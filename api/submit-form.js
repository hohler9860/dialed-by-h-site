const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const { render } = require("@react-email/render");
const React = require("react");
const { WelcomeEmail } = require("./emails/welcome.js");
const { InquiryEmail } = require("./emails/inquiry.js");

// Lazy-init clients
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

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate required environment variables
  const missingVars = [];
  if (!process.env.SUPABASE_URL) missingVars.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.RESEND_API_KEY) missingVars.push("RESEND_API_KEY");

  if (missingVars.length > 0) {
    console.error("[submit-form] Missing environment variables:", missingVars.join(", "));
    return res.status(500).json({
      error: "Server configuration error",
      details: `Missing environment variables: ${missingVars.join(", ")}. Set these in your Vercel project settings.`,
    });
  }

  // Log env var presence (never log actual values)
  console.log("[submit-form] ENV CHECK -SUPABASE_URL:", !!process.env.SUPABASE_URL);
  console.log("[submit-form] ENV CHECK -SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("[submit-form] ENV CHECK -RESEND_API_KEY:", !!process.env.RESEND_API_KEY);
  console.log("[submit-form] ENV CHECK -NOTIFICATION_EMAIL:", process.env.NOTIFICATION_EMAIL || "(not set, will use default)");

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
    const { data, error } = await getSupabase()
      .from("submissions")
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error("[submit-form] SUPABASE ERROR:", JSON.stringify(error));
      return res.status(500).json({ error: "Database error", details: error.message });
    }

    console.log("[submit-form] Supabase insert SUCCESS -id:", data.id);

    // Build all email promises in parallel for speed
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
          else console.log("[submit-form] Notification sent -ID:", result.data?.id);
          return { type: "notification", result };
        }).catch(err => {
          console.error("[submit-form] NOTIFICATION EMAIL THREW:", err.message);
          return { type: "notification", error: err.message };
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
            else console.log("[submit-form] Welcome email sent -ID:", result.data?.id);
            return { type: "welcome", result };
          })
          .catch(err => {
            console.error("[submit-form] WELCOME EMAIL THREW:", err.message);
            return { type: "welcome", error: err.message };
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
            else console.log("[submit-form] Inquiry email sent -ID:", result.data?.id);
            return { type: "inquiry", result };
          })
          .catch(err => {
            console.error("[submit-form] INQUIRY EMAIL THREW:", err.message);
            return { type: "inquiry", error: err.message };
          })
      );
    }

    // Fire all emails in parallel
    const emailResults = await Promise.all(emailPromises);
    const notif = emailResults.find(r => r.type === "notification");
    const welcome = emailResults.find(r => r.type === "welcome");
    const inquiry = emailResults.find(r => r.type === "inquiry");

    return res.status(200).json({
      success: true,
      id: data.id,
      emailSent: notif && !notif.error && !notif.result?.error,
      emailId: notif?.result?.data?.id || null,
      welcomeSent: welcome && !welcome.error && !welcome.result?.error,
      inquirySent: inquiry && !inquiry.error && !inquiry.result?.error,
    });
  } catch (err) {
    console.error("[submit-form] UNHANDLED ERROR:", err.message);
    console.error("[submit-form] STACK:", err.stack);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
