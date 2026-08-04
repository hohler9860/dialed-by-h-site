// Backfill responsive image variants (-thumb 300px, -medium 600px) for every
// piece image already in Supabase Storage.
//
//   node scripts/sourcing/backfill_variants.mjs           # report what is missing
//   node scripts/sourcing/backfill_variants.mjs --run     # generate + upload
//   node scripts/sourcing/backfill_variants.mjs --run --force   # rebuild all
//
// Reads each stored 900px standard, downscales it, and writes the variants
// alongside. Notion is not involved and the standard is never modified.
//
// Resumable, and unlike the original importer it verifies EVERY variant before
// skipping a piece — the earlier "standard exists, therefore done" shortcut is
// exactly how 9 cutouts went missing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { renderScaled, variantPath, THUMB_SIZE, MEDIUM_SIZE } = require(path.join(ROOT, 'lib/watch-image.js'));

function loadEnv() {
    const file = path.join(ROOT, '.env.local');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}
loadEnv();

let SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
if (SUPABASE_URL && !/^https?:\/\//.test(SUPABASE_URL)) SUPABASE_URL = 'https://' + SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const EXPECTED = 'untnrofsnmoyxdidxbdj';
if (!SUPABASE_URL.includes(EXPECTED)) {
    console.error(`REFUSING TO RUN. SUPABASE_URL is ${SUPABASE_URL}, expected the DBH project (${EXPECTED}).`);
    process.exit(1);
}

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const FORCE = args.includes('--force');
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? parseInt(args[i + 1], 10) : d; };
const CONCURRENCY = flag('--concurrency', 4);   // Storage 429s above ~6
const BUCKET = 'pieces';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function pool(items, n, fn) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            await fn(items[i], i);
        }
    }));
}

// Storage path out of a public URL.
function objPath(url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const i = url.indexOf(marker);
    return i < 0 ? null : url.slice(i + marker.length);
}
const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;

async function exists(p) {
    const r = await fetch(publicUrl(p), { method: 'HEAD' });
    return r.ok;
}

async function put(p, buf) {
    for (let attempt = 1; attempt <= 4; attempt++) {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${p}`, {
            method: 'POST',
            headers: { ...H, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'public, max-age=31536000, immutable' },
            body: buf,
        });
        if (r.ok) return;
        // Storage throws transient 429 "too_many_connections" under load; that is
        // what silently cost 9 pieces their cutouts last time. Back off and retry.
        if (r.status === 429 && attempt < 4) {
            await new Promise(res => setTimeout(res, 400 * attempt * attempt));
            continue;
        }
        throw new Error(`upload ${p} -> ${r.status}`);
    }
}

async function allImages() {
    const out = [];
    for (let from = 0; ; from += 1000) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/pieces?select=id,images&order=sort_order.asc.nullslast`, {
            headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
        });
        if (!r.ok) throw new Error(`query ${r.status}`);
        const batch = await r.json();
        batch.forEach(row => (row.images || []).forEach(u => {
            const p = objPath(u);
            if (p) out.push(p);
        }));
        if (batch.length < 1000) break;
    }
    return out;
}

async function main() {
    console.log(RUN ? 'BACKFILLING image variants' : 'DRY RUN (pass --run to execute)');
    console.log(`  target: ${SUPABASE_URL}`);

    const paths = await allImages();
    console.log(`  ${paths.length} stored images -> ${paths.length * 2} variants (${THUMB_SIZE}px + ${MEDIUM_SIZE}px)\n`);

    if (!RUN) {
        console.log('  checking a 20-image sample for what is already present...');
        let have = 0;
        for (const p of paths.slice(0, 20)) {
            if (await exists(variantPath(p, 'thumb')) && await exists(variantPath(p, 'medium'))) have++;
        }
        console.log(`  ${have}/20 sampled images already have both variants`);
        console.log('\nNothing written. Re-run with --run.');
        return;
    }

    const started = Date.now();
    let done = 0, skipped = 0, failed = 0, seen = 0, bytesIn = 0, bytesOut = 0;
    const failures = [];

    await pool(paths, CONCURRENCY, async (p) => {
        const tPath = variantPath(p, 'thumb');
        const mPath = variantPath(p, 'medium');
        try {
            if (!FORCE && await exists(tPath) && await exists(mPath)) {
                skipped++;
            } else {
                const res = await fetch(publicUrl(p));
                if (!res.ok) throw new Error(`fetch standard ${res.status}`);
                const std = Buffer.from(await res.arrayBuffer());
                const [thumb, medium] = await Promise.all([
                    renderScaled(std, THUMB_SIZE),
                    renderScaled(std, MEDIUM_SIZE),
                ]);
                await put(tPath, thumb);
                await put(mPath, medium);
                bytesIn += std.length; bytesOut += thumb.length;
                done++;
            }
        } catch (e) {
            failed++;
            failures.push(`${p}: ${e.message}`);
        }
        seen++;
        const rate = seen / ((Date.now() - started) / 1000);
        const eta = rate > 0 ? Math.round((paths.length - seen) / rate) : 0;
        process.stdout.write(
            `\r  ${Math.round(seen / paths.length * 100)}%  ${seen}/${paths.length}` +
            `  new:${done} skip:${skipped} fail:${failed}  ~${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s left   `
        );
    });

    process.stdout.write('\n');
    console.log(`\n  done in ${((Date.now() - started) / 60000).toFixed(1)}m: ${done} generated, ${skipped} already present, ${failed} failed`);
    if (done) {
        console.log(`  thumbnails average ${(bytesOut / done / 1024).toFixed(1)}KB vs ${(bytesIn / done / 1024).toFixed(1)}KB full size` +
                    ` (${Math.round((1 - bytesOut / bytesIn) * 100)}% smaller)`);
    }
    if (failures.length) {
        console.log('\n  failures (re-run to retry):');
        failures.slice(0, 20).forEach(f => console.log('    - ' + f));
        if (failures.length > 20) console.log(`    ... and ${failures.length - 20} more`);
    }
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1); });
