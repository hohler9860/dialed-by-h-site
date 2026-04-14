const FEED_URL = 'https://dialedbyh.substack.com/feed';

function stripCdata(s) {
    return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function getTag(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const m = xml.match(re);
    return m ? stripCdata(m[1]) : '';
}

function getItems(xml) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml))) items.push(m[1]);
    return items;
}

function extractImage(itemXml) {
    const enc = itemXml.match(/<enclosure[^>]+url="([^"]+)"/);
    if (enc) return enc[1];
    const content = itemXml.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);
    if (content) {
        const img = content[1].match(/<img[^>]+src="([^"]+)"/);
        if (img) return img[1];
    }
    return '';
}

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#8217;/g, '\u2019')
        .replace(/&#8216;/g, '\u2018')
        .replace(/&#8220;/g, '\u201C')
        .replace(/&#8221;/g, '\u201D')
        .replace(/&#8211;/g, '\u2013')
        .replace(/&#8212;/g, '\u2014')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function stripHtml(s) {
    return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

module.exports = async (req, res) => {
    const allowedOrigins = ['https://dialedbyhenry.com', 'https://www.dialedbyhenry.com'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (process.env.VERCEL_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const r = await fetch(FEED_URL, {
            headers: { 'User-Agent': 'DialedByH-Site/1.0 (+https://dialedbyhenry.com)' }
        });
        if (!r.ok) throw new Error(`Substack feed returned ${r.status}`);
        const xml = await r.text();

        const posts = getItems(xml).map(item => {
            const title = decodeEntities(getTag(item, 'title'));
            const link = getTag(item, 'link');
            const pubDate = getTag(item, 'pubDate');
            const descriptionRaw = getTag(item, 'description');
            const description = stripHtml(descriptionRaw).slice(0, 240);
            const image = extractImage(item);
            return { title, link, pubDate, description, image };
        });

        return res.status(200).json({ posts });
    } catch (err) {
        console.error('Substack feed error:', err);
        return res.status(500).json({ error: 'Failed to fetch Substack feed', details: err.message });
    }
};
