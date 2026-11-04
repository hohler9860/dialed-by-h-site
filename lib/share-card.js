// Link-preview images in the brand system. Text is drawn as outlines from the Suisse
// files, so nothing depends on fonts being installed on the server.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');

const WIDTH = 1200, HEIGHT = 630;
const CHARCOAL = '#252522', CREAM = '#F7F3E9', PANEL = '#ECE8DF', GREY_DARK = '#52514E', GREY_MID = '#999791';
const ASSETS = path.join(__dirname, '..', 'assets');

const fonts = {};
function font(name) {
    if (!fonts[name]) {
        const b = fs.readFileSync(path.join(ASSETS, 'fonts', 'suisse', `${name}.ttf`));
        fonts[name] = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    return fonts[name];
}
const INTL_MED = 'SuisseIntl-Medium', INTL = 'SuisseIntl-Regular', WORKS = 'SuisseWorks-Regular', MONO = 'SuisseIntlMono-Regular';

const measure = (face, text, size, tracking = 0) => font(face).getAdvanceWidth(text, size, { kerning: true, letterSpacing: tracking });
function draw(face, text, x, y, size, fill, { tracking = 0, align = 'left' } = {}) {
    const left = align === 'right' ? x - measure(face, text, size, tracking) : x;
    const d = font(face).getPath(text, left, y, size, { kerning: true, letterSpacing: tracking }).toPathData(2);
    return `<path d="${d}" fill="${fill}"/>`;
}
function wrap(face, text, size, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(face, next, size) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}
// Largest size at which the text fits the line limit and no single word overflows.
function fit(face, text, sizes, maxWidth, maxLines) {
    for (const size of sizes) {
        const lines = wrap(face, text, size, maxWidth);
        if (lines.length <= maxLines && lines.every((l) => measure(face, l, size) <= maxWidth)) return { size, lines };
    }
    const size = sizes[sizes.length - 1];
    let lines = wrap(face, text, size, maxWidth).slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, '') + '…';
    return { size, lines };
}
function logo(file, x, y, width, height) {
    const svg = fs.readFileSync(path.join(ASSETS, 'brand', file), 'utf8');
    const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}">${inner}</svg>`;
}
const chrome = () => logo('wordmark-charcoal.svg', 34, 26, 300, 42.5) + logo('logomark-charcoal.svg', 1090, 12, 90, 88);
const contact = () => draw(MONO, '(WEBSITE)', 1156 - measure(INTL, 'dialedbyhenry.com', 20, 0.02) - 14, 590, 15, GREY_MID, { tracking: 0.12, align: 'right' })
    + draw(INTL, 'dialedbyhenry.com', 1156, 590, 20, CHARCOAL, { tracking: 0.02, align: 'right' });

async function finish(svg, cutout, box) {
    const layers = [];
    if (cutout) {
        const img = await sharp(cutout).resize(box.width, box.height, { fit: 'inside' }).png().toBuffer();
        const m = await sharp(img).metadata();
        layers.push({ input: img, left: Math.round(box.cx - m.width / 2), top: Math.round(box.cy - m.height / 2) });
    }
    return sharp(Buffer.from(svg)).composite(layers).flatten({ background: CREAM }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

// One watch: centred, so a square crop in a chat thumbnail still shows it whole.
async function watchCard({ brand, model, ref, year, cutout }) {
    const left = 56, maxW = 350;
    const { size, lines } = fit(WORKS, model || brand || '', [50, 44, 38, 32], maxW, 3);
    const leading = Math.round(size * 1.1);
    const refY = 590, modelLast = refY - 44, modelFirst = modelLast - (lines.length - 1) * leading, brandY = modelFirst - size - 14;
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
        `<rect width="${WIDTH}" height="${HEIGHT}" fill="${CREAM}"/>`,
        chrome(),
        draw(INTL_MED, brand || '', left, brandY, 26, CHARCOAL),
    ];
    if (year) parts.push(draw(MONO, String(year), left + maxW, brandY, 17, GREY_DARK, { tracking: 0.06, align: 'right' }));
    lines.forEach((line, i) => parts.push(draw(WORKS, line, left, modelFirst + i * leading, size, CHARCOAL, { tracking: -0.04 })));
    if (ref) parts.push(draw(MONO, `REF. ${String(ref).toUpperCase()}`, left, refY, 19, GREY_DARK, { tracking: 0.06 }));
    parts.push(contact(), '</svg>');
    return finish(parts.join(''), cutout, { cx: 600, cy: 315, width: 390, height: 586 });
}

// A page: the two-tone headline from the page itself, with one watch beside it.
async function pageCard({ lead, rest, cutout }) {
    const left = 56, maxW = cutout ? 610 : 1060;
    let size = 50, leadLines = [], restLines = [];
    for (const candidate of [74, 66, 58, 50]) {
        size = candidate;
        leadLines = wrap(INTL_MED, lead, size, maxW);
        restLines = wrap(INTL_MED, rest, size, maxW);
        if (leadLines.length + restLines.length <= 4) break;
    }
    const leading = Math.round(size * 0.98);
    const total = leadLines.length + restLines.length;
    const firstY = 590 - (total - 1) * leading;
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
        `<rect width="${WIDTH}" height="${HEIGHT}" fill="${CREAM}"/>`,
    ];
    if (cutout) parts.push(`<rect x="700" width="500" height="${HEIGHT}" fill="${PANEL}"/>`);
    parts.push(chrome());
    leadLines.forEach((line, i) => parts.push(draw(INTL_MED, line, left, firstY + i * leading, size, GREY_MID, { tracking: -0.04 })));
    restLines.forEach((line, i) => parts.push(draw(INTL_MED, line, left, firstY + (leadLines.length + i) * leading, size, CHARCOAL, { tracking: -0.04 })));
    parts.push('</svg>');
    return finish(parts.join(''), cutout, { cx: 950, cy: 330, width: 420, height: 530 });
}

module.exports = { watchCard, pageCard, WIDTH, HEIGHT };
