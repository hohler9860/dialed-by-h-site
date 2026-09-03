// POST /api/leads-admin
// Auth-protected endpoint backing the /admin/leads/ console.
// Body: { action: "list" | "set-status", ...args }
// Auth: Authorization: Bearer <ADMIN_PASSWORD>
//
// Mirrors api/journal-admin.js deliberately: same Bearer scheme, same timing-safe
// compare, same CORS allowlist. If the admin auth model changes, change it in both.

const crypto = require("crypto");
const taxCal = require("../lib/tax-calendar.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Evolution powers the "is this still available" message. Server-side only:
// the key must never reach the browser.
const EVOLUTION_URL = (process.env.EVOLUTION_URL || "").replace(/\/+$/, "");
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "dialedbyh";

const TABLE = "dialed_submissions";

// RWB Parts/Accessories group: everything posted there is parts, and parts
// posted anywhere else are caught by listing_type PARTS from the classifier.
const PARTS_GROUP_JID = "120363427123129179@g.us";

// Statuses the console is allowed to set. Anything else is rejected, so a tampered
// client can't write arbitrary strings into the column.
const ALLOWED_STATUSES = ["new", "contacted", "negotiating", "closed", "archived"];

// Hard ceiling on a single list call. The console filters and sorts client-side,
// which is fine at this volume. If this ever truncates, that is the signal to move
// filtering server-side rather than to raise the number.
const MAX_ROWS = 5000;

// Vercel hard-fails a response over 4.5MB. Listings are the bulk of the
// wholesale payload, so they are capped and the true total is reported next
// to them. Raising this without measuring the response size will break the
// tab outright rather than degrade it.
// Dropped from 2000 when the RWB groups roughly doubled the feed: the page
// plus stats plus signed image URLs must stay clear of Vercel's 4.5MB kill
// line, and Load-more paging means a smaller page costs one extra click, not
// data.
const LISTING_CAP = 1500;

const ALLOWED_ORIGINS = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];

function setCors(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (process.env.VERCEL_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function timingSafeEq(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

function isAuthorized(req) {
    if (!ADMIN_PASSWORD) return false;
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return false;
    return timingSafeEq(header.slice(7).trim(), ADMIN_PASSWORD);
}

async function supabase(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Supabase ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

// PostgREST refuses to return more than 1000 rows no matter what limit you ask
// for, so a plain "limit=2000" silently hands back 1000 and everything past it
// vanishes without an error. Walk the range in pages instead.
// `start` shifts the whole walk, which is how paging works: PostgREST refuses
// a query-string offset combined with Range headers, so the offset must live
// in the Range itself.
async function supabaseAll(path, options = {}, cap = 20000, start = 0) {
    const PAGE = 1000;
    const out = [];
    for (let from = start; from < start + cap; from += PAGE) {
        const to = from + PAGE - 1;
        const page = await supabase(path, {
            ...options,
            headers: { ...(options.headers || {}), Range: `${from}-${to}`, "Range-Unit": "items" },
        });
        if (!Array.isArray(page) || page.length === 0) break;
        out.push(...page);
        if (page.length < PAGE) break;
        if (out.length >= cap) { out.length = cap; break; }
    }
    return out;
}

// A lead is "real" only once the classifier has said so. Unclassified rows are
// counted separately rather than being lumped in with the good ones.
function buildStats(leads) {
    const s = {
        total: leads.length,
        real: 0, test: 0, spam: 0, personal: 0, unclassified: 0,
        hot: 0, warm: 0, cold: 0,
        newStatus: 0,
    };
    for (const l of leads) {
        if (l.lead_class === "REAL") s.real += 1;
        else if (l.lead_class === "TEST") s.test += 1;
        else if (l.lead_class === "SPAM") s.spam += 1;
        // Someone Henry actually knows, messaging socially. Not a lead, and
        // not a failure of the classifier either, so counted on its own.
        else if (l.lead_class === "PERSONAL") s.personal += 1;
        else s.unclassified += 1;

        if (l.lead_class === "REAL") {
            if (l.lead_quality === "HOT") s.hot += 1;
            else if (l.lead_quality === "WARM") s.warm += 1;
            else if (l.lead_quality === "COLD") s.cold += 1;
        }
        if (!l.status || l.status === "new") s.newStatus += 1;
    }
    return s;
}

// ── Books write helpers ─────────────────────────────────────────────────────
// Column whitelists. Anything not named here never reaches the database.
const DEAL_FIELDS = {
    ref: "text", status: "text", brand: "text", model: "text", reference: "text",
    serial: "text", year: "text", condition: "text", box: "bool", papers: "bool",
    date_bought: "date", date_sold: "date", source_seller: "text", buyer: "text",
    buy_total: "num", other_costs: "num", sell_total: "num",
    payment_in: "text", payment_out: "text", docs: "bool", notes: "text",
};
const EXPENSE_FIELDS = {
    spent_on: "date", category: "text", description: "text", vendor: "text",
    amount: "num", payment_method: "text", deal_ref: "text", deductible: "bool",
    trip: "text", needs_review: "bool", notes: "text",
};
const BANK_FIELDS = {
    posted_on: "date", description: "text", category: "text",
    money_in: "num", money_out: "num", txn_type: "text",
};

// Empty string means "clear this column", not "store an empty string" -- the
// admin's inputs hand back "" for every field the user left alone.
function coerce(v, kind) {
    if (v === "" || v === undefined) return null;
    if (v === null) return null;
    if (kind === "num") {
        const n = Number(String(v).replace(/[$,\s]/g, ""));
        return Number.isFinite(n) ? n : null;
    }
    if (kind === "bool") {
        if (typeof v === "boolean") return v;
        return ["yes", "y", "true", "1"].includes(String(v).trim().toLowerCase());
    }
    if (kind === "date") {
        const s = String(v).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }
    return String(v).trim() || null;
}

function pick(obj, fields) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    const names = Array.isArray(fields) ? fields : Object.keys(fields);
    for (const k of names) {
        if (!(k in obj)) continue;
        out[k] = Array.isArray(fields) ? coerce(obj[k], "text") : coerce(obj[k], fields[k]);
    }
    return out;
}

// One row in, one row back. PATCH when an id is supplied, POST when it is not.
async function upsert(table, id, row) {
    const opts = {
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
    };
    const saved = id
        ? await supabase(`${table}?id=eq.${encodeURIComponent(id)}`, { ...opts, method: "PATCH" })
        : await supabase(table, { ...opts, method: "POST" });
    if (!saved || !saved.length) throw new Error("Row not saved");
    return saved[0];
}

// Fixed-amount subscriptions, auto-logged on their monthly charge date by the
// daily cron below. Variable-amount services (Supabase, Claude, OpenRouter,
// ElevenLabs, LinkedIn) are deliberately NOT here: guessing their amounts
// would break the register's to-the-penny reconciliation — they arrive via
// CSV import instead. The importer absorbs these auto rows when the real
// bank row posts, so nothing doubles.
const AUTO_SUBS = [
    { vendor: "Canva",        match: "canva",        amount: 16.26, day: 13, category: "Software — Canva" },
    { vendor: "DocuSign",     match: "docusign",     amount: 48.77, day: 3,  category: "Software — DocuSign" },
    { vendor: "Amazon Prime", match: "amazon prime", amount: 7.49,  day: 30, category: "Subscription — Amazon Prime" },
    { vendor: "Captions.AI",  match: "captions",     amount: 10.83, day: 8,  category: "Software — Captions" },
    { vendor: "Coolify",      match: "coollabs",     amount: 5.00,  day: 4,  category: "Software — Coolify" },
];

async function runAutoSubs() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const existing = await supabase(
        `dbh_bank_txns?select=description,money_out&posted_on=gte.${monthStart}`);
    const logged = [];
    for (const s of AUTO_SUBS) {
        if (now.getUTCDate() < s.day) continue;               // not due yet this month
        const seen = existing.some((r) =>
            String(r.description || "").toLowerCase().includes(s.match) &&
            Math.abs(Number(r.money_out || 0) - s.amount) < 0.01);
        if (seen) continue;                                    // real row or earlier auto row
        const posted = new Date(Date.UTC(y, m, s.day)).toISOString().slice(0, 10);
        await supabase("dbh_bank_txns", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify([{
                posted_on: posted,
                description: s.vendor + " (auto-logged subscription)",
                category: s.category, money_in: 0, money_out: s.amount,
                txn_type: "DEBIT_CARD", import_batch: "auto-sub",
            }]),
        });
        logged.push(s.vendor);
    }
    return logged;
}

// Daily at 12:00 UTC (8am ET). Emails Henry for every deadline whose
// days-until matches one of its reminder offsets, so each one nags on a
// fixed ladder (30/14/7/1 days) and never twice on the same day. Uses the
// same Resend sender as lead notifications.
async function sendTaxReminders() {
    const due = taxCal.dueToday();
    if (!due.length) return [];
    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const to = process.env.NOTIFICATION_EMAIL || "dialedbyh@gmail.com";
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmt = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const line = (o) => {
        const when = o.days === 0 ? "TODAY" : o.days === 1 ? "tomorrow" : `in ${o.days} days`;
        return `<div style="padding:14px 0;border-bottom:1px solid #e5e5e5">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${o.days <= 1 ? "#b00020" : "#888"}">${esc(when)} · ${esc(fmt(o.date))}</div>
          <div style="font-size:16px;font-weight:700;margin:4px 0 2px;color:#111">${esc(o.title)}${o.label ? " · " + esc(o.label) : ""}</div>
          <div style="font-size:12px;color:#666">${esc(o.who)}</div>
          <div style="font-size:13px;color:#333;margin-top:6px;line-height:1.5">${esc(o.note)}</div>
          ${o.placeholder ? '<div style="font-size:12px;color:#b00020;margin-top:6px">Date is a placeholder, confirm it.</div>' : ""}
        </div>`;
    };
    const soonest = due[0];
    const subject = due.length === 1
        ? `Tax reminder: ${soonest.title}${soonest.label ? " " + soonest.label : ""} ${soonest.days === 0 ? "is due today" : soonest.days === 1 ? "is due tomorrow" : "in " + soonest.days + " days"}`
        : `Tax reminders: ${due.length} deadlines coming up`;
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#fafafa">
      <div style="border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:8px"><strong style="font-size:11px;letter-spacing:3px;text-transform:uppercase">DIALED BY H · TAX CALENDAR</strong></div>
      ${due.map(line).join("")}
      <div style="margin-top:20px;font-size:12px;color:#888">Full calendar is on the Books tab of the admin. These reminders come from lib/tax-calendar.js; if a date is wrong, fix it there.</div>
    </div>`;
    const r = await resend.emails.send({ from: "Dialed By H <inquiries@mail.dialedbyhenry.com>", to, subject, html });
    if (r.error) throw new Error("Resend: " + (r.error.message || JSON.stringify(r.error)));
    return due.map(o => o.key + "@" + o.days);
}

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();

    // Vercel cron fires a GET with the CRON_SECRET bearer. Everything else
    // stays POST + admin password.
    if (req.method === "GET") {
        const q = req.query || {};
        const auth = String(req.headers.authorization || "");
        if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (q.action === "auto-subs") {
            const logged = await runAutoSubs();
            console.log("[leads-admin] auto-subs logged:", logged.join(", ") || "nothing due");
            return res.status(200).json({ logged });
        }
        if (q.action === "tax-reminders") {
            const sent = await sendTaxReminders();
            console.log("[leads-admin] tax-reminders:", sent.join(", ") || "nothing due today");
            return res.status(200).json({ sent });
        }
        return res.status(400).json({ error: "Unknown cron action" });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (!SUPABASE_KEY) {
        console.error("[leads-admin] Missing SUPABASE_SERVICE_ROLE_KEY");
        return res.status(500).json({ error: "Server misconfigured" });
    }
    if (!ADMIN_PASSWORD) {
        console.error("[leads-admin] Missing ADMIN_PASSWORD");
        return res.status(500).json({ error: "Server misconfigured" });
    }
    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { action } = body;

    try {
        if (action === "list") {
            const [leads, drafts, stages] = await Promise.all([
                supabase(`${TABLE}?select=*&order=created_at.desc&limit=${MAX_ROWS}`),
                // The written reply belongs next to the lead: without it the
                // console tells you someone asked, but not what to say back.
                supabaseAll("lead_drafts?select=id,submission_id,channel,body,quoted_price," +
                            "reference,status,kind,sent_at&order=created_at.desc").catch(() => []),
                // Where each lead actually stands, worked out in one place so
                // the console and the follow-up flow cannot disagree.
                supabaseAll("lead_stage?select=*").catch(() => []),
            ]);
            const stageById = {};
            for (const st of stages || []) stageById[st.id] = st;
            if (leads.length === MAX_ROWS) {
                console.warn(`[leads-admin] Hit MAX_ROWS (${MAX_ROWS}); list is truncated`);
            }

            const draftsBySub = {};
            for (const d of drafts || []) {
                (draftsBySub[d.submission_id] ||= []).push(d);
            }

            for (const l of leads) {
                // Where it actually came in. A WhatsApp lead is stored with a
                // synthetic wa-<number>@whatsapp.local address, which is the
                // only thing distinguishing it from a form fill.
                const wa = /^wa-(\d+)@whatsapp\.local$/i.exec(l.email || "");
                if (wa) {
                    l.source = "WHATSAPP";
                    l.source_label = "WhatsApp DM";
                    l.email = null;                       // not a real address
                    l.phone = l.phone || wa[1];
                } else if (l.submission_type === "WATCH_DETAIL") {
                    l.source = "WATCH_PAGE";
                    l.source_label = l.watch_name
                        ? `Watch page: ${l.watch_name}` : "A watch page";
                } else {
                    l.source = "SITE_FORM";
                    l.source_label = "Site enquiry form";
                }
                l.drafts = draftsBySub[l.id] || [];
                const st = stageById[l.id];
                if (st) {
                    l.stage = st.stage;
                    l.last_sent = st.last_sent;
                    l.client_replied_at = st.client_replied_at;
                    l.followups_sent = st.followups_sent;
                }
            }

            return res.status(200).json({
                leads,
                stats: buildStats(leads),
                truncated: leads.length === MAX_ROWS,
            });
        }

        if (action === "set-status") {
            const { id, status } = body;
            if (!id || typeof id !== "string") {
                return res.status(400).json({ error: "Missing id" });
            }
            if (!ALLOWED_STATUSES.includes(status)) {
                return res.status(400).json({ error: "Invalid status" });
            }
            const updated = await supabase(
                `${TABLE}?id=eq.${encodeURIComponent(id)}`,
                {
                    method: "PATCH",
                    headers: { Prefer: "return=representation" },
                    body: JSON.stringify({ status }),
                }
            );
            if (!updated || updated.length === 0) {
                return res.status(404).json({ error: "Lead not found" });
            }
            console.log("[leads-admin] status set", id, "->", status);
            return res.status(200).json({ lead: updated[0] });
        }

        // ── Wholesale price index ──────────────────────────────────────────
        // These live here rather than in their own api/wholesale-admin.js on
        // purpose: the project sits at Vercel's 12-function Hobby ceiling, so a
        // 13th route would fail the build. Same auth, different data.
        if (action === "wholesale") {
            // The feed runs at roughly 5,000 messages a day, so shipping every
            // listing to the browser stopped being possible: Vercel refuses a
            // response over 4.5MB and the whole tab fails rather than degrades.
            // Narrow it here instead, where the database can do the work.
            // The groups produce roughly 5,000 listings a day, so even a single day
            // overflows one response. Default to the most recent window and let
            // search reach everything else.
            const days = Number(body.days) > 0 ? Math.min(Number(body.days), 365) : 1;
            const term = String(body.q || "").trim().slice(0, 60);
            const since = new Date(Date.now() - days * 86400000).toISOString();
            // Paging: "Load more" passes the number of rows already shown and
            // receives the next window, so the whole feed is reachable without
            // ever building a response Vercel would refuse.
            const offset = Number(body.offset) > 0 ? Math.min(Number(body.offset), 200000) : 0;

            // The wholesale tab is supply of whole watches, nothing else. Parts
            // live in the Parts tab; dealer demand (WTB/NTQ/ISO) feeds the
            // Buyers board and matching, never this feed.
            const PARTS_EXCLUDE =
                `&group_jid=neq.${PARTS_GROUP_JID}` +
                `&listing_type=not.in.(PARTS,WTB,NTQ,ISO)` +
                // The feed shows named watches only: no unprocessed intake
                // husks, no brand-less "UNIDENTIFIED" cards, no chatter rows
                // that slipped a listing shell. A listing appears once it has
                // a brand (classified, or rule-corrected on the way in).
                `&status=neq.noise&brand=not.is.null` +
                // Henry's call 2026-08-28: a listing whose photo exists on
                // WhatsApp waits for that photo before it shows. Text-only
                // listings (no media on the message) pass through — there is
                // nothing to wait for.
                `&or=(image_path.not.is.null,media_type.is.null)`;

            let listingFilter = `&message_ts=gte.${since}`;
            if (term) {
                // Searching means searching everything, not just the window.
                const safe = term.replace(/[(),*]/g, " ").trim();
                if (safe) {
                    const like = `*${safe}*`;
                    listingFilter =
                        `&or=(brand.ilike.${like},model.ilike.${like},reference.ilike.${like},` +
                        `nickname.ilike.${like},seller_name.ilike.${like})`;
                }
            }

            const q = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const qAll = (path, _o, cap, start) =>
                supabaseAll(path, { headers: { "Accept-Profile": "wholesale" } }, cap, start);

            const [listings, stats, variants, alerts, groups] = await Promise.all([
                // The view carries the stored photo path alongside the listing.
                // Vercel refuses to return a response over 4.5MB, and select=*
                // on every listing had reached 4.53MB, which fails outright
                // rather than truncating. Ask only for the columns the console
                // actually renders, and cap the rows with the true total sent
                // alongside so the tab can say what it is not showing.
                qAll(
                    "listings_with_image?select=id,message_pk,group_jid,listing_type,brand,model," +
                    "reference,price_usd,price_original,price_currency,condition,set_completeness,year,seller_name,dial_color," +
                    "dial_material,bracelet,bezel,case_material,case_size_mm,complications," +
                    "has_diamonds,diamonds_factory,nickname,variant_key,model_used,trust_score," +
                    "trust_why,corrected_fields,vision_brand,vision_model,vision_reference," +
                    "vision_mismatch,confidence,message_ts,image_path" +
                    listingFilter + PARTS_EXCLUDE + "&order=message_ts.desc",
                    // A search scans the whole table with five wildcard
                    // matches; a second offset page repeats that scan and can
                    // trip the database's statement timeout. One page is
                    // plenty — the tab already says when results are capped.
                    {}, term ? 1000 : LISTING_CAP, offset
                ),
                // Both stats tables grew past what one response can carry once
                // the RWB groups joined (4.4k variants and climbing). The tab
                // only ever surfaces the head of these lists, so cap them by
                // volume rather than shipping the tail into a 4.5MB wall.
                qAll("reference_stats?select=*&order=n.desc", {}, 800),
                qAll("variant_stats?select=*&order=n.desc", {}, 1200),
                // Join through to the listing so the UI can show what was on offer.
                q("deal_alerts?select=*,listing:listings(brand,model,reference,price_usd,condition,set_completeness,year,seller_name,group_jid,message_ts)&order=created_at.desc&limit=200"),
                q("groups?select=jid,name,is_price_baseline,active"),
            ]);

            // The real number held, so the tab never implies it is showing all.
            let totalHeld = null;
            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?select=id&limit=1`, {
                    headers: {
                        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
                        // planned (estimated) count: exact counting walks the
                        // whole 80k+ table and started tripping the database's
                        // statement timeout. The header number is cosmetic.
                        "Accept-Profile": "wholesale", Prefer: "count=planned",
                        Range: "0-0", "Range-Unit": "items",
                    },
                });
                const cr = res.headers.get("content-range");
                if (cr && cr.includes("/")) totalHeld = Number(cr.split("/")[1]) || null;
            } catch { /* a missing count must not break the view */ }

            const nameByJid = {};
            for (const g of groups || []) nameByJid[g.jid] = g.name;

            // Index the baselines so the table can show each listing against the
            // market without a second round trip. Variant wins when it has enough
            // quotes; otherwise the looser reference median stands in.
            const byVariant = {};
            for (const v of variants || []) byVariant[v.variant_key] = v;
            const byRef = {};
            for (const s of stats || []) byRef[s.reference] = s;

            for (const l of listings) {
                const v = l.variant_key ? byVariant[l.variant_key] : null;
                const r = l.reference ? byRef[l.reference] : null;

                // Prefer the variant, which now includes dial colour. Colour is
                // the single biggest price driver: on a 124300 it separates an
                // $8,100 silver from a $22,600 white.
                //
                // Falling back to the bare reference is only safe when that
                // reference's own prices hang together. Roughly a fifth of them
                // do not, because one reference number covers several different
                // watches, and showing a median of unlike things as "market" is
                // worse than admitting there is no baseline.
                const useVariant = v && v.n >= 3;
                const refOk = r && r.n >= 4 && r.coherent !== false;
                const base = useVariant ? v : (refOk ? r : null);

                l.baseline_usd = base ? Number(base.median_usd) : null;
                l.baseline_n = base ? base.n : 0;
                l.baseline_basis = base ? (useVariant ? "VARIANT" : "REFERENCE") : null;
                // Say why there is no number, rather than leaving it blank.
                l.baseline_note = base ? null
                    : (r && r.coherent === false
                        ? "reference mixes different watches"
                        : "not enough comparable quotes yet");
                l.delta_pct = (l.baseline_usd && l.price_usd)
                    ? Math.round(((l.baseline_usd - l.price_usd) / l.baseline_usd) * 1000) / 10
                    : null;
            }

            // The bucket is private, so hand the browser short-lived signed URLs
            // rather than making dealer photos world-readable.
            //
            // Asking for two thousand at once silently returned nothing, and
            // because the failure was swallowed the whole grid simply lost its
            // photos with no error anywhere. Sign in chunks, and let one bad
            // chunk cost its own photos rather than all of them.
            const paths = [...new Set(listings.map((l) => l.image_path).filter(Boolean))];
            if (paths.length) {
                const CHUNK = 250;
                const urlByPath = {};
                const chunks = [];
                for (let i = 0; i < paths.length; i += CHUNK) chunks.push(paths.slice(i, i + CHUNK));

                const results = await Promise.all(chunks.map((batch) =>
                    fetch(`${SUPABASE_URL}/storage/v1/object/sign/wholesale-images`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            apikey: SUPABASE_KEY,
                            Authorization: `Bearer ${SUPABASE_KEY}`,
                        },
                        body: JSON.stringify({ expiresIn: 3600, paths: batch }),
                    })
                        .then((r) => (r.ok ? r.json() : []))
                        .catch((err) => {
                            console.error("[leads-admin] signing chunk failed:", err.message);
                            return [];
                        })
                ));

                for (const signed of results) {
                    for (const sg of signed || []) {
                        if (sg.signedURL) urlByPath[sg.path] = `${SUPABASE_URL}/storage/v1${sg.signedURL}`;
                    }
                }
                for (const l of listings) {
                    l.image_url = l.image_path ? urlByPath[l.image_path] || null : null;
                }
                const missing = listings.filter((l) => l.image_path && !l.image_url).length;
                if (missing) console.warn(`[leads-admin] ${missing} photos could not be signed`);
            }

            return res.status(200).json({
                listings, stats, variants, alerts, groups, nameByJid,
                listings_shown: listings.length,
                listings_capped: listings.length >= LISTING_CAP,
                window_days: term ? null : days,
                searched: term || null,
                listings_held: totalHeld,
                counters: {
                    listings: listings.length,
                    priced: listings.filter((l) => l.price_usd != null).length,
                    references: stats.length,
                    variants: variants.length,
                    // Only quotable once enough quotes sit behind the median.
                    quotable: stats.filter((s) => s.n >= 4).length,
                    alerts: alerts.length,
                    mismatches: listings.filter((l) => l.vision_mismatch).length,
                },
            });
        }

        // Live market read for one reference: what the group is actually asking.
        if (action === "wholesale-reference") {
            const ref = String(body.reference || "").toUpperCase().replace(/[^A-Z0-9/\-.]/g, "");
            if (!ref) return res.status(400).json({ error: "Missing reference" });
            const [stat, quotes] = await Promise.all([
                supabase(`reference_stats?select=*&reference=eq.${encodeURIComponent(ref)}`,
                         { headers: { "Accept-Profile": "wholesale" } }),
                supabase(`listings?select=*&reference=eq.${encodeURIComponent(ref)}` +
                         `&listing_type=eq.FOR_SALE&order=message_ts.desc&limit=60`,
                         { headers: { "Accept-Profile": "wholesale" } }),
            ]);
            return res.status(200).json({ reference: ref, stat: stat[0] || null, quotes });
        }

        // ── Books ──────────────────────────────────────────────────────────
        // The business tracker, moved off the Google Sheet. Same reason as
        // wholesale for living in this file: the project is at Vercel's
        // 12-function Hobby ceiling, so a 13th route would fail the build.
        //
        // This is the most sensitive payload the admin serves -- buy prices,
        // client names, bank rows -- so it is deliberately NOT reachable from
        // /admin/index.html source. It only ever crosses the wire behind the
        // Bearer check above. The dbh_* tables have RLS on with zero policies,
        // so the service-role key is the only way to read them.
        if (action === "tax-calendar") {
            return res.status(200).json({ items: taxCal.upcoming() });
        }

        if (action === "books") {
            // These are the money tiles. A limit above 1000 is a lie -- PostgREST
            // caps the response there and says nothing -- so a growing bank
            // register would have started quietly understating cash and profit.
            const [deals, expenses, subscriptions, capital, bank, docs] = await Promise.all([
                supabaseAll("dbh_deals?select=*&order=date_bought.asc"),
                supabaseAll("dbh_expenses?select=*&order=spent_on.asc"),
                supabaseAll("dbh_subscriptions?select=*&order=monthly_cost.desc"),
                supabaseAll("dbh_capital?select=*&order=moved_on.asc"),
                supabaseAll("dbh_bank_txns?select=*&order=posted_on.asc"),
                supabaseAll("dbh_deal_docs?select=*&order=uploaded_at.desc"),
            ]);

            // Cash is a whole-account fact, not a period one: it is every row the
            // register has ever seen, so it is summed here rather than client-side
            // where the period filter would quietly slice it.
            const cash = bank.reduce(
                (s, t) => s + Number(t.money_in || 0) - Number(t.money_out || 0), 0
            );

            return res.status(200).json({
                deals, expenses, subscriptions, capital, bank, docs,
                cash: Math.round(cash * 100) / 100,
            });
        }

        // ── Books writes ───────────────────────────────────────────────────
        // Every writable column is listed explicitly below. A payload key that
        // is not on its whitelist is dropped rather than rejected, so a stale
        // client cannot smuggle a column in and a new client field cannot
        // silently write somewhere it was not meant to.
        if (action === "books-save-deal") {
            const row = pick(body.deal, DEAL_FIELDS);
            // New deals mint their own ref: next free DBH-<year>-NNN. Generated
            // here rather than in the form so two open tabs can't pick the same
            // number by both reading the list before either saves.
            if (!row.ref && !body.id) {
                const year = new Date().getFullYear();
                const prefix = `DBH-${year}-`;
                const taken = await supabase(
                    `dbh_deals?select=ref&ref=like.${encodeURIComponent(prefix + "%")}`
                );
                const next = taken.reduce((m, d) => {
                    const n = parseInt(String(d.ref).slice(prefix.length), 10);
                    return Number.isFinite(n) && n > m ? n : m;
                }, 0) + 1;
                row.ref = prefix + String(next).padStart(3, "0");
            }
            if (!row.ref) return res.status(400).json({ error: "Ref is required" });
            if (row.sell_total != null && !row.date_sold) {
                return res.status(400).json({ error: "A sold piece needs a sold date" });
            }
            return res.status(200).json({
                deal: await upsert("dbh_deals", body.id, { ...row, updated_at: new Date().toISOString() }),
            });
        }

        if (action === "books-save-expense") {
            const row = pick(body.expense, EXPENSE_FIELDS);
            if (!row.spent_on) return res.status(400).json({ error: "Date is required" });
            if (row.amount == null) return res.status(400).json({ error: "Amount is required" });
            if (!row.category) row.category = "Other";
            return res.status(200).json({ expense: await upsert("dbh_expenses", body.id, row) });
        }

        if (action === "books-set-sub") {
            const row = pick(body.sub, ["disposition", "status"]);
            if (!body.id) return res.status(400).json({ error: "Missing id" });
            return res.status(200).json({ sub: await upsert("dbh_subscriptions", body.id, row) });
        }

        if (action === "books-delete") {
            const table = { deal: "dbh_deals", expense: "dbh_expenses" }[body.kind];
            if (!table || !body.id) return res.status(400).json({ error: "Bad delete" });
            await supabase(`${table}?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
            console.log("[leads-admin] books deleted", body.kind, body.id);
            return res.status(200).json({ ok: true });
        }

        // ── Deal documents (contracts / invoices) ──────────────────────────
        // Files live in the private dbh-docs bucket. The browser never sees a
        // storage key: it asks here for a one-shot signed upload URL, PUTs the
        // file straight to Supabase (dodging Vercel's 4.5MB body cap), then
        // records the row. Downloads are hour-long signed URLs, same as the
        // wholesale photos.
        if (action === "books-doc-sign-upload") {
            const { deal_id, filename } = body || {};
            if (!deal_id || !filename) return res.status(400).json({ error: "Missing deal or filename" });
            const safe = String(filename).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
            const path = `${deal_id}/${Date.now()}-${safe}`;
            const r = await fetch(
                `${SUPABASE_URL}/storage/v1/object/upload/sign/dbh-docs/${encodeURI(path)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                    body: "{}",
                }
            );
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                return res.status(500).json({ error: err.message || "Could not sign upload" });
            }
            const signed = await r.json();
            return res.status(200).json({
                path,
                uploadUrl: `${SUPABASE_URL}/storage/v1${signed.url}`,
            });
        }

        if (action === "books-doc-record") {
            const row = pick(body.doc, ["deal_id", "kind", "filename", "path", "mime", "size_bytes"]);
            if (!row.deal_id || !row.path || !row.filename) {
                return res.status(400).json({ error: "Missing document fields" });
            }
            if (!["contract", "invoice", "statement", "other"].includes(row.kind)) row.kind = "other";
            const [doc] = await supabase("dbh_deal_docs", {
                method: "POST",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify([row]),
            });
            return res.status(200).json({ doc });
        }

        if (action === "books-doc-url") {
            if (!body.path) return res.status(400).json({ error: "Missing path" });
            const r = await fetch(
                `${SUPABASE_URL}/storage/v1/object/sign/dbh-docs/${encodeURI(body.path)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                    body: JSON.stringify({ expiresIn: 3600 }),
                }
            );
            if (!r.ok) return res.status(500).json({ error: "Could not sign download" });
            const signed = await r.json();
            return res.status(200).json({ url: `${SUPABASE_URL}/storage/v1${signed.signedURL}` });
        }

        if (action === "books-doc-delete") {
            if (!body.id || !body.path) return res.status(400).json({ error: "Bad delete" });
            await fetch(`${SUPABASE_URL}/storage/v1/object/dbh-docs/${encodeURI(body.path)}`, {
                method: "DELETE",
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            });
            await supabase(`dbh_deal_docs?id=eq.${encodeURIComponent(body.id)}`, { method: "DELETE" });
            return res.status(200).json({ ok: true });
        }

        // Bank CSV import. Chase exports overlap month to month, so the same
        // rows get pasted twice as a matter of course -- this dedupes on the
        // natural key instead of trusting the paste to be clean.
        if (action === "books-import-bank") {
            const rows = Array.isArray(body.rows) ? body.rows : [];
            if (!rows.length) return res.status(400).json({ error: "Nothing to import" });
            if (rows.length > 2000) return res.status(400).json({ error: "Too many rows in one paste" });

            const clean = rows
                .map((r) => pick(r, BANK_FIELDS))
                .filter((r) => r.posted_on && (r.money_in || r.money_out));

            const existing = await supabase("dbh_bank_txns?select=id,posted_on,description,money_in,money_out,import_batch");
            const key = (r) =>
                [r.posted_on, String(r.description || "").trim().toLowerCase(),
                 Number(r.money_in || 0).toFixed(2), Number(r.money_out || 0).toFixed(2)].join("|");
            const seen = new Set(existing.map(key));

            // Auto-logged subscription placeholders get absorbed by the real
            // bank row: same amount within a week means it IS that charge, so
            // the placeholder takes on the bank's description and date rather
            // than a second row appearing.
            const autoRows = existing.filter((r) => r.import_batch === "auto-sub");
            const absorbed = new Set();

            const fresh = [];
            for (const r of clean) {
                if (seen.has(key(r))) continue;
                const twin = autoRows.find((a) =>
                    !absorbed.has(a.id) &&
                    Math.abs(Number(a.money_out || 0) - Number(r.money_out || 0)) < 0.01 &&
                    Number(r.money_out || 0) > 0 &&
                    Math.abs(new Date(a.posted_on) - new Date(r.posted_on)) < 8 * 86400000);
                if (twin) {
                    absorbed.add(twin.id);
                    await supabase(`dbh_bank_txns?id=eq.${twin.id}`, {
                        method: "PATCH",
                        headers: { Prefer: "return=representation" },
                        body: JSON.stringify({
                            posted_on: r.posted_on, description: r.description,
                            txn_type: r.txn_type, import_batch: "csv-absorbed",
                        }),
                    });
                    seen.add(key(r));
                    continue;
                }
                seen.add(key(r));                       // also dedupes within the paste itself
                fresh.push({ ...r, import_batch: "paste-" + new Date().toISOString().slice(0, 10) });
            }
            if (fresh.length) {
                // return=representation on purpose: a bare insert answers 201 with an
                // empty body, and the shared supabase() helper parses every non-204
                // response as JSON, so it would throw after the rows had already
                // landed -- a 500 on a write that actually succeeded.
                await supabase("dbh_bank_txns", {
                    method: "POST",
                    headers: { Prefer: "return=representation" },
                    body: JSON.stringify(fresh),
                });
            }
            console.log(`[leads-admin] bank import: ${fresh.length} new, ${clean.length - fresh.length} dupes`);
            return res.status(200).json({
                imported: fresh.length,
                skipped: clean.length - fresh.length,
                ignored: rows.length - clean.length,
            });
        }

        // ── Matches: client demand meeting dealer supply ───────────────────
        // The wants book is the seam between the site and the dealer groups.
        // A want stays open until closed, so supply arriving weeks later still
        // finds the client who asked for it.
        // ── Watches & Wonders 2027 outreach tracker ────────────────────────
        if (action === "ww") {
            const rows = await supabase(
                "dbh_ww_outreach?select=*&order=priority.asc,brand.asc");
            return res.status(200).json({ rows });
        }
        if (action === "ww-save") {
            const WW_FIELDS = {
                brand: "text", type: "text", location: "text", ww_exhibitor: "bool",
                contact_name: "text", contact_email: "text", contact_source: "text",
                status: "text", priority: "num", notes: "text",
                last_contact_at: "date", follow_up_on: "date",
            };
            const row = pick(body.row || {}, WW_FIELDS);
            row.updated_at = new Date().toISOString();
            const saved = await upsert("dbh_ww_outreach", body.id, row);
            return res.status(200).json({ row: saved });
        }

        if (action === "matches") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });

            const [wants, matches, alerts] = await Promise.all([
                supabaseAll("open_wants_board?select=*"),
                // Best (cheapest) match per want is what matters operationally;
                // the rest are noise from one client matching every Daytona posted.
                // This has to read ALL of them: picking the cheapest out of only
                // the 400 newest quietly showed a worse price than was available.
                supabaseAll(
                    "want_matches?select=*,want:client_wants(client_name,client_phone,ok_to_text,lead_quality,brand,model,reference,opened_at,status)" +
                    "&order=created_at.desc"
                ),
                wh("deal_alerts?select=*&order=created_at.desc&limit=100"),
            ]);

            // Attach the dealer's own photo of the piece. Seeing the watch is how
            // Henry judges condition before he spends anything chasing it.
            const listingIds = [...new Set((matches || []).map((m) => m.listing_id).filter(Boolean))];
            if (listingIds.length) {
                try {
                    const shots = await wh(
                        "listings_with_image?select=id,image_path,year,condition,set_completeness," +
                        "dial_material,case_material,bracelet,has_diamonds,nickname," +
                        "brand,model,reference,price_usd,dial_color,bezel,case_size_mm," +
                        "complications,diamonds_factory,seller_name,group_jid,message_ts," +
                        "trust_score,trust_why,listing_type" +
                        `&id=in.(${listingIds.join(",")})`
                    );
                    const byId = {};
                    for (const s of shots || []) byId[s.id] = s;

                    const paths = [...new Set((shots || []).map((s) => s.image_path).filter(Boolean))];
                    let urlByPath = {};
                    if (paths.length) {
                        const signed = await fetch(
                            `${SUPABASE_URL}/storage/v1/object/sign/wholesale-images`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    apikey: SUPABASE_KEY,
                                    Authorization: `Bearer ${SUPABASE_KEY}`,
                                },
                                body: JSON.stringify({ expiresIn: 3600, paths }),
                            }
                        ).then((r) => (r.ok ? r.json() : []));
                        for (const s of signed || []) {
                            if (s.signedURL) urlByPath[s.path] = `${SUPABASE_URL}/storage/v1${s.signedURL}`;
                        }
                    }
                    for (const m of matches || []) {
                        const l = byId[m.listing_id];
                        if (!l) continue;
                        m.image_url = l.image_path ? urlByPath[l.image_path] || null : null;
                        // The whole listing, so the match card can open into the
                        // actual piece rather than a summary of it.
                        m.listing = l;
                    }
                } catch (err) {
                    // Photos are a nicety; never take the whole view down for them.
                    console.error("[leads-admin] match photos failed:", err.message);
                }
            }

            // Collapse to one row per want: cheapest wins, ties broken by profit.
            const bestByWant = {};
            for (const m of matches || []) {
                if (!m.want || m.want.status !== "OPEN") continue;
                const cur = bestByWant[m.want_id];
                if (!cur || Number(m.dealer_price) < Number(cur.dealer_price)) bestByWant[m.want_id] = m;
            }
            const best = Object.values(bestByWant).sort((a, b) => {
                const rank = (q) => (q === "HOT" ? 1 : q === "WARM" ? 2 : 3);
                const d = rank(a.want?.lead_quality) - rank(b.want?.lead_quality);
                return d !== 0 ? d : Number(b.profit_high || 0) - Number(a.profit_high || 0);
            });

            return res.status(200).json({
                wants, best, alerts,
                counters: {
                    open_wants: wants.length,
                    hot: wants.filter((w) => w.lead_quality === "HOT").length,
                    matched: best.length,
                    unmatched: wants.filter((w) => !bestByWant[w.id]).length,
                    alerts: alerts.length,
                },
            });
        }

        // ── Dealer directory ───────────────────────────────────────────────
        // Group members are only exposed as an opaque @lid; the phone number
        // comes from the participant roster, which is why this is worth keeping.
        // Henry's own benchmark for a reference. He quotes these every week and
        // knows the condition it applies to, which no scraped listing states, so
        // a manual entry outranks everything scraped.
        if (action === "set-benchmark") {
            const { reference, retail_price, condition, set_completeness, year_from, year_to, note } = body;
            const ref = String(reference || "").toUpperCase().replace(/[^A-Z0-9/.-]/g, "");
            const price = Number(String(retail_price || "").replace(/[$,\s]/g, ""));
            if (!ref) return res.status(400).json({ error: "Missing reference" });
            if (!Number.isFinite(price) || price <= 0) {
                return res.status(400).json({ error: "Retail price must be a positive number" });
            }
            const row = {
                reference: ref,
                retail_price: price,
                // null means "applies to any", which is the useful default
                condition: condition || null,
                set_completeness: set_completeness || null,
                year_from: Number.isFinite(Number(year_from)) && year_from ? Number(year_from) : null,
                year_to: Number.isFinite(Number(year_to)) && year_to ? Number(year_to) : null,
                note: note || null,
                updated_at: new Date().toISOString(),
            };
            const saved = await supabase(
                "manual_benchmarks?on_conflict=reference,condition,set_completeness",
                {
                    method: "POST",
                    headers: {
                        "Content-Profile": "wholesale",
                        Prefer: "resolution=merge-duplicates,return=representation",
                    },
                    body: JSON.stringify([row]),
                }
            );
            console.log("[leads-admin] benchmark set", ref, price);
            return res.status(200).json({ saved: (saved && saved[0]) || row });
        }

        if (action === "delete-benchmark") {
            const { id } = body;
            if (!id) return res.status(400).json({ error: "Missing id" });
            await supabase(`manual_benchmarks?id=eq.${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: { "Content-Profile": "wholesale", Prefer: "return=minimal" },
            });
            return res.status(200).json({ deleted: true });
        }

        // The retail catalogue itself: what the public is being asked to pay.
        // Separate from quote-book, which only covers references we can price.
        if (action === "retail") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const [rows, sources] = await Promise.all([
                supabaseAll("retail_listings?select=id,source_slug,title,brand,reference,price_usd,available," +
                   "year,condition,set_completeness,url,image_url,last_seen,dial_color" +
                   "&order=last_seen.desc", { headers: { "Accept-Profile": "wholesale" } }),
                wh("retail_sources?select=slug,name,feed_type,last_sync,last_count"),
            ]);

            // What the same watch trades at wholesale, matched on reference AND
            // dial where both sides state it. Without the dial this compares a
            // turquoise to a black and calls it the same piece.
            const [wByRefDial, wByRef] = await Promise.all([
                supabaseAll("wholesale_by_ref_dial?select=*", { headers: { "Accept-Profile": "wholesale" } }).catch(() => []),
                supabaseAll("wholesale_by_ref?select=*", { headers: { "Accept-Profile": "wholesale" } }).catch(() => []),
            ]);
            const refCore = (r) => String(r || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
            const dialMap = {}, refMap = {};
            for (const w of wByRefDial) dialMap[`${refCore(w.ref_core)}|${w.dial}`] = w;
            for (const w of wByRef) refMap[refCore(w.ref_core)] = w;

            for (const r of rows) {
                if (!r.reference) continue;
                const key = refCore(r.reference);
                const exact = r.dial_color ? dialMap[`${key}|${r.dial_color}`] : null;
                const loose = refMap[key];
                const w = exact || loose;
                if (!w || !w.median_usd) continue;
                const median = Number(w.median_usd);
                const price = Number(r.price_usd || 0);
                const ratio = median > 0 && price > 0 ? price / median : null;

                r.wholesale_median = median;
                r.wholesale_quotes = w.quotes;
                r.wholesale_basis = exact ? "SAME DIAL"
                    : (loose && loose.coherent === false ? "REFERENCE, MIXED" : "REFERENCE");

                // A reference number is not a product. 116509 covers a $45k
                // steel Daytona and a $1.8M gem-set one, which read as a 3,886%
                // margin. Anything outside a believable band is not a margin,
                // it is two different watches wearing the same number.
                const believable = ratio !== null && ratio >= 0.55 && ratio <= 2.2;
                const trustworthy = exact || (w.coherent !== false && (w.quotes || 0) >= 3);

                if (believable && trustworthy) {
                    r.margin_usd = Math.round(price - median);
                    r.margin_pct = Math.round(((price - median) / median) * 1000) / 10;
                } else {
                    r.comparable = false;
                    r.not_comparable_why = !believable
                        ? "prices too far apart to be the same watch"
                        : "this reference covers more than one watch";
                }
            }

            const nameBySlug = {};
            for (const s of sources || []) nameBySlug[s.slug] = s.name;

            // Per-source quality. This is the honest answer to "can I trust this
            // number": a source that never states condition or contents can only
            // ever support a reference-only comparison.
            const bySource = {};
            for (const r of rows) {
                const s = (bySource[r.source_slug] ||= {
                    slug: r.source_slug, name: nameBySlug[r.source_slug] || r.source_slug,
                    products: 0, with_ref: 0, with_year: 0, with_condition: 0, with_set: 0,
                });
                s.products += 1;
                if (r.reference) s.with_ref += 1;
                if (r.year) s.with_year += 1;
                if (r.condition) s.with_condition += 1;
                if (r.set_completeness) s.with_set += 1;
            }

            return res.status(200).json({
                rows, sources,
                bySource: Object.values(bySource).sort((a, b) => b.products - a.products),
                counters: {
                    total: rows.length,
                    with_ref: rows.filter((r) => r.reference).length,
                    comparable: rows.filter((r) => r.reference && r.condition && r.set_completeness).length,
                    sources: Object.keys(bySource).length,
                },
            });
        }

        if (action === "dealers") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const dealers = await supabaseAll(
                "dealers?select=lid,phone,wa_name,push_name,listings_count,first_seen,last_seen,groups" +
                "&listings_count=gt.0&order=listings_count.desc",
                { headers: { "Accept-Profile": "wholesale" } }
            );
            return res.status(200).json({
                dealers,
                counters: {
                    total: dealers.length,
                    with_phone: dealers.filter((d) => d.phone).length,
                    active_7d: dealers.filter(
                        (d) => d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 7 * 864e5
                    ).length,
                },
            });
        }

        // What to charge, per reference. Every row carries the evidence behind it:
        // how many dealer quotes, how many comparable retail listings, how close
        // the retail match was, and whether it is safe to put in front of a client.
        if (action === "quote-book") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const [rows, manual] = await Promise.all([
                supabaseAll("quote_book?select=*", { headers: { "Accept-Profile": "wholesale" } }),
                wh("manual_benchmarks?select=*&order=updated_at.desc&limit=500"),
            ]);
            const by = (c) => rows.filter((r) => r.quote_confidence === c).length;
            return res.status(200).json({
                rows, manual,
                counters: {
                    total: rows.length,
                    // Only these may ever reach a client. INDICATIVE is deliberately
                    // excluded: it is a reference-only comparison, useful to Henry,
                    // not defensible in a quote.
                    quotable: by("MANUAL") + by("HIGH") + by("MEDIUM"),
                    manual: by("MANUAL"),
                    high: by("HIGH"),
                    medium: by("MEDIUM"),
                    indicative: by("INDICATIVE"),
                    no_retail: by("NONE"),
                },
            });
        }

        // ── NTQ board ──────────────────────────────────────────────────────
        // Copy-paste dealer NTQ lines built from client requests scraped out of
        // iMessage, WhatsApp, email and site submissions. The scrape itself runs
        // locally on Henry's Mac (scripts/ntq/) because Vercel can't see the
        // message databases; this endpoint only reads and updates the results.
        if (action === "ntq") {
            const rows = await supabaseAll("dbh_ntq?select=*&order=requested_at.desc.nullslast");
            const by = (s) => rows.filter((r) => r.status === s).length;
            return res.status(200).json({
                rows,
                counters: {
                    total: rows.length,
                    open: by("open"),
                    quoted: by("quoted"),
                    sourced: by("sourced"),
                    dead: by("dead"),
                    needs_detail: rows.filter((r) => r.confidence === "needs-detail" && r.status === "open").length,
                },
            });
        }

        if (action === "ntq-set-status") {
            const { id, status } = body;
            const NTQ_STATUSES = ["open", "quoted", "sourced", "dead"];
            if (!id || !NTQ_STATUSES.includes(status)) {
                return res.status(400).json({ error: "Missing id or bad status" });
            }
            await supabase(`dbh_ntq?id=eq.${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
            });
            return res.status(200).json({ updated: true });
        }

        if (action === "ntq-save-text") {
            const { id, ntq_text } = body;
            if (!id || !ntq_text || typeof ntq_text !== "string") {
                return res.status(400).json({ error: "Missing id or ntq_text" });
            }
            await supabase(`dbh_ntq?id=eq.${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: JSON.stringify({
                    ntq_text: ntq_text.slice(0, 500),
                    confidence: "exact",
                    updated_at: new Date().toISOString(),
                }),
            });
            return res.status(200).json({ updated: true });
        }

        // ── Ask a dealer if a piece is still available ─────────────────────
        // Deliberately NOT an n8n flow. Messaging dealers is case by case, and an
        // automated blast from Henry's own number to people he trades with is the
        // fastest way to get it flagged. This only fires when he clicks.
        // Henry corrects what the extractor got wrong. The corrected value lands
        // on the listing itself, so variant_key, matching and quotes all pick it
        // up at once, and the original is kept so the model can be measured.
        if (action === "correct-listing") {
            const { listing_id, field, value } = body;
            if (!listing_id || !field) return res.status(400).json({ error: "Missing listing_id or field" });
            const out = await supabase("rpc/correct_listing", {
                method: "POST",
                headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
                body: JSON.stringify({
                    p_listing_id: Number(listing_id),
                    p_field: String(field),
                    p_value: value == null ? "" : String(value),
                }),
            });
            const r = Array.isArray(out) ? out[0] : out;
            if (!r || r.c_ok === false) {
                return res.status(400).json({ error: `Field not correctable: ${field}` });
            }
            console.log("[leads-admin] corrected", listing_id, field, r.c_was, "->", r.c_now);
            return res.status(200).json({ corrected: true, field, was: r.c_was, now: r.c_now });
        }

        // Henry answers plenty of people straight from his phone. Logging that
        // here is what stops them looking untouched and starts the follow-up
        // clock from roughly when he actually messaged them.
        if (action === "log-outreach") {
            const { submission_id, channel, hours_ago, note } = body;
            if (!submission_id) return res.status(400).json({ error: "Missing submission_id" });
            const CHANNELS = ["IMESSAGE", "SMS", "WHATSAPP", "EMAIL", "CALL", "INSTAGRAM"];
            const ch = CHANNELS.includes(String(channel || "").toUpperCase())
                ? String(channel).toUpperCase() : "IMESSAGE";
            const out = await supabase("rpc/log_outreach", {
                method: "POST",
                body: JSON.stringify({
                    p_submission_id: String(submission_id),
                    p_channel: ch,
                    p_hours_ago: Number(hours_ago) >= 0 ? Number(hours_ago) : 0,
                    p_note: note == null ? null : String(note),
                }),
            });
            const r = Array.isArray(out) ? out[0] : out;
            if (!r || r.o_ok === false) return res.status(404).json({ error: "Lead not found" });
            return res.status(200).json({ logged: true, sent_at: r.o_sent_at });
        }

        // Sending is what starts the follow-up clock. Nothing here sends the
        // message: Henry sends it from WhatsApp, Messages or his mail client
        // and marks it here, which also moves the lead to contacted.
        if (action === "mark-draft-sent") {
            const { draft_id, sent_body } = body;
            if (!draft_id) return res.status(400).json({ error: "Missing draft_id" });
            const out = await supabase("rpc/mark_draft_sent", {
                method: "POST",
                body: JSON.stringify({
                    p_draft_id: Number(draft_id),
                    p_sent_body: sent_body == null ? null : String(sent_body),
                }),
            });
            const r = Array.isArray(out) ? out[0] : out;
            if (!r || r.m_ok === false) return res.status(404).json({ error: "Draft not found" });
            return res.status(200).json({ sent: true, submission_id: r.m_submission });
        }

        // Everywhere Henry could get a given reference right now: dealer group
        // asks first, then any retail store holding one in stock, which he can
        // DM for a trade price. Retail asks are shown raw, never discounted
        // into a guess at what they would actually sell it to him for.
        if (action === "sourcing") {
            const { reference, condition, set_completeness } = body;
            if (!reference) return res.status(400).json({ error: "Missing reference" });
            const rows = await supabase("rpc/sourcing_options", {
                method: "POST",
                headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
                body: JSON.stringify({
                    p_reference: String(reference),
                    p_condition: condition || null,
                    p_set: set_completeness || null,
                    p_max: 40,
                }),
            });
            const list = Array.isArray(rows) ? rows : [];
            return res.status(200).json({
                reference,
                options: list,
                wholesale_n: list.filter((o) => o.o_channel === "WHOLESALE").length,
                retail_n: list.filter((o) => o.o_channel === "RETAIL").length,
            });
        }

        // Everything needed to tune the extractor: how each flow is running,
        // how each model scores, where the fields are thin, and the raw input
        // next to the parsed output so a bad read can be judged on the spot.
        if (action === "accuracy") {
            const wh = (p) => supabase(p, { headers: { "Accept-Profile": "wholesale" } });
            const sort = body.sort === "worst" ? "trust_score.asc" : "created_at.desc";
            const only = body.only || "";
            let filter = "";
            if (only === "weak")      filter = "&trust_score=lt.70";
            if (only === "mismatch")  filter = "&vision_mismatch=is.true";
            if (only === "corrected") filter = "&corrected_at=not.is.null";
            if (only === "noref")     filter = "&reference=is.null";
            if (only === "noprice")   filter = "&price_usd=is.null";

            const [flows, scorecard, coverage, samples, benchModels, benchFields,
                   identity, disputes, leadDisputes, contested] = await Promise.all([
                wh("flow_health?select=*&order=errors.desc"),
                wh("model_scorecard?select=*"),
                wh("field_coverage?select=*&order=pct.asc"),
                wh(`extraction_samples?select=*${filter}&order=${sort}&limit=300`),
                // The head to head: which cheap model to trust, and which
                // attributes no cheap model reads reliably.
                wh("bench_models?select=*&order=answer_rate.desc").catch(() => []),
                wh("bench_fields?select=*&order=pct_agree.asc").catch(() => []),
                // How well the chats are being turned into an actual watch.
                supabase("rpc/identity_health", { method: "POST", body: "{}" }).catch(() => null),
                // Pieces held back from matching: both photo models read the
                // metal or the diamonds as something other than the caption
                // claims, which is the difference between steel and platinum.
                wh("photo_disputes?select=*&blocks_matching=is.true&reviewed=is.false" +
                   "&order=price_usd.desc&limit=120").catch(() => []),
                // Leads the two classifiers read differently. A split here
                // decides whether a person gets answered at all.
                supabase("lead_disputes?select=*&limit=40").catch(() => []),
                // References the chats cannot agree on: these are the ones worth
                // pinning down by hand, because a wrong one sends the wrong watch.
                wh("contested_refs?select=*&order=listings.desc&limit=60").catch(() => []),
            ]);
            return res.status(200).json({
                flows: flows || [], scorecard: scorecard || [],
                coverage: coverage || [], samples: samples || [],
                benchModels: benchModels || [], benchFields: benchFields || [],
                identity: identity || null, contested: contested || [],
                disputes: disputes || [], leadDisputes: leadDisputes || [],
            });
        }

        // Who in the groups is hunting what, paired with whether Henry can
        // actually get hold of one. Buyers post "Please DM" and almost never a
        // price, so nothing here guesses what they would pay.
        // The day's work in one call: who is owed a reply, who has options
        // waiting to be sent, and what is still being hunted. Three questions
        // Henry was answering by eye across three different tabs.
        if (action === "today") {
            const [queue, hunting, briefs, thread, summary] = await Promise.all([
                supabase("waiting_on_henry?select=*&limit=60"),
                supabase("hunting_board?select=*&limit=200"),
                // Where each conversation stands, read by two models.
                supabase("lead_brief?select=*").catch(() => []),
                // The last messages, so Henry can see the conversation rather
                // than guess at it from a timestamp.
                supabase("lead_thread?select=submission_id,from_me,body,sent_at" +
                         "&order=sent_at.desc&limit=400").catch(() => []),
                // The day in one paragraph, computed from the same rows below
                // it so the two can never disagree.
                supabase("rpc/day_summary", { method: "POST", body: "{}" }).catch(() => null),
            ]);
            const q = Array.isArray(queue) ? queue : [];
            const h = Array.isArray(hunting) ? hunting : [];
            const byId = {};
            for (const b of (Array.isArray(briefs) ? briefs : [])) byId[b.submission_id] = b;
            const msgs = {};
            for (const m of (Array.isArray(thread) ? thread : [])) {
                (msgs[m.submission_id] ||= []).length < 4 && msgs[m.submission_id].push(m);
            }
            for (const r of q) { r.brief = byId[r.submission_id] || null;
                                 r.recent = (msgs[r.submission_id] || []).slice().reverse(); }
            return res.status(200).json({
                needsReply: q, summary: summary || null,
                hunting: h,
                counters: {
                    ballWithYou:  q.filter(r => r.ball === "BALL_WITH_YOU").length,
                    neverAnswered: q.filter(r => r.ball === "NEVER_ANSWERED").length,
                    found:      h.filter(r => r.state === "FOUND").length,
                    hunting:    h.filter(r => r.state === "HUNTING").length,
                    tooVague:   h.filter(r => r.state === "TOO_VAGUE").length,
                },
            });
        }

        if (action === "buyers") {
            const rows = await supabaseAll("buyers_board?select=*&order=last_want_at.desc", {
                headers: { "Accept-Profile": "wholesale" },
            });
            const list = Array.isArray(rows) ? rows : [];
            return res.status(200).json({
                rows: list,
                counters: {
                    total: list.length,
                    sourceable: list.filter((r) => r.can_source).length,
                    store_cheaper: list.filter((r) => r.store_beats_group).length,
                    buyers: list.reduce((n, r) => n + (r.buyers || 0), 0),
                },
            });
        }

        // Is anything actually flowing. A broken flow shows up here as a step
        // that has not produced anything in far longer than it should have,
        // which is the only symptom a dead webhook ever gives off.
        if (action === "health") {
            const wh = (p) => supabase(p, { headers: { "Accept-Profile": "wholesale" } });
            const [rows, scorecard, errors] = await Promise.all([
                wh("pipeline_health?select=*"),
                wh("model_scorecard?select=*"),
                wh("extraction_errors?select=*&limit=20").catch(() => []),
            ]);
            const list = Array.isArray(rows) ? rows : [];
            return res.status(200).json({
                steps: list,
                scorecard: Array.isArray(scorecard) ? scorecard : [],
                errors: Array.isArray(errors) ? errors : [],
                dead: list.filter((s) => s.status === "DEAD").length,
                stale: list.filter((s) => s.status === "STALE").length,
                checked_at: new Date().toISOString(),
            });
        }

        // ── Parts feed ─────────────────────────────────────────────────────
        // Everything from the RWB parts group plus anything the classifier
        // typed as PARTS elsewhere. Parts posts are usually a sentence, not a
        // spec, so the original message text rides along with each row.
        if (action === "parts") {
            const wh = (p) => supabase(p, { headers: { "Accept-Profile": "wholesale" } });
            const rows = await supabaseAll(
                "listings_with_image?select=id,message_pk,group_jid,listing_type,brand,model," +
                "reference,price_usd,condition,seller_name,message_ts,image_path" +
                `&or=(group_jid.eq.${PARTS_GROUP_JID},listing_type.eq.PARTS)` +
                "&order=message_ts.desc",
                { headers: { "Accept-Profile": "wholesale" } }, 500
            );
            const pks = [...new Set(rows.map((r) => r.message_pk).filter(Boolean))];
            const bodyByPk = {};
            for (let i = 0; i < pks.length; i += 200) {
                const msgs = await wh(`messages?select=id,body&id=in.(${pks.slice(i, i + 200).join(",")})`);
                for (const m of msgs || []) bodyByPk[m.id] = m.body;
            }
            const paths = [...new Set(rows.map((r) => r.image_path).filter(Boolean))].slice(0, 250);
            const urlByPath = {};
            if (paths.length) {
                const r2 = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/wholesale-images`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                    body: JSON.stringify({ expiresIn: 3600, paths }),
                }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
                for (const sg of r2 || []) {
                    if (sg.signedURL) urlByPath[sg.path] = `${SUPABASE_URL}/storage/v1${sg.signedURL}`;
                }
            }
            for (const r of rows) {
                r.body = r.message_pk ? (bodyByPk[r.message_pk] || null) : null;
                r.image_url = r.image_path ? urlByPath[r.image_path] || null : null;
            }
            return res.status(200).json({ rows, counters: { total: rows.length } });
        }

        // ── Jobs board ─────────────────────────────────────────────────────
        // The jobs pipeline replaced the monolithic extractor 2026-08-12: every
        // stage is a 30s worker that claims one listing by inserting a job row.
        // Failures never retry on their own; they sit here with their reason
        // until requeued by hand.
        if (action === "jobs") {
            const wh = (p) => supabase(p, { headers: { "Accept-Profile": "wholesale" } });
            const [failed, recent, types] = await Promise.all([
                wh("jobs?select=id,listing_id,job_type,error,claimed_at,finished_at" +
                   "&status=eq.failed&order=claimed_at.desc&limit=200"),
                wh("jobs?select=job_type,status&claimed_at=gte." +
                   new Date(Date.now() - 86400000).toISOString()),
                wh("job_types?select=key,description,entry_status,success_status,model,active"),
            ]);
            const counts = {};
            for (const j of recent) {
                counts[j.job_type] = counts[j.job_type] || { success: 0, failed: 0, running: 0 };
                counts[j.job_type][j.status] = (counts[j.job_type][j.status] || 0) + 1;
            }
            return res.status(200).json({ failed, counts, types });
        }

        // Live snapshot behind the Pipeline diagram. One RPC, polled every few
        // seconds while the tab is open.
        if (action === "pipeline") {
            const snap = await supabase("rpc/pipeline_snapshot", {
                method: "POST",
                headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
                body: JSON.stringify({}),
            });
            return res.status(200).json(snap || {});
        }

        // Bulk-sign storage paths so the card view can show the actual photos.
        // The bucket is private on purpose; signing stays server-side.
        if (action === "sign-images") {
            const paths = Array.isArray(body.paths) ? body.paths.slice(0, 300).filter((p) => typeof p === "string") : [];
            if (!paths.length) return res.status(200).json({ urls: {} });
            const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/wholesale-images`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
                body: JSON.stringify({ expiresIn: 3600, paths }),
            });
            const rows = r.ok ? await r.json() : [];
            const urls = {};
            for (const row of Array.isArray(rows) ? rows : []) {
                if (row.signedURL && row.path) urls[row.path] = `${SUPABASE_URL}/storage/v1${row.signedURL}`;
            }
            return res.status(200).json({ urls });
        }

        // Requeue = delete the failed job row. The listing's status never moved
        // (it only advances on success), so the worker's next tick claims it
        // fresh. Only failed rows can be requeued; a running job is left alone.
        if (action === "job-requeue") {
            const { job_id } = body;
            if (!job_id) return res.status(400).json({ error: "Missing job_id" });
            await supabase(`jobs?id=eq.${encodeURIComponent(job_id)}&status=eq.failed`, {
                method: "DELETE",
                headers: { "Content-Profile": "wholesale", "Accept-Profile": "wholesale" },
            });
            return res.status(200).json({ requeued: true });
        }

        // Bulk requeue for mass failures (credit outages fail thousands at
        // once). Same mechanics as job-requeue, across every failed row —
        // optionally narrowed to one job_type.
        if (action === "job-requeue-all") {
            let path = "jobs?status=eq.failed&select=id";
            if (body.job_type) path += `&job_type=eq.${encodeURIComponent(body.job_type)}`;
            const gone = await supabase(path, {
                method: "DELETE",
                headers: {
                    "Content-Profile": "wholesale",
                    "Accept-Profile": "wholesale",
                    Prefer: "return=representation",
                },
            });
            return res.status(200).json({ requeued: Array.isArray(gone) ? gone.length : 0 });
        }

        // What the extractor actually gets wrong, per field and per model.
        if (action === "extraction-errors") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const [errors, scorecard] = await Promise.all([
                wh("extraction_errors?select=*"),
                wh("model_scorecard?select=*"),
            ]);
            return res.status(200).json({ errors, scorecard });
        }

        if (action === "ask-dealer") {
            const { listing_id, text: override } = body;
            if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });
            if (!EVOLUTION_URL || !EVOLUTION_KEY) {
                return res.status(500).json({ error: "Evolution not configured" });
            }

            const rows = await supabase(
                `listings_with_image?select=*&id=eq.${encodeURIComponent(listing_id)}&limit=1`,
                { headers: { "Accept-Profile": "wholesale" } }
            );
            const l = rows && rows[0];
            if (!l) return res.status(404).json({ error: "Listing not found" });

            // Resolve the dealer's real number from the roster via the message sender.
            const msg = await supabase(
                `messages?select=sender_jid&id=eq.${encodeURIComponent(l.message_pk)}&limit=1`,
                { headers: { "Accept-Profile": "wholesale" } }
            );
            const lid = msg && msg[0] && msg[0].sender_jid;
            const dealer = lid
                ? await supabase(`dealers?select=phone,wa_name,push_name&lid=eq.${encodeURIComponent(lid)}&limit=1`,
                                 { headers: { "Accept-Profile": "wholesale" } })
                : [];
            const phone = dealer && dealer[0] && dealer[0].phone;
            if (!phone) return res.status(400).json({ error: "No phone number for this dealer yet" });

            const piece = [l.brand, l.model, l.reference].filter(Boolean).join(" ");
            const message = override && String(override).trim()
                ? String(override).trim()
                : `Hey, is the ${piece} still available?`;

            const send = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
                body: JSON.stringify({ number: phone, text: message }),
            });
            const sendBody = await send.json().catch(() => ({}));
            const ok = send.ok;

            // Log either way: a failed send is worth seeing, and the unique index
            // on listing_id is what stops the same dealer being asked twice.
            await supabase("dealer_messages", {
                method: "POST",
                headers: {
                    "Content-Profile": "wholesale",
                    Prefer: "resolution=merge-duplicates,return=minimal",
                },
                body: JSON.stringify([{
                    dealer_lid: lid || null,
                    listing_id: Number(listing_id),
                    phone_jid: phone,
                    body: message,
                    status: ok ? "sent" : "failed",
                    error: ok ? null : JSON.stringify(sendBody).slice(0, 400),
                    sent_at: ok ? new Date().toISOString() : null,
                }]),
            }).catch((e) => console.error("[leads-admin] dealer_messages log failed:", e.message));

            if (!ok) {
                console.error("[leads-admin] dealer send failed:", JSON.stringify(sendBody).slice(0, 300));
                return res.status(502).json({ error: "Send failed", details: sendBody });
            }
            console.log("[leads-admin] asked dealer", phone, "about listing", listing_id);
            return res.status(200).json({ sent: true, phone, message });
        }

        return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
        console.error("[leads-admin] ERROR:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
};
