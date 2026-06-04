const { fetchAllPieces } = require('./_pieces');

module.exports = async (req, res) => {
    const allowedOrigins = ['https://dialedbyhenry.com', 'https://www.dialedbyhenry.com'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (process.env.VERCEL_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const pieces = await fetchAllPieces();

        const params = req.query || {};
        if (params.id) {
            const piece = pieces.find(w => w.id === params.id);
            if (!piece) return res.status(404).json({ error: 'Piece not found' });
            return res.status(200).json(piece);
        }

        return res.status(200).json(pieces);
    } catch (err) {
        console.error('get-inventory failed:', err && err.message);
        return res.status(500).json({ error: 'Failed to load inventory' });
    }
};
