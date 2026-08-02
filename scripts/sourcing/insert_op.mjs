#!/usr/bin/env node
// OP colorway run: insert WA Oyster Perpetual collection, skipping anything
// Henry already has (matched by ref + base dial color + size). <41mm => Women's.
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

// base dial color canonicalization (both sides go through this)
function baseColor(s) {
  s = (s || '').toLowerCase();
  if (/jubilee/.test(s)) return 'jubilee';
  if (/celebration/.test(s)) return 'celebration';
  if (/turquoise|tiffany/.test(s)) return 'turquoise';
  if (/coral/.test(s)) return 'coral';
  if (/mother of pearl|mop/.test(s)) return 'mop';
  if (/lavender/.test(s)) return 'lavender';
  if (/pistachio/.test(s)) return 'pistachio';
  if (/beige/.test(s)) return 'beige';
  if (/slate/.test(s)) return 'slate';
  if (/silver/.test(s)) return 'silver';
  if (/candy pink|pink/.test(s)) return 'pink';
  if (/brown/.test(s)) return 'brown';
  if (/green/.test(s)) return 'green';
  if (/blue/.test(s)) return 'blue';
  if (/black/.test(s)) return 'black';
  if (/white/.test(s)) return 'white';
  if (/red/.test(s)) return 'red';
  if (/grey|gray/.test(s)) return 'grey';
  if (/yellow/.test(s)) return 'yellow';
  return s.replace(/[^a-z]+/g, '') || null;
}
const normRef = r => (r || '').toUpperCase().replace(/-\d{4}$/, '');

// existing OPs from the DB
const existing = []; // {ref, color|null, size}
let cursor;
do {
  const body = { filter: { property: 'Model', select: undefined }, page_size: 100 };
  delete body.filter; body.page_size = 100; if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  for (const pg of r.results) {
    const model = pg.properties.Model?.select?.name || '';
    if (!/^Oyster Perpetual/.test(model)) continue;
    existing.push({
      ref: normRef((pg.properties['Reference Number']?.rich_text || []).map(x => x.plain_text).join('')),
      color: pg.properties['Dial Color']?.select?.name ? baseColor(pg.properties['Dial Color'].select.name) : null,
      size: pg.properties['Case Size (mm)']?.number || null,
    });
  }
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);
console.log('existing OP entries:', existing.length);

function alreadyHave(ref, color) {
  for (const e of existing) {
    if (e.ref !== ref) continue;
    if (e.color === null) return 'ref match (existing entry has no dial color — conservative skip)';
    if (e.color === color) return `ref+color match (${color})`;
  }
  return null;
}

async function uploadImage(file) {
  const buf = fs.readFileSync(`${DIR}/op_png/${file}`);
  const up = await api('/file_uploads', { method: 'POST', headers: H, body: JSON.stringify({ filename: file, content_type: 'image/png' }) });
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/png' }), file);
  const r = await fetch(up.upload_url, { method: 'POST', headers: { Authorization: H.Authorization, 'Notion-Version': H['Notion-Version'] }, body: form });
  if (!r.ok) throw new Error(`upload ${file}: ${r.status}`);
  return up.id;
}

const rows = JSON.parse(fs.readFileSync(`${DIR}/wa_op.json`));
const ledgerPath = `${DIR}/op_inserted.json`;
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath)) : [];
const done = new Set(ledger.map(x => x.file));
const batchSeen = new Set();
let ok = 0; const skips = [], fails = [];

for (const r of rows) {
  if (done.has(r.file)) continue;
  const t = r.title.replace(/'([^']*)'/g, ' $1 ').replace(/\b(Ladies|Lady)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const sizeM = t.match(/Oyster Perpetual (\d{2})/);
  const size = sizeM ? parseInt(sizeM[1]) : null;
  const refM = t.match(/\b(\d{6}[A-Z]*)\b/);
  const ref = refM ? refM[1] : '';
  // strip materials first so they never leak into the dial phrase; WA titles can
  // read "...Stainless Steel Dial Blue Dial" — take the LAST phrase before "Dial"
  let td = t.replace(/Stainless Steel|Rose Gold|Yellow Gold|Everose( Gold)?|Oystersteel/gi, ' ').replace(/\s+/g, ' ');
  const dialMatches = [...td.matchAll(/([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*){0,4}?)\s+Dial\b/g)]
    .map(m => m[1].trim()).filter(x => x && !/^Dial$/i.test(x));
  let dialPhrase = dialMatches.length ? dialMatches[dialMatches.length - 1] : '';
  dialPhrase = dialPhrase.replace(/^(Steel|Gold|Stainless|Dial)\s+/i, '').replace(/\bDial\b/gi, '').replace(/\s+/g, ' ').trim();
  const color = baseColor(dialPhrase || t);
  const material = /Stainless Steel Yellow Gold/i.test(t) ? 'Oystersteel & Yellow Gold'
    : /Rose Gold/i.test(t) ? '18ct Everose Gold'
    : /Yellow Gold/i.test(t) ? '18K Yellow Gold'
    : /Stainless Steel/i.test(t) ? 'Stainless Steel' : null;
  const yM = r.title.match(/\((19|20)\d{2}\)/);
  const gem = /RBR|Diamond/i.test(t);

  const have = alreadyHave(normRef(ref), color);
  if (have) { skips.push(`${r.title.slice(0, 60)} -> ${have}`); continue; }
  const vk = [normRef(ref), color, gem].join('|');
  if (batchSeen.has(vk)) { skips.push(`${r.title.slice(0, 60)} -> batch dupe`); continue; }
  batchSeen.add(vk);

  const collections = [];
  if (size && size < 41) collections.push("Women's");
  if (material && /steel/i.test(material) && !gem) collections.push('Everyday Wear');
  const matWord = material ? material.replace(/^18(K|ct)\s/, '') : '';
  const dialName = dialPhrase || (color ? color[0].toUpperCase() + color.slice(1) : '');
  const piece = ['Oyster Perpetual', size, /gold/i.test(matWord) ? matWord : '', dialName ? dialName + ' Dial' : '']
    .filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const tags = [...new Set([
    'rolex', `oyster perpetual ${size || ''}`.trim(), ref.toLowerCase(),
    material ? material.toLowerCase() : null, color ? color + ' dial' : null,
    size ? size + 'mm' : null, gem ? 'diamond set' : null,
    size && size < 41 ? 'womens luxury watches' : 'mens luxury watches', 'luxury watches',
    'rolex oyster perpetual for sale', 'buy rolex boston',
    'boston watch dealer', 'luxury watches nyc', 'watch dealer miami', 'dialedbyh',
  ].filter(Boolean))].join(', ');

  try {
    const fileId = await uploadImage(r.file.replace('.jpg', '.png'));
    const props = {
      Piece: { title: [{ text: { content: piece } }] },
      Brand: { select: { name: 'Rolex' } },
      Model: { select: { name: `Oyster Perpetual ${size}` } },
      'Reference Number': { rich_text: [{ text: { content: ref } }] },
      Collection: { multi_select: collections.map(name => ({ name })) },
      Image: { files: [{ type: 'file_upload', file_upload: { id: fileId }, name: r.file.replace('.jpg', '.png') }] },
      Tags: { rich_text: [{ text: { content: tags } }] },
      Condition: { select: { name: 'Brand New' } },
    };
    if (material) props['Case Material'] = { select: { name: material } };
    if (dialName) props['Dial Color'] = { select: { name: dialName } };
    if (size) props['Case Size (mm)'] = { number: size };
    if (yM) props.Year = { number: parseInt(yM[0].slice(1, 5)) };
    await api('/pages', { method: 'POST', headers: H, body: JSON.stringify({ parent: { database_id: DB }, properties: props }) });
    ledger.push({ file: r.file, piece, ref, color, size });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
    ok++;
  } catch (e) { fails.push(`${r.file}: ${e.message}`); }
}
console.log(`inserted ${ok}, skipped ${skips.length}, failed ${fails.length}`);
console.log('--- skips ---'); skips.forEach(s => console.log(' ', s));
fails.slice(0, 8).forEach(f => console.log('FAIL', f));
