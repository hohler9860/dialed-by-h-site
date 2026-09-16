const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.ADMIN_PASSWORD = 'test-admin';
const admin = require('../api/journal-admin');
const article = require('../api/journal-article-render');
const { sanitizeInline, sanitizeArticle, scriptJson } = require('../lib/safe-html-bundle.cjs');
function response(data, status = 200) { return { ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }; }
async function invoke(handler, body = {}, query = {}, method = 'POST') {
  const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; }, redirect(n,v) { this.code = n; this.location = v; return this; }, end() {} };
  await handler({ method, body, query, headers: { authorization: 'Bearer test-admin' } }, res);
  return res;
}
test('inline formatting survives while executable URLs and attributes are removed', () => {
  const html = sanitizeInline('<strong>Good</strong><a href="javascript:alert(1)">bad</a><b onclick="alert(1)">bold</b><a href="https://example.com">link</a>');
  assert.match(html, /<strong>Good<\/strong>/); assert.match(html, /https:\/\/example.com/);
  assert.doesNotMatch(html, /javascript:|onclick/);
});
test('article sanitizer blocks captions, scripts, SVG and unsafe embeds', () => {
  const html = sanitizeArticle('<figure class="journal-figure"><img src="https://example.com/a.png" onerror="alert(1)"><figcaption><script>alert(1)</script>Caption</figcaption></figure><iframe src="javascript:alert(1)"></iframe><svg onload="alert(1)"></svg>');
  assert.match(html, /Caption/); assert.match(html, /journal-figure/); assert.doesNotMatch(html, /script|onerror|onload|javascript:|svg/);
});
test('article sanitizer accepts configured video embeds and rejects arbitrary origins', () => {
  const html = sanitizeArticle('<iframe src="https://www.youtube.com/embed/test"></iframe><iframe src="https://attacker.invalid"></iframe>');
  assert.match(html, /www.youtube.com\/embed\/test/); assert.doesNotMatch(html, /attacker/);
});
test('script JSON preserves content without closing its HTML script element', () => {
  const data = { title: '</script><script>alert(1)</script>\u2028' };
  const encoded = scriptJson(data); assert.doesNotMatch(encoded, /</); assert.deepEqual(JSON.parse(encoded), data);
});
test('journal save sanitizes image captions and embeds before database write', async () => {
  let saved;
  global.fetch = async (url, opts) => { saved = JSON.parse(opts.body); return response([{ id: 'article', ...saved }]); };
  const r = await invoke(admin, { action: 'save', id: 'article', title: 'Test', content_json: { blocks: [ { type: 'image', data: { url: 'https://example.com/a.png', caption: '<img src=x onerror="alert(1)">Caption' } }, { type: 'embed', data: { embed: 'javascript:alert(1)' } } ] } });
  assert.equal(r.code, 200); assert.doesNotMatch(saved.content_html, /\sonerror="|javascript:|<iframe/); assert.match(saved.content_html, /<figcaption>Caption<\/figcaption>/);
});
test('paired journal images retain safe companions and sanitize captions and URLs', async () => {
  let saved;
  global.fetch = async (url, opts) => { saved = JSON.parse(opts.body); return response([{ id: 'article', ...saved }]); };
  await invoke(admin, { action: 'save', id: 'article', title: 'Pair', content_json: { blocks: [
    { type: 'image', data: { file: { url: 'https://example.com/photo.png' }, watchFile: { url: 'https://example.com/watch.png' }, watchAlt: 'Watch', imageFit: 'contain', imagePosition: 'top', caption: '<script>bad()</script>Caption' } },
    { type: 'image', data: { file: { url: 'https://example.com/photo.png' }, watchFile: { url: 'javascript:alert(1)' } } }
  ] } });
  assert.match(saved.content_html, /class="journal-pair"/);
  assert.match(saved.content_html, /journal-product journal-focus-top/);
  assert.match(saved.content_html, /src="https:\/\/example.com\/watch.png"/);
  assert.match(saved.content_html, /<\/div><figcaption>Caption<\/figcaption>/);
  assert.doesNotMatch(saved.content_html, /javascript:|<script/);
  assert.equal(saved.content_json.blocks[0].data.watchFile.url, 'https://example.com/watch.png');
});
test('published legacy article is sanitized and JSON-LD cannot break out', async () => {
  global.fetch = async () => response([{ id: 'article', slug: 'test', title: '</script><script id="injected">alert(1)</script>', content_html: '<p>Good</p><img src=x onerror="alert(1)">' }]);
  const r = await invoke(article, {}, { slug: 'test' }, 'GET');
  assert.equal(r.code, 200); assert.doesNotMatch(r.body, /<script id="injected">|onerror="alert/); assert.match(r.body, /<p>Good<\/p>/);
});
