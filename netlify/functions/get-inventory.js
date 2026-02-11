const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Extract value from a Notion property
function get(prop) {
    if (!prop) return '';
    switch (prop.type) {
        case 'title':
            return prop.title?.map(t => t.plain_text).join('') || '';
        case 'rich_text':
            return prop.rich_text?.map(t => t.plain_text).join('') || '';
        case 'select':
            return prop.select?.name || '';
        case 'number':
            return prop.number ?? '';
        case 'checkbox':
            return prop.checkbox;
        default:
            return '';
    }
}

// Get all image URLs from Files property
function getImages(prop) {
    if (!prop || !prop.files) return [];
    return prop.files.map(f => f.file?.url || f.external?.url || '').filter(Boolean);
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=60'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Only pull "Available" watches
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                property: 'Status',
                select: { equals: 'Available' }
            },
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
        });

        const watches = response.results.map(page => {
            const p = page.properties;

            const brand = get(p['Brand']);
            const model = get(p['Model']);
            const ref = get(p['Reference Number']);
            const name = get(p['Watch']) || `${brand} ${model}`.trim();
            const askingPrice = get(p['Asking Price']);
            const caseSizeNum = get(p['Case Size']);
            const caseSize = caseSizeNum ? `${caseSizeNum}mm` : '';
            const year = get(p['Year']);
            const condition = get(p['Condition']);
            const material = get(p['Material']);
            const dial = get(p['Dial Color']);
            const boxPapers = get(p['Box & Papers']); // boolean
            const description = get(p['Extra Details']);
            const images = getImages(p['Images']);

            // Price display
            let price = 'Inquire';
            if (askingPrice) {
                price = '$' + Number(askingPrice).toLocaleString('en-US');
            }

            // Short description for card view
            const descParts = [];
            if (material) descParts.push(material);
            if (dial) descParts.push(dial + ' dial');
            if (caseSize) descParts.push(caseSize);
            if (description) descParts.push(description);
            const details = descParts.join(', ') + (descParts.length ? '.' : '');

            return {
                id: page.id,
                brand,
                name,
                ref,
                price,
                details,
                image: images[0] || '',
                images,
                year: year ? String(Math.round(year)) : '',
                condition,
                material,
                dial,
                caseSize,
                contents: boxPapers ? 'Box & Papers' : 'Watch Only',
                description,
                model
            };
        });

        // Single watch by ID (bypass image filter for direct links)
        const params = event.queryStringParameters || {};
        if (params.id) {
            const watch = watches.find(w => w.id === params.id);
            if (!watch) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Watch not found' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify(watch) };
        }

        // Only return watches that have at least one image
        const withImages = watches.filter(w => w.images.length > 0);

        return { statusCode: 200, headers, body: JSON.stringify(withImages) };

    } catch (error) {
        console.error('Notion API error:', error);
        return {
            statusCode: 500, headers,
            body: JSON.stringify({ error: 'Failed to fetch inventory', details: error.message })
        };
    }
};
