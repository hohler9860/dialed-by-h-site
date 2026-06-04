// Dynamic sitemap: core pages + every individual watch page.
// Routed via vercel.json: /sitemap.xml -> /api/sitemap
const { fetchAllPieces } = require('./_pieces');

const SITE_URL = process.env.SITE_URL || 'https://dialedbyhenry.com';

const CORE = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/inventory.html', changefreq: 'daily', priority: '0.9' },
    { loc: '/journal/', changefreq: 'weekly', priority: '0.8' },
    { loc: '/about.html', changefreq: 'monthly', priority: '0.8' },
    { loc: '/process.html', changefreq: 'monthly', priority: '0.7' },
    { loc: '/boston.html', changefreq: 'monthly', priority: '0.7' },
    { loc: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
];

function urlTag({ loc, changefreq, priority }) {
    return `  <url><loc>${SITE_URL}${loc}</loc>${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
}

module.exports = async (req, res) => {
    let watchTags = '';
    try {
        const pieces = await fetchAllPieces();
        watchTags = pieces
            .filter(p => p.image && p.slug)
            .map(p => urlTag({ loc: `/watch/${p.slug}`, changefreq: 'weekly', priority: '0.8' }))
            .join('\n');
    } catch (err) {
        console.error('[sitemap] failed to load pieces:', err && err.message);
        // Still serve the core sitemap even if Notion is unreachable.
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CORE.map(urlTag).join('\n')}${watchTags ? '\n' + watchTags : ''}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(body);
};
