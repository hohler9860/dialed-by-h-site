#!/usr/bin/env node
// Builds every site and admin icon from Beau's logomark file. Run from the repo root.
// Two things to keep: the logo SVG has a wide empty margin, so it is trimmed before
// sizing, and its path must never get fill-rule="evenodd", which cuts wedges into the H.
const fs = require('fs');
const sharp = require('sharp');

const CHARCOAL = '#252522', CREAM = '#F7F3E9';
const SRC = { cream: 'assets/brand/logomark-cream.svg', charcoal: 'assets/brand/logomark-charcoal.svg' };

async function trimmed(file) {
    const { data, info } = await sharp(file, { density: 2400 }).trim().png().toBuffer({ resolveWithObject: true });
    return { data, info };
}
const sized = (mark, px) => sharp(mark).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function disc(mark, size, fill) {
    const shape = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${CHARCOAL}"/></svg>`);
    return sharp(shape).composite([{ input: await sized(mark, Math.round(size * fill)), gravity: 'center' }]).png().toBuffer();
}
async function tile(mark, size, fill, background) {
    return sharp({ create: { width: size, height: size, channels: 3, background } })
        .composite([{ input: await sized(mark, Math.round(size * fill)), gravity: 'center' }]).removeAlpha().png().toBuffer();
}
function ico(entries) {
    const head = Buffer.alloc(6 + entries.length * 16);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(entries.length, 4);
    let offset = head.length;
    entries.forEach(({ size, png }, i) => {
        const o = 6 + i * 16;
        head[o] = size; head[o + 1] = size;
        head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
        head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(offset, o + 12);
        offset += png.length;
    });
    return Buffer.concat([head, ...entries.map((e) => e.png)]);
}
async function svgIcon(markFile, color, shape, fill) {
    const d = fs.readFileSync(markFile, 'utf8').match(/ d="([^"]+)"/)[1];
    const { info } = await sharp(markFile, { density: 2400 }).trim().png().toBuffer({ resolveWithObject: true });
    const full = await sharp(markFile, { density: 2400 }).metadata();
    const unit = full.width / 145;
    const left = -info.trimOffsetLeft / unit, top = -info.trimOffsetTop / unit, w = info.width / unit, h = info.height / unit;
    const scale = (64 * fill) / w;
    const tx = 32 - (left + w / 2) * scale, ty = 32 - (top + h / 2) * scale;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">\n${shape}\n<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})"><path d="${d}" fill="${color}"/></g>\n</svg>\n`;
}

(async () => {
    const cream = (await trimmed(SRC.cream)).data, charcoal = (await trimmed(SRC.charcoal)).data;
    const small = { 16: await disc(cream, 16, 0.86), 32: await disc(cream, 32, 0.82), 48: await disc(cream, 48, 0.8) };
    fs.writeFileSync('favicon.ico', ico([{ size: 48, png: small[48] }, { size: 32, png: small[32] }, { size: 16, png: small[16] }]));
    fs.writeFileSync('favicon-dbh-32.png', small[32]);
    fs.writeFileSync('favicon-dbh-48.png', small[48]);
    fs.writeFileSync('favicon-dbh-96.png', await disc(cream, 96, 0.8));
    fs.writeFileSync('favicon-dbh-192.png', await disc(cream, 192, 0.8));
    fs.writeFileSync('favicon.png', await disc(cream, 512, 0.8));
    fs.writeFileSync('favicon.svg', await svgIcon(SRC.cream, CREAM, `<circle cx="32" cy="32" r="32" fill="${CHARCOAL}"/>`, 0.8));
    // Safari keeps Favorites tiles at 144px and shrinks whatever it is given with a crude
    // filter, so a 1024px source comes out jagged. 288px is an exact double and shrinks
    // cleanly, and it is still sharp on a phone home screen or in the Dock.
    fs.writeFileSync('apple-touch-icon.png', await tile(cream, 288, 0.62, CHARCOAL));
    // The admin stays inverted so it is easy to tell apart on a home screen.
    fs.writeFileSync('admin/favicon.svg', await svgIcon(SRC.charcoal, CHARCOAL, `<rect width="64" height="64" rx="8" fill="${CREAM}"/>`, 0.8));
    fs.writeFileSync('admin/icon-288.png', await tile(charcoal, 288, 0.62, CREAM));
    console.log('icons written');
})().catch((e) => { console.error(e); process.exit(1); });
