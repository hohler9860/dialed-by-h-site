// GET /api/journal-confirm?token=...
// Confirms a journal subscription. Redirects to a friendly /journal/?confirmed=1 page.
// Linked from the double-opt-in email sent by /api/journal-subscribe.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

module.exports = async (req, res) => {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const token = req.query.token ? String(req.query.token) : null;
    if (!token || !/^[a-f0-9]{16,128}$/.test(token)) {
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=invalid`);
    }

    if (!SUPABASE_KEY) {
        console.error("[journal-confirm] Missing SUPABASE_SERVICE_ROLE_KEY");
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
    }

    try {
        // Find subscriber by token
        const lookupUrl = `${SUPABASE_URL}/rest/v1/journal_subscribers?confirmation_token=eq.${encodeURIComponent(token)}&limit=1`;
        const lookupRes = await fetch(lookupUrl, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });

        if (!lookupRes.ok) {
            console.error("[journal-confirm] Lookup failed:", lookupRes.status);
            return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
        }

        const rows = await lookupRes.json();
        if (!rows || rows.length === 0) {
            return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=expired`);
        }

        const subscriber = rows[0];
        if (subscriber.confirmed) {
            return res.redirect(302, `${SITE_URL}/journal/?confirmed=1&already=1`);
        }

        // Mark confirmed; clear token so it can't be reused
        const updateUrl = `${SUPABASE_URL}/rest/v1/journal_subscribers?id=eq.${subscriber.id}`;
        const updateRes = await fetch(updateUrl, {
            method: "PATCH",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            },
            body: JSON.stringify({
                confirmed: true,
                confirmed_at: new Date().toISOString(),
                confirmation_token: null,
            }),
        });

        if (!updateRes.ok) {
            console.error("[journal-confirm] Update failed:", updateRes.status);
            return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
        }

        return res.redirect(302, `${SITE_URL}/journal/?confirmed=1`);
    } catch (err) {
        console.error("[journal-confirm] UNHANDLED:", err.message);
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
    }
};
