// Guard the native dependency: if sharp ever fails to load (e.g. missing binary),
// the handler degrades to redirecting to the original image instead of 500ing.
let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

// Hosts we are willing to fetch from. Keeps this from becoming an open image proxy (SSRF guard).
// Notion serves uploaded files from AWS S3 signed URLs.
const ALLOWED_HOST_PATTERNS = [
    /\.amazonaws\.com$/i,
    /(^|\.)notion\.so$/i,
    /(^|\.)notion-static\.com$/i,
];

function isAllowed(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch { return false; }
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOST_PATTERNS.some((re) => re.test(u.hostname));
}

module.exports = async (req, res) => {
    const raw = req.query.u || (req.query && req.query['u']);
    const url = Array.isArray(raw) ? raw[0] : raw;

    // No/blocked URL: nothing to serve.
    if (!url) {
        res.statusCode = 400;
        return res.end('Missing image url');
    }
    if (!isAllowed(url)) {
        // Not a host we proxy; bounce to it so the browser can try directly.
        res.statusCode = 302;
        res.setHeader('Location', url);
        return res.end();
    }

    // Target square size (defaults to 600, clamped).
    let size = parseInt(req.query.s, 10);
    if (!Number.isFinite(size)) size = 600;
    size = Math.max(200, Math.min(1200, size));

    // No image processor available: serve the original.
    if (!sharp) {
        res.statusCode = 302;
        res.setHeader('Location', url);
        return res.end();
    }

    try {
        const upstream = await fetch(url);
        if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
        const input = Buffer.from(await upstream.arrayBuffer());

        const output = await sharp(input)
            // Trim the surrounding transparent/flat padding down to the watch itself...
            .trim()
            // ...then re-center it on a fixed transparent square so every piece shares one footprint.
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 90 })
            .toBuffer();

        res.setHeader('Content-Type', 'image/webp');
        // Cache hard at the CDN edge; the rendered output for a given source is stable.
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
        res.statusCode = 200;
        return res.end(output);
    } catch (err) {
        // Any failure (fetch, decode, trim): fall back to the original image so the card still renders.
        console.error('normalize-image failed:', err && err.message);
        res.statusCode = 302;
        res.setHeader('Location', url);
        return res.end();
    }
};
