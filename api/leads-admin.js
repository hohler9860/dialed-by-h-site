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

        return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
        console.error("[leads-admin] ERROR:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
};
