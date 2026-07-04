// Shared server-side data layer for Notion "Pieces for Sourcing".
// Used by get-inventory (JSON API), watch-render (SSR pages) and sitemap so
// they always agree on the piece shape AND the slug → page mapping.
const { Client } = require('@notionhq/client');

let notion;
let DATABASE_ID;

function getNotion() {
    if (!notion) {
        if (!process.env.NOTION_API_KEY) throw new Error('NOTION_API_KEY environment variable is not set');
        if (!process.env.NOTION_DATABASE_ID) throw new Error('NOTION_DATABASE_ID environment variable is not set');
        notion = new Client({ auth: process.env.NOTION_API_KEY });
        DATABASE_ID = process.env.NOTION_DATABASE_ID;
    }
    return { notion, DATABASE_ID };
}

function get(prop) {
    if (!prop) return '';
    switch (prop.type) {
        case 'title': return prop.title?.map(t => t.plain_text).join('') || '';
        case 'rich_text': return prop.rich_text?.map(t => t.plain_text).join('') || '';
        case 'select': return prop.select?.name || '';
        case 'number': return prop.number ?? '';
        case 'checkbox': return prop.checkbox;
        default: return '';
    }
}

function getImages(prop) {
    if (!prop || !prop.files) return [];
    return prop.files.map(f => f.file?.url || f.external?.url || '').filter(Boolean);
}

function getMulti(prop) {
    if (!prop || prop.type !== 'multi_select') return [];
    return (prop.multi_select || []).map(o => o.name).filter(Boolean);
}

// Build a stable, SEO-friendly slug. The trailing id fragment guarantees
// uniqueness even when two pieces share brand/model/ref, and lets us resolve
// a slug back to its Notion page without a separate lookup table.
function slugify(str) {
    return String(str || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function pieceSlug(p) {
    const idTail = String(p.id || '').replace(/-/g, '').slice(-6);
    const text = slugify([p.brand, p.model, p.ref].filter(Boolean).join(' ')) || 'piece';
    return `${text}-${idTail}`;
}

function mapPage(page) {
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
    const collections = getMulti(p['Collection']);

    const name = piece || `${brand} ${model}`.trim();

    const descParts = [];
    if (caseMaterial) descParts.push(caseMaterial);
    if (dialColor) descParts.push(dialColor + ' dial');
    if (caseSize) descParts.push(caseSize);
    if (bracelet) descParts.push(bracelet);
    const details = descParts.join(' · ');

    const out = {
        id: page.id,
        brand, model, name, nickname, ref, details,
        image: images[0] || '',
        images,
        year: year ? String(Math.round(year)) : '',
        condition, caseMaterial, dialColor, bracelet, caseSize, set,
        collections,
    };
    out.slug = pieceSlug(out);
    return out;
}

// SDK v5 / Notion API 2025-09-03 queries data sources, not databases.
// NOTION_DATABASE_ID still holds the database ID, so resolve its (single)
// data source once per cold start and cache it.
let DATA_SOURCE_ID;

async function getDataSourceId() {
    if (DATA_SOURCE_ID) return DATA_SOURCE_ID;
    const { notion, DATABASE_ID } = getNotion();
    const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
    const sources = db.data_sources || [];
    if (!sources.length) throw new Error('Notion database has no data sources');
    DATA_SOURCE_ID = sources[0].id;
    return DATA_SOURCE_ID;
}

async function fetchAllPieces() {
    const { notion } = getNotion();
    const dataSourceId = await getDataSourceId();
    let results = [];
    let cursor;
    do {
        const resp = await notion.dataSources.query({
            data_source_id: dataSourceId,
            start_cursor: cursor,
            sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        });
        results = results.concat(resp.results);
        cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);
    return results.map(mapPage);
}

module.exports = { getNotion, get, getImages, getMulti, slugify, pieceSlug, mapPage, fetchAllPieces };
