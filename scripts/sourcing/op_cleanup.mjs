#!/usr/bin/env node
// Fix null-dial OP originals, archive the 21 badly-parsed OP inserts, reset ledger.
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
    } catch (e) { if (i === tries - 1) throw e; await new Promise(s => setTimeout(s, 2000 * (i + 1))); }
  }
};

// 1) identified dial colors for Henry's originals (from their own photos)
const nulls = JSON.parse(fs.readFileSync(`${DIR}/op_nulldial.json`));
for (const f of nulls) {
  const props = {};
  if (['124300', '126000'].includes(f.ref)) props['Dial Color'] = { select: { name: 'Yellow' } };
  if (['134303', '126003', '277203'].includes(f.ref)) props['Dial Color'] = { select: { name: 'Slate' } };
  if (f.ref === '126003') props['Case Size (mm)'] = { number: 36 }; // was wrongly 41
  if (Object.keys(props).length) {
    await api(`/pages/${f.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: props }) });
    console.log('fixed', f.piece, '->', props['Dial Color']?.select?.name);
  }
}

// 2) archive the 21 badly-parsed inserts by exact Piece title
const ledger = JSON.parse(fs.readFileSync(`${DIR}/op_inserted.json`));
let archived = 0;
for (const e of ledger) {
  const q = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify({
    filter: { and: [
      { property: 'Piece', title: { equals: e.piece } },
      { property: 'Brand', select: { equals: 'Rolex' } },
    ] }, page_size: 5 }) });
  for (const pg of q.results) {
    await api(`/pages/${pg.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ archived: true }) });
    archived++;
  }
}
console.log('archived', archived, 'bad OP inserts');
fs.writeFileSync(`${DIR}/op_inserted.json`, '[]');
console.log('op ledger reset');
