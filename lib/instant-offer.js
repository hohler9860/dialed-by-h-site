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

    const market = await marketFor(reference, dial);
    const offer = priceIt(market, { condition, set });

    const row = {
      status: offer.ok ? "offered" : "no_data",
      brand: String(body.brand || market?.brand || "").trim().slice(0, 60) || null,
      model: market?.model || null,
      reference,
      ref_core: market?.ref_core || null,
      dial,
      year: Number.isFinite(year) && year > 1900 && year < 2100 ? year : null,
      condition,
      set_completeness: set,
      photos,
      full_name: String(body.fullName || "").trim().slice(0, 120) || null,
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
      const subject = offer.ok
        ? `\u{26A1} Instant Offer ${money(offer.amount)}: ${[row.brand, row.reference].filter(Boolean).join(" ")}`
        : `\u{26A1} Instant Offer (no data): ${[row.brand, row.reference].filter(Boolean).join(" ")}`;
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

module.exports = { handle, priceIt, MARGIN, WINDOW_DAYS, CONDITIONS, SETS };
