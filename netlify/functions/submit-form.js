const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

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
        <p><strong>Email:</strong> ${data.email}</p>`,
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

exports.handler = async (event) => {
  console.log("[submit-form] Function invoked, method:", event.httpMethod);

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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Log env var presence (never log actual values)
  console.log("[submit-form] ENV CHECK — SUPABASE_URL:", !!process.env.SUPABASE_URL);
  console.log("[submit-form] ENV CHECK — SUPABASE_SERVICE_ROLE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("[submit-form] ENV CHECK — RESEND_API_KEY:", !!process.env.RESEND_API_KEY);
  console.log("[submit-form] ENV CHECK — NOTIFICATION_EMAIL:", process.env.NOTIFICATION_EMAIL || "(not set, will use default)");

  try {
    const { type, fullName, email, watchDetails, watchName, watchRef } =
      JSON.parse(event.body);

    console.log("[submit-form] Parsed payload — type:", type, "email:", email, "watchName:", watchName || "(none)");

    // Validate
    if (!type || !email) {
      console.error("[submit-form] VALIDATION FAIL — missing type or email");
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const validTypes = ["JOIN_LIST", "BUY", "SELL", "TRADE", "WATCH_DETAIL"];
    if (!validTypes.includes(type)) {
      console.error("[submit-form] VALIDATION FAIL — invalid type:", type);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid submission type" }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("[submit-form] VALIDATION FAIL — invalid email:", email);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid email" }),
      };
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
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Database error", details: error.message }),
      };
    }

    console.log("[submit-form] Supabase insert SUCCESS — id:", data.id);

    // Send email via Resend — AWAIT it so we know if it fails
    const template = buildEmail(type, data);
    let emailResult = null;

    if (template) {
      const toEmail = process.env.NOTIFICATION_EMAIL || "dialedbyh@gmail.com";

      console.log("[submit-form] Sending email via Resend...");
      console.log("[submit-form] From: Dialed By H <inquiries@mail.dialedbyhenry.com>");
      console.log("[submit-form] To:", toEmail);
      console.log("[submit-form] Subject:", template.subject);

      try {
        emailResult = await getResend().emails.send({
          from: "Dialed By H <inquiries@mail.dialedbyhenry.com>",
          to: toEmail,
          subject: template.subject,
          html: template.body,
        });

        console.log("[submit-form] RESEND RESPONSE:", JSON.stringify(emailResult));

        if (emailResult.error) {
          console.error("[submit-form] RESEND RETURNED ERROR:", JSON.stringify(emailResult.error));
        } else {
          console.log("[submit-form] Email sent successfully — Resend ID:", emailResult.data?.id);
        }
      } catch (emailErr) {
        console.error("[submit-form] RESEND SEND THREW:", emailErr.message);
        console.error("[submit-form] RESEND FULL ERROR:", JSON.stringify(emailErr, Object.getOwnPropertyNames(emailErr)));
        // Don't fail the whole request if email fails — submission is already saved
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: data.id,
        emailSent: emailResult && !emailResult.error,
        emailId: emailResult?.data?.id || null,
      }),
    };
  } catch (err) {
    console.error("[submit-form] UNHANDLED ERROR:", err.message);
    console.error("[submit-form] STACK:", err.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
};
