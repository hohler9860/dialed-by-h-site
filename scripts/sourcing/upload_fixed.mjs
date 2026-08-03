#!/usr/bin/env node
// Re-upload repaired cutouts to their Notion pages, matched by stored image filename.
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

const fixed = JSON.parse(fs.readFileSync(`${DIR}/bg_fixed.json`)).filter(x => !String(x[2]).startsWith('ERROR'));
const byName = new Map(fixed.map(x => [x[1], x[0]])); // filename -> dir
console.log('fixed files:', byName.size);

// map image filename -> page id across the whole DB
let cursor; const pageByName = new Map();
do {
  const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  for (const pg of r.results) {
    const f = pg.properties.Image?.files?.[0];
    if (f?.name) pageByName.set(f.name.replace(/-v\d+\.png$/, '.png'), pg.id);
  }
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);
console.log('pages indexed:', pageByName.size);

let ok = 0, miss = 0, fail = 0;
for (const [name, dir] of byName) {
  const pageId = pageByName.get(name);
  if (!pageId) { miss++; continue; }
  try {
    const buf = fs.readFileSync(`${DIR}/${dir}/${name}`);
    const up = await api('/file_uploads', { method: 'POST', headers: H, body: JSON.stringify({ filename: name, content_type: 'image/png' }) });
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'image/png' }), name);
    const r = await fetch(up.upload_url, { method: 'POST', headers: { Authorization: H.Authorization, 'Notion-Version': H['Notion-Version'] }, body: form });
    if (!r.ok) throw new Error('upload ' + r.status);
    await api(`/pages/${pageId}`, { method: 'PATCH', headers: H, body: JSON.stringify({
      properties: { Image: { files: [{ type: 'file_upload', file_upload: { id: up.id }, name }] } },
    }) });
    ok++;
    if (ok % 20 === 0) console.log(ok, 'replaced...');
  } catch (e) { fail++; console.log('FAIL', name, e.message.slice(0, 60)); }
}
console.log(`replaced ${ok}, no matching page ${miss}, failed ${fail}`);
