// Called only after leads-admin has checked the existing admin bearer token.
// No social token or provider credential is returned to the browser.
const ACTIONS = new Set(['status','verify-account','pause','resume','mode','approve','reject','edit','recheck','workspace','connect']);
const OPERATIONS = new Set(['state','settings','integrations','create','edit','link','unschedule','resolve','generate','refresh','add-feed','remove-feed','add-source','verify-source','upload','metrics','disconnect']);
module.exports = async function socialAdmin(body, options = {}) {
    const env = options.env || process.env;
    const fetcher = options.fetch || fetch;
    const action = String(body.action || '').replace(/^social-/, '');
    if (!ACTIONS.has(action)) throw new Error('Unknown social action');
    if (action === 'workspace' && !OPERATIONS.has(body.operation)) throw new Error('Unknown workspace operation.');
    if (!env.SOCIAL_POSTER_URL || !env.SOCIAL_POSTER_SECRET) {
        if (action === 'status') return { configured: false, reason: 'Social publishing service has not been connected to this admin yet.', reddit: { status: 'approval_required', connected: false } };
        throw new Error('Connect the social publishing service first.');
    }
    const origin = new URL(env.SOCIAL_POSTER_URL);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('SOCIAL_POSTER_URL must be an HTTPS origin.');
    if (env.SOCIAL_POSTER_SECRET.length < 32) throw new Error('Social service secret must be at least 32 characters.');
    // Fixed endpoint: browser input cannot select a remote URL or send credentials elsewhere.
    const payload = { action };
    for (const key of ['id','version','mode','body','scheduledAt','operation','payload']) if (body[key] !== undefined) payload[key] = body[key];
    let response;
    try {
        response = await fetcher(origin.origin + '/api/admin-bridge', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.SOCIAL_POSTER_SECRET },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new Error('Social worker is unreachable. No success was assumed. Check hosting and service connection.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('Social service authentication failed. Check the server-side connection secret.');
        throw new Error(result.error || 'Social service request failed.');
    }
    return result;
};
