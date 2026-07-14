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

    // Sweep stale rate-limit rows (windows reset in minutes; anything a day old is dead weight).
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?window_start=lt.${encodeURIComponent(cutoff)}`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "return=minimal" },
      });
    } catch (e) {
      console.error("[keep-alive] rate_limits sweep failed:", e.message);
    }

    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[keep-alive] Failed:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
