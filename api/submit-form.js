const { Resend } = require("resend");
const { render } = require("@react-email/render");
const React = require("react");
const { WelcomeEmail } = require("./emails/welcome.js");
const { InquiryEmail } = require("./emails/inquiry.js");

// Supabase REST API — hardcoded to correct project
const SUPABASE_URL = "https://spyeyqgrpvvdetxdhsur.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNweWV5cWdycHZ2ZGV0eGRoc3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTA2MDcsImV4cCI6MjA4ODQ4NjYwN30.MUURsxV3Pwh5BXELNpiK5tqPuBDWaBigt_2Q7SJvqJU";

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

// Lazy-init Resend
let resend;
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Email templates per submission type
function buildEmail(type, data) {
  const detailsBlock = data.watch_details
    ? `<p><strong>Details:</strong> ${data.watch_details}</p>`
    : "";

  const templates = {
    JOIN_LIST: {
      subject: "New Private List Signup",
      body: `<h2>New Private List Signup</h2>
        <p><strong>Name:</strong> ${data.full_name || "Not provided"}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.intent ? `<p><strong>Intent:</strong> ${data.intent}</p>` : ""}
        ${data.budget ? `<p><strong>Budget:</strong> ${data.budget}</p>` : ""}`,
    },
    BUY: {
      subject: `Sourcing Request: ${data.watch_name || "New Request"}`,
      body: `<h2>New Sourcing Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.watch_name ? `<p><strong>Watch:</strong> ${data.watch_name}</p>` : ""}
        ${data.watch_ref ? `<p><strong>Reference:</strong> ${data.watch_ref}</p>` : ""}
        ${detailsBlock}`,
    },
    SELL: {
      subject: `Sell Request: ${data.watch_name || "New Request"}`,
      body: `<h2>New Sell Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.watch_name ? `<p><strong>Watch:</strong> ${data.watch_name}</p>` : ""}
        ${data.watch_ref ? `<p><strong>Reference:</strong> ${data.watch_ref}</p>` : ""}
        ${detailsBlock}`,
    },
    TRADE: {
      subject: `Trade Request: ${data.watch_name || "New Request"}`,
      body: `<h2>New Trade Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.watch_name ? `<p><strong>Watch:</strong> ${data.watch_name}</p>` : ""}
        ${data.watch_ref ? `<p><strong>Reference:</strong> ${data.watch_ref}</p>` : ""}
        ${detailsBlock}`,
    },
    WATCH_DETAIL: {
      subject: `Watch Inquiry: ${data.watch_name || "Unknown"}`,
      body: `<h2>New Watch Inquiry</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        ${data.watch_name ? `<p><strong>Watch:</strong> ${data.watch_name}</p>` : ""}
        ${data.watch_ref ? `<p><strong>Reference:</strong> ${data.watch_ref}</p>` : ""}
        ${detailsBlock}`,
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

  console.log("[submit-form] Using SUPABASE_URL:", SUPABASE_URL);

  try {
    const { type, fullName, email, watchDetails, watchName, watchRef, watchImage, watchBrand } = req.body;

    console.log("[submit-form] Parsed payload -type:", type, "email:", email, "watchName:", watchName || "(none)");

    // Validate
    if (!type || !email) {
      console.error("[submit-form] VALIDATION FAIL -missing type or email");
      return res.status(400).json({ error: "Missing required fields" });
    }

    const validTypes = ["JOIN_LIST", "BUY", "SELL", "TRADE", "WATCH_DETAIL"];
    if (!validTypes.includes(type)) {
      console.error("[submit-form] VALIDATION FAIL -invalid type:", type);
      return res.status(400).json({ error: "Invalid submission type" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("[submit-form] VALIDATION FAIL -invalid email:", email);
      return res.status(400).json({ error: "Invalid email" });
    }

    // Insert into Supabase
    const row = {
      submission_type: type,
      email: email.toLowerCase().trim(),
      full_name: fullName?.trim() || null,
      watch_details: watchDetails?.trim() || null,
      watch_name: watchName?.trim() || null,
      watch_ref: watchRef?.trim() || null,
      status: "new",
    };

    console.log("[submit-form] Inserting into Supabase...");
    const data = await supabaseInsert("dialed_submissions", row);
    console.log("[submit-form] Supabase insert SUCCESS -id:", data.id);

    // ── EMAIL SENDING (non-critical — never fails the request) ──
    let emailSent = false;
    let welcomeSent = false;
    let inquirySent = false;

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
            if (result.error) console.error("[submit-form] NOTIFICATION EMAIL ERROR:", JSON.stringify(result.error));
            else { console.log("[submit-form] Notification sent -ID:", result.data?.id); emailSent = true; }
            return result;
          }).catch(err => {
            console.error("[submit-form] NOTIFICATION EMAIL THREW:", err.message);
          })
        );
      }

      // 2. Welcome email to subscriber (JOIN_LIST only)
      if (type === "JOIN_LIST") {
        const firstName = data.full_name ? data.full_name.split(" ")[0] : null;
        console.log("[submit-form] Queuing welcome email to:", data.email);

        emailPromises.push(
          render(React.createElement(WelcomeEmail, { firstName }))
            .then(welcomeHtml =>
              getResend().emails.send({
                from: "Henry at Dialed By H <inquiries@mail.dialedbyhenry.com>",
                to: data.email,
                subject: "Welcome to the Private List",
                html: welcomeHtml,
              })
            )
            .then(result => {
              if (result.error) console.error("[submit-form] WELCOME EMAIL ERROR:", JSON.stringify(result.error));
              else { console.log("[submit-form] Welcome email sent -ID:", result.data?.id); welcomeSent = true; }
              return result;
            })
            .catch(err => {
              console.error("[submit-form] WELCOME EMAIL THREW:", err.message);
            })
        );
      }

      // 3. Inquiry confirmation email to user (WATCH_DETAIL or BUY)
      if (type === "WATCH_DETAIL" || type === "BUY") {
        const firstName = data.full_name ? data.full_name.split(" ")[0] : null;
        console.log("[submit-form] Queuing inquiry confirmation to:", data.email);

        emailPromises.push(
          render(React.createElement(InquiryEmail, {
            firstName,
            watchName: data.watch_name || null,
            watchRef: data.watch_ref || null,
            watchBrand: watchBrand || null,
            watchImage: watchImage || null,
          }))
            .then(inquiryHtml =>
              getResend().emails.send({
                from: "Henry at Dialed By H <inquiries@mail.dialedbyhenry.com>",
                to: data.email,
                subject: `Your Inquiry: ${data.watch_name || "Watch Inquiry"}`,
                html: inquiryHtml,
              })
            )
            .then(result => {
              if (result.error) console.error("[submit-form] INQUIRY EMAIL ERROR:", JSON.stringify(result.error));
              else { console.log("[submit-form] Inquiry email sent -ID:", result.data?.id); inquirySent = true; }
              return result;
            })
            .catch(err => {
              console.error("[submit-form] INQUIRY EMAIL THREW:", err.message);
            })
        );
      }

      await Promise.all(emailPromises);
    } catch (emailErr) {
      console.error("[submit-form] EMAIL BLOCK ERROR (non-fatal):", emailErr.message);
    }

    return res.status(200).json({
      success: true,
      id: data.id,
      emailSent,
      welcomeSent,
      inquirySent,
    });
  } catch (err) {
    console.error("[submit-form] UNHANDLED ERROR:", err.message);
    console.error("[submit-form] STACK:", err.stack);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
