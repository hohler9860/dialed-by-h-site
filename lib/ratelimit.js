// Server-side rate limiting via the Supabase check_rate_limit() RPC.
//
// Design choice: this FAILS OPEN. If Supabase is unreachable or the key is
// missing, we allow the request through rather than block a real customer over
// a transient DB hiccup. The RPC is atomic (fixed-window counter), so concurrent
// requests can't race past the limit.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Best-effort client IP. Vercel sets x-forwarded-for (client is the first entry).
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim() || "unknown";
  return req.headers["x-real-ip"] || "unknown";
}

// Returns true if the request is ALLOWED, false if it should be blocked (429).
async function checkRateLimit(key, max, windowSeconds, { failClosed = false } = {}) {
  if (!SUPABASE_KEY) return !failClosed; // misconfigured -> don't punish real users
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!r.ok) {
      console.error("[ratelimit] RPC failed:", r.status);
      return !failClosed; // public lead forms may fail open; uploads and pricing fail closed
    }
    return (await r.json()) === true;
  } catch (e) {
    console.error("[ratelimit] threw:", e && e.message);
    return !failClosed; // public lead forms may fail open; uploads and pricing fail closed
  }
}

// Convenience: enforce a per-IP limit and a global backstop in one call.
// Returns { allowed, scope } where scope names which limit tripped.
async function guard({ req, name, perIp, global, failClosed = false }) {
  const ip = getClientIp(req);
  if (perIp) {
    const ok = await checkRateLimit(`${name}:ip:${ip}`, perIp.max, perIp.windowSeconds, { failClosed });
    if (!ok) return { allowed: false, scope: "ip" };
  }
  if (global) {
    const ok = await checkRateLimit(`${name}:global`, global.max, global.windowSeconds, { failClosed });
    if (!ok) return { allowed: false, scope: "global" };
  }
  return { allowed: true, scope: null };
}

module.exports = { getClientIp, checkRateLimit, guard };
