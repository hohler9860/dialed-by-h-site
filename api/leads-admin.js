// POST /api/leads-admin
// Auth-protected endpoint backing the /admin/leads/ console.
// Body: { action: "list" | "set-status", ...args }
// Auth: Authorization: Bearer <ADMIN_PASSWORD>
//
// Mirrors api/journal-admin.js deliberately: same Bearer scheme, same timing-safe
// compare, same CORS allowlist. If the admin auth model changes, change it in both.

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const TABLE = "dialed_submissions";

// Statuses the console is allowed to set. Anything else is rejected, so a tampered
// client can't write arbitrary strings into the column.
const ALLOWED_STATUSES = ["new", "contacted", "negotiating", "closed", "archived"];

// Hard ceiling on a single list call. The console filters and sorts client-side,
// which is fine at this volume. If this ever truncates, that is the signal to move
// filtering server-side rather than to raise the number.
const MAX_ROWS = 5000;

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

// A lead is "real" only once the classifier has said so. Unclassified rows are
// counted separately rather than being lumped in with the good ones.
function buildStats(leads) {
    const s = {
        total: leads.length,
        real: 0, test: 0, spam: 0, unclassified: 0,
        hot: 0, warm: 0, cold: 0,
        newStatus: 0,
    };
    for (const l of leads) {
        if (l.lead_class === "REAL") s.real += 1;
        else if (l.lead_class === "TEST") s.test += 1;
        else if (l.lead_class === "SPAM") s.spam += 1;
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

module.exports = async (req, res) => {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();
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
            const leads = await supabase(
                `${TABLE}?select=*&order=created_at.desc&limit=${MAX_ROWS}`
            );
            if (leads.length === MAX_ROWS) {
                console.warn(`[leads-admin] Hit MAX_ROWS (${MAX_ROWS}); list is truncated`);
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
            const q = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });

            const [listings, stats, variants, alerts, groups] = await Promise.all([
                // The view carries the stored photo path alongside the listing.
                q("listings_with_image?select=*&order=message_ts.desc&limit=1000"),
                q("reference_stats?select=*&order=n.desc&limit=1000"),
                q("variant_stats?select=*&order=n.desc&limit=1000"),
                // Join through to the listing so the UI can show what was on offer.
                q("deal_alerts?select=*,listing:listings(brand,model,reference,price_usd,condition,set_completeness,year,seller_name,group_jid,message_ts)&order=created_at.desc&limit=200"),
                q("groups?select=jid,name,is_price_baseline,active"),
            ]);

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
                const base = (v && v.n >= 4) ? v : r;
                l.baseline_usd = base ? Number(base.median_usd) : null;
                l.baseline_n = base ? base.n : 0;
                l.baseline_basis = base ? ((v && v.n >= 4) ? "VARIANT" : "REFERENCE") : null;
                l.delta_pct = (l.baseline_usd && l.price_usd)
                    ? Math.round(((l.baseline_usd - l.price_usd) / l.baseline_usd) * 1000) / 10
                    : null;
            }

            // The bucket is private, so hand the browser short-lived signed URLs
            // rather than making dealer photos world-readable. One batch call.
            const paths = [...new Set(listings.map((l) => l.image_path).filter(Boolean))];
            if (paths.length) {
                try {
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

                    const urlByPath = {};
                    for (const s of signed || []) {
                        if (s.signedURL) urlByPath[s.path] = `${SUPABASE_URL}/storage/v1${s.signedURL}`;
                    }
                    for (const l of listings) {
                        l.image_url = l.image_path ? urlByPath[l.image_path] || null : null;
                    }
                } catch (err) {
                    // Photos are a nicety; never fail the whole view over them.
                    console.error("[leads-admin] signing image URLs failed:", err.message);
                }
            }

            return res.status(200).json({
                listings, stats, variants, alerts, groups, nameByJid,
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
        if (action === "books") {
            const [deals, expenses, subscriptions, capital, bank] = await Promise.all([
                supabase("dbh_deals?select=*&order=date_bought.asc&limit=2000"),
                supabase("dbh_expenses?select=*&order=spent_on.asc&limit=5000"),
                supabase("dbh_subscriptions?select=*&order=monthly_cost.desc&limit=200"),
                supabase("dbh_capital?select=*&order=moved_on.asc&limit=500"),
                supabase("dbh_bank_txns?select=*&order=posted_on.asc&limit=5000"),
            ]);

            // Cash is a whole-account fact, not a period one: it is every row the
            // register has ever seen, so it is summed here rather than client-side
            // where the period filter would quietly slice it.
            const cash = bank.reduce(
                (s, t) => s + Number(t.money_in || 0) - Number(t.money_out || 0), 0
            );

            return res.status(200).json({
                deals, expenses, subscriptions, capital, bank,
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

            const existing = await supabase("dbh_bank_txns?select=posted_on,description,money_in,money_out");
            const key = (r) =>
                [r.posted_on, String(r.description || "").trim().toLowerCase(),
                 Number(r.money_in || 0).toFixed(2), Number(r.money_out || 0).toFixed(2)].join("|");
            const seen = new Set(existing.map(key));

            const fresh = [];
            for (const r of clean) {
                if (seen.has(key(r))) continue;
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
        if (action === "matches") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });

            const [wants, matches, alerts] = await Promise.all([
                supabase("open_wants_board?select=*&limit=500"),
                // Best (cheapest) match per want is what matters operationally;
                // the rest are noise from one client matching every Daytona posted.
                supabase(
                    "want_matches?select=*,want:client_wants(client_name,client_phone,ok_to_text,lead_quality,brand,model,reference,opened_at,status)" +
                    "&order=created_at.desc&limit=400"
                ),
                wh("deal_alerts?select=*&order=created_at.desc&limit=100"),
            ]);

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
        if (action === "dealers") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const dealers = await wh(
                "dealers?select=lid,phone,wa_name,push_name,listings_count,first_seen,last_seen,groups" +
                "&listings_count=gt.0&order=listings_count.desc&limit=1000"
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

        // What to charge, per reference, at Henry's 5-8%.
        if (action === "quote-book") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const rows = await wh("quote_book?select=*&limit=500");
            return res.status(200).json({ rows });
        }

        return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
        console.error("[leads-admin] ERROR:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
};
