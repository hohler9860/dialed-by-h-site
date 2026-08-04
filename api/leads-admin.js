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

// Evolution powers the "is this still available" message. Server-side only:
// the key must never reach the browser.
const EVOLUTION_URL = (process.env.EVOLUTION_URL || "").replace(/\/+$/, "");
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "dialedbyh";

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

            // Attach the dealer's own photo of the piece. Seeing the watch is how
            // Henry judges condition before he spends anything chasing it.
            const listingIds = [...new Set((matches || []).map((m) => m.listing_id).filter(Boolean))];
            if (listingIds.length) {
                try {
                    const shots = await wh(
                        "listings_with_image?select=id,image_path,year,condition,set_completeness," +
                        "dial_material,case_material,bracelet,has_diamonds,nickname" +
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
                        m.listing = {
                            year: l.year, condition: l.condition, set_completeness: l.set_completeness,
                            dial_material: l.dial_material, case_material: l.case_material,
                            bracelet: l.bracelet, has_diamonds: l.has_diamonds, nickname: l.nickname,
                        };
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
                wh("retail_listings?select=id,source_slug,title,brand,reference,price_usd,available," +
                   "year,condition,set_completeness,url,image_url,last_seen" +
                   "&order=last_seen.desc&limit=2000"),
                wh("retail_sources?select=slug,name,feed_type,last_sync,last_count"),
            ]);

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

        // What to charge, per reference. Every row carries the evidence behind it:
        // how many dealer quotes, how many comparable retail listings, how close
        // the retail match was, and whether it is safe to put in front of a client.
        if (action === "quote-book") {
            const wh = (path) => supabase(path, { headers: { "Accept-Profile": "wholesale" } });
            const [rows, manual] = await Promise.all([
                wh("quote_book?select=*&limit=1000"),
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
