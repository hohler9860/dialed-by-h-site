const crypto = require('crypto');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  if (!secret || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({ ok: false, error: 'Server misconfigured' });

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/dialed_submissions?select=id&limit=1`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    console.log("[keep-alive] Pinged Supabase, status:", response.status);
    if (!response.ok) throw new Error('Database ping failed');

    // Sweep stale rate-limit rows (windows reset in minutes; anything a day old is dead weight).
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sweep = await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?window_start=lt.${encodeURIComponent(cutoff)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "return=minimal" },
      });
      if (!sweep.ok) throw new Error('Rate-limit cleanup failed');

    return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[keep-alive] Failed:", err.message);
    return res.status(500).json({ ok: false, error: 'Maintenance failed' });
  }
};
