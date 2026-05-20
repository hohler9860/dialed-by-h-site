// POST /api/journal-subscribe
// Body: { email: string, source?: string }
// Adds a subscriber to journal_subscribers (unconfirmed) and sends a
// double-opt-in confirmation email via Resend.

const { Resend } = require("resend");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

let resend;
function getResend() {
    if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
    return resend;
}

function setCors(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (process.env.VERCEL_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function supabaseUpsertSubscriber(row) {
    const url = `${SUPABASE_URL}/rest/v1/journal_subscribers?on_conflict=email`;
    const r = await fetch(url, {
        method: "POST",
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Supabase ${r.status}: ${text}`);
    }
    const data = await r.json();
    return data[0];
}

function confirmEmailHtml({ confirmUrl }) {
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #fafafa;">
        <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 28px;">
            <strong style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #1a1a1a;">OFF-CATALOG · DIALED BY H</strong>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 18px; color: #1a1a1a;">Confirm your subscription</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 24px;">
            Click below to confirm and start receiving Off-Catalog, the journal from Dialed By H. Market notes, sourcing stories, and the occasional rare reference.
        </p>
        <a href="${confirmUrl}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 28px; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; border-radius: 2px;">
            Confirm Subscription
        </a>
        <p style="font-size: 12px; line-height: 1.6; color: #999; margin: 32px 0 0;">
            If you didn't sign up for this, ignore this email.
        </p>
        <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 14px; font-size: 11px; color: #aaa;">
            Sent from dialedbyhenry.com
        </div>
    </div>
    `;
}

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (!SUPABASE_KEY) {
        console.error("[journal-subscribe] Missing SUPABASE_SERVICE_ROLE_KEY");
        return res.status(500).json({ error: "Server misconfigured" });
    }

    try {
        const { email: rawEmail, source } = req.body || {};
        const email = String(rawEmail || "").toLowerCase().trim();

        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: "Invalid email" });
        }

        const confirmationToken = crypto.randomBytes(24).toString("hex");

        const row = {
            email,
            confirmation_token: confirmationToken,
            confirmed: false,
            source: source ? String(source).slice(0, 60) : "journal",
        };

        const subscriber = await supabaseUpsertSubscriber(row);

        // If already confirmed, return success without re-sending email
        if (subscriber.confirmed) {
            return res.status(200).json({ success: true, alreadyConfirmed: true });
        }

        // Send confirmation email
        const tokenToUse = subscriber.confirmation_token || confirmationToken;
        const confirmUrl = `${SITE_URL}/api/journal-confirm?token=${encodeURIComponent(tokenToUse)}`;

        try {
            const sendRes = await getResend().emails.send({
                from: "Off-Catalog <inquiries@mail.dialedbyhenry.com>",
                to: email,
                subject: "Confirm your Off-Catalog subscription",
                html: confirmEmailHtml({ confirmUrl }),
            });
            if (sendRes.error) {
                console.error("[journal-subscribe] Resend error:", JSON.stringify(sendRes.error));
            } else {
                console.log("[journal-subscribe] Confirmation sent, id:", sendRes.data?.id);
            }
        } catch (e) {
            console.error("[journal-subscribe] Resend threw:", e.message);
        }

        return res.status(200).json({ success: true, alreadyConfirmed: false });
    } catch (err) {
        console.error("[journal-subscribe] UNHANDLED:", err.message);
        return res.status(500).json({ error: "Server error" });
    }
};
