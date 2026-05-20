// GET /api/journal-unsubscribe?token=...
// One-click unsubscribe via the unsubscribe_token in every broadcast email's footer.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

module.exports = async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const token = (req.query.token || (req.body && req.body.token));
    if (!token) {
        return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=missing`);
    }

    if (!SUPABASE_KEY) {
        console.error("[journal-unsubscribe] Missing SUPABASE_SERVICE_ROLE_KEY");
        return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=server`);
    }

    try {
        const url = `${SUPABASE_URL}/rest/v1/journal_subscribers?unsubscribe_token=eq.${encodeURIComponent(token)}`;
        const r = await fetch(url, {
            method: "PATCH",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
            },
            body: JSON.stringify({
                unsubscribed_at: new Date().toISOString(),
                confirmed: false,
            }),
        });

        if (!r.ok) {
            console.error("[journal-unsubscribe] Update failed:", r.status);
            return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=server`);
        }

        const rows = await r.json();
        if (!rows || rows.length === 0) {
            return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=notfound`);
        }

        return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=1`);
    } catch (err) {
        console.error("[journal-unsubscribe] UNHANDLED:", err.message);
        return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=server`);
    }
};
