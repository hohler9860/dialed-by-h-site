// Shared server-side data layer for the sourcing catalog.
// Used by get-inventory (JSON API), the SSR watch pages and the sitemap so they
// always agree on the piece shape AND the slug -> page mapping.
//
// Backed by Supabase Postgres. This replaced Notion, which was rate limited to
// 3 requests/second and handed out image URLs that expired every hour - meaning
// every CDN cache miss cost one Notion API call PER PIECE just to re-sign an
// image. A cold cache or a crawler could burn the whole quota and break images.
//
// Now: image URLs are permanent and public, stored on the row, served straight
// from Supabase's CDN to the browser. No per-image lookup, no expiry, no quota.

const PIECES_URL = (() => {
    let u = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
    return u;
})();

function sbHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!PIECES_URL || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    return { apikey: key, Authorization: `Bearer ${key}` };
}

// Build a stable, SEO-friendly slug. The trailing id fragment guarantees
// uniqueness even when two pieces share brand/model/ref, and lets us resolve a
// slug back to its row without a separate lookup table. The ids are the ORIGINAL
// Notion page UUIDs, so every /watch/<slug> URL survived the migration intact.
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

// Row -> the piece shape the site has always consumed. Field names and derived
// strings are unchanged from the Notion era so nothing downstream had to move.
function mapRow(r) {
    const caseSize = r.case_size_mm ? `${r.case_size_mm}mm` : '';
    const name = r.piece || `${r.brand || ''} ${r.model || ''}`.trim();

    const descParts = [];
    if (r.case_material) descParts.push(r.case_material);
    if (r.dial_color) descParts.push(r.dial_color + ' dial');
    if (caseSize) descParts.push(caseSize);
    if (r.bracelet) descParts.push(r.bracelet);

    const images = Array.isArray(r.images) ? r.images : [];
    const cutouts = Array.isArray(r.images_cutout) ? r.images_cutout : [];

    // Responsive variants are a naming convention on the standard's path, so
    // they need no extra columns and no extra query:
    //   .../0.webp -> .../0-thumb.webp (300px), .../0-medium.webp (600px)
    // The grid was downloading the full 900px file for a ~300px tile, which was
    // most of /buy/'s 8.3s mobile LCP.
    const variant = (url, suffix) => (url ? url.replace(/\.webp$/, `-${suffix}.webp`) : '');

    const out = {
        id: r.id,
        brand: r.brand || '',
        model: r.model || '',
        name,
        nickname: r.nickname || '',
        ref: r.ref || '',
        details: descParts.join(' · '),
        image: images[0] || '',
        imageThumb: variant(images[0], 'thumb'),
        imageMedium: variant(images[0], 'medium'),
        images,
        imagesMedium: images.map(u => variant(u, 'medium')),
        // Transparent 520px variant for the homepage ticker and celeb cards.
        // Falls back to the standard image, which is what the old `?mode=cutout`
        // effectively did for opaque photos that have no meaningful cutout.
        imageCutout: cutouts[0] || images[0] || '',
        // 140px transparent variant, by the same naming convention as
        // thumb/medium. The ticker paints at ~50px; the full cutout is ~30KB
        // against ~4KB here, times 44 items on the homepage.
        imageCutoutThumb: /-cutout\.webp$/.test(cutouts[0] || '')
            ? variant(cutouts[0], 'thumb')
            : '',
        imagesCutout: cutouts,
        year: r.year ? String(Math.round(r.year)) : '',
        condition: r.condition || '',
        caseMaterial: r.case_material || '',
        dialColor: r.dial_color || '',
        bracelet: r.bracelet || '',
        caseSize,
        set: r.set_included || '',
        collections: Array.isArray(r.collections) ? r.collections : [],
        tags: r.tags || '',
        celebs: Array.isArray(r.celebs) ? r.celebs : [],
        // When the piece landed in the catalog. The homepage ticker leads with
        // new stock, which it cannot do from array position alone.
        addedAt: r.created_at || '',
    };
    out.slug = pieceSlug(out);
    return out;
}

// In-memory cache shared across warm invocations of the same instance. Supabase
// is fast enough (~250ms for the full catalog) that the elaborate Notion-era
// storage snapshot is gone; a short TTL plus stale-while-revalidate is plenty.
let _piecesCache = null;
let _piecesCacheAt = 0;
let _refreshing = null;
const PIECES_TTL_MS = 180 * 1000;

// PostgREST caps a response at 1000 rows and the catalog is larger than that,
// so page through with Range until the server stops filling the window.
async function queryAll() {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const to = from + PAGE - 1;
        const r = await fetch(
            `${PIECES_URL}/rest/v1/pieces?select=*&order=sort_order.asc.nullslast,created_at.asc`,
            { headers: { ...sbHeaders(), Range: `${from}-${to}`, 'Range-Unit': 'items' } }
        );
        if (!r.ok) throw new Error(`pieces query failed ${r.status}: ${await r.text()}`);
        const batch = await r.json();
        rows.push(...batch);
        if (batch.length < PAGE) break;
    }
    return rows.map(mapRow);
}

async function _refreshPieces() {
    try {
        const pieces = await queryAll();
        _piecesCache = pieces;
        _piecesCacheAt = Date.now();
        return pieces;
    } catch (err) {
        if (_piecesCache) {
            console.error('[pieces] query failed, serving stale cache:', err && err.message);
            return _piecesCache;
        }
        throw err;
    }
}

async function fetchAllPieces({ force = false } = {}) {
    const now = Date.now();
    if (!force && _piecesCache && now - _piecesCacheAt < PIECES_TTL_MS) return _piecesCache;
    if (!force && _piecesCache) {
        // stale but instant; kick off a refresh behind the response
        if (!_refreshing) _refreshing = _refreshPieces().finally(() => { _refreshing = null; });
        return _piecesCache;
    }
    return _refreshPieces();
}

// Admin writes call this so the very next read reflects the edit.
function invalidatePieces() {
    _piecesCache = null;
    _piecesCacheAt = 0;
}

module.exports = {
    slugify, pieceSlug, mapRow, fetchAllPieces, invalidatePieces,
    PIECES_URL, sbHeaders,
};
