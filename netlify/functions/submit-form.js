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
  const templates = {
    JOIN_LIST: {
      subject: "New Private List Signup",
      body: `<h2>New Private List Signup</h2>
        <p><strong>Name:</strong> ${data.full_name || "Not provided"}</p>
        <p><strong>Email:</strong> ${data.email}</p>`,
    },
    BUY: {
      subject: "New Buy Request",
      body: `<h2>New Buy Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Watch Details:</strong> ${data.watch_details || "None"}</p>`,
    },
    SELL: {
      subject: "New Sell Request",
      body: `<h2>New Sell Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Watch Details:</strong> ${data.watch_details || "None"}</p>`,
    },
    TRADE: {
      subject: "New Trade Request",
      body: `<h2>New Trade Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Watch Details:</strong> ${data.watch_details || "None"}</p>`,
    },
    WATCH_DETAIL: {
      subject: `Watch Inquiry: ${data.watch_name || "Unknown"}`,
      body: `<h2>New Watch Inquiry</h2>
        <p><strong>Watch:</strong> ${data.watch_name}</p>
        <p><strong>Reference:</strong> ${data.watch_ref}</p>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Email:</strong> ${data.email}</p>`,
    },
  };
  return templates[type];
}

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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { type, fullName, email, watchDetails, watchName, watchRef } =
      JSON.parse(event.body);

    // Validate
    if (!type || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const validTypes = ["JOIN_LIST", "BUY", "SELL", "TRADE", "WATCH_DETAIL"];
    if (!validTypes.includes(type)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid submission type" }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    const { data, error } = await getSupabase()
      .from("submissions")
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Database error" }),
      };
    }

    // Send email (don't fail if this errors)
    const template = buildEmail(type, data);
    if (template) {
      getResend()
        .emails.send({
          from: "Dialed By H <onboarding@resend.dev>",
          to: process.env.NOTIFICATION_EMAIL || "dialedbyh@gmail.com",
          subject: template.subject,
          html: template.body,
        })
        .catch((err) => console.error("Email error:", err));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, id: data.id }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};
