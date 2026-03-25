module.exports = async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/dialed_submissions?select=id&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    console.log("[keep-alive] Pinged Supabase, status:", response.status);
    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[keep-alive] Failed:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
