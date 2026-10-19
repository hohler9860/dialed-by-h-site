#!/usr/bin/env node
/**
 * Retail price comparables: Shopify catalogues -> wholesale.retail_listings.
 *
 * This used to run in n8n, but the shops rate-limit the n8n server's datacenter
 * IP (about 10 of every 12 runs failed with 429 from 10-18 on), so it runs from
 * Henry's Mac instead, where the same requests go through. daily-scan.js calls
 * it every 2 hours; each call works through the shops whose last full sync is
 * older than STALE_HOURS until its time budget runs out, saving its place after
 * every page, so every shop refreshes once a day without a burst of requests.  Safe to run by hand:  node scripts/retail-sync.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) { console.error('retail-sync: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local'); process.exit(2); }

const STALE_HOURS = 20;
// Shops start refusing pages requested 3s apart (Happy Jewelers answers 500),
// so space them out; it is no slower than eating a 20s retry on every page.
const PAGE_DELAY_MS = 8000;
const MAX_PAGES = 100;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const db = (p, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
  ...opts,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'wholesale', 'Content-Profile': 'wholesale',
             'Content-Type': 'application/json', ...(opts.headers || {}) },
});

// Same code as the n8n "Shape retail rows" node, kept verbatim so a page is read
// the same way wherever it runs: reference from the title, watch-or-not filter,
// and condition / box and papers / year from the product description.
function shape(page, pageMeta) {
  const $input = { all: () => [{ json: page }], first: () => ({ json: page }) };
  const $ = () => ({ all: () => [{ json: pageMeta }] });
  // Turn Shopify products into retail_listings rows and, crucially, dig the
  // manufacturer reference out of the title so it can be joined to the wholesale
  // index. Titles are the only place these shops put it.
  const src = $('Pages to fetch').all();

  // Longest plausible ref wins: 5711/1A-010 beats 5711. Anchored on token
  // boundaries so we do not slice digits out of the middle of a word.
  const REF_RE = /\b([A-Z]{0,3}\d{4,8}(?:[A-Z]{0,4})?(?:\/\d{1,3}[A-Z]{0,3})?(?:-\d{2,4})?)\b/g;
  function refFrom(title) {
    const t = String(title || '').toUpperCase();
    let best = null;
    let m;
    while ((m = REF_RE.exec(t)) !== null) {
      const cand = m[1];
      // Years and prices masquerade as references; require a letter or enough digits.
      if (/^(19|20)\d{2}$/.test(cand)) continue;
      if (cand.length < 4) continue;
      if (!best || cand.length > best.length) best = cand;
    }
    return best;
  }
  function brandFrom(p) {
    const title = String(p.title || '').toLowerCase();
    const makers = [['Audemars Piguet','audemars'],['Patek Philippe','patek'],['Vacheron Constantin','vacheron'],['Rolex','rolex'],['Richard Mille','richard mille'],['Grand Seiko','grand seiko'],['A. Lange & Sohne','lange'],['F.P. Journe','journe'],['Jaeger-LeCoultre','jaeger'],['Cartier','cartier'],['Omega','omega'],['Tudor','tudor'],['Breitling','breitling'],['IWC','iwc'],['Piaget','piaget'],['Panerai','panerai'],['Hublot','hublot'],['Zenith','zenith'],['Chopard','chopard'],['Breguet','breguet'],['Bulgari','bulgari'],['Franck Muller','franck muller'],['Blancpain','blancpain'],['Tag Heuer','tag heuer']];
    const known = makers.find(([,token]) => title.includes(token));
    return known ? known[0] : p.vendor || null;
  }


  // Several of these shops sell jewellery alongside watches. A $20 pair of earrings
  // is noise in a watch price index, so keep a row only when it is recognisably a
  // watch: a known maker in the title/vendor, or a parsed reference.
  const BRANDS = ['rolex','patek','audemars','cartier','omega','tudor','breitling','iwc',
    'jaeger','lecoultre','vacheron','lange','panerai','hublot','zenith','chopard','bvlgari',
    'bulgari','grand seiko','seiko','tag heuer','heuer','longines','montblanc','oris',
    'richard mille','franck muller','ulysse','girard','blancpain','glashutte','breguet',
    'piaget','chanel','hermes','tissot','rado','baume','vacheron constantin','f.p. journe',
    'journe','moser','greubel','mb&f','urwerk','bell & ross','norqain','nomos','sinn'];
  function looksLikeWatch(p, ref) {
    const type = String(p.product_type || '').toLowerCase();
    const title = String(p.title || '').toLowerCase();
    if (/jewel|diamond|earring|necklace|pendant|ring|accessor|strap|winder/.test(type) && !/watch|timepiece/.test(type)) return false;
    if (/\b(earrings?|necklaces?|pendants?|straps?|winders?|cufflinks?)\b/.test(title)) return false;
    // A numeric product identifier alone cannot establish that it is a watch.
    const hay = ((p.title || '') + ' ' + (p.vendor || '') + ' ' + (p.product_type || '')).toLowerCase();
    if (/\b(watch|chronograph|timepiece|wristwatch)\b/.test(hay)) return true;
    return BRANDS.some(function (b) { return hay.indexOf(b) >= 0; });
  }

  // Condition, box/papers and year, read from what the shop actually published.
  // Vocabulary matches wholesale.listings so retail_benchmark can match on it:
  // condition NEW | UNWORN | PRE_OWNED, set FULL_SET | WATCH_AND_CARD |
  // WATCH_AND_BOX | WATCH_ONLY. Anything not stated stays null, never guessed.
  function specFrom(p) {
    const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const title = String(p.title || '');
    const body = strip(p.body_html);
    const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(','))
      .map(t => String(t).trim().toLowerCase()).filter(Boolean);
    const tag = (re) => tags.some(t => re.test(t));
    const all = (title + ' ' + body).toLowerCase();

    // Condition: the shop's own "Condition" field first, then tags, then words.
    let condition = null;
    const condField = (body.match(/\bcondition\s*:?\s*([a-z][a-z \-;,]{2,40})/i) || [])[1] || '';
    const c = condField.toLowerCase();
    if (/unworn/.test(c)) condition = 'UNWORN';
    else if (/brand new|^new\b/.test(c)) condition = 'NEW';
    else if (/pre-?owned|used|excellent|very good|good|mint|vintage/.test(c)) condition = 'PRE_OWNED';
    if (!condition) {
      if (tag(/^unworn$/)) condition = 'UNWORN';
      else if (tag(/^(pre-?owned|used|vintage)$|\bpre-?owned\b/)) condition = 'PRE_OWNED';
      else if (tag(/^(new|brand-new|brand new)$/) && !tag(/pre-?owned|^used$/)) condition = 'NEW';
      else if (/\bunworn\b/.test(all)) condition = 'UNWORN';
      else if (/\b(pre-?owned|vintage)\b/.test(all)) condition = 'PRE_OWNED';
    }

    // Box and papers: explicit fields, then tags. "Box Rolex Box" means a box.
    let box = null, papers = null;
    const bp = (body.match(/box (?:and|&) papers\s*:?\s*([a-z ]{0,30})/i) || [])[1];
    if (bp !== undefined) {
      const v = bp.toLowerCase();
      if (/box (and|&) papers|full set|both/.test(v)) { box = true; papers = true; }
      else if (/papers only|card only/.test(v)) { box = false; papers = true; }
      else if (/box only/.test(v)) { box = true; papers = false; }
      else if (/watch only|^no\b|none/.test(v)) { box = false; papers = false; }
    }
    // Happy Jewelers writes "Branded Box Box" (has one) or "Box Generic" (does not).
    if (box === null) {
      const bb = body.match(/\bbranded box\s+(box|yes|no|none|generic)/i);
      if (bb) box = /^(box|yes)$/i.test(bb[1]);
    }
    if (box === null) {
      const b = body.match(/\bbox\s*:?\s*(yes|no|none|n\/a|generic|original box|[a-z]+ box)\b/i);
      if (b) box = !/^(no|none|n\/a|generic|generic box)$/i.test(b[1]);
    }
    // Service or archive papers are not the original warranty papers.
    if (papers === null) {
      const pp = body.match(/\b(?:papers|warranty card)\s*:?\s*(yes|no|none|n\/a|original|card|service|archive)\b/i);
      if (pp) papers = /^(yes|original|card)$/i.test(pp[1]);
    }
    if (box === null && tag(/^box$|^box-and-papers$|^full-set$/)) box = true;
    if (papers === null && tag(/^papers$|^box-and-papers$|^full-set$/)) papers = true;
    if (box === null && papers === null && /\bfull set\b/.test(all)) { box = true; papers = true; }
    if (box === null && papers === null && /\bwatch only\b/.test(all)) { box = false; papers = false; }

    let set_completeness = null;
    if (box === true && papers === true) set_completeness = 'FULL_SET';
    else if (papers === true && box === false) set_completeness = 'WATCH_AND_CARD';
    else if (box === true && papers === false) set_completeness = 'WATCH_AND_BOX';
    else if (box === false && papers === false) set_completeness = 'WATCH_ONLY';

    // Year: a labelled field, then "(2017)" in the title, then a leading "1989 ".
    let year = null;
    const y = body.match(/\byear(?: or est\.? production)?\s*:?\s*((?:19|20)\d{2})\b/i)
      || title.match(/\(((?:19|20)\d{2})\)/) || title.match(/^((?:19|20)\d{2})\s/);
    if (y) { const n = parseInt(y[1], 10); if (n >= 1900 && n <= new Date().getFullYear() + 1) year = n; }

    return { condition, set_completeness, year };
  }

  const rows = [];
  let pages = 0;
  let limited = 0;
  for (let i = 0; i < $input.all().length; i++) {
    const res = $input.all()[i].json;
    const meta = src[i] ? src[i].json : {};
    if (!res || !Array.isArray(res.products)) throw new Error('Retail feed did not return a products array');
    const products = res.products;
    if (typeof res === 'string' || (res && typeof res.data === 'string')) { limited++; continue; }
    if (!products.length) continue;
    pages++;
    for (const p of products) {
      const variants = p.variants || [];
      const v = variants.find(v => v.available === true) || variants[0] || {};
      const price = v.price != null ? Number(v.price) : null;
      if (!price || !isFinite(price) || price <= 0) continue;
      const ref = refFrom(p.title);
      if (!looksLikeWatch(p, ref)) continue;
      rows.push({
        source_slug: meta.slug,
        external_id: String(p.id),
        title: p.title || null,
        brand: brandFrom(p),
        reference: ref,
        price_usd: price,
        available: v.available === true,
        url: meta.base + '/products/' + (p.handle || ''),
        image_url: (p.images && p.images[0] && p.images[0].src) || null,
        raw: { handle: p.handle, type: p.product_type || null, sku: v.sku || null },
        ...specFrom(p),
        last_seen: new Date().toISOString(),
      });
    }
  }
  // De-dupe within the batch: the same product can appear across pages if the
  // shop reorders mid-crawl, and one duplicate would fail the whole upsert.
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    const k = r.source_slug + '|' + r.external_id;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  const response = $input.first().json;
  const meta = src[0].json;
  const complete = response.products.length < 250;
  return [{ json: { rows: deduped, count: deduped.length, pages, limited, slug: meta.slug, page: meta.page, complete, rows_seen: meta.rows_so_far + deduped.length } }];
}

// 429 means slow down: wait a minute, then try once more. A 5xx on a deep page
// is how some shops (Happy Jewelers) refuse deep pagination under load, so it
// gets one short retry and then the shop resumes from that page next run.
async function fetchPage(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
    } catch (e) {
      // A page that hangs past 30s gets the same single retry as a 5xx.
      if (attempt === 0) { await sleep(20000); continue; }
      throw new Error(e.name === 'TimeoutError' ? 'timed out' : e.message);
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    if (attempt === 0) await sleep(res.status === 429 ? 60000 : 20000);
    else throw new Error(`HTTP ${res.status}`);
  }
}

// Where each shop stopped last time, so a refused deep page is picked up on
// the next run instead of the catalogue tail never being refreshed.
const STATE_FILE = path.join(__dirname, '..', 'logs', 'retail-sync-state.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const writeState = (s) => { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1)); } catch {} };

// Stop starting new pages well inside daily-scan's 10 minute limit per script
// (a page can still take ~2 minutes with a 429 wait and a retry).
const RUN_BUDGET_MS = 6 * 60 * 1000;
const runStarted = Date.now();

async function syncShop(shop, from, onPage) {
  let rows = 0, withSet = 0, page = from;
  for (; page < from + MAX_PAGES; page++) {
    if (Date.now() - runStarted > RUN_BUDGET_MS) return { rows, withSet, complete: false, stoppedAt: page, reason: 'time budget' };
    let data;
    try { data = await fetchPage(`${shop.base}/products.json?limit=250&page=${page}`); }
    catch (e) { return { rows, withSet, complete: false, stoppedAt: page, reason: e.message }; }
    const out = shape(data, { slug: shop.slug, base: shop.base, page, rows_so_far: rows })[0].json;
    if (out.rows.length) {
      const up = await db('retail_listings?on_conflict=source_slug,external_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out.rows) });
      if (!up.ok) throw new Error(`upsert page ${page}: ${up.status} ${(await up.text()).slice(0, 200)}`);
    }
    rows += out.rows.length;
    withSet += out.rows.filter(r => r.set_completeness).length;
    if (out.complete) return { rows, withSet, complete: true, stoppedAt: page };
    onPage(page + 1);
    await sleep(PAGE_DELAY_MS);
  }
  return { rows, withSet, complete: false, stoppedAt: page, reason: 'page limit' };
}

const patchSource = (slug, body) => db(`retail_sources?slug=eq.${encodeURIComponent(slug)}`,
  { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }).catch(() => {});

(async () => {
  const res = await db(`retail_sources?select=slug,base_url,last_sync&feed_type=eq.shopify_json&active=is.true&order=last_sync.asc.nullsfirst`);
  if (!res.ok) { console.error(`retail-sync: could not read retail_sources (${res.status})`); process.exit(1); }
  const cutoff = Date.now() - STALE_HOURS * 3600 * 1000;
  const due = (await res.json()).filter(s => !s.last_sync || Date.parse(s.last_sync) < cutoff);
  if (!due.length) { console.log(`retail-sync: every shop refreshed in the last ${STALE_HOURS}h`); return; }

  const state = readState();
  let changed = false;
  for (const s of due) {
    if (Date.now() - runStarted > RUN_BUDGET_MS) { console.log(`retail-sync: out of time, ${s.slug} waits for the next run`); break; }
    const shop = { slug: s.slug, base: s.base_url.replace(/\/$/, '') };
    const st = state[s.slug] || { resume: 1, stuck: 0 };
    // Three runs in a row with no progress from the same page: start over, so
    // the front of the catalogue is not left stale behind a page that never loads.
    const from = st.stuck >= 3 ? 1 : st.resume;
    const t0 = Date.now();
    const r = await syncShop(shop, from, (next) => { state[s.slug] = { resume: next, stuck: 0 }; writeState(state); });
    const secs = Math.round((Date.now() - t0) / 1000);
    changed = changed || r.rows > 0;
    if (r.complete) {
      state[s.slug] = { resume: 1, stuck: 0 };
      await patchSource(s.slug, { last_sync: new Date().toISOString(), last_count: r.rows, last_error: null });
      console.log(`retail-sync: ${s.slug} done from page ${from} in ${secs}s, ${r.rows} watches, ${r.withSet} with box/papers`);
    } else {
      // Not finished: keep last_sync old so the shop is first in line next run.
      // Only a refused page counts toward "stuck"; running out of time does not.
      const refused = r.reason !== 'time budget' && r.stoppedAt === from;
      state[s.slug] = { resume: r.stoppedAt, stuck: refused ? (st.stuck || 0) + 1 : 0 };
      await patchSource(s.slug, { last_error: `paused at page ${r.stoppedAt}: ${r.reason}`.slice(0, 300) });
      console.log(`retail-sync: ${s.slug} paused at page ${r.stoppedAt} after ${secs}s (${r.reason}), ${r.rows} watches so far, resumes next run`);
    }
    writeState(state);
  }
  writeState(state);
  // Fresh comparables: let the quote book snapshot refresh on its next minute.
  if (changed) await db('admin_snapshot_refreshes?name=eq.quote_book', { method: 'DELETE' }).catch(() => {});
})().catch(e => { console.error('retail-sync failed:', e); process.exit(1); });
