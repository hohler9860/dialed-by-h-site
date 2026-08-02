#!/usr/bin/env node
// Existing inventory pass: add SEO Tags to every piece that lacks them, and
// recategorize Classics / Everyday Wear per Henry's approved taxonomy.
// NEVER touches: 2026 Novelties, My Picks, Women's memberships; skips pages that already have Tags.
// --dry prints the planned changes without writing.
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('/Users/henryohler/IdeaProjects/dialed-by-h-site/.env.local', 'utf8')
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

const txt = p => (p?.rich_text || p?.title || []).map(x => x.plain_text).join('');
const sel = p => p?.select?.name || '';
const multi = p => (p?.multi_select || []).map(o => o.name);

// approved taxonomy — Classics: archetypal icons only; Everyday: steel/two-tone daily sports.
// Matched against model+name so Omega/Lange/FPJ pieces (whose Model select varies) resolve correctly.
const CLASSICS = /\b(cosmograph daytona|daytona|submariner|gmt-master ii|nautilus|royal oak jumbo|calatrava|tank\b|speedmaster|lange 1\b|chronometre (souverain|bleu))/i;
const EVERYDAY = /\b(aquanaut|explorer|oyster perpetual|datejust|land-dweller|sky-dweller|yacht-master|royal oak\b|overseas (self-winding|dual time|chronograph)|black bay|santos|panthere|twenty~4|elegante|speedmaster)/i;
const NO_PILL = /perpetual calendar|tourbillon|skeleton|minute repeater|zeitwerk|frosted|\bmini\b|offshore|code 11\.59|\brm ?\d|\bocta\b|grande? complication|dark side/i;
const STEELY = /oystersteel|stainless|steel|two-tone|rolesor|titanium|titalyt|ceramic/i;
const GEMSET = /diamond|pav[eé]|baguette|gem-set|sapphire bezel|rainbow/i;

function newCollections(model, name, material, dial, current) {
  const keep = current.filter(c => !['Classics', 'Everyday Wear'].includes(c)); // Novelties/My Picks/Women's preserved
  const hay = [model, name].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (NO_PILL.test(hay) || GEMSET.test([hay, dial].join(' '))) return keep;
  const out = [...keep];
  if (CLASSICS.test(hay)) out.push('Classics');
  if (EVERYDAY.test(hay) && STEELY.test([material || '', hay].join(' '))) out.push('Everyday Wear');
  return out;
}

function buildTags(brand, model, ref, material, dial, size, name, isWomens) {
  const comp = /chronograph/i.test(model + name) ? 'chronograph'
    : /perpetual/i.test(model + name) ? 'perpetual calendar'
    : /gmt|dual time|travel time|sky-dweller/i.test(model + name) ? 'gmt'
    : /tourbillon/i.test(model + name) ? 'tourbillon'
    : /annual calendar/i.test(model + name) ? 'annual calendar' : null;
  return [...new Set([
    brand.toLowerCase(), model ? model.toLowerCase() : null, ref ? ref.toLowerCase() : null,
    material ? material.toLowerCase() : null, dial ? dial.toLowerCase() + ' dial' : null,
    size ? size + 'mm' : null, comp,
    isWomens ? 'womens luxury watches' : 'mens luxury watches', 'luxury watches',
    `${brand.toLowerCase()} ${model ? model.toLowerCase() : 'watch'} for sale`, `buy ${brand.toLowerCase()} boston`,
    'boston watch dealer', 'luxury watches nyc', 'watch dealer miami', 'dialedbyh',
  ].filter(Boolean))].join(', ');
}

let cursor, pages = [];
do {
  const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
  const r = await api(`/databases/${DB}/query`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  pages.push(...r.results);
  cursor = r.has_more ? r.next_cursor : null;
} while (cursor);

let tagged = 0, recat = 0, skipped = 0;
const report = [];
for (const pg of pages) {
  const P = pg.properties;
  const brand = sel(P.Brand), model = sel(P.Model), ref = txt(P['Reference Number']);
  const material = sel(P['Case Material']), dial = sel(P['Dial Color']);
  const size = P['Case Size (mm)']?.number || null;
  const name = txt(P.Piece), curr = multi(P.Collection);
  const hasTags = txt(P.Tags).length > 0;
  const isWomens = curr.includes("Women's");
  if (hasTags && isWomens) { skipped++; continue; } // fresh inserts are already complete

  const props = {};
  if (!hasTags) { props.Tags = { rich_text: [{ text: { content: buildTags(brand, model, ref, material, dial, size, name, isWomens) } }] }; tagged++; }
  if (!isWomens) { // collection fixes apply to the pre-existing inventory only
    const next = newCollections(model, name, material, dial, curr);
    if (JSON.stringify([...next].sort()) !== JSON.stringify([...curr].sort())) {
      props.Collection = { multi_select: next.map(n => ({ name: n })) };
      recat++;
      report.push(`${brand} ${name} [${ref}]: ${curr.join('+') || '(none)'} -> ${next.join('+') || '(none)'}`);
    }
  }
  if (!Object.keys(props).length) { skipped++; continue; }
  if (!DRY) await api(`/pages/${pg.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: props }) });
}
console.log(`${DRY ? '[DRY RUN] ' : ''}pages ${pages.length}: tagged ${tagged}, recategorized ${recat}, untouched ${skipped}`);
console.log('--- collection changes ---');
report.forEach(x => console.log(x));
fs.writeFileSync('/Users/henryohler/Desktop/collection-changes.txt', report.join('\n'));
