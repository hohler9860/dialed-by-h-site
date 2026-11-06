#!/usr/bin/env node
// Writes lib/price-bands.json, which lets related pieces favour similar price levels.
//   node scripts/build-price-bands.js      (run from the repo root; needs .env.local)
// Read-only against the database. Market prices come from the wholesale schema, but only a
// broad band per reference is written, never a dollar figure, because this repo is public.
// Bands are wide, so re-running every month or two is plenty.
const fs = require('fs'), path = require('path');
const { family, key } = require('../lib/related-pieces');
const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// $15k, $30k, $60k, $120k, $250k, $500k: band 1 is under $15k, band 7 is over $500k.
const CUTS = [15e3, 30e3, 60e3, 120e3, 250e3, 500e3];
const bandFor = (usd) => CUTS.filter((c) => usd >= c).length + 1;
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

async function all(pathAndQuery, profile, cap = 60000) {
    const out = [];
    for (let o = 0; out.length < cap; o += 1000) {
        const r = await fetch(`${URL_}/rest/v1/${pathAndQuery}&limit=1000&offset=${o}`, { headers: profile ? { ...headers, 'Accept-Profile': profile } : headers });
        if (!r.ok) throw new Error(`${pathAndQuery.split('?')[0]}: ${r.status}`);
        const rows = await r.json();
        out.push(...rows);
        if (rows.length < 1000) break;
    }
    return out;
}

(async () => {
    const pieces = await all('pieces?select=brand,model,ref&order=id');
    const [retail, chat] = await Promise.all([
        all('retail_listings?select=reference,price_usd&available=eq.true&price_usd=gt.0&order=id', 'wholesale'),
        all('listings?select=reference,price_usd,listing_type&price_usd=gt.0&reference=not.is.null&order=id.desc', 'wholesale'),
    ]);

    const prices = new Map();
    const add = (ref, usd) => {
        const k = key(ref);
        if (k.length < 4 || !(usd >= 1000 && usd < 5e7)) return;
        if (!prices.has(k)) prices.set(k, []);
        prices.get(k).push(usd);
    };
    retail.forEach((r) => add(r.reference, +r.price_usd));
    chat.filter((r) => r.listing_type == null || /sell|sale|wts|offer/i.test(r.listing_type)).forEach((r) => add(r.reference, +r.price_usd));

    // Market references are often shorter or longer than ours: 15510st vs 15510st.oo.1320st.03.
    const byPrefix = new Map();
    for (const [k, v] of prices) for (let n = 6; n < k.length; n++) {
        const p = k.slice(0, n);
        if (!byPrefix.has(p)) byPrefix.set(p, []);
        byPrefix.get(p).push(...v);
    }
    const priceOf = (ref) => {
        const k = key(ref);
        if (k.length < 4 || !/\d/.test(k)) return null;
        if (prices.has(k)) return median(prices.get(k));
        for (let n = k.length - 1; n >= 6; n--) if (prices.has(k.slice(0, n))) return median(prices.get(k.slice(0, n)));
        return byPrefix.has(k) ? median(byPrefix.get(k)) : null;
    };

    const refs = {}, modelBands = new Map();
    for (const p of pieces) {
        const usd = priceOf(p.ref);
        if (!usd) continue;
        const band = bandFor(usd);
        refs[key(p.ref)] = band;
        const m = `${key(p.brand)}|${family(p)}`;
        if (family(p)) { if (!modelBands.has(m)) modelBands.set(m, []); modelBands.get(m).push(band); }
    }
    const models = {};
    for (const [m, list] of modelBands) models[m] = median(list);

    const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(path.join(ROOT, 'lib/price-bands.json'), `${JSON.stringify({ refs: sortKeys(refs), models: sortKeys(models) })}\n`);
    const covered = pieces.filter((p) => refs[key(p.ref)] || models[`${key(p.brand)}|${family(p)}`]).length;
    console.log(`${pieces.length} pieces, ${Object.keys(refs).length} references banded, ${Object.keys(models).length} models, ${covered} pieces covered`);
})().catch((e) => { console.error(e.message); process.exit(1); });
