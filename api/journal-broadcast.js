// POST /api/journal-broadcast
// Body: { articleId: string }
// Auth: Authorization: Bearer <ADMIN_PASSWORD>
//
// Sends the given (published) Off-Catalog article to every confirmed,
// non-unsubscribed journal subscriber. Per-subscriber unsubscribe link
// is injected via string replacement on a pre-rendered base template.

const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const { render } = require("@react-email/render");
const React = require("react");
const crypto = require("crypto");
const { BroadcastEmail } = require("../lib/emails/broadcast.js");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

let supabase;
let resend;

function getSupabase() {
    if (!supabase) {
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return supabase;
}

function getResend() {
    if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
    return resend;
}

function timingSafeEq(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

function isAuthorized(req) {
    if (!ADMIN_PASSWORD) return false;
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return false;
    return timingSafeEq(h.slice(7).trim(), ADMIN_PASSWORD);
}

function setCors(req, res) {
    const origin = req.headers.origin;
    const allowed = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];
    if (allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (process.env.VERCEL_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

const UNSUB_PLACEHOLDER = "%%UNSUB_URL_PLACEHOLDER%%";

function injectUnsubscribeFooter(baseHtml) {
    // Append a small "Unsubscribe" link next to the existing Privacy link in the footer.
    // The base template ends with: <a href="https://www.dialedbyhenry.com/privacy.html" ...>Privacy &amp; Terms</a>
    return baseHtml.replace(
        /(Privacy\s*&amp;\s*Terms<\/a>)/,
        `$1 &nbsp;·&nbsp; <a href="${UNSUB_PLACEHOLDER}" style="color:inherit;text-decoration:none;font-family:'Space Grotesk','Arial','Helvetica',sans-serif;letter-spacing:2.5px;text-transform:uppercase;font-size:10px">Unsubscribe</a>`
    );
}

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

    const { articleId, testEmail } = req.body || {};
    if (!articleId) return res.status(400).json({ error: "Missing articleId" });

    try {
        // 1. Fetch article
        const { data: articleRows, error: artErr } = await getSupabase()
            .from("journal_articles")
            .select("*")
            .eq("id", articleId)
            .eq("status", "published")
            .limit(1);

        if (artErr) return res.status(500).json({ error: "DB error", details: artErr.message });
        if (!articleRows || articleRows.length === 0) return res.status(404).json({ error: "Published article not found" });

        const article = articleRows[0];
        const ctaUrl = `${SITE_URL}/journal/${article.slug}`;

        // 2. Render base email HTML with placeholder injected
        const baseHtml = await render(
            React.createElement(BroadcastEmail, {
                previewText: article.subtitle || article.excerpt || article.title,
                tag: article.category ? `OFF-CATALOG · ${article.category.toUpperCase()}` : "OFF-CATALOG",
                headline: article.title,
                body: article.subtitle || "",
                body2: article.excerpt || "",
                imageUrl: article.hero_image_url || "",
                imageAlt: article.title,
                ctaText: "Read the full article",
                ctaUrl,
                signoffText: "— Henry",
            })
        );
        const htmlWithUnsub = injectUnsubscribeFooter(baseHtml);
        const subject = article.title;

        // 3. Test mode → single send and return
        if (testEmail) {
            const unsubUrl = `${SITE_URL}/api/journal-confirm?action=unsubscribe&token=test-token`;
            const html = htmlWithUnsub.replaceAll(UNSUB_PLACEHOLDER, unsubUrl);
            const r = await getResend().emails.send({
                from: "Henry at Off-Catalog <inquiries@mail.dialedbyhenry.com>",
                to: testEmail,
                subject,
                html,
                headers: { "List-Unsubscribe": `<${unsubUrl}>` },
            });
            return res.status(200).json({ mode: "test", sentTo: testEmail, resendId: r.data?.id, error: r.error || null });
        }

        // 4. Production: fetch all confirmed subscribers
        const { data: subs, error: subErr } = await getSupabase()
            .from("journal_subscribers")
            .select("email, unsubscribe_token")
            .eq("confirmed", true)
            .is("unsubscribed_at", null);

        if (subErr) return res.status(500).json({ error: "DB error", details: subErr.message });
        if (!subs || subs.length === 0) {
            return res.status(200).json({ mode: "broadcast", totalSubscribers: 0, sent: 0, failed: 0 });
        }

        // 5. Send in batches of 10
        const batchSize = 10;
        let sent = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < subs.length; i += batchSize) {
            const batch = subs.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map((sub) => {
                    const unsubUrl = `${SITE_URL}/api/journal-confirm?action=unsubscribe&token=${encodeURIComponent(sub.unsubscribe_token)}`;
                    const html = htmlWithUnsub.replaceAll(UNSUB_PLACEHOLDER, unsubUrl);
                    return getResend().emails.send({
                        from: "Henry at Off-Catalog <inquiries@mail.dialedbyhenry.com>",
                        to: sub.email,
                        subject,
                        html,
                        headers: {
                            "List-Unsubscribe": `<${unsubUrl}>`,
                            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                        },
                    });
                })
            );

            results.forEach((r, idx) => {
                if (r.status === "fulfilled" && !r.value.error) {
                    sent++;
                } else {
                    failed++;
                    errors.push({
                        email: batch[idx].email,
                        error: r.status === "rejected" ? (r.reason && r.reason.message) : (r.value && r.value.error),
                    });
                }
            });

            if (i + batchSize < subs.length) await new Promise((r) => setTimeout(r, 200));
        }

        return res.status(200).json({
            mode: "broadcast",
            totalSubscribers: subs.length,
            sent,
            failed,
            errors: errors.length ? errors.slice(0, 10) : undefined,
        });
    } catch (err) {
        console.error("[journal-broadcast] UNHANDLED:", err.message);
        return res.status(500).json({ error: err.message || "Server error" });
    }
};
