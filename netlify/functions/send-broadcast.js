const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const { render } = require("@react-email/render");
const React = require("react");
const { BroadcastEmail } = require("./emails/broadcast.js");

let supabase;
let resend;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * POST /.netlify/functions/send-broadcast
 *
 * Protected by a secret key (BROADCAST_SECRET env var).
 *
 * Body: {
 *   secret: string,           // Must match BROADCAST_SECRET
 *   subject: string,          // Email subject line
 *   previewText: string,      // Inbox preview
 *   tag: string,              // e.g. "NEW ARRIVAL", "JOURNAL", "ANNOUNCEMENT"
 *   headline: string,         // Main headline
 *   body: string,             // Paragraph 1
 *   body2?: string,           // Paragraph 2 (optional)
 *   imageUrl?: string,        // Hero image URL
 *   imageAlt?: string,        // Image alt text
 *   imageDark?: boolean,      // Dark bg behind image (default true)
 *   details?: {label, value}[], // Detail rows
 *   ctaText?: string,         // CTA button text
 *   ctaUrl?: string,          // CTA button URL
 *   signoff?: string,         // Custom sign-off
 *   testEmail?: string,       // If provided, only sends to this address (for testing)
 * }
 */
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body);

    // Auth check
    const broadcastSecret = process.env.BROADCAST_SECRET;
    if (!broadcastSecret || payload.secret !== broadcastSecret) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    if (!payload.subject || !payload.headline) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields: subject, headline" }) };
    }

    // Render the email
    console.log("[broadcast] Rendering email...");
    const html = await render(
      React.createElement(BroadcastEmail, {
        previewText: payload.previewText || payload.subject,
        tag: payload.tag || "UPDATE",
        headline: payload.headline,
        body: payload.body || "",
        body2: payload.body2 || "",
        imageUrl: payload.imageUrl || "",
        imageAlt: payload.imageAlt || "",
        imageDark: payload.imageDark !== false,
        details: payload.details || [],
        ctaText: payload.ctaText || "View Now",
        ctaUrl: payload.ctaUrl || "",
        signoff: payload.signoff || "Talk soon,",
      })
    );

    // If test mode, send to single address
    if (payload.testEmail) {
      console.log("[broadcast] TEST MODE — sending to:", payload.testEmail);
      const result = await getResend().emails.send({
        from: "Henry at Dialed By H <inquiries@mail.dialedbyhenry.com>",
        to: payload.testEmail,
        subject: payload.subject,
        html,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          mode: "test",
          sentTo: payload.testEmail,
          resendId: result.data?.id || null,
          error: result.error || null,
        }),
      };
    }

    // Production: fetch all subscribers from Supabase
    console.log("[broadcast] Fetching subscriber list...");
    const { data: subscribers, error: dbError } = await getSupabase()
      .from("submissions")
      .select("email, full_name")
      .eq("submission_type", "JOIN_LIST")
      .order("created_at", { ascending: true });

    if (dbError) {
      console.error("[broadcast] DB ERROR:", dbError.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Database error", details: dbError.message }) };
    }

    // Deduplicate by email
    const seen = new Set();
    const uniqueSubs = subscribers.filter(s => {
      const e = s.email.toLowerCase().trim();
      if (seen.has(e)) return false;
      seen.add(e);
      return true;
    });

    console.log("[broadcast] Sending to", uniqueSubs.length, "subscribers...");

    // Send in batches of 10 to avoid rate limits
    const batchSize = 10;
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < uniqueSubs.length; i += batchSize) {
      const batch = uniqueSubs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(sub =>
          getResend().emails.send({
            from: "Henry at Dialed By H <inquiries@mail.dialedbyhenry.com>",
            to: sub.email,
            subject: payload.subject,
            html,
          })
        )
      );

      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && !r.value.error) {
          sent++;
        } else {
          failed++;
          errors.push({
            email: batch[idx].email,
            error: r.status === "rejected" ? r.reason?.message : r.value?.error,
          });
        }
      });

      // Small delay between batches
      if (i + batchSize < uniqueSubs.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log("[broadcast] Complete — sent:", sent, "failed:", failed);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        mode: "broadcast",
        totalSubscribers: uniqueSubs.length,
        sent,
        failed,
        errors: errors.length ? errors : undefined,
      }),
    };
  } catch (err) {
    console.error("[broadcast] ERROR:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", details: err.message }) };
  }
};
