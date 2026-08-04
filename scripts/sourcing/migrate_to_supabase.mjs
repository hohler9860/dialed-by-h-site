// One-time migration: Notion "Pieces for Sourcing" -> Supabase (pieces table + Storage).
//
//   node scripts/sourcing/migrate_to_supabase.mjs            # dry run, changes nothing
//   node scripts/sourcing/migrate_to_supabase.mjs --run      # do it (resumable)
//   node scripts/sourcing/migrate_to_supabase.mjs --run --force   # reprocess images already done
//   node scripts/sourcing/migrate_to_supabase.mjs --run --limit 5 # small test batch first
//
// Safe to re-run. Rows upsert on the piece's original Notion UUID and images are
// skipped when already present in Storage, so a crash halfway through costs
// nothing — just run it again.
//
// This script only READS from Notion. It never modifies the Notion database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { processWatchImage } = require(path.join(ROOT, 'lib/watch-image.js'));

// ── env ────────────────────────────────────────────────────────────────
// The repo has no dotenv dependency; .env.local is a simple KEY=VALUE file.
function loadEnv() {
    const file = path.join(ROOT, '.env.local');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[m[1]]) process.env[m[1]] = v;
    }
}
loadEnv();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
let SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
if (SUPABASE_URL && !/^https?:\/\//.test(SUPABASE_URL)) SUPABASE_URL = 'https://' + SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ NOTION_API_KEY, NOTION_DATABASE_ID, SUPABASE_URL, SERVICE_KEY })) {
    if (!v) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
}

// Guard rail: this project's data must not land in the Boston Watch Club database.
const EXPECTED_PROJECT = 'untnrofsnmoyxdidxbdj';
if (!SUPABASE_URL.includes(EXPECTED_PROJECT)) {
    console.error(`REFUSING TO RUN. SUPABASE_URL points at ${SUPABASE_URL}, expected the DBH project (${EXPECTED_PROJECT}).`);
    process.exit(1);
}

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const FORCE = args.includes('--force');
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? parseInt(args[i + 1], 10) : dflt; };
const LIMIT = flag('--limit', 0);
// ~1700 pieces / ~3k images: sequential would run well over an hour. Image
// downloads hit S3 and Supabase (not the rate-limited Notion API), so the only
// real ceiling is local CPU for sharp. 6 is a sane default on an M-series Mac.
const CONCURRENCY = flag('--concurrency', 6);
const BUCKET = 'pieces';

// Minimal worker pool: run `fn` over `items`, `n` at a time, in order-independent
// fashion. Results land in a same-index array so ordering is still preserved.
async function pool(items, n, fn) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    }));
    return out;
}

// ── Notion read ────────────────────────────────────────────────────────
const notion = new Client({ auth: NOTION_API_KEY });

function txt(prop) {
    if (!prop) return '';
    switch (prop.type) {
        case 'title': return prop.title?.map(t => t.plain_text).join('') || '';
        case 'rich_text': return prop.rich_text?.map(t => t.plain_text).join('') || '';
        case 'select': return prop.select?.name || '';
        case 'checkbox': return prop.checkbox;
        default: return '';
    }
}
function num(prop) {
    if (!prop || prop.type !== 'number') return null;
    return prop.number ?? null;
}
function multi(prop) {
    if (!prop || prop.type !== 'multi_select') return [];
    return (prop.multi_select || []).map(o => o.name).filter(Boolean);
}
function fileUrls(prop) {
    if (!prop || !prop.files) return [];
    return prop.files.map(f => f.file?.url || f.external?.url || '').filter(Boolean);
}

async function fetchNotionPages() {
    const db = await notion.databases.retrieve({ database_id: NOTION_DATABASE_ID });
    const dataSourceId = (db.data_sources || [])[0]?.id;
    if (!dataSourceId) throw new Error('Notion database has no data sources');

    const out = [];
    let cursor;
    do {
        const resp = await notion.dataSources.query({
            data_source_id: dataSourceId,
            start_cursor: cursor,
            // Same order the live site uses today, captured into sort_order below.
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        });
        out.push(...resp.results);
        cursor = resp.has_more ? resp.next_cursor : undefined;
        process.stdout.write(`\r  read ${out.length} pages from Notion...`);
    } while (cursor);
    process.stdout.write('\n');
    return out;
}

// ── Supabase helpers ───────────────────────────────────────────────────
const sbHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
};

async function ensureBucket() {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: BUCKET,
            name: BUCKET,
            public: true,                     // permanent public URLs: the entire point
            file_size_limit: 26214400,        // 25MB
            allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'],
        }),
    });
    if (r.ok) { console.log(`  created public bucket "${BUCKET}"`); return; }
    const body = await r.text();
    if (r.status === 409 || /already exists|Duplicate/i.test(body)) {
        console.log(`  bucket "${BUCKET}" already exists`);
        return;
    }
    throw new Error(`bucket create failed ${r.status}: ${body}`);
}

function publicUrl(objPath) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objPath}`;
}

async function objectExists(objPath) {
    const r = await fetch(publicUrl(objPath), { method: 'HEAD' });
    return r.ok;
}

async function uploadObject(objPath, buf) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objPath}`, {
        method: 'POST',
        headers: {
            ...sbHeaders,
            'Content-Type': 'image/webp',
            'x-upsert': 'true',
            // Images are content-addressed by piece id + index and never mutate
            // in place (the admin writes a new index instead), so cache forever.
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: buf,
    });
    if (!r.ok) throw new Error(`upload ${objPath} failed ${r.status}: ${await r.text()}`);
    return publicUrl(objPath);
}

async function upsertRows(rows) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pieces`, {
        method: 'POST',
        headers: {
            ...sbHeaders,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`upsert failed ${r.status}: ${await r.text()}`);
}

// ── per-piece work ─────────────────────────────────────────────────────
// Storage layout, stable and derivable from the piece id:
//   pieces/<uuid>/<i>.webp          standard 900px on #0d0d0d
//   pieces/<uuid>/<i>-cutout.webp   520px transparent (alpha sources only)
async function migrateImages(pageId, urls) {
    const images = [];
    const cutouts = [];

    for (let i = 0; i < urls.length; i++) {
        const stdPath = `${pageId}/${i}.webp`;
        const cutPath = `${pageId}/${i}-cutout.webp`;

        if (!FORCE && await objectExists(stdPath)) {
            images.push(publicUrl(stdPath));
            cutouts.push(await objectExists(cutPath) ? publicUrl(cutPath) : publicUrl(stdPath));
            continue;
        }

        // Notion's signed S3 URL — read once here, then never needed again.
        const res = await fetch(urls[i]);
        if (!res.ok) { console.warn(`\n    ! image ${i} fetch ${res.status}, skipped`); continue; }
        const src = Buffer.from(await res.arrayBuffer());

        const { standard, cutout } = await processWatchImage(src);
        images.push(await uploadObject(stdPath, standard));
        cutouts.push(cutout ? await uploadObject(cutPath, cutout) : publicUrl(stdPath));
    }

    return { images, cutouts };
}

function rowFromPage(page, sortOrder) {
    const p = page.properties;
    const id = page.id;
    return {
        id,
        piece: txt(p['Piece']),
        brand: txt(p['Brand']),
        model: txt(p['Model']),
        nickname: txt(p['Nickname']),
        ref: txt(p['Reference Number']),
        case_material: txt(p['Case Material']),
        case_size_mm: num(p['Case Size (mm)']),
        dial_color: txt(p['Dial Color']),
        bracelet: txt(p['Bracelet/Strap']),
        condition: txt(p['Condition']),
        set_included: txt(p['Set']),
        year: num(p['Year']),
        collections: multi(p['Collection']),
        celebs: multi(p['Celebrity']),
        tags: txt(p['Tags']),
        sort_order: sortOrder,
    };
}

// ── main ───────────────────────────────────────────────────────────────
async function main() {
    console.log(RUN ? 'MIGRATING Notion -> Supabase' : 'DRY RUN (pass --run to execute)');
    console.log(`  target: ${SUPABASE_URL}\n`);

    const pages = await fetchNotionPages();
    const selected = LIMIT ? pages.slice(0, LIMIT) : pages;
    const imageCount = pages.reduce((n, pg) => n + fileUrls(pg.properties['Image']).length, 0);

    console.log(`  ${pages.length} pieces, ${imageCount} source images`);
    if (LIMIT) console.log(`  --limit ${LIMIT}: processing first ${selected.length}`);

    if (!RUN) {
        const sample = selected.slice(0, 3).map((pg, i) => ({
            ...rowFromPage(pg, i),
            _images: fileUrls(pg.properties['Image']).length,
        }));
        console.log('\n  sample of what would be written:');
        console.log(JSON.stringify(sample, null, 2));
        console.log('\nNothing was written. Re-run with --run.');
        return;
    }

    await ensureBucket();

    console.log(`  concurrency: ${CONCURRENCY}\n`);

    const started = Date.now();
    let rows = [];
    let done = 0, failed = 0, seen = 0;
    const failures = [];

    // Flushing from inside the pool keeps memory flat and means a crash at piece
    // 1500 still leaves the first 1475 safely in the database.
    async function flush(force = false) {
        if (!rows.length || (!force && rows.length < 25)) return;
        const batch = rows;
        rows = [];
        await upsertRows(batch);
    }

    await pool(selected, CONCURRENCY, async (page, i) => {
        const label = (txt(page.properties['Piece']) || txt(page.properties['Brand']) || page.id).slice(0, 40);
        try {
            const { images, cutouts } = await migrateImages(page.id, fileUrls(page.properties['Image']));
            rows.push({ ...rowFromPage(page, i), images, images_cutout: cutouts });
            done++;
        } catch (e) {
            failed++;
            failures.push(`${label}: ${e.message}`);
        }
        seen++;
        const pct = Math.round((seen / selected.length) * 100);
        const rate = seen / ((Date.now() - started) / 1000);
        const eta = rate > 0 ? Math.round((selected.length - seen) / rate) : 0;
        process.stdout.write(
            `\r  ${pct}%  ${seen}/${selected.length}  ok:${done} fail:${failed}  ` +
            `~${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s left   `
        );
        await flush();
    });
    await flush(true);

    process.stdout.write('\n');
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`\n  done in ${mins}m: ${done} pieces written, ${failed} failed`);
    if (failures.length) {
        console.log('\n  failures (re-run the script to retry these; finished pieces are skipped):');
        failures.slice(0, 40).forEach(f => console.log(`    - ${f}`));
        if (failures.length > 40) console.log(`    ... and ${failures.length - 40} more`);
    }
    console.log('\n  Notion was not modified.');
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1); });
