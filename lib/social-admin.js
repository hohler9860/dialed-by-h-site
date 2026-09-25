// This entry point is called only after the website's existing admin bearer check.
const ACTIONS = new Set(['status','verify-account','pause','resume','mode','approve','reject','edit','recheck','workspace','connect']);
const OPERATIONS = new Set(['state','settings','integrations','create','edit','link','unschedule','resolve','generate','refresh','add-feed','remove-feed','add-source','verify-source','upload','metrics','disconnect']);
module.exports = async function socialAdmin(body, options = {}) {
    const action = String(body.action || '').replace(/^social-/, '');
    if (!ACTIONS.has(action)) throw new Error('Unknown social action');
    if (action === 'workspace' && !OPERATIONS.has(body.operation)) throw new Error('Unknown workspace operation.');
    const payload = {action};
    for (const key of ['id','version','mode','body','scheduledAt','operation','payload']) if (body[key] !== undefined) payload[key] = body[key];
    const native = options.native || await import('./social-runtime/native.mjs');
    try {return await native.admin(payload, options);}
    catch (error) {
        if (action === 'status' && error.setup) return {configured:false,reason:'The publishing database needs its website migration applied.',reddit:{connected:false}};
        throw error;
    }
};
