'use strict';
const crypto = require('node:crypto');
const schema = require('../assets/inquiry-schema');
const ORIGINS = new Set(['https://dialedbyhenry.com', 'https://www.dialedbyhenry.com']);
async function db(route, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Tracking database is not configured');
  const r = await fetch(`${process.env.SUPABASE_URL || 'https://untnrofsnmoyxdidxbdj.supabase.co'}/rest/v1/${route}`, {
    method:'POST', headers:{apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(body), signal:AbortSignal.timeout(4000)
  });
  if (!r.ok) throw new Error('Tracking database request failed');
  return r;
}
function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  const actual = String(req.headers.authorization || '').replace(/^Bearer /, '');
  return !!expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function handle(req, res) {
  res.setHeader('Cache-Control','private, no-store');
  const action = req.query && req.query.action;
  if (action === 'analytics') {
    if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
    if (!authorized(req)) return res.status(401).json({error:'Unauthorized'});
    const days = Number(req.query.days || 30);
    if (![7,30,90].includes(days)) return res.status(400).json({error:'Invalid period'});
    try { const r = await db('rpc/inquiry_analytics', {p_days:days}); return res.status(200).json(await r.json()); }
    catch (_) { return res.status(503).json({error:'Analytics unavailable. Please retry.'}); }
  }
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if (!ORIGINS.has(req.headers.origin)) return res.status(403).json({error:'Invalid origin'});
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).json({error:'JSON required'});
  let body = req.body;
  try {
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body || {})) > 4096) return res.status(413).json({error:'Event too large'});
    if (typeof body === 'string') body = JSON.parse(body);
  } catch (_) { return res.status(400).json({error:'Invalid event'}); }
  const event = schema.event(body);
  if (!event) return res.status(400).json({error:'Invalid event'});
  // Never pollute production analytics from branch previews or local development.
  if (process.env.VERCEL_ENV !== 'production') return res.status(204).end();
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
    const digest = crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '').update(ip).digest('hex').slice(0,32);
    const allowed = await db('rpc/check_rate_limit', {p_key:`analytics:${digest}`,p_max:120,p_window_seconds:600});
    if ((await allowed.json()) !== true) return res.status(429).json({error:'Rate limited'});
    const global = await db('rpc/check_rate_limit', {p_key:'analytics:global',p_max:6000,p_window_seconds:3600});
    if ((await global.json()) !== true) return res.status(429).json({error:'Rate limited'});
    await db('inquiry_events?on_conflict=event_id', event);
    return res.status(204).end();
  } catch (_) { return res.status(503).json({error:'Tracking unavailable'}); }
}
function attribution(raw, type) {
  const value = schema.context(raw);
  return value && value.form_id && schema.types.includes(type) ? {...value, form_type:type} : null;
}
module.exports = {handle, attribution};
