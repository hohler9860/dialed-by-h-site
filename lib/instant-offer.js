// Instant Offer: price a seller's watch off the live dealer index and let them
// lock the number in for 48 hours.
//
// Lives inside api/submit-form.js (action: "instant-offer") because the project
// sits at Vercel's 12-function Hobby cap. Three ops:
//   quote        reference (+ dial, condition, set) -> a number, no DB write
//   sign-upload  a signed PUT url for one photo into the private dbh-offers bucket
//   submit       contact details + photos -> dbh_offers row + email to Henry
//
// The number is always recomputed server-side on submit. The client never
// tells us what the offer was.

const { Resend } = require("resend");
const { guard, getClientIp } = require("./ratelimit.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// How far under the wholesale median the instant number sits. 15% leaves
// room to flip to a dealer at wholesale or hold for retail. Henry can move
// this without a deploy via the env var.
const MARGIN = Math.min(0.4, Math.max(0.05, Number(process.env.INSTANT_OFFER_MARGIN || 0.15)));
const WINDOW_DAYS = 45;
const OFFER_HOURS = 48;
const MIN_LISTINGS = 3;          // fewer than this: no instant number, manual quote
const REVIEW_ABOVE = 75000;      // show the number, but flag for Henry before it is binding
const MAX_PHOTOS = 6;

// Condition and set nudges, applied to the median before the margin. Dealer
// listings skew toward full-set, excellent pieces, so anything less is priced
// off that baseline. Small on purpose: the inspection is where the real
// adjustment happens.
const CONDITION_ADJ = { unworn: 0.02, excellent: 0, good: -0.04, fair: -0.10, poor: -0.18 };
const SET_ADJ = { full: 0, box: -0.03, papers: -0.03, naked: -0.06 };

const CONDITIONS = Object.keys(CONDITION_ADJ);
const SETS = Object.keys(SET_ADJ);

function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });
}

function roundTo(n, step) {
  return Math.round(Number(n) / step) * step;
}

function cleanRef(s) {
  return String(s || "").trim().slice(0, 40);
}

function pick(value, allowed) {
  const v = String(value || "").trim().toLowerCase();
  return allowed.includes(v) ? v : null;
}

// Market stats for one reference from the live index.
async function marketFor(reference, dial) {
  const r = await sb("rpc/instant_offer", {
    method: "POST",
    headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
    body: JSON.stringify({ p_reference: reference, p_dial: dial || null, p_days: WINDOW_DAYS }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `instant_offer rpc ${r.status}`);
  }
  const rows = await r.json();
  return rows && rows[0] ? rows[0] : null;
}

// Turn market stats plus the seller's answers into the offer. Pure function
// so it can be unit-tested without a database.
function priceIt(market, { condition, set }) {
  if (!market || !market.n || market.n < MIN_LISTINGS) {
    return {
      ok: false,
      reason: "thin",
      market: market ? summarize(market) : null,
    };
  }
  const condAdj = CONDITION_ADJ[condition] ?? 0;
  const setAdj = SET_ADJ[set] ?? 0;
  const factor = (1 + condAdj + setAdj) * (1 - MARGIN);
  const median = Number(market.median);
  const p10 = Number(market.p10);
  const p90 = Number(market.p90);

  const step = median >= 50000 ? 500 : median >= 10000 ? 100 : 50;
  const amount = roundTo(median * factor, step);
  const low = roundTo(p10 * factor, step);
  const high = roundTo(p90 * factor, step);

  // Spread across the p10..p90 band. Wide with no dial match usually means
  // several variants share the reference, so the number is shown as the
  // middle of a range rather than a single figure.
  const spread = p10 > 0 ? p90 / p10 : 99;
  const dialMatched = !!market.dial_used;
  let confidence = "LOW";
  if (market.n >= 20 && (dialMatched || spread <= 1.25)) confidence = "HIGH";
  else if (market.n >= 5 && spread <= 1.6) confidence = "MEDIUM";
  else if (market.n >= 5) confidence = "MEDIUM_WIDE";

  return {
    ok: true,
    amount,
    low,
    high,
    confidence,
    show_range: confidence === "MEDIUM_WIDE" || confidence === "LOW",
    needs_review: amount >= REVIEW_ABOVE,
    margin_pct: MARGIN,
    adjustments: { condition: condAdj, set: setAdj },
    expires_at: new Date(Date.now() + OFFER_HOURS * 3600 * 1000).toISOString(),
    market: summarize(market),
  };
}

function summarize(m) {
  return {
    ref_core: m.ref_core,
    brand: m.brand,
    model: m.model,
    dial_used: m.dial_used,
    n: m.n,
    n_ref: m.n_ref,
    median: Number(m.median),
    p10: Number(m.p10),
    p90: Number(m.p90),
    days: m.days,
    last_seen: m.last_seen,
  };
}

// ── photo matching ─────────────────────────────────────────────────────────
// The seller's photos are read by the same vision model and prompt the
// pipeline uses on dealer photos, so the read is comparable to the index it
// is priced against. Three jobs: confirm the typed reference, catch a
// mismatch, and read the variant (dial, bezel, bracelet, metal) that moves
// the price. It never replaces inspection; it makes the number land closer.
const VISION_MODEL = process.env.INSTANT_OFFER_VISION_MODEL || "google/gemini-2.5-flash-lite";
const MAX_READ_PHOTOS = 3;

const VISION_SYSTEM = [
  "You identify wristwatches from one to three photographs of the same watch.",
  "You are given NO description. Report only what you can actually see.",
  "",
  "Return ONLY JSON with exactly these keys:",
  '{"brand":string|null,"model":string|null,"reference":string|null,',
  '"dial_color":string|null,',
  '"hour_markers":"BATON"|"ROMAN"|"ARABIC"|"MIXED"|"DIAMOND"|"BAGUETTE"|"NONE"|null,',
  '"bezel":"SMOOTH"|"FLUTED"|"CERAMIC"|"TACHYMETRE"|"DIAMOND"|"BAGUETTE"|"GEM_SET"|"ENGRAVED"|null,',
  '"bracelet":"OYSTER"|"JUBILEE"|"PRESIDENT"|"OYSTERFLEX"|"LEATHER"|"RUBBER"|"INTEGRATED"|"MESH"|null,',
  '"case_metal":"STEEL"|"YELLOW_GOLD"|"WHITE_GOLD"|"ROSE_GOLD"|"TWO_TONE"|"PLATINUM"|"TITANIUM"|"CERAMIC"|null,',
  '"diamonds":"NONE"|"DIAL"|"BEZEL"|"BRACELET"|"BEZEL_AND_DIAL"|"FULL"|null,',
  '"set_seen":"FULL"|"BOX"|"PAPERS"|"CARD"|"NONE"|null,',
  '"condition_notes":string|null,',
  '"is_watch":true|false,',
  '"confidence":0-100}',
  "",
  "Rules:",
  "- Use null when you cannot see it. A guess is worse than a null.",
  "- The reference is often printed on a warranty card or engraved between the lugs. Read it exactly if a photo shows it.",
  "- Baguette markers are long rectangular stones, not round ones.",
  "- Fluted bezels have fine vertical grooves. Gem-set bezels have stones.",
  "- Jubilee is five-link, Oyster three-link, President three-link and rounded.",
  "- Blue, black and grey all read near-black in a phone photo. If unsure, null.",
  "- condition_notes: only visible wear (scratches, polish, dents, bracelet stretch). One short sentence or null.",
  "- is_watch is false if the photos are not of a wristwatch.",
].join("\n");

function refCore(s) {
  const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c || null;
}

async function signReadUrls(paths) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/dbh-offers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ expiresIn: 600, paths }),
  });
  if (!r.ok) throw new Error(`sign ${r.status}`);
  const rows = await r.json();
  return rows.filter((x) => x.signedURL).map((x) => `${SUPABASE_URL}/storage/v1${x.signedURL}`);
}

async function readPhotos(paths, typedReference) {
  const key = process.env.OPENROUTER_API_KEY;
  const clean = (paths || []).filter((p) => typeof p === "string" && p.startsWith("pending/")).slice(0, MAX_READ_PHOTOS);
  if (!key || !clean.length) return { status: "none", read: null, model: null };

  const urls = await signReadUrls(clean);
  if (!urls.length) return { status: "none", read: null, model: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  let read = null;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://www.dialedbyhenry.com", "X-Title": "DBH Instant Offer" },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VISION_SYSTEM },
          { role: "user", content: [
            { type: "text", text: "Identify this watch. JSON only." },
            ...urls.map((u) => ({ type: "image_url", image_url: { url: u } })),
          ] },
        ],
      }),
      signal: controller.signal,
    });
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content;
    if (txt) read = JSON.parse(txt);
  } catch (e) {
    console.error("[instant-offer] photo read failed:", e.message);
    return { status: "error", read: null, model: VISION_MODEL };
  } finally {
    clearTimeout(timer);
  }
  if (!read) return { status: "error", read: null, model: VISION_MODEL };
  if (read.is_watch === false) return { status: "not_a_watch", read, model: VISION_MODEL };

  const typed = refCore(typedReference);
  const seen = refCore(read.reference);

  // A reference visible in the photos (card, caseback) settles it outright.
  if (seen && typed) {
    return { status: seen === typed ? "match" : "mismatch", read, model: VISION_MODEL,
      suggested_reference: seen !== typed ? read.reference : null, conflicts: [] };
  }
  if (seen && !typed) return { status: "read", read, model: VISION_MODEL, suggested_reference: read.reference, conflicts: [] };

  // No reference in the photos. Match on what the photos show instead.
  if (typed) {
    // Does the typed reference look like this in the index?
    let p = null;
    try { const prof = await rpc("ref_profile", { p_reference: typedReference, p_days: WINDOW_DAYS }); p = prof && prof[0]; }
    catch (e) { console.error("[instant-offer] ref_profile failed:", e.message); }
    const conflicts = [];
    if (p) {
      if (read.brand && p.brand && read.brand.toLowerCase() !== p.brand.toLowerCase()) conflicts.push(`brand: photos ${read.brand}, index says ${p.brand}`);
      // Metal and dial only count as conflicts when the index is near-unanimous
      // for that reference. A Day-Date sold in ten dials must not be flagged.
      const rm = normMetal(read.case_metal), pm = normMetal(p.metal);
      if (rm && pm && rm !== pm && pm !== "GOLD" && rm !== "GOLD" && Number(p.metal_share || 0) >= 0.7) conflicts.push(`metal: photos ${rm.toLowerCase().replace(/_/g, " ")}, index says ${pm.toLowerCase().replace(/_/g, " ")}`);
      if (read.model && p.model && !modelWordsOverlap(read.model, p.model)) conflicts.push(`model: photos ${read.model}, index says ${p.model}`);
      if (read.dial_color && p.dial && normDial(read.dial_color) !== p.dial && p.n >= 20 && Number(p.dial_share || 0) >= 0.7) conflicts.push(`dial: photos ${String(read.dial_color).toLowerCase()}, nearly every listing is ${String(p.dial).toLowerCase()}`);
    }
    const status = conflicts.length ? "mismatch_attributes" : (p ? "consistent" : "unreadable");
    let candidates = [];
    if (conflicts.length) candidates = await candidatesFor(read);
    return { status, read, model: VISION_MODEL, conflicts, profile: p || null, candidates, suggested_reference: candidates[0]?.ref_core || null };
  }

  // Nothing typed, nothing printed: propose references from the index.
  const candidates = await candidatesFor(read);
  return { status: candidates.length ? "candidates" : "unreadable", read, model: VISION_MODEL, conflicts: [], candidates,
    suggested_reference: candidates.length === 1 ? candidates[0].ref_core : null };
}

async function rpc(name, args) {
  const r = await sb(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `${name} rpc ${r.status}`);
  }
  return r.json();
}

function normMetal(s) {
  const v = String(s || "").toUpperCase().replace(/\s+/g, "_");
  if (!v) return null;
  if (v === "GOLD" || v === "PINK_GOLD") return v === "PINK_GOLD" ? "ROSE_GOLD" : "GOLD";
  return v;
}
function normDial(s) {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "gray") return "GREY";
  return v.toUpperCase().replace(/\s+/g, "_");
}
function modelWordsOverlap(a, b) {
  const w = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 2));
  const A = w(a), B = w(b);
  for (const x of A) if (B.has(x)) return true;
  // "daydate" vs "day date"
  const ca = [...A].join(""), cb = [...B].join("");
  return ca.includes(cb) || cb.includes(ca);
}

async function candidatesFor(read) {
  if (!read || !read.brand) return [];
  try {
    const rows = await rpc("photo_candidates", {
      p_brand: read.brand, p_model: read.model || null, p_dial: read.dial_color || null,
      p_metal: read.case_metal || null, p_bracelet: read.bracelet || null, p_bezel: read.bezel || null,
      p_days: WINDOW_DAYS, p_limit: 4,
    });
    return (rows || []).map((r) => ({ ref_core: r.ref_core, model: r.model, n: r.n, median: Number(r.median) }));
  } catch (e) {
    console.error("[instant-offer] candidates failed:", e.message);
    return [];
  }
}

// ── email to Henry ─────────────────────────────────────────────────────────
let resend;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(n) {
  return n == null ? "" : "$" + Number(n).toLocaleString("en-US");
}
function offerEmail(row) {
  const rows = [
    ["Watch", [row.brand, row.model, row.reference].filter(Boolean).join(" ")],
    ["Dial / Year", [row.dial, row.year].filter(Boolean).join(" / ")],
    ["Condition / Set", [row.condition, row.set_completeness].filter(Boolean).join(" / ")],
    ["Offer", row.offer_amount != null ? `${money(row.offer_amount)} (${row.confidence})` : "No instant number, quote by hand"],
    ["Market", row.market_n ? `median ${money(row.market_median)} on ${row.market_n} listings / ${row.market_days}d, band ${money(row.market_p10)} to ${money(row.market_p90)}` : ""],
    ["Name", row.full_name],
    ["Email", row.email],
    ["Phone", row.phone],
    ["Based in", row.location],
    ["Notes", row.notes],
    ["Photos", (row.photos || []).length ? `${row.photos.length} uploaded, see admin` : "none"],
    ["Photo check", row.photo_match && row.photo_match !== "none"
      ? `${row.photo_match.toUpperCase()}${row.photo_read ? `: ${[row.photo_read.brand, row.photo_read.model, row.photo_read.reference, row.photo_read.dial_color ? row.photo_read.dial_color + " dial" : null, row.photo_read.bezel, row.photo_read.bracelet, row.photo_read.case_metal].filter(Boolean).join(", ")}${row.photo_read.condition_notes ? ". " + row.photo_read.condition_notes : ""} (${row.photo_read.confidence ?? "?"}%)` : ""}`
      : ""],
    ["Expires", row.expires_at ? new Date(row.expires_at).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET" : ""],
  ].filter(([, v]) => v);
  const tr = rows.map(([k, v]) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;width:110px;vertical-align:top">${k}</td>` +
    `<td style="padding:10px 0 10px 16px;border-bottom:1px solid #eee;font-size:15px;color:#1a1a1a;vertical-align:top">${esc(v)}</td></tr>`).join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#fafafa">
      <div style="border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:28px">
        <strong style="font-size:11px;letter-spacing:3px;text-transform:uppercase">DIALED BY H</strong>
      </div>
      <h2 style="font-size:18px;font-weight:700;margin:0 0 20px">${row.needs_review ? "Instant Offer needs your OK" : "Instant Offer locked"}</h2>
      <table style="width:100%;border-collapse:collapse">${tr}</table>
      <div style="border-top:1px solid #e5e5e5;margin-top:32px;padding-top:14px;font-size:11px;color:#aaa">Sent automatically from dialedbyhenry.com</div>
    </div>`;
}

// ── handler ────────────────────────────────────────────────────────────────
async function handle(req, res) {
  const body = req.body || {};
  const op = String(body.op || "");

  if (op === "quote") {
    const rl = await guard({ req, name: "instant-offer-quote", perIp: { max: 30, windowSeconds: 600 }, global: { max: 600, windowSeconds: 600 } });
    if (!rl.allowed) return res.status(429).json({ error: "Too many requests. Try again in a few minutes." });

    const reference = cleanRef(body.reference);
    if (reference.length < 3) return res.status(400).json({ error: "Enter the reference number" });
    const dial = String(body.dial || "").trim().slice(0, 40) || null;
    const condition = pick(body.condition, CONDITIONS);
    const set = pick(body.set, SETS);

    const market = await marketFor(reference, dial);
    const offer = priceIt(market, { condition, set });
    return res.status(200).json({ ok: true, reference, ...offer });
  }

  if (op === "search") {
    const rl = await guard({ req, name: "instant-offer-search", perIp: { max: 120, windowSeconds: 600 }, global: { max: 3000, windowSeconds: 600 } });
    if (!rl.allowed) return res.status(429).json({ error: "Slow down a little." });
    const q = String(body.q || "").trim().slice(0, 60);
    if (q.length < 2) return res.status(200).json({ ok: true, results: [] });
    const rows = await rpc("ref_search", { q, p_limit: 6, p_days: 60 });
    const results = (rows || []).map((r) => ({
      ref_core: r.ref_core, reference: r.reference, brand: r.brand, model: r.model,
      n: r.n, median: r.median == null ? null : Number(r.median),
      dials: r.dials || [], metal: r.metal, size_mm: r.size_mm == null ? null : Number(r.size_mm),
      image: Array.isArray(r.image) ? r.image[0] : (typeof r.image === "string" ? r.image : null),
    }));
    return res.status(200).json({ ok: true, results });
  }

  if (op === "sign-upload") {
    const rl = await guard({ req, name: "instant-offer-upload", perIp: { max: 24, windowSeconds: 600 }, global: { max: 400, windowSeconds: 600 } });
    if (!rl.allowed) return res.status(429).json({ error: "Too many uploads. Try again in a few minutes." });

    const mime = String(body.mime || "");
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return res.status(400).json({ error: "Photos only (JPG, PNG, WebP, HEIC)" });
    const safe = String(body.filename || "photo").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const session = String(body.session || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "anon";
    const path = `pending/${session}/${Date.now()}-${safe}`;

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/dbh-offers/${encodeURI(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: "{}",
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(500).json({ error: err.message || "Could not sign upload" });
    }
    const signed = await r.json();
    return res.status(200).json({ path, uploadUrl: `${SUPABASE_URL}/storage/v1${signed.url}` });
  }

  if (op === "photo-read") {
    const rl = await guard({ req, name: "instant-offer-photo", perIp: { max: 12, windowSeconds: 600 }, global: { max: 200, windowSeconds: 600 } });
    if (!rl.allowed) return res.status(429).json({ error: "Too many photo checks. Try again in a few minutes." });
    const out = await readPhotos(body.photos, body.reference);
    return res.status(200).json({ ok: true, ...out });
  }

  if (op === "submit") {
    const rl = await guard({ req, name: "instant-offer-submit", perIp: { max: 6, windowSeconds: 600 }, global: { max: 60, windowSeconds: 600 } });
    if (!rl.allowed) return res.status(429).json({ error: "Too many requests. Try again in a few minutes." });

    const reference = cleanRef(body.reference);
    if (reference.length < 3) return res.status(400).json({ error: "Enter the reference number" });
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email" });
    const phone = String(body.phone || "").trim();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return res.status(400).json({ error: "Please enter a valid phone number" });
    const location = String(body.location || "").trim().slice(0, 120);
    if (!location) return res.status(400).json({ error: "Please tell me where you are based" });

    const dial = String(body.dial || "").trim().slice(0, 40) || null;
    const condition = pick(body.condition, CONDITIONS);
    const set = pick(body.set, SETS);
    const year = Number.parseInt(body.year, 10);
    const photos = Array.isArray(body.photos)
      ? body.photos.filter((p) => typeof p === "string" && p.startsWith("pending/")).slice(0, MAX_PHOTOS)
      : [];

    // Photos are re-read here rather than trusted from the client, so the
    // stored match is ours. Runs alongside the pricing call.
    const [market, photo] = await Promise.all([
      marketFor(reference, dial),
      photos.length ? readPhotos(photos, reference).catch((e) => ({ status: "error", read: null, model: null, error: e.message })) : Promise.resolve({ status: "none", read: null, model: null }),
    ]);
    const offer = priceIt(market, { condition, set });
    if (photo.status === "mismatch" || photo.status === "not_a_watch") offer.needs_review = true;

    const sellOption = String(body.option || "instant") === "consign" ? "consign" : "instant";
    const yn = (v) => (v === true || v === "yes" ? true : v === false || v === "no" ? false : null);

    const row = {
      sell_option: sellOption,
      first_name: String(body.firstName || "").trim().slice(0, 60) || null,
      last_name: String(body.lastName || "").trim().slice(0, 60) || null,
      has_box: yn(body.hasBox),
      has_papers: yn(body.hasPapers),
      worn: yn(body.worn),
      polished: yn(body.polished),
      watch_label: String(body.watchLabel || "").trim().slice(0, 160) || null,
      agreed_terms: body.agreedTerms === true,
      photo_read: photo.read,
      photo_match: photo.status,
      photo_reference: photo.read?.reference || null,
      photo_model: photo.model,
      status: sellOption === "consign" ? "consign_request" : (offer.ok ? "offered" : "no_data"),
      brand: String(body.brand || market?.brand || "").trim().slice(0, 60) || null,
      model: market?.model || null,
      reference,
      ref_core: market?.ref_core || null,
      dial,
      year: Number.isFinite(year) && year > 1900 && year < 2100 ? year : null,
      condition,
      set_completeness: set,
      photos,
      full_name: (String(body.fullName || "").trim() || [body.firstName, body.lastName].map((s) => String(s || "").trim()).filter(Boolean).join(" ")).slice(0, 120) || null,
      email,
      phone,
      location,
      notes: String(body.notes || "").trim().slice(0, 2000) || null,
      market_median: market?.median ?? null,
      market_n: market?.n ?? null,
      market_p10: market?.p10 ?? null,
      market_p90: market?.p90 ?? null,
      market_days: WINDOW_DAYS,
      dial_matched: !!market?.dial_used,
      offer_amount: offer.ok ? offer.amount : null,
      offer_low: offer.ok ? offer.low : null,
      offer_high: offer.ok ? offer.high : null,
      margin_pct: offer.ok ? offer.margin_pct : null,
      adjustments: offer.ok ? offer.adjustments : {},
      confidence: offer.ok ? offer.confidence : null,
      needs_review: offer.ok ? offer.needs_review : true,
      expires_at: offer.ok ? offer.expires_at : null,
      ip: getClientIp(req),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
    };

    const ins = await sb("dbh_offers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!ins.ok) {
      const err = await ins.json().catch(() => ({}));
      throw new Error(err.message || `dbh_offers insert ${ins.status}`);
    }
    const saved = (await ins.json())[0];

    // Email is best-effort. The seller already has their number on screen.
    let emailSent = false;
    try {
      const to = process.env.NOTIFICATION_EMAIL || "dialedbyh@gmail.com";
      const what = [row.brand, row.reference].filter(Boolean).join(" ");
      const subject = sellOption === "consign"
        ? `\u{1F4E6} Consign request: ${what}${offer.ok ? ` (market ${money(market.median)})` : ""}`
        : offer.ok
          ? `\u{26A1} Instant Offer ${money(offer.amount)}: ${what}`
          : `\u{26A1} Instant Offer (no data): ${what}`;
      const r = await getResend().emails.send({
        from: "Dialed By H <inquiries@mail.dialedbyhenry.com>",
        to,
        subject: subject.replace(/[\r\n\t]+/g, " ").slice(0, 160),
        html: offerEmail(saved),
      });
      emailSent = !r.error;
      if (r.error) console.error("[instant-offer] email error:", JSON.stringify(r.error));
    } catch (e) {
      console.error("[instant-offer] email threw:", e.message);
    }

    return res.status(200).json({ ok: true, id: saved.id, emailSent, ...offer });
  }

  return res.status(400).json({ error: "Unknown op" });
}

module.exports = { handle, priceIt, readPhotos, refCore, MARGIN, WINDOW_DAYS, CONDITIONS, SETS };
