#!/usr/bin/env node
// Fold near-duplicate Model select values into their canonical versions:
// bare Datejust / Oyster Perpetual / Day-Date -> sized model via Case Size (mm);
// Tubogas -> Serpenti Tubogas. Then prune now-empty select options.
// --dry to preview.
import fs from 'fs';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const H = { Authorization: `Bearer ${env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const DB = env.NOTION_DATABASE_ID;
const DRY = process.argv.includes('--dry');

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

const SIZED = {
  'Datejust': { sizes: { 26: 'Datejust 26', 28: 'Datejust 28', 31: 'Datejust 31', 36: 'Datejust 36', 41: 'Datejust 41' }, lady: 'Lady-Datejust' },
  'Oyster Perpetual': { sizes: { 28: 'Oyster Perpetual 28', 31: 'Oyster Perpetual 31', 34: 'Oyster Perpetual 34', 36: 'Oyster Perpetual 36', 39: 'Oyster Perpetual 39', 41: 'Oyster Perpetual 41' } },
  'Day-Date': { sizes: { 36: 'Day-Date 36', 40: 'Day-Date 40' } },
};
const RENAME = { 'Tubogas': 'Serpenti Tubogas', 'Twenty-4': 'Twenty~4' };

let cursor, changed = 0, left = [];
do {
  const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  for (const pg of r.results) {
    const model = pg.properties.Model?.select?.name || '';
    const size = pg.properties['Case Size (mm)']?.number || null;
    let next = RENAME[model] || null;
    if (!next && SIZED[model]) {
      const round = size ? Math.round(size) : null;
      // 35.6 etc: match nearest defined size within 1mm
      const hit = round && Object.keys(SIZED[model].sizes).map(Number).find(s => Math.abs(s - size) <= 1);
      if (hit) next = SIZED[model].sizes[hit];
      else left.push(`${model} (size ${size ?? '?'}) — left as-is`);
    }
    if (next && next !== model) {
      changed++;
      console.log(`${DRY ? '[dry] ' : ''}${model} -> ${next}  (${(pg.properties.Piece?.title || []).map(t => t.plain_text).join('').slice(0, 40)})`);
      if (!DRY) await api(`/pages/${pg.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Model: { select: { name: next } } } }) });
    }
  }
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);

if (!DRY && changed) { // prune select options no longer used by any page
  const used = new Set(); cursor = undefined;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    r.results.forEach(pg => { const m = pg.properties.Model?.select?.name; if (m) used.add(m); });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  const db = await api(`/databases/${DB}`, { headers: H });
  const opts = db.properties.Model.select.options.filter(o => used.has(o.name));
  const pruned = db.properties.Model.select.options.length - opts.length;
  await api(`/databases/${DB}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Model: { select: { options: opts.map(o => ({ id: o.id, name: o.name })) } } } }) });
  console.log(`pruned ${pruned} unused model options`);
}
console.log(`changed ${changed}; ambiguous left: ${left.length}`);
left.slice(0, 10).forEach(x => console.log('  ', x));
