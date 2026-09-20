// GET /img?src=<url>[&mode=cutout]  (rewritten here via vercel.json)
//
// Watch-image normalizer for the buy grid and watch pages. Direct port of the
// rebuild dev server's pipeline so tiles render identically in production:
// background-removed pieces get a halo recut, trim, and centering at a fixed
// fill on a uniform dark canvas; opaque photos get a square attention crop.
// Disk cache is replaced by CDN edge caching (output for a given src is stable).

const { fetchImage, allowedImageUrl } = require('../lib/fetch-image');
const { validateImage, hasAlpha, renderStandard, renderCutout } = require('../lib/watch-image');
const { guard } = require('../lib/ratelimit');

// LEGACY ONLY. /img?piece=<pageId>&i=<n> was the old image path: it called the
// Notion API to re-sign an expiring URL, one call per piece, on every CDN miss.
// That is exactly what this migration removed. Nothing on the site emits this
// shape anymore, but Google indexed these URLs, so resolve them to the piece's
// permanent Supabase URL and redirect. No Notion involvement.
const { fetchAllPieces } = require('./_pieces');

async function resolveLegacyPieceImage(pageId, idx, mode) {
    // Incoming ids are dashless 32-char hex; stored ids are dashed UUIDs.
    const pieces = await fetchAllPieces();
    const piece = pieces.find(p => String(p.id).replace(/-/g, '') === pageId);
    if (!piece) return '';
    const list = mode === 'cutout'
        ? (piece.imagesCutout && piece.imagesCutout.length ? piece.imagesCutout : piece.images)
        : piece.images;
    return (list && list[idx]) || '';
}

module.exports = async (req, res) => {
    const raw = req.query.src;
    let src = Array.isArray(raw) ? raw[0] : raw;
    const modeRaw = req.query.mode;
    const mode = Array.isArray(modeRaw) ? modeRaw[0] : modeRaw;

    const pieceRaw = req.query.piece;
    const piece = Array.isArray(pieceRaw) ? pieceRaw[0] : pieceRaw;
    if (piece && /^[a-f0-9]{32}$/.test(piece)) {
        const idx = parseInt(req.query.i || '0') || 0;
        const target = await resolveLegacyPieceImage(piece, idx, mode);
        if (!target || !allowedImageUrl(target)) { res.statusCode = 404; return res.end(); }
        // The stored image is already fully processed, so redirect rather than
        // re-download and re-encode it. 301 lets crawlers relearn the new URL.
        res.statusCode = 301;
        res.setHeader('Location', target);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000');
        return res.end();
    }

    if (!src) { res.statusCode = 400; return res.end('Missing src'); }
    if (!allowedImageUrl(src)) { res.statusCode = 404; return res.end(); }
    if (mode && mode !== 'cutout') { res.statusCode = 400; return res.end('Invalid image mode'); }
    const rl = await guard({ req, name: 'image-proxy', perIp: { max: 60, windowSeconds: 600 }, global: { max: 600, windowSeconds: 600 }, failClosed: true });
    if (!rl.allowed) { res.statusCode = 429; return res.end('Try again later'); }
    try {
        const buf = await fetchImage(src);
        await validateImage(buf);
        const alpha = await hasAlpha(buf);
        const output = mode === 'cutout' && alpha ? await renderCutout(buf, alpha) : await renderStandard(buf, alpha);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
        return res.end(output);
    } catch {
        // Never proxy undecoded bytes or retry without the safety limits.
        res.statusCode = 404;
        return res.end();
    }
};
