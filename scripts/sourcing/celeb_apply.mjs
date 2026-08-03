#!/usr/bin/env node
// Tag DB pieces with the celebrities that wear them (Celebrity multi_select),
// and list celeb pieces we don't carry yet -> celeb_missing.json
import fs from 'fs';
const DIR = '/private/tmp/claude-501/-Users-henryohler/fc0f9ad8-d46d-4fa9-a81f-db8693aa760a/scratchpad';
const env = Object.fromEntries(
  fs.readFileSync('/Users/henryohler/IdeaProjects/dialed-by-h-site/.env.local', 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const H = { Authorization: `Bearer ${env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const DB = env.NOTION_DATABASE_ID;
const api = async (url, opts, tries = 5) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://api.notion.com/v1${url}`, opts);
      if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
      const j = await r.json();
      if (!r.ok) throw new Error(`${url}: ${j.message || r.status}`);
      return j;
    } catch (e) { if (i === tries - 1) throw e; await new Promise(s => setTimeout(s, 2500 * (i + 1))); }
  }
};

// ensure Celebrity property
const db = await api(`/databases/${DB}`, { headers: H });
if (!db.properties.Celebrity) {
  await api(`/databases/${DB}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Celebrity: { multi_select: {} } } }) });
  console.log('added Celebrity property');
}

const BRAND_MAP = { 'BVLGARI Watches': 'Bulgari', 'Jaeger LeCoultre': 'Jaeger-LeCoultre', 'OMEGA': 'Omega' };
const refOf = (title, vendor) => {
  const t = title.replace(/'([^']*)'/g, ' $1 ');
  const m = t.replace(new RegExp(vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .match(/\b(?=[A-Z0-9/.\-]{4,})([A-Z]{0,6}\d[A-Z0-9/.\-]*\d[A-Z0-9/.\-]*|[A-Z]{2,6}\d{2,}[A-Z0-9/.\-]*)\b/i);
  let ref = m ? m[1].replace(/[.\-/]+$/, '').toUpperCase() : '';
  if (/richard mille/i.test(vendor) && ref && !/^RM/i.test(ref)) ref = 'RM' + ref;
  return ref;
};
const norm = r => r.replace(/-\d{4}$/, '');

// index DB by brand|ref
let cursor; const byKey = new Map();
do {
  const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  for (const pg of r.results) {
    const b = pg.properties.Brand?.select?.name || '';
    const rf = norm(((pg.properties['Reference Number']?.rich_text) || []).map(x => x.plain_text).join('').toUpperCase());
    if (!rf) continue;
    const k = (b + '|' + rf).toLowerCase().replace(/\s/g, '');
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ id: pg.id, dial: (pg.properties['Dial Color']?.select?.name || '').toLowerCase(),
      celebs: (pg.properties.Celebrity?.multi_select || []).map(o => o.name) });
  }
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);
console.log('db keys:', byKey.size);

const celebs = JSON.parse(fs.readFileSync(`${DIR}/celebs.json`));
const want = new Map(); // pageId -> Set(celebs)
const missing = [];
for (const [name, rows] of Object.entries(celebs)) {
  for (const row of rows) {
    const brand = BRAND_MAP[row.vendor] || row.vendor;
    const ref = refOf(row.title, row.vendor);
    if (!ref) { missing.push({ celeb: name, ...row, reason: 'no-ref' }); continue; }
    const k = (brand + '|' + norm(ref)).toLowerCase().replace(/\s/g, '');
    let hits = byKey.get(k);
    if (!hits) { missing.push({ celeb: name, ...row, ref }); continue; }
    const COLORS = ['meteorite','mother of pearl','chocolate','sundust','rainbow','turquoise','green','blue','black','white','silver','champagne','grey','gray','brown','pink','purple','red','salmon','ivory','gold dust','olive'];
    const rowColor = COLORS.find(c => new RegExp(c + '[^a-z]*(dial|diamond dial|baguette dial)', 'i').test(row.title));
    if (rowColor && hits.length > 1) {
      const filtered = hits.filter(h => h.dial.indexOf(rowColor) >= 0);
      if (filtered.length) hits = filtered;
    }
    hits.forEach(h => { want.set(h.id, want.get(h.id) || new Set()); want.get(h.id).add(name); });
  }
}
console.log('pages to tag:', want.size, '| missing pieces:', missing.length);

// clear pages that were tagged before but aren't in the new mapping
let cleared = 0;
for (const [, entries] of byKey) {
  for (const e of entries) {
    if (e.celebs.length && !want.has(e.id)) {
      await api(`/pages/${e.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Celebrity: { multi_select: [] } } }) });
      cleared++;
    }
  }
}
console.log('cleared stale tags on', cleared, 'pages');
let ok = 0;
for (const [id, set] of want) {
  await api(`/pages/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({
    properties: { Celebrity: { multi_select: [...set].map(name => ({ name })) } },
  }) });
  ok++;
  if (ok % 40 === 0) console.log(ok, 'tagged...');
}
fs.writeFileSync(`${DIR}/celeb_missing.json`, JSON.stringify(missing, null, 1));
console.log(`tagged ${ok} pages; missing list saved (${missing.length})`);
