#!/usr/bin/env node
// Writes the fixed link-preview images for brand and Boston pages to images/share/.
// Watch pages make theirs on request, see the shareCard branch in api/get-inventory.js.
// Run from the repo root with .env.local present.
const fs = require('fs');
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { fetchAllPieces } = require('../api/_pieces');
const { pageCard } = require('../lib/share-card');

const PAGES = {
    'rolex': ['Rolex in Boston,', 'without the waitlist', '126500LN'],
    'patek-philippe': ['Patek Philippe', 'in Boston', '5711/1A-010', '5726/1A-014'],
    'audemars-piguet': ['Audemars Piguet', 'in Boston', '15510ST.OO.1320ST.03'],
    'richard-mille': ['Richard Mille', 'in Boston', 'RM67-02'],
    'vacheron-constantin': ['Vacheron Constantin', 'in Boston', '7900V/110A-B546'],
    'cartier': ['Cartier', 'in Boston', 'WSSA0013'],
    'fp-journe': ['F.P. Journe', 'in Boston', 'slug:f-p-journe-chronometre-bleu-c7e995'],
    'a-lange-sohne': ['A. Lange & Söhne', 'in Boston', '191.029'],
    'boston': ["Boston's Luxury", 'Watch Dealer & Concierge', '5726/1A-014'],
    'buy-rolex-boston': ['Buy a Rolex in Boston', 'without the waitlist', '126610LV', '126500LN'],
    'sell-rolex-boston': ['Sell your Rolex', 'in Boston, today', '126710BLRO', '126500LN'],
    'rolex-dealer-boston': ['An independent', 'Rolex dealer in Boston', '126500LN'],
    'patek-philippe-boston': ['Patek Philippe in Boston,', 'bought and sold properly', '5167R-001'],
};

(async () => {
    const pieces = (await fetchAllPieces()).filter((p) => /-cutout\.webp$/.test(p.imageCutout || ''));
    fs.mkdirSync('images/share', { recursive: true });
    for (const [slug, [lead, rest, ...refs]] of Object.entries(PAGES)) {
        let piece = null;
        for (const r of refs) {
            piece = r.startsWith('slug:') ? pieces.find((p) => p.slug === r.slice(5)) : pieces.find((p) => p.ref === r);
            if (piece) break;
        }
        if (!piece) throw new Error(`No cutout found for ${slug}: ${refs.join(', ')}`);
        const cutout = Buffer.from(await (await fetch(piece.imageCutout)).arrayBuffer());
        const jpg = await pageCard({ lead, rest, cutout });
        fs.writeFileSync(`images/share/${slug}.jpg`, jpg);
        console.log(slug.padEnd(24), piece.brand, piece.ref, `${Math.round(jpg.length / 1024)}KB`);
    }
})().catch((e) => { console.error(e); process.exit(1); });
