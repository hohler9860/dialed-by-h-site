const { Resend } = require("resend");
const { guard } = require("../lib/ratelimit.js");

// Supabase REST API — DialedbyH project
const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Supabase ${res.status}`);
  }
  const data = await res.json();
  return data[0];
}

// n8n lead classifier. Fire-and-forget: it grades the lead in the background and
// writes lead_class / lead_quality back onto the row. It must never affect whether
// the visitor's submission succeeds.
//
// We deliberately send ONLY the row id, never the lead's name/email/phone. n8n reads
// those back out of Supabase itself. This started as a workaround for n8n being plain
// HTTP; it is kept now that TLS is in place because there is no reason to copy PII
// across a second hop when an id is enough.
//
// N8N_LEAD_WEBHOOK_URL must stay on https. The host 302-redirects http to https, and
// fetch() downgrades a redirected POST to GET, which would silently drop the payload.
const N8N_WEBHOOK_URL = process.env.N8N_LEAD_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_LEAD_WEBHOOK_SECRET;

async function notifyClassifier(id) {
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    console.log("[submit-form] Classifier webhook not configured, skipping");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dialed-signature": N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ id }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("[submit-form] Classifier webhook HTTP", res.status);
    else console.log("[submit-form] Classifier notified for id:", id);
  } catch (err) {
    console.error("[submit-form] Classifier webhook failed (non-fatal):", err.message);
  } finally {
    clearTimeout(timeout);
  }
}

// Lazy-init Resend
let resend;
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Escape user-supplied values before they land in the notification email HTML.
// Without this, a submitter could inject markup/links into the inbox Henry reads.
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Strip CR/LF and collapse whitespace so user input can't mangle the subject line.
function cleanSubject(s) {
  return String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim().slice(0, 160);
}

// Styled notification wrapper
function wrapNotification(bodyHtml) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #fafafa;">
      <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 28px;">
        <strong style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #1a1a1a;">DIALED BY H</strong>
      </div>
      ${bodyHtml}
      <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 14px; font-size: 11px; color: #aaa;">
        Sent automatically from dialedbyhenry.com
      </div>
    </div>
  `;
}

function fieldRow(label, value) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; width: 100px; vertical-align: top;">${label}</td>
      <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #eee; font-size: 15px; color: #1a1a1a; vertical-align: top;">${escHtml(value)}</td>
    </tr>
  `;
}

function fieldTable(fields) {
  const rows = fields.map(f => fieldRow(f.label, f.value)).filter(Boolean).join("");
  if (!rows) return "";
  return `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">${rows}</table>`;
}

// Email templates per submission type
function buildEmail(type, data) {
  const name = data.full_name || "Not provided";
  const email = data.email;
  const watch = data.watch_name || null;
  const ref = data.watch_ref || null;
  const details = data.watch_details || null;

  const templates = {
    BUY: {
      subject: cleanSubject(`\u{1F535} Sourcing: ${watch || "New Request"}`),
      body: wrapNotification(`
        <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 20px; color: #1a1a1a;">New Sourcing Request</h2>
        ${fieldTable([
          { label: "Name", value: name },
          { label: "Email", value: email },
          { label: "Watch", value: watch },
          { label: "Reference", value: ref },
          { label: "Details", value: details },
        ])}
      `),
    },
    SELL: {
      subject: cleanSubject(`\u{1F7E1} Sell: ${watch || "New Request"}`),
      body: wrapNotification(`
        <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 20px; color: #1a1a1a;">New Sell Request</h2>
        ${fieldTable([
          { label: "Name", value: name },
          { label: "Email", value: email },
          { label: "Watch", value: watch },
          { label: "Reference", value: ref },
          { label: "Details", value: details },
        ])}
      `),
    },
    TRADE: {
      subject: cleanSubject(`\u{1F504} Trade: ${watch || "New Request"}`),
      body: wrapNotification(`
        <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 20px; color: #1a1a1a;">New Trade Request</h2>
        ${fieldTable([
          { label: "Name", value: name },
          { label: "Email", value: email },
          { label: "Watch", value: watch },
          { label: "Reference", value: ref },
          { label: "Details", value: details },
        ])}
      `),
    },
    WATCH_DETAIL: {
      subject: cleanSubject(`\u{1F441} Inquiry: ${watch || "Unknown"}`),
      body: wrapNotification(`
        <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 20px; color: #1a1a1a;">New Watch Inquiry</h2>
        ${fieldTable([
          { label: "Name", value: name },
          { label: "Email", value: email },
          { label: "Watch", value: watch },
          { label: "Reference", value: ref },
          { label: "Details", value: details },
        ])}
      `),
    },
  };
  return templates[type];
}

module.exports = async (req, res) => {
  console.log("[submit-form] Function invoked, method:", req.method);

  const allowedOrigins = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (process.env.VERCEL_ENV !== "production") {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!SUPABASE_KEY) {
    console.error("[submit-form] Missing SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  // Honeypot: real users never see or fill this field. Bots fill every input.
  // Return a fake success so the bot thinks it worked and moves on — no DB row,
  // no emails, nothing happens.
  if (req.body && (req.body.website || req.body.company_url)) {
    console.warn("[submit-form] Honeypot tripped — silently dropping");
    return res.status(200).json({ success: true });
  }

  // Rate limit: 6 submissions / 10 min per IP, plus a 40 / 10 min global backstop
  // so no single machine (or a distributed flood) can drain the email quota.
  const rl = await guard({
    req, name: "submit-form",
    perIp: { max: 6, windowSeconds: 600 },
    global: { max: 40, windowSeconds: 600 },
  });
  if (!rl.allowed) {
    console.warn("[submit-form] Rate limited, scope:", rl.scope);
    return res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
  }

  console.log("[submit-form] Using SUPABASE_URL:", SUPABASE_URL);

  try {
    const { type, fullName, email, phone, watchDetails, watchName, watchRef, watchImage, watchBrand, intent, budget, lookingFor, preferred, okToText, location } = req.body;

    console.log("[submit-form] Parsed payload -type:", type, "email:", email, "watchName:", watchName || "(none)");

    // Validate
    if (!type || !email) {
      console.error("[submit-form] VALIDATION FAIL -missing type or email");
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validTypes = ["BUY", "SELL", "TRADE", "WATCH_DETAIL"];
    if (!validTypes.includes(type)) {
      console.error("[submit-form] VALIDATION FAIL -invalid type:", type);
      return res.status(400).json({ error: "Invalid submission type" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("[submit-form] VALIDATION FAIL -invalid email:", email);
      return res.status(400).json({ error: "Invalid email" });
    }

    // Where they are, on every form. Decides whether a piece can be handed
    // over in person and what shipping costs, and it is the cheapest question
    // to ask up front.
    const locationClean = String(location || "").trim();
    if (!locationClean) {
      console.error("[submit-form] VALIDATION FAIL -missing location");
      return res.status(400).json({ error: "Please tell me where you are based" });
    }

    // Budget is no longer asked on any form (Henry, 2026-09-02). The column is
    // kept so old rows still read; new rows land null.

    // Phone is required on every lead form. The `required` attribute on the
    // inputs is only a hint; this is the real gate, since anyone can POST
    // straight to this endpoint.
    const phoneClean = (phone || "").trim();
    const digits = phoneClean.replace(/\D/g, "");
    if (!digits) {
      console.error("[submit-form] VALIDATION FAIL -missing phone for type:", type);
      return res.status(400).json({ error: "Phone number is required" });
    }
    // 7 is the shortest plausible national number; 15 is the E.164 maximum.
    if (digits.length < 7 || digits.length > 15) {
      console.error("[submit-form] VALIDATION FAIL -implausible phone length:", digits.length);
      return res.status(400).json({ error: "Please enter a valid phone number" });
    }

    let detailsForRow = watchDetails?.trim() || null;

    // Insert into Supabase
    const row = {
      submission_type: type,
      email: email.toLowerCase().trim(),
      full_name: fullName?.trim() || null,
      watch_details: detailsForRow,
      location: locationClean || null,
      watch_name: watchName?.trim() || null,
      watch_ref: watchRef?.trim() || null,
      phone: phoneClean || null,
      budget: budget?.trim() || null,
      // How they asked to be reached. Ten leads asked for iMessage and the
      // console had no idea, because this only ever existed inside the details
      // text. Whitelisted so a tampered form cannot write anything it likes.
      preferred_channel: (() => {
        const p = String(preferred || "").trim();
        const OK = ["WhatsApp", "iMessage", "Text message", "Email", "Instagram DM", "Phone call"];
        return OK.find((o) => o.toLowerCase() === p.toLowerCase()) || null;
      })(),
      ok_to_text: typeof okToText === "boolean" ? okToText : null,
      status: "new",
    };

    console.log("[submit-form] Inserting into Supabase...");
    const data = await supabaseInsert("dialed_submissions", row);
    console.log("[submit-form] Supabase insert SUCCESS -id:", data.id);

    // Kick this off now so it runs alongside the emails rather than after them.
    // notifyClassifier swallows its own errors, so this promise never rejects.
    const classifierPromise = notifyClassifier(data.id);

    // ── EMAIL SENDING (non-critical — never fails the request) ──
    let emailSent = false;
    let inquirySent = false;
    let emailDebug = null;

    try {
      const template = buildEmail(type, data);
      const emailPromises = [];

      // 1. Notification email to Henry
      if (template) {
        const toEmail = process.env.NOTIFICATION_EMAIL || "dialedbyh@gmail.com";
        console.log("[submit-form] Queuing notification email to:", toEmail);

        emailPromises.push(
          getResend().emails.send({
            from: "Dialed By H <inquiries@mail.dialedbyhenry.com>",
            to: toEmail,
            subject: template.subject,
            html: template.body,
          }).then(result => {
            if (result.error) { console.error("[submit-form] NOTIFICATION EMAIL ERROR:", JSON.stringify(result.error)); emailDebug = result.error.message || JSON.stringify(result.error); }
            else { console.log("[submit-form] Notification sent -ID:", result.data?.id); emailSent = true; }
            return result;
          }).catch(err => {
            console.error("[submit-form] NOTIFICATION EMAIL THREW:", err.message);
            emailDebug = err.message;
          })
        );
      }

      // No confirmation email to the visitor. Henry pulled it 2026-09-02: the
      // template read badly and the personal reply is the follow-up anyway.
      // Only the internal notification above goes out.

      await Promise.all(emailPromises);
    } catch (emailErr) {
      emailDebug = emailErr.message;
      console.error("[submit-form] EMAIL BLOCK ERROR (non-fatal):", emailErr.message);
    }

    // Vercel freezes the function once we respond, so settle this before returning.
    await classifierPromise;

    return res.status(200).json({
      success: true,
      id: data.id,
      emailSent,
      inquirySent,
      _debug: emailDebug || null,
    });
  } catch (err) {
    console.error("[submit-form] UNHANDLED ERROR:", err.message);
    console.error("[submit-form] STACK:", err.stack);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
