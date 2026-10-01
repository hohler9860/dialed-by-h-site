const test = require('node:test');
const assert = require('node:assert/strict');
process.env.ADMIN_PASSWORD = 'synthetic-admin';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service';
process.env.SUPABASE_URL = 'https://database.invalid';
const handler = require('../api/leads-admin');
function response() {
  return { code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('internal lead actions reject untrusted callers before any database access', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected network call'); };
  try {
    for (const action of ['list', 'today', 'accuracy']) {
      for (const authorization of ['', 'Bearer synthetic-public-key']) {
        const res = response();
        await handler({ method: 'POST', headers: { authorization }, body: { action } }, res);
        assert.equal(res.code, 401);
      }
    }
    assert.equal(calls, 0);
  } finally { global.fetch = original; }
});
test('authorized lead view and daily summary calls use only service credentials', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => url.includes('/rpc/') ? { synthetic: true } : [] };
  };
  try {
    for (const action of ['list', 'today', 'accuracy']) {
      const res = response();
      await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic-admin' }, body: { action } }, res);
      assert.equal(res.code, 200);
    }
    assert.ok(calls.some(c => c.url.includes('/lead_stage?')));
    assert.ok(calls.some(c => c.url.endsWith('/rpc/day_summary')));
    assert.ok(calls.some(c => c.url.endsWith('/rpc/identity_health')));
    for (const { options } of calls) {
      assert.equal(options.headers.apikey, 'synthetic-service');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-service');
    }
  } finally { global.fetch = original; }
});
