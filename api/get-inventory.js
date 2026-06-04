// Single multi-purpose endpoint (Hobby plan caps serverless functions at 12):
//  - default            -> JSON array of all pieces
//  - ?id=<pageId>       -> JSON for one piece
//  - ?slug=<slug>       -> server-rendered watch HTML  (rewrite: /watch/:slug)
//  - ?sitemap=1         -> dynamic sitemap XML         (rewrite: /sitemap.xml)
const { fetchAllPieces } = require('./_pieces');
const { renderWatchPage, renderSitemap, fourOhFour } = require('./_render');

module.exports = async (req, res) => {
    const q = req.query || {};

    // ── Sitemap (XML) ──
    if (q.sitemap) {
        try {
            const pieces = await fetchAllPieces();
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).send(renderSitemap(pieces));
        } catch (err) {
            console.error('[get-inventory:sitemap] error:', err && err.message);
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            return res.status(200).send(renderSitemap([]));
        }
    }

    // ── Watch page (HTML) ──
    if (q.slug || q.render === 'watch') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const slug = q.slug ? String(q.slug).trim().toLowerCase() : null;
        try {
            const pieces = await fetchAllPieces();
            const piece = q.id ? pieces.find(p => p.id === q.id) : pieces.find(p => p.slug === slug);
            if (!piece || !piece.image) return res.status(404).send(fourOhFour());
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
            return res.status(200).send(renderWatchPage(piece));
        } catch (err) {
            console.error('[get-inventory:watch] error:', err && err.message);
            return res.status(500).send(fourOhFour());
        }
    }

    // ── JSON API (default + single piece) ──
    const allowedOrigins = ['https://dialedbyhenry.com', 'https://www.dialedbyhenry.com'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (process.env.VERCEL_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const pieces = await fetchAllPieces();
        if (q.id) {
            const piece = pieces.find(w => w.id === q.id);
            if (!piece) return res.status(404).json({ error: 'Piece not found' });
            return res.status(200).json(piece);
        }
        return res.status(200).json(pieces);
    } catch (err) {
        console.error('get-inventory failed:', err && err.message);
        return res.status(500).json({ error: 'Failed to load inventory' });
    }
};
