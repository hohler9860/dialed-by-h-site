#!/usr/bin/env node
// Insert WA women's catalog into "Pieces for Sourcing" with images + tags.
// Usage: node insert_notion.mjs --sample 20   |   node insert_notion.mjs --all
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync('/Users/henryohler/IdeaProjects/dialed-by-h-site/.env.local', 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const KEY = env.NOTION_API_KEY, DB = env.NOTION_DATABASE_ID;
const H = { Authorization: `Bearer ${KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

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

// ---------- parsing ----------
const BRAND_MAP = { 'BVLGARI Watches': 'Bulgari', 'Jaeger LeCoultre': 'Jaeger-LeCoultre' };
const MODELS = [ // longest-match-first per brand; maps title fragment -> Model select
  'Aquanaut Luce', 'Aquanaut', 'Twenty~4', 'Twenty-4', 'Nautilus', 'Calatrava', 'Golden Ellipse', 'Gondolo', 'Grand Complications',
  'Oyster Perpetual 36', 'Oyster Perpetual 39', 'Oyster Perpetual 41', 'Oyster Perpetual',
  'Clash', 'Ellipse', 'Trocadéro', 'Trocadero', 'Colisée', 'Colisee', 'Success',
  'Lady-Datejust', 'Datejust 31', 'Datejust 28', 'Datejust 26', 'Datejust 36', 'Datejust',
  'Oyster Perpetual 28', 'Oyster Perpetual 31', 'Oyster Perpetual 34', 'Day-Date 36', 'Day-Date 40', 'Day-Date',
  'Pearlmaster', 'Yacht-Master 37', 'Yacht-Master 40', 'Daytona', 'Cosmograph Daytona', 'GMT-Master II', 'Submariner',
  'Royal Oak Offshore', 'Royal Oak Concept', 'Royal Oak Chronograph', 'Royal Oak Frosted', 'Royal Oak Mini', 'Royal Oak Double Balance', 'Royal Oak',
  'Millenary', 'Code 11.59',
  'Panthere', 'Panthère', 'Tank Francaise', 'Tank Française', 'Tank Americaine', 'Tank Louis', 'Tank Must', 'Tank a Guichets', 'Tank',
  'Santos Demoiselle', 'Santos Dumont', 'Santos', 'Ballon Bleu', 'Ballon Blanc', 'Baignoire', 'Vendôme', 'Vendome', 'Pasha', 'Ronde',
  'Serpenti Tubogas', 'Serpenti Seduttori', 'Serpenti Spiga', 'Serpenti', 'Lvcea', 'Octo', 'BVLGARI BVLGARI',
  'Happy Sport', 'Happy Diamonds', 'Imperiale', 'Alpine Eagle',
  'Limelight Gala', 'Limelight', 'Possession', 'Polo',
  'Overseas', 'Patrimony', 'Traditionnelle', 'Égérie', 'Egerie',
  'Reverso', 'Rendez-Vous',
  'Alhambra', 'Pierre Arpels',
  'Élégante 48', 'Élégante 40', 'Elegante 48', 'Elegante 40',
  'Black Bay 54', 'Black Bay 31', 'Black Bay 32', 'Black Bay Chrono', 'Black Bay',
  'Tubogas', 'Cobra', '222', 'Lady Arpels', 'Ballerine', 'Charms', 'Cadenas',
  'Streamliner', 'Endeavour', 'Pioneer', 'Première', 'Premiere', 'Cellini', 'Lady-Date',
  'Crash Libre', 'Crash Tigrée', 'Crash Tigree', 'Crash', 'La Flamme', 'Neptune', 'Xtravaganza',
  'Vintage Oval', 'Jumbo Square', 'Jumbo Ellipse', 'Day Date 40', 'Day Date 36', 'Day Date',
  'Complications', 'Captive', 'La Doña', 'La Dona', 'Altiplano', 'Reine de Naples', '[RE]Master',
  'Land-Dweller', 'GMT-Master', 'Day-Date 36', 'Datejust 41', 'Sky-Dweller', 'Yacht-Master 42', 'Yacht-Master II', 'Yacht-Master 37', 'Sea-Dweller', 'Deepsea',
  'Air-King', 'Milgauss', 'Cellini', 'Explorer 40', 'Explorer II',
  'Royal Oak Concept', 'Jules Audemars', 'Royal Oak Double Balance Wheel Openworked',
  'Cubitus', 'World Time', 'Celestial', 'In-Line Perpetual Calendar',
  'Datograph', 'Odysseus', 'Saxonia', 'Richard Lange', '1815 Chronograph', '1815', 'Lange 31',
  'Zeitwerk', 'Grand Lange 1', 'Little Lange 1', 'Lange 1 Time Zone', 'Lange 1',
  'Centigraphe', 'Tourbillon Souverain', 'Vagabondage', 'Astronomic', 'Octa Lune', 'Octa',
  'Patrimony', 'Historiques', 'Fiftysix', 'Malte', 'American 1921',
  'Seamaster', 'Speedmaster', 'Constellation', 'De Ville',
  'Pelagos', 'Ranger', 'Royal',
];
const MODEL_FIX = { 'Day Date 40': 'Day-Date 40', 'Day Date 36': 'Day-Date 36', 'Day Date': 'Day-Date', 'Crash Tigree': 'Crash Tigrée' };
const RM_RE = /\bRM[\s-]?(\d{2,3})[-\s]?(\d{2})?\b/i;

const MATERIALS = [
  ['Stainless Steel Yellow Gold', 'Oystersteel & Yellow Gold'], ['Steel Yellow Gold', 'Oystersteel & Yellow Gold'],
  ['Stainless Steel Rose Gold', null], ['Stainless Steel Everose', 'Oystersteel & Everose Gold'],
  ['Two-Tone', null], ['Stainless Steel', 'Stainless Steel'],
  ['White Gold', '18K White Gold'], ['Yellow Gold', '18K Yellow Gold'],
  ['Rose Gold', '18K Rose Gold'], ['Everose Gold', '18ct Everose Gold'], ['Everose', '18ct Everose Gold'],
  ['Platinum', '950 Platinum'], ['Titanium', 'Titanium'], ['Carbon TPT', 'Carbon TPT'], ['Quartz TPT', null], ['Ceramic', null],
];
const ICONS = /^(Cosmograph Daytona|Daytona|Submariner|Nautilus|Royal Oak|Tank|Tank Francaise|Tank Française|Tank Must|Tank Louis|Calatrava|Santos|GMT-Master II|Reverso)$/;
const EVERYDAY = /^(Lady-Datejust|Datejust.*|Oyster Perpetual.*|Aquanaut Luce|Panthere|Panthère|Santos|Happy Sport|Alpine Eagle|Overseas|Ballon Bleu|Serpenti Tubogas|Twenty~4|Twenty-4)$/;
const GEMMY = /diamond|pav[eé]|baguette|sapphire|ruby|emerald|rainbow|rbr\b/i;

const tcase = s => s.replace(/\w\S*/g, w => /^(of|the|and)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase());

function parse(row) {
  const brand = BRAND_MAP[row.vendor] || row.vendor;
  const waTags = row.tags.split(',').map(t => t.trim());
  // strip the FULL brand string (as it appears in the title) plus Ladies/Midsize noise
  let t = row.title
    .replace(new RegExp('^' + row.vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .replace(/^(BVLGARI|Patek Philippe|Audemars Piguet|Vacheron Constantin|Van Cleef & Arpels|H\. Moser & Cie\.?|Jaeger.?LeCoultre)/i, '')
    .replace(/'([^']*)'/g, ' $1 ')       // unquote nicknames so '222'/'Oyster 100' stay parseable
    .replace(/\b(Ladies|Lady|Midsize|Mens)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();

  // model: longest vocab match against cleaned title
  let model = null;
  if (brand === 'Richard Mille') { const m = t.match(RM_RE); model = m ? `RM ${m[1]}${m[2] ? '-' + m[2] : ''}` : null; }
  else model = MODELS.filter(x => t.toLowerCase().includes(x.toLowerCase()))
                     .sort((a, b) => b.length - a.length)[0] || null;
  if (MODEL_FIX[model]) model = MODEL_FIX[model];
  if (model === 'Panthere') model = 'Panthère';
  if (model === 'Daytona') model = 'Cosmograph Daytona';
  if (model === 'Twenty-4') model = 'Twenty~4';
  if (model === 'Vendome') model = 'Vendôme';
  if (model === 'Datejust') model = /\b26\b/.test(t) ? 'Datejust 26' : /\b28\b/.test(t) ? 'Datejust 28' : /\b31\b/.test(t) ? 'Datejust 31' : 'Datejust';

  // reference: digit-bearing token, ≥4 chars, not a bare size/model number
  const refM = t.match(/\b(?=[A-Z0-9/.\-]{4,})([A-Z]{0,6}\d[A-Z0-9/.\-]*\d[A-Z0-9/.\-]*|[A-Z]{2,6}\d{2,}[A-Z0-9/.\-]*)\b/i);
  let ref = refM ? refM[1].replace(/[.\-/]+$/, '') : '';
  if (!ref) { const rm2 = t.match(/\bRef\.?\s+([A-Z0-9\-]{2,})/i); if (rm2) ref = rm2[1]; }
  if (brand === 'Richard Mille') {
    if (ref && !/^RM/i.test(ref)) ref = 'RM' + ref;
    if (!ref && model) ref = model.replace(/\s/g, '');
  }

  // size: prefer WA's own mm tags (decimal beats integer), fall back to title
  const mmTags = waTags.map(x => x.match(/^(\d{2}(?:\.\d)?)\s?-?mm$/i)).filter(Boolean).map(m => parseFloat(m[1]));
  const size = mmTags.find(v => !Number.isInteger(v)) ?? mmTags[0] ?? (t.match(/(\d{2}(?:\.\d)?)\s?mm/i)?.[1] && parseFloat(t.match(/(\d{2}(?:\.\d)?)\s?mm/i)[1])) ?? null;

  // dial: longest WA tag ending in "dial", cleaned + title-cased
  const dialTags = waTags.filter(x => /dial$/i.test(x) && x.length < 40)
    .map(x => x.replace(/\s*dial$/i, '').trim()).filter(x => x && !/^(set|gold|steel)$/i.test(x))
    .sort((a, b) => b.length - a.length);
  let dial = dialTags.length ? tcase(dialTags[0]) : '';
  if (!dial) { // fallback: color phrase right before "Dial", after removing material words
    let td = t;
    for (const [k] of MATERIALS) td = td.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    td = td.replace(/\s+/g, ' ');
    const COLORS = 'Black|White|Blue|Green|Silver|Silvered|Champagne|Chocolate|Olive|Pink|Purple|Red|Grey|Gray|Salmon|Ivory|Opaline|Malachite|Onyx|Turquoise|Multicolour|Multicoloured|Multicolor|Mother of Pearl|Celebration|Azzurro|Tiffany|Lacquer|Meteorite|Opal|Enamel|Pave|Pavé';
    const m = td.match(new RegExp(`\\b((?:${COLORS})(?:[\\w\\s]{0,18}?))\\s+Dial\\b`, 'i'));
    if (m) dial = tcase(m[1].trim());
  }

  let material = null;
  for (const [k, v] of MATERIALS) if (t.toLowerCase().includes(k.toLowerCase())) { material = v; break; }

  const gem = GEMMY.test(row.title) || waTags.some(x => /^(diamond bezel|pave diamonds|diamonds|diamond set)$/i.test(x));
  // approved taxonomy (same rules as the existing-inventory recat)
  const hayT = ((model || '') + ' ' + t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const TAX_CLASSICS = /\b(cosmograph daytona|daytona|submariner|gmt-master ii|nautilus|royal oak jumbo|calatrava|tank\b|speedmaster|lange 1\b|chronometre (souverain|bleu))/i;
  const TAX_EVERYDAY = /\b(aquanaut|explorer|oyster perpetual|datejust|land-dweller|sky-dweller|yacht-master|royal oak\b|overseas (self-winding|dual time|chronograph)|black bay|santos|panthere|elegante|speedmaster)/i;
  const TAX_NOPILL = /perpetual calendar|tourbillon|skeleton|minute repeater|zeitwerk|frosted|\bmini\b|offshore|code 11\.59|\brm ?\d|\bocta\b|grande? complication|dark side/i;
  const collections = [];
  if (!TAX_NOPILL.test(hayT) && !gem) {
    if (TAX_CLASSICS.test(hayT)) collections.push('Classics');
    if (TAX_EVERYDAY.test(hayT) && /steel|oystersteel|two-tone|rolesor|titanium|ceramic/i.test(row.title)) collections.push('Everyday Wear');
  }

  const matWord = material ? material.replace(/^18(K|ct)\s/, '').replace(' & ', ' ') : '';
  let fallbackBase = t;
  if (ref) fallbackBase = fallbackBase.replace(ref, ' ');
  for (const [k] of MATERIALS) fallbackBase = fallbackBase.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  fallbackBase = fallbackBase.replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  const pieceBase = model || fallbackBase;
  const piece = [pieceBase,
    /gold|platinum/i.test(matWord) && !/gold/i.test(pieceBase) ? matWord : '',
    dial ? dial + ' Dial' : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const complication = /chronograph|chrono\b/i.test(row.title) ? 'chronograph'
    : /moonphase|moon phase/i.test(row.title) ? 'moonphase'
    : /tourbillon/i.test(row.title) ? 'tourbillon' : null;

  const tags = [...new Set([
    brand.toLowerCase(), model ? model.toLowerCase() : null, ref ? ref.toLowerCase() : null,
    material ? material.toLowerCase() : null, dial ? dial.toLowerCase() + ' dial' : null,
    size ? size + 'mm' : null, complication, gem ? 'diamond set' : null,
    'mens luxury watches', 'luxury watches', `${brand.toLowerCase()} ${model ? model.toLowerCase() : 'watch'} for sale`, `buy ${brand.toLowerCase()} boston`,
    'boston watch dealer', 'luxury watches nyc', 'watch dealer miami', 'dialedbyh',
  ].filter(Boolean))].join(', ');

  const yM = row.title.match(/\((19|20)\d{2}\)/);
  return { brand, model, ref, dial, size, material, piece, collections, tags, year: yM ? parseInt(yM[0].slice(1, 5)) : null };
}

// existing inventory refs for dedupe (brand+ref, normalized)
async function existingRefs() {
  const seen = new Set(); let cursor;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    for (const pg of r.results) {
      const b = pg.properties.Brand?.select?.name || '';
      const rf = (pg.properties['Reference Number']?.rich_text || []).map(x => x.plain_text).join('');
      if (rf) seen.add((b + '|' + rf).toLowerCase().replace(/\s/g, ''));
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return seen;
}

// ---------- notion ----------
async function ensureTagsProp() {
  const db = await api(`/databases/${DB}`, { headers: H });
  if (!db.properties.Tags) {
    await api(`/databases/${DB}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: { Tags: { rich_text: {} } } }) });
    console.log('added Tags property');
  }
}

async function uploadImage(file) {
  const buf = fs.readFileSync(path.join(DIR, 'mens_png', file));
  const up = await api('/file_uploads', { method: 'POST', headers: H, body: JSON.stringify({ filename: file, content_type: 'image/png' }) });
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/png' }), file);
  const r = await fetch(up.upload_url, { method: 'POST', headers: { Authorization: H.Authorization, 'Notion-Version': H['Notion-Version'] }, body: form });
  if (!r.ok) throw new Error(`upload ${file}: ${r.status} ${await r.text()}`);
  return up.id;
}

async function insert(row) {
  const p = parse(row);
  const png = row.file.replace(/\.jpg$/, '.png');
  const fileId = await uploadImage(png);
  const props = {
    Piece: { title: [{ text: { content: p.piece } }] },
    Brand: { select: { name: p.brand } },
    'Reference Number': { rich_text: [{ text: { content: p.ref } }] },
    Collection: { multi_select: p.collections.map(name => ({ name })) },
    Image: { files: [{ type: 'file_upload', file_upload: { id: fileId }, name: png }] },
    Tags: { rich_text: [{ text: { content: p.tags } }] },
    Condition: { select: { name: 'Brand New' } },
  };
  if (p.model) props.Model = { select: { name: p.model } };
  if (p.material) props['Case Material'] = { select: { name: p.material } };
  if (p.dial) props['Dial Color'] = { select: { name: p.dial } };
  if (p.size) props['Case Size (mm)'] = { number: p.size };
  if (p.year) props.Year = { number: p.year };
  // drop select props the DB stores as other types; API will error clearly if mismatched
  await api('/pages', { method: 'POST', headers: H, body: JSON.stringify({ parent: { database_id: DB }, properties: props }) });
  return p;
}

// ---------- main ----------
const keep = JSON.parse(fs.readFileSync(path.join(DIR, 'wa_mens.json')));
const ledgerPath = path.join(DIR, 'mens_inserted.json');
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath)) : [];
const done = new Set(ledger.map(x => x.file));

const arg = process.argv[2];
let batch;
if (arg === '--sample') {
  const n = parseInt(process.argv[3] || '20');
  const byBrand = {};
  keep.forEach(r => { if (!done.has(r.file)) (byBrand[r.vendor] ||= []).push(r); });
  batch = [];
  const order = ['Rolex', 'Patek Philippe', 'Audemars Piguet', 'Cartier', 'Richard Mille', 'BVLGARI Watches', 'Chopard', 'Piaget', 'Vacheron Constantin', 'Tudor', 'H. Moser & Cie.', 'Van Cleef & Arpels'];
  let i = 0;
  while (batch.length < n) {
    const b = order[i % order.length]; i++;
    if (byBrand[b]?.length) batch.push(byBrand[b].shift());
    if (i > 200) break;
  }
} else if (arg === '--all') {
  batch = keep.filter(r => !done.has(r.file));
} else if (arg === '--restore') {
  // insert ONLY the audit-identified lost colorways; brand+ref check bypassed on purpose
  const lost = new Set(JSON.parse(fs.readFileSync(path.join(DIR, 'mens_lost.json'))));
  batch = keep.filter(r => lost.has(r.file) && !done.has(r.file));
} else if (arg === '--audit') {
  // replay within-batch dedupe over the whole catalog and classify each collision
  const seen2 = new Map();
  let trueDupes = 0; const collapsed = [];
  for (const r of keep) {
    if (/RM\s?27|Crash|Minute Repeater|Sonnerie|Grande? Complication\b|Baguette Diamonds|Grandmaster|Tiffany/i.test(r.title)) continue;
    const p = parse(r);
    const k = [p.brand, p.ref, p.dial, p.material].join('|').toLowerCase().replace(/\s/g, '');
    const norm = t => t.toLowerCase().replace(/\((19|20)\d{2}(\/\d{4})?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen2.has(k)) {
      if (norm(seen2.get(k)) === norm(r.title)) trueDupes++;
      else collapsed.push({ kept: seen2.get(k), lost: r.title, file: r.file });
    } else seen2.set(k, r.title);
  }
  console.log(`true duplicates correctly skipped: ${trueDupes}`);
  console.log(`distinct pieces collapsed by dedupe key: ${collapsed.length}`);
  collapsed.forEach(x => console.log(`KEPT: ${x.kept.slice(0, 62)}\n LOST: ${x.lost.slice(0, 62)}`));
  fs.writeFileSync(path.join(DIR, 'mens_lost.json'), JSON.stringify(collapsed.map(x => x.file), null, 1));
  process.exit(0);
} else if (arg === '--dry') {
  const stats = { noModel: [], noRef: [], all: 0 };
  for (const r of keep) {
    const p = parse(r); stats.all++;
    if (!p.model) stats.noModel.push(r.title.slice(0, 60));
    if (!p.ref) stats.noRef.push(r.title.slice(0, 60));
  }
  console.log(`parsed ${stats.all}: model missing ${stats.noModel.length}, ref missing ${stats.noRef.length}`);
  stats.noModel.slice(0, 12).forEach(x => console.log(' NOMODEL', x));
  stats.noRef.slice(0, 8).forEach(x => console.log(' NOREF', x));
  console.log('--- sample parses ---');
  [3, 47, 120, 200, 280, 350, 420, 470].forEach(i => {
    if (!keep[i]) return; const p = parse(keep[i]);
    console.log(JSON.stringify({ piece: p.piece, brand: p.brand, model: p.model, ref: p.ref, dial: p.dial, size: p.size, mat: p.material, col: p.collections.join('+') }));
  });
  process.exit(0);
} else { console.log('need --sample N | --all | --dry'); process.exit(1); }

// un-sourceable ultra tier: log + skip (Henry: nothing he can't realistically source right now)
const TOO_BIG = /RM\s?27|Crash|Minute Repeater|Sonnerie|Grande? Complication\b|Baguette Diamonds|Sapphire Crystal Case|Grandmaster|Tiffany|cufflink|key\s?chain|necklace|money clip|\bpen\b|wallet|table clock|desk clock/i;
const tooBig = [];
batch = batch.filter(r => {
  if (TOO_BIG.test(r.title)) { tooBig.push(r.title.slice(0, 70)); return false; }
  return true;
});
if (tooBig.length) { console.log(`excluded ${tooBig.length} ultra-tier pieces:`); tooBig.forEach(x => console.log('  ULTRA', x)); }

await ensureTagsProp();
const seen = await existingRefs();
const preCount = batch.length;
const dupes = [];
const batchSeen = new Set();
batch = batch.filter(r => {
  const p = parse(r);
  const dbKey = (p.brand + '|' + p.ref).toLowerCase().replace(/\s/g, '');
  // full normalized title so colorway variants sharing a ref are NOT collapsed;
  // only listings that are word-for-word the same watch dedupe
  const varKey = p.brand + '|' + r.title.toLowerCase().replace(/\((19|20)\d{2}(\/\d{4})?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (p.ref && seen.has(dbKey)) { dupes.push(p.brand + ' ' + p.ref + ' (in inventory)'); return false; }
  if (batchSeen.has(varKey)) { dupes.push(p.brand + ' ' + p.ref + ' (batch dupe)'); return false; }
  batchSeen.add(varKey);
  return true;
});
if (dupes.length) console.log(`skipping ${dupes.length} already in inventory or batch:`, dupes.slice(0, 8).join('; '), '...');
let ok = 0, fails = [];
for (const row of batch) {
  try {
    const p = await insert(row);
    ledger.push({ file: row.file, piece: p.piece, brand: p.brand, model: p.model, ref: p.ref, collections: p.collections });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
    ok++;
    if (ok % 25 === 0) console.log(`${ok}/${batch.length}...`);
  } catch (e) { fails.push(`${row.file}: ${e.message}`); }
}
console.log(`inserted ${ok}/${batch.length}, failed ${fails.length}`);
fails.slice(0, 10).forEach(f => console.log('FAIL', f));
