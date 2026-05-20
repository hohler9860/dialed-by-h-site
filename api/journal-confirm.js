// GET /api/journal-confirm?token=...                 → confirm subscription
// GET /api/journal-confirm?action=unsubscribe&token=… → unsubscribe
// (Merged from former journal-unsubscribe.js to stay under the Vercel function limit.)
//
// Both flows are simple token-based GET redirects, so they share this single endpoint.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

async function handleConfirm(token, res) {
    if (!/^[a-f0-9]{16,128}$/.test(token)) {
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=invalid`);
    }

    const lookupUrl = `${SUPABASE_URL}/rest/v1/journal_subscribers?confirmation_token=eq.${encodeURIComponent(token)}&limit=1`;
    const lookupRes = await fetch(lookupUrl, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!lookupRes.ok) return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);

    const rows = await lookupRes.json();
    if (!rows || rows.length === 0) {
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=expired`);
    }

    const subscriber = rows[0];
    if (subscriber.confirmed) {
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=1&already=1`);
    }

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/journal_subscribers?id=eq.${subscriber.id}`, {
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
    if (!updateRes.ok) return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);

    return res.redirect(302, `${SITE_URL}/journal/?confirmed=1`);
}

async function handleUnsubscribe(token, res) {
    if (!token) return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=missing`);

    const r = await fetch(`${SUPABASE_URL}/rest/v1/journal_subscribers?unsubscribe_token=eq.${encodeURIComponent(token)}`, {
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
    if (!r.ok) return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=server`);

    const rows = await r.json();
    if (!rows || rows.length === 0) {
        return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=0&reason=notfound`);
    }
    return res.redirect(302, `${SITE_URL}/journal/?unsubscribed=1`);
}

module.exports = async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!SUPABASE_KEY) {
        console.error("[journal-confirm] Missing SUPABASE_SERVICE_ROLE_KEY");
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
    }

    const action = (req.query.action || (req.body && req.body.action) || "confirm").toString();
    const token = req.query.token ? String(req.query.token) : (req.body && req.body.token) || null;

    if (!token) {
        const redirectKey = action === "unsubscribe" ? "unsubscribed" : "confirmed";
        return res.redirect(302, `${SITE_URL}/journal/?${redirectKey}=0&reason=missing`);
    }

    try {
        if (action === "unsubscribe") return handleUnsubscribe(token, res);
        return handleConfirm(token, res);
    } catch (err) {
        console.error("[journal-confirm] UNHANDLED:", err.message);
        return res.redirect(302, `${SITE_URL}/journal/?confirmed=0&reason=server`);
    }
};
