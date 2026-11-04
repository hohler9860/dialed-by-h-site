#!/usr/bin/env node
// Runs the site on this Mac, read-only, so changes can be looked at before they go live.
//   node scripts/local-preview.cjs            http://localhost:4173
//   PORT=4174 MARGINS=1 node scripts/...      same site with the guidelines' 20px page margins
// Pages and data come from the real database, but nothing can change it: writes to the database,
// emails, messages and paid AI calls are all stopped here and pretend to succeed. Bound to this
// Mac only, so it cannot be reached from another device.
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 4173, MARGINS = !!process.env.MARGINS, SHOW_ADMIN_TEST = process.env.LOCAL_LOG;

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
for (const k of Object.keys(process.env)) if (/RESEND|TWILIO|EVOLUTION|WHATSAPP|N8N|WEBHOOK|OPENROUTER|FIREWORKS|ANTHROPIC|OPENAI|APIFY/.test(k)) delete process.env[k];
process.env.VERCEL_ENV = 'development';

// Read-only guard: reads go through, anything that would write or send is answered locally.
// These calls use POST but only read: the database confirmed them as read-only, and signing only makes photo links.
const READ_ONLY_RPC = /\/rpc\/(inquiry_analytics|day_summary|identity_health)\b|\/storage\/v1\/object\/sign\//;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, opts = {}) => {
    const target = String(input && input.url ? input.url : input);
    const method = String((opts && opts.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || READ_ONLY_RPC.test(target)) return realFetch(input, opts);
    if (SHOW_ADMIN_TEST) console.log('blocked', method, target.replace(/\?.*$/, '').slice(0, 90));
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const compile = (source) => { const names = []; const re = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:([a-zA-Z]+)\*/g, (_, n) => { names.push(n); return '(.*)'; }).replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+?)'; }); return { re: new RegExp('^' + re + '$'), names }; };
const routes = (list) => (list || []).filter((r) => !r.has).map((r) => ({ ...compile(r.source), destination: r.destination }));
const redirects = routes(config.redirects), rewrites = routes(config.rewrites);
const fill = (route, m) => route.names.reduce((d, n, i) => d.split(':' + n).join(encodeURIComponent(m[i + 1])), route.destination);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml', '.mp4': 'video/mp4' };
const inject = (html) => MARGINS ? String(html).replace('</head>', '<style>:root{--max:none!important;--gutter:20px!important}</style></head>') : html;

function fileFor(pathname) {
    const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(ROOT, clean);
    if (!abs.startsWith(ROOT) || /(^|\/)\.env|\/node_modules\//.test(abs)) return null;
    for (const f of [abs, abs + '.html', path.join(abs, 'index.html')]) { try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ } }
    return null;
}
function sendFile(res, f, status = 200) {
    const ext = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (ext === '.html') body = inject(body);
    res.writeHead(status, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
}
async function runApi(name, query, req, res) {
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    // Public write endpoints do nothing locally. Tracking is dropped too, so local visits never count.
    if (req.method === 'POST' && ['submit-form', 'journal-subscribe', 'send-broadcast', 'journal-broadcast'].includes(name)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"success":true,"local":true}'); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    let body = raw.toString('utf8');
    if (/json/.test(req.headers['content-type'] || '')) { try { body = JSON.parse(body || '{}'); } catch { /* leave as text */ } }
    Object.assign(req, { query, body });
    const headers = {};
    const shim = {
        statusCode: 200,
        setHeader(k, v) { headers[k] = v; return shim; }, getHeader: (k) => headers[k],
        status(c) { shim.statusCode = c; return shim; },
        json(o) { headers['Content-Type'] = 'application/json'; return shim.end(JSON.stringify(o)); },
        send(b) { return shim.end(b); },
        redirect(a, b) { const [code, loc] = b ? [a, b] : [302, a]; headers.Location = loc; shim.statusCode = code; return shim.end(); },
        end(b) { let out = b == null ? '' : b; if (/text\/html/.test(headers['Content-Type'] || '')) out = inject(out); headers['Cache-Control'] = 'no-store'; res.writeHead(shim.statusCode, headers); res.end(out); return shim; },
    };
    try { await require(file)(req, shim); } catch (e) { console.error('[api]', name, e && e.message); if (!res.headersSent) { res.writeHead(500); res.end('Local error'); } }
}
http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    let pathname = parsed.pathname, query = { ...parsed.query };
    for (const r of redirects) { const m = pathname.match(r.re); if (m) { res.writeHead(307, { Location: fill(r, m) }); return res.end(); } }
    if (!pathname.startsWith('/api/')) {
        const f = fileFor(pathname);
        if (f) return sendFile(res, f);
        for (const r of rewrites) {
            const m = pathname.match(r.re);
            if (m) { const d = url.parse(fill(r, m), true); pathname = d.pathname; query = { ...query, ...d.query }; const again = !pathname.startsWith('/api/') && fileFor(pathname); if (again) return sendFile(res, again); break; }
        }
    }
    if (pathname.startsWith('/api/')) return runApi(pathname.slice(5).replace(/\/$/, ''), query, req, res);
    const missing = path.join(ROOT, '404.html');
    return fs.existsSync(missing) ? sendFile(res, missing, 404) : (res.writeHead(404), res.end('Not found'));
}).listen(PORT, '127.0.0.1', () => console.log(`Local preview${MARGINS ? ' with 20px margins' : ''}: http://localhost:${PORT}`));
