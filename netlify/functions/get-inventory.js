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
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
        });

        const pieces = response.results.map(page => {
            const p = page.properties;

            const piece = get(p['Piece']);
            const brand = get(p['Brand']);
            const model = get(p['Model']);
            const nickname = get(p['Nickname']);
            const ref = get(p['Reference Number']);
            const caseMaterial = get(p['Case Material']);
            const caseSizeNum = get(p['Case Size (mm)']);
            const caseSize = caseSizeNum ? `${caseSizeNum}mm` : '';
            const dialColor = get(p['Dial Color']);
            const bracelet = get(p['Bracelet/Strap']);
            const condition = get(p['Condition']);
            const set = get(p['Set']);
            const year = get(p['Year']);
            const images = getImages(p['Image']);

            // Build display name
            const name = piece || `${brand} ${model}`.trim();

            // Short description for card view
            const descParts = [];
            if (caseMaterial) descParts.push(caseMaterial);
            if (dialColor) descParts.push(dialColor + ' dial');
            if (caseSize) descParts.push(caseSize);
            if (bracelet) descParts.push(bracelet + ' bracelet');
            const details = descParts.join(', ') + (descParts.length ? '.' : '');

            return {
                id: page.id,
                brand,
                model,
                name,
                nickname,
                ref,
                details,
                image: images[0] || '',
                images,
                year: year ? String(Math.round(year)) : '',
                condition,
                caseMaterial,
                dialColor,
                bracelet,
                caseSize,
                set
            };
        });

        // Single piece by ID
        const params = event.queryStringParameters || {};
        if (params.id) {
            const piece = pieces.find(w => w.id === params.id);
            if (!piece) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Piece not found' }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify(piece) };
        }

        return { statusCode: 200, headers, body: JSON.stringify(pieces) };

    } catch (error) {
        console.error('Notion API error:', error);
        return {
            statusCode: 500, headers,
            body: JSON.stringify({ error: 'Failed to fetch pieces', details: error.message })
        };
    }
};
