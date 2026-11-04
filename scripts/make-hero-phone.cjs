#!/usr/bin/env node
// Cuts the tall phone versions of the hero photos from the originals on the Desktop.
// A wide image stretched to fill a phone's height is blown up about 3x and looks blurry,
// so phones get their own crop at full phone resolution. AVIF first, WebP for old phones.
// Usage: node scripts/make-hero-phone.cjs <map.json of {"01.webp":{"src":"/path/photo.jpg"}}>
const fs = require('fs');
const sharp = require('sharp');

const WIDTH = 1170, HEIGHT = 2535;
// Where the crop is centred, as a share of the photo's width, when centre cuts the watch off.
const FOCUS = { '01.webp': 0.472 };

(async () => {
    const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    let total = 0;
    for (const [name, { src }] of Object.entries(map)) {
        const photo = await sharp(src).rotate().toBuffer();
        const { width, height } = await sharp(photo).metadata();
        const cropWidth = Math.round((height * WIDTH) / HEIGHT);
        const left = Math.max(0, Math.min(width - cropWidth, Math.round(width * (FOCUS[name] ?? 0.5) - cropWidth / 2)));
        const crop = await sharp(photo).extract({ left, top: 0, width: cropWidth, height }).resize(WIDTH, HEIGHT, { kernel: 'lanczos3' }).toBuffer();
        const id = name.replace('.webp', '');
        const avif = await sharp(crop).avif({ quality: 38, effort: 5 }).toBuffer();
        const webp = await sharp(crop).webp({ quality: 55, effort: 5, smartSubsample: true }).toBuffer();
        fs.writeFileSync(`assets/hero/${id}-p.avif`, avif);
        fs.writeFileSync(`assets/hero/${id}-p.webp`, webp);
        total += avif.length;
        console.log(id, `avif ${Math.round(avif.length / 1024)}KB`, `webp ${Math.round(webp.length / 1024)}KB`);
    }
    console.log('average avif', Math.round(total / 1024 / Object.keys(map).length), 'KB');
})().catch((e) => { console.error(e); process.exit(1); });
