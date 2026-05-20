// GET /api/journal-get?slug=foo-bar
// Returns a single published Off-Catalog article by slug.
// Used by the public article page renderer (/journal/[slug]/).

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const ALLOWED_ORIGINS = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];

function setCors(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (process.env.VERCEL_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");

    const slug = req.query.slug ? String(req.query.slug).trim() : null;
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: "Invalid slug" });
    }

    try {
        const url = `${SUPABASE_URL}/rest/v1/journal_articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`;
        const r = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });

        if (!r.ok) {
            const errBody = await r.text();
            console.error("[journal-get] Supabase error:", r.status, errBody);
            return res.status(500).json({ error: "Failed to load article" });
        }

        const rows = await r.json();
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: "Article not found" });
        }

        // Fire-and-forget view increment (don't block response)
        const article = rows[0];
        fetch(`${SUPABASE_URL}/rest/v1/journal_articles?id=eq.${article.id}`, {
            method: "PATCH",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            },
            body: JSON.stringify({ view_count: (article.view_count || 0) + 1 }),
        }).catch(() => { /* swallow */ });

        return res.status(200).json({ article });
    } catch (err) {
        console.error("[journal-get] UNHANDLED:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
};
