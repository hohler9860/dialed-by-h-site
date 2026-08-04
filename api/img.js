// GET /img?src=<url>[&mode=cutout]  (rewritten here via vercel.json)
//
// Watch-image normalizer for the buy grid and watch pages. Direct port of the
// rebuild dev server's pipeline so tiles render identically in production:
// background-removed pieces get a halo recut, trim, and centering at a fixed
// fill on a uniform dark canvas; opaque photos get a square attention crop.
// Disk cache is replaced by CDN edge caching (output for a given src is stable).

let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const ALLOWED = ['amazonaws.com', 'notion.so', 'notion-static.com', 'supabase.co'];

function isAllowed(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch { return false; }
    if (u.protocol !== 'https:') return false;
    return ALLOWED.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
}

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
        if (!target) { res.statusCode = 404; return res.end(); }
        // The stored image is already fully processed, so redirect rather than
        // re-download and re-encode it. 301 lets crawlers relearn the new URL.
        res.statusCode = 301;
        res.setHeader('Location', target);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000');
        return res.end();
    }

    if (!src) { res.statusCode = 400; return res.end('Missing src'); }
    if (!isAllowed(src)) { res.statusCode = 404; return res.end(); }

    if (!sharp) {
        res.statusCode = 302;
        res.setHeader('Location', src);
        return res.end();
    }

    try {
        const r = await fetch(src);
        if (!r.ok) throw new Error('fetch ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const img = sharp(buf).ensureAlpha();
        const stats = await img.clone().stats();
        const alphaCh = stats.channels[3];
        const SIZE = 900, FILL = 0.66, BG = { r: 13, g: 13, b: 13, alpha: 1 };
        let outBuf;
        let contentType = 'image/webp';

        if (alphaCh && alphaCh.min < 200) {
            // background-removed piece: clean halo, trim, center at FILL on BG
            const cleaned = await img.recomb([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).toBuffer();
            // edge recut: pull the contour inside the halo, then soften 1px for AA
            const rgbBuf = await sharp(cleaned).removeAlpha().toBuffer();
            const alphaBuf = await sharp(cleaned).ensureAlpha().extractChannel(3)
                .blur(1.1)                 // spread so threshold lands mid-fringe
                .linear(3.0, -420)         // steep cut ~= alpha 55% -> hard edge inside halo
                .blur(0.5)                 // reintroduce 1px anti-aliasing
                .toBuffer();
            const halo = await sharp(rgbBuf).joinChannel(alphaBuf).png().toBuffer();
            const trimmed = await sharp(halo).trim({ threshold: 12 }).toBuffer();
            if (mode === 'cutout') {
                outBuf = await sharp(trimmed).resize(520, 520, { fit: 'inside', kernel: 'lanczos3' }).webp({ quality: 84 }).toBuffer();
            } else {
                const meta = await sharp(trimmed).metadata();
                const target = Math.round(SIZE * FILL);
                const scale = Math.min(target / meta.width, target / meta.height);
                const w = Math.max(1, Math.round(meta.width * scale));
                const hgt = Math.max(1, Math.round(meta.height * scale));
                const piece = await sharp(trimmed).resize(w, hgt, { kernel: 'lanczos3' }).toBuffer();
                outBuf = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
                    .composite([{ input: piece, left: Math.round((SIZE - w) / 2), top: Math.round((SIZE - hgt) / 2) }])
                    .webp({ quality: 84 }).toBuffer();
            }
        } else {
            // opaque photo: center-crop square, cap size
            outBuf = await sharp(buf).resize(SIZE, SIZE, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toBuffer();
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
        return res.end(outBuf);
    } catch (e) {
        // fall back to plain proxy — never for a disallowed host
        try {
            if (!isAllowed(src)) throw new Error('blocked');
            const r = await fetch(src);
            if (!r.ok) throw new Error('fetch ' + r.status);
            const buf = Buffer.from(await r.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.end(buf);
        } catch {
            res.statusCode = 404;
            return res.end();
        }
    }
};
