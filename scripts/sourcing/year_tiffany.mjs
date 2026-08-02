#!/usr/bin/env node
// 1) Archive Tiffany & Co-stamped pieces from the Women's catalog.
// 2) Backfill Year property from WA titles like "... (2021)".
import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync('/Users/henryohler/IdeaProjects/dialed-by-h-site/.env.local', 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const H = { Authorization: `Bearer ${env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const DB = env.NOTION_DATABASE_ID;
const DIR = '/private/tmp/claude-501/-Users-henryohler/fc0f9ad8-d46d-4fa9-a81f-db8693aa760a/scratchpad';

const api = async (url, opts, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.notion.com/v1${url}`, opts);
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`${url}: ${j.message || r.status}`);
    return j;
  }
  throw new Error(`${url}: retries exhausted`);
};

// WA rows keyed by brand|ref with year + tiffany flag
const keep = JSON.parse(fs.readFileSync(`${DIR}/wa_keep.json`));
const BRAND_MAP = { 'BVLGARI Watches': 'Bulgari', 'Jaeger LeCoultre': 'Jaeger-LeCoultre' };
const rows = new Map();
for (const r of keep) {
  const brand = (BRAND_MAP[r.vendor] || r.vendor).toLowerCase();
  const t = r.title.replace(/'([^']*)'/g, ' $1 ');
  const refM = t.replace(new RegExp(r.vendor, 'i'), '').match(/\b(?=[A-Z0-9/.\-]{4,})([A-Z]{0,6}\d[A-Z0-9/.\-]*\d[A-Z0-9/.\-]*|[A-Z]{2,6}\d{2,}[A-Z0-9/.\-]*)\b/i);
  const ref = refM ? refM[1].replace(/[.\-/]+$/, '') : '';
  const yM = r.title.match(/\((19|20)\d{2}\)/);
  const key = brand + '|' + ref.toLowerCase();
  const entry = { year: yM ? parseInt(yM[0].slice(1, 5)) : null, tiffany: /tiffany/i.test(r.title + r.tags) };
  if (!rows.has(key)) rows.set(key, []);
  rows.get(key).push(entry);
}

let cursor, archived = 0, yearSet = 0, ambiguous = 0;
do {
  const body = { filter: { property: 'Collection', multi_select: { contains: "Women's" } }, page_size: 100 };
  if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  for (const pg of r.results) {
    const brand = (pg.properties.Brand?.select?.name || '').toLowerCase();
    const ref = (pg.properties['Reference Number']?.rich_text || []).map(x => x.plain_text).join('');
    const hasYear = pg.properties.Year?.number;
    const matches = rows.get(brand + '|' + ref.toLowerCase()) || [];
    if (matches.some(m => m.tiffany)) {
      await api(`/pages/${pg.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ archived: true }) });
      archived++;
      console.log('ARCHIVED tiffany:', brand, ref);
      continue;
    }
    if (hasYear || !matches.length) continue;
    const years = [...new Set(matches.map(m => m.year).filter(Boolean))];
    if (years.length === 1) {
      await api(`/pages/${pg.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Year: { number: years[0] } } }) });
      yearSet++;
    } else if (years.length > 1) ambiguous++;
  }
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);
console.log(`archived ${archived} tiffany, set year on ${yearSet}, ambiguous (skipped) ${ambiguous}`);
