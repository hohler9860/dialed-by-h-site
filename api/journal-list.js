// GET /api/journal-list
// Returns published Off-Catalog articles (card list for /journal/ index page)
// Query params:
//   ?limit=20         max articles to return (default 20, cap 50)
//   ?category=Market  filter by category (optional)
//   ?offset=0         pagination offset (default 0)

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

    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const category = req.query.category ? String(req.query.category) : null;

        const select = [
            "id",
            "slug",
            "title",
            "subtitle",
            "excerpt",
            "hero_image_url",
            "category",
            "author_name",
            "published_at",
            "reading_time_minutes",
        ].join(",");

        let url = `${SUPABASE_URL}/rest/v1/journal_articles?select=${select}&status=eq.published&order=published_at.desc&limit=${limit}&offset=${offset}`;
        if (category) {
            url += `&category=eq.${encodeURIComponent(category)}`;
        }

        const r = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });

        if (!r.ok) {
            const errBody = await r.text();
            console.error("[journal-list] Supabase error:", r.status, errBody);
            return res.status(500).json({ error: "Failed to load journal" });
        }

        const articles = await r.json();
        return res.status(200).json({ articles, count: articles.length });
    } catch (err) {
        console.error("[journal-list] UNHANDLED:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
    }
};
