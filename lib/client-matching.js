// Deterministic sourcing shortlist. Identity, specification and price are
// independent checks. Unknown evidence never becomes a positive assertion.
const crypto = require('crypto');
const VERSION = 'strict-v1';
const key = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const brandKey = v => ({ AP: 'AUDEMARSPIGUET', PP: 'PATEKPHILIPPE' }[key(v)] || key(v));
const specKey = v => ({GREY:'GRAY',BOXANDPAPERS:'FULLSET',JUBILEEBRACELET:'JUBILEE',OYSTERBRACELET:'OYSTER'}[key(v)] || key(v));
const known = v => v != null && v !== '' && !['UNKNOWN','UNSPECIFIED','NA'].includes(key(v));
function sourceHash(w) {
  return crypto.createHash('sha256').update(JSON.stringify(['brand','model','reference','max_price','want_condition','want_set','year_from','year_to','notes','status'].map(k => w[k] ?? null))).digest('hex');
}
function requestFor(w, saved, now = Date.now()) {
  const confirmed = !!saved && saved.source_hash === sourceHash(w) && Number.isFinite(Date.parse(saved.confirmed_at)) && now - Date.parse(saved.confirmed_at) <= 30 * 864e5;
  const p = saved && saved.source_hash === sourceHash(w) ? saved.preferences : {};
  const req = { brand:w.brand, model:w.model, reference:w.reference, max_price:w.max_price, condition:w.want_condition, set:w.want_set, year_from:w.year_from, year_to:w.year_to, ...p };
  const review = [];
  if (!confirmed) review.push('Reconfirm client request and original notes');
  if (!known(req.brand) || (!known(req.reference) && !known(req.model))) review.push('Missing watch identity');
  // Notes are deliberately never silently converted into constraints: alternatives,
  // changed budgets and condition language must be resolved by a human once.
  return { ...req, confirmed, review, source_hash:sourceHash(w) };
}
function evaluate(req, l, now = Date.now()) {
  const rejected = [], review = [...req.review];
  const fail = s => rejected.push(s);
  const field = (label, expected, actual, normalize = specKey) => {
    if (!known(expected)) return;
    if (!known(actual)) review.push(`${label} not stated`);
    else if (normalize(expected) !== normalize(actual)) fail(`${label} differs`);
  };
  if (!known(req.brand) || (!known(req.reference) && !known(req.model))) fail('Request has no reliable identity');
  if (!known(l.brand)) fail('Listing brand missing');
  else field('Brand',req.brand,l.brand,brandKey);
  if (known(req.reference)) {
    if (!known(l.reference)) fail('Listing reference missing');
    else field('Reference', req.reference, l.reference,key);
    // A contradictory model is evidence against even an exact reference.
    field('Model', req.model,l.model);
  } else field('Model',req.model,l.model);
  if (!known(req.reference) && !known(l.model)) fail('Listing model missing');
  field('Condition',req.condition,l.condition);
  field('Contents',req.set,l.set_completeness);
  for (const [name,label] of [['dial_color','Dial'],['bracelet','Bracelet'],['bezel','Bezel'],['case_material','Case metal'],['dial_material','Dial material']]) field(label,req[name],l[name]);
  if (req.case_size_mm != null) {
    if (!Number(l.case_size_mm)) review.push('Case size not stated');
    else if (Number(req.case_size_mm) !== Number(l.case_size_mm)) fail('Case size differs');
  }
  if (req.year_from != null || req.year_to != null) {
    if (!Number(l.year)) review.push('Year not stated');
    else if ((req.year_from != null && Number(l.year)<Number(req.year_from)) || (req.year_to != null && Number(l.year)>Number(req.year_to))) fail('Year outside requested range');
  }
  for (const f of ['has_diamonds','diamonds_factory']) {
   if (typeof req[f] === 'boolean') {
    if (typeof l[f] !== 'boolean') review.push(f === 'has_diamonds' ? 'Diamonds not confirmed' : 'Diamond origin not confirmed');
    else if (req[f] !== l[f]) fail(f === 'has_diamonds' ? 'Diamonds differ' : 'Diamond origin differs');
  }
   }
  if (l.listing_type !== 'FOR_SALE') fail('Not a sale listing');
  if (known(l.status) && !['ACTIVE','OPEN','AVAILABLE','CLASSIFIED','AWAITINGVERIFY'].includes(key(l.status))) fail('Listing is not active');
  if (!known(l.status) || key(l.status)==='AWAITINGVERIFY') review.push('Listing verification status incomplete');
  const ts = Date.parse(l.message_ts);
  if (!Number.isFinite(ts) || now-ts>3*864e5 || ts>now+300000) fail('Listing outside three-day freshness window');
  if (!Number.isFinite(Number(l.price_usd)) || Number(l.price_usd)<500) fail('Invalid dealer ask');
  if (Number(req.max_price)>0 && Math.ceil(Number(l.price_usd)*1.05)>Number(req.max_price)) fail('Five-percent target exceeds client budget');
  if (!Number.isFinite(Number(l.trust_score)) || Number(l.trust_score)<70) review.push('Low or missing extraction confidence');
  if (l.vision_mismatch || (l.photo_conflicts || []).length || (l.photo_unresolved || []).length) review.push('Photo evidence is disputed or unresolved');
  if (!l.photo_read_at) review.push('Photo verification incomplete');
  if (req.manual_requirements) review.push('Check manually: '+req.manual_requirements);
  review.push('Confirm dealer availability and final client quote');
  return { version:VERSION, rejected:[...new Set(rejected)], review:[...new Set(review)], status:rejected.length?'REJECTED':'NEEDS_REVIEW', identity:known(req.reference)?'EXACT_REFERENCE':'EXACT_MODEL' };
}
function evidenceHash(req,l) {
  const fields=['brand','model','reference','price_usd','condition','set_completeness','year','dial_color','dial_material','bracelet','bezel','case_material','case_size_mm','has_diamonds','diamonds_factory','status','listing_type','message_ts','trust_score','vision_mismatch','photo_conflicts','photo_unresolved','photo_read_at'];
  return crypto.createHash('sha256').update(JSON.stringify([VERSION,req,fields.map(f=>l[f]??null)])).digest('hex');
}
function shortlist(wants, listings, saved = [], now = Date.now(), feedback = []) {
  const byWant = new Map(saved.map(p=>[String(p.want_id),p]));
  const best = [], diagnostic = [];
  for (const w of wants) {
    const req = requestFor(w,byWant.get(String(w.id)),now);
    w.match_review = req.review;
    const candidates = [];
    let rejected = 0;
    for (const l of listings) {
      // Cheap prefilter avoids showing unrelated rejection counts.
      if (brandKey(req.brand)!==brandKey(l.brand)) continue;
      if (known(req.reference) ? key(req.reference)!==key(l.reference) : key(req.model)!==key(l.model)) continue;
      const assessment = evaluate(req,l,now);
      const evidence_hash = evidenceHash(req,l);
      const label = feedback.find(f=>String(f.want_id)===String(w.id) && String(f.listing_id)===String(l.id) && f.evidence_hash===evidence_hash && f.engine_version===VERSION);
      if (label?.decision==='REJECT') { rejected++; continue; }
      if (assessment.rejected.length) { rejected++; continue; }
      candidates.push({ want_id:w.id,listing_id:l.id,want:w,listing:l,reference:l.reference,dealer_price:l.price_usd,dealer_name:l.seller_name,assessment,evidence_hash,feedback:label || null });
    }
    // Evidence completeness precedes price. Lead heat never changes correctness.
    candidates.sort((a,b)=>a.assessment.review.length-b.assessment.review.length || Number(a.dealer_price)-Number(b.dealer_price) || String(a.listing_id).localeCompare(String(b.listing_id)));
    if (candidates[0]) best.push({...candidates[0], candidate_count:candidates.length});
    diagnostic.push({want_id:w.id, candidates:candidates.length,rejected,review:req.review});
  }
  return {best,diagnostic,version:VERSION};
}
function priceTarget(req, l, retail = [], now = Date.now()) {
  const ask = Number(l.price_usd);
  const floor = Math.ceil(ask * 1.05), ceiling = Math.ceil(ask * 1.08);
  const comps = retail.filter(r => r.available === true && now-Date.parse(r.last_seen)<=36*36e5 && Date.parse(r.last_seen)<=now+300000 && Number(r.price_usd)>0 && brandKey(r.brand)===brandKey(l.brand) && key(r.reference)===key(l.reference) && ['condition','set_completeness','dial_color','year'].every(f=>known(l[f]) && known(r[f]) && key(l[f])===key(r[f])));
  const sources = new Set(comps.map(r=>r.source_slug));
  const prices = comps.map(r=>Number(r.price_usd)).sort((a,b)=>a-b);
  const market = prices.length ? (prices[Math.floor((prices.length-1)/2)]+prices[Math.floor(prices.length/2)])/2 : null;
  const enough = sources.size>=2 && prices.length>=3;
  const budget = Number(req.max_price)>0 ? Number(req.max_price) : Infinity;
  const high = Math.min(ceiling,budget,enough?Math.floor(market):Infinity);
  return { target_low:floor,target_high:high>=floor?high:null, market_median:market,market_count:prices.length,market_sources:sources.size, market_supported:enough && high>=floor, market_below_target:enough && high<floor, pricing_note:enough ? 'Retail asking prices; confirm variant, shipping and fees before quoting' : 'Insufficient fresh comparable market evidence; manual quote review' };
}
module.exports={key,brandKey,sourceHash,requestFor,evaluate,shortlist,priceTarget,evidenceHash,VERSION};
