// Single multi-purpose endpoint (Hobby plan caps serverless functions at 12):
//  - GET  default          -> JSON array of all pieces
//  - GET  ?id=<pieceId>    -> JSON for one piece
//  - GET  ?slug=<slug>     -> server-rendered watch HTML  (rewrite: /watch/:slug)
//  - GET  ?sitemap=1       -> dynamic sitemap XML         (rewrite: /sitemap.xml)
//  - POST + Bearer         -> admin CMS actions (see handleAdmin)
//
// The admin actions live here rather than in their own pieces-admin.js purely
// because of that 12-function cap: api/ is already at exactly 12.
const {
    fetchAllPieces, invalidatePieces, pieceSlug, mapRow, PIECES_URL, sbHeaders,
} = require('./_pieces');
const { renderWatchPage, renderSitemap, fourOhFour } = require('./_render');
const { processWatchImage, variantPath } = require('../lib/watch-image');

const BUCKET = 'pieces';

// Columns the admin is allowed to write. Anything else in the payload is
// dropped, so a stray client-side field can never reach the database.
const WRITABLE = [
    'piece', 'brand', 'model', 'nickname', 'ref',
    'case_material', 'case_size_mm', 'dial_color', 'bracelet',
    'condition', 'set_included', 'year',
    'collections', 'celebs', 'tags',
    'images', 'images_cutout', 'sort_order',
];

function pick(body) {
    const out = {};
    for (const k of WRITABLE) {
        if (!(k in body)) continue;
        let v = body[k];
        if (k === 'case_size_mm' || k === 'year' || k === 'sort_order') {
            v = (v === '' || v == null) ? null : Number(v);
            if (v != null && Number.isNaN(v)) v = null;
        } else if (k === 'collections' || k === 'celebs' || k === 'images' || k === 'images_cutout') {
            v = Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
        } else {
            v = v == null ? '' : String(v);
        }
        out[k] = v;
    }
    return out;
}

async function sbFetch(path, init = {}) {
    const r = await fetch(`${PIECES_URL}${path}`, {
        ...init,
        headers: { ...sbHeaders(), ...(init.headers || {}) },
    });
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${r.status}: ${await r.text()}`);
    return r;
}

function publicUrl(objPath) {
    return `${PIECES_URL}/storage/v1/object/public/${BUCKET}/${objPath}`;
}

// ── admin ──────────────────────────────────────────────────────────────
async function handleAdmin(req, res) {
    const expected = process.env.ADMIN_PASSWORD;
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;

    try {
        switch (action) {
            // Probe used by the login gate, and the admin catalog view.
            case 'list': {
                const pieces = await fetchAllPieces({ force: !!body.force });
                return res.status(200).json({ pieces });
            }

            case 'get': {
                const pieces = await fetchAllPieces();
                const piece = pieces.find(p => p.id === body.id);
                if (!piece) return res.status(404).json({ error: 'Piece not found' });
                return res.status(200).json({ piece });
            }

            // Create (no id) or update (id). Returns the piece in site shape so
            // the admin can render it without a second round trip.
            case 'save': {
                const fields = pick(body.fields || {});
                let row;
                if (body.id) {
                    const r = await sbFetch(`/rest/v1/pieces?id=eq.${encodeURIComponent(body.id)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                        body: JSON.stringify(fields),
                    });
                    row = (await r.json())[0];
                    if (!row) return res.status(404).json({ error: 'Piece not found' });
                } else {
                    const r = await sbFetch('/rest/v1/pieces', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                        body: JSON.stringify([fields]),
                    });
                    row = (await r.json())[0];
                }
                invalidatePieces();
                return res.status(200).json({ ok: true, piece: mapRow(row) });
            }

            case 'delete': {
                if (!body.id) return res.status(400).json({ error: 'Missing id' });
                // Storage objects go first; an orphaned row is easier to notice
                // and fix than orphaned files nobody can see.
                await deleteAllImages(body.id);
                await sbFetch(`/rest/v1/pieces?id=eq.${encodeURIComponent(body.id)}`, { method: 'DELETE' });
                invalidatePieces();
                return res.status(200).json({ ok: true });
            }

            // Accepts a base64 data URL, runs the SAME sharp pipeline the Notion
            // import used, and stores both variants. Returns the permanent URLs.
            case 'upload-image': {
                if (!body.id) return res.status(400).json({ error: 'Missing id' });
                const dataUrl = String(body.data || '');
                const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                if (!b64) return res.status(400).json({ error: 'Missing image data' });
                const src = Buffer.from(b64, 'base64');

                const pieces = await fetchAllPieces();
                const piece = pieces.find(p => p.id === body.id);
                if (!piece) return res.status(404).json({ error: 'Piece not found' });

                // Append at the next free index. Indices are never reused within
                // a session, so a replaced image can't be served from a stale CDN
                // copy of the same URL.
                const idx = Math.max(piece.images.length, piece.imagesCutout.length, Number(body.nextIndex) || 0);
                const stamp = Date.now().toString(36);
                const stdPath = `${body.id}/${idx}-${stamp}.webp`;
                const cutPath = `${body.id}/${idx}-${stamp}-cutout.webp`;

                const { standard, cutout, cutoutThumb, thumb, medium } = await processWatchImage(src);
                await putObject(stdPath, standard);
                if (cutout) await putObject(cutPath, cutout);
                // Small transparent variant for the homepage ticker. Same naming
                // convention as thumb/medium, so no extra column is needed.
                if (cutoutThumb) await putObject(variantPath(cutPath, 'thumb'), cutoutThumb);
                // Responsive variants, written now so nothing is ever resized
                // per request. Their URLs are derived from the standard's path.
                await putObject(variantPath(stdPath, 'thumb'), thumb);
                await putObject(variantPath(stdPath, 'medium'), medium);

                const images = piece.images.concat(publicUrl(stdPath));
                const imagesCutout = piece.imagesCutout.concat(cutout ? publicUrl(cutPath) : publicUrl(stdPath));

                const r = await sbFetch(`/rest/v1/pieces?id=eq.${encodeURIComponent(body.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                    body: JSON.stringify({ images, images_cutout: imagesCutout }),
                });
                invalidatePieces();
                return res.status(200).json({ ok: true, piece: mapRow((await r.json())[0]) });
            }

            // Reorder or remove images. The client sends the desired final order
            // as a list of indices into the current arrays.
            case 'set-images': {
                if (!body.id) return res.status(400).json({ error: 'Missing id' });
                const order = Array.isArray(body.order) ? body.order : null;
                if (!order) return res.status(400).json({ error: 'Missing order' });

                const pieces = await fetchAllPieces();
                const piece = pieces.find(p => p.id === body.id);
                if (!piece) return res.status(404).json({ error: 'Piece not found' });

                const images = order.map(i => piece.images[i]).filter(Boolean);
                const imagesCutout = order.map(i => piece.imagesCutout[i] || piece.images[i]).filter(Boolean);

                const r = await sbFetch(`/rest/v1/pieces?id=eq.${encodeURIComponent(body.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                    body: JSON.stringify({ images, images_cutout: imagesCutout }),
                });
                invalidatePieces();
                return res.status(200).json({ ok: true, piece: mapRow((await r.json())[0]) });
            }

            // Distinct values for the admin's dropdowns, derived from live data
            // so the vocabulary matches whatever is actually in the catalog.
            case 'facets': {
                const pieces = await fetchAllPieces();
                const uniq = (fn) => [...new Set(pieces.flatMap(fn).filter(Boolean))].sort();
                return res.status(200).json({
                    brands: uniq(p => [p.brand]),
                    conditions: uniq(p => [p.condition]),
                    materials: uniq(p => [p.caseMaterial]),
                    dials: uniq(p => [p.dialColor]),
                    bracelets: uniq(p => [p.bracelet]),
                    sets: uniq(p => [p.set]),
                    collections: uniq(p => p.collections),
                    celebs: uniq(p => p.celebs),
                });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error('[get-inventory:admin]', action, err && err.message);
        return res.status(500).json({ error: err.message || 'Admin action failed' });
    }
}

async function putObject(objPath, buf) {
    const r = await fetch(`${PIECES_URL}/storage/v1/object/${BUCKET}/${objPath}`, {
        method: 'POST',
        headers: {
            ...sbHeaders(),
            'Content-Type': 'image/webp',
            'x-upsert': 'true',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: buf,
    });
    if (!r.ok) throw new Error(`upload ${objPath} failed ${r.status}: ${await r.text()}`);
    return publicUrl(objPath);
}

async function deleteAllImages(pieceId) {
    try {
        const r = await fetch(`${PIECES_URL}/storage/v1/object/list/${BUCKET}`, {
            method: 'POST',
            headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: `${pieceId}/`, limit: 200 }),
        });
        if (!r.ok) return;
        const files = await r.json();
        const prefixes = (Array.isArray(files) ? files : []).map(f => `${pieceId}/${f.name}`);
        if (!prefixes.length) return;
        await fetch(`${PIECES_URL}/storage/v1/object/${BUCKET}`, {
            method: 'DELETE',
            headers: { ...sbHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes }),
        });
    } catch (e) {
        console.error('[get-inventory:deleteImages]', e && e.message);
    }
}

// ── public ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    const q = req.query || {};

    if (req.method === 'POST') return handleAdmin(req, res);

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
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=86400');
            return res.status(200).send(renderWatchPage(piece, pieces));
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=86400');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // ?fresh=1 — manual lever: drop the warm cache and re-read Postgres.
        // Far cheaper than the Notion era, but still handy right after an edit.
        if (q.fresh) {
            res.setHeader('Cache-Control', 'no-store');
            const fresh = await fetchAllPieces({ force: true });
            return res.status(200).json({ refreshed: true, pieces: fresh.length });
        }
        const pieces = await fetchAllPieces();

        // ?ticker=1 — the homepage strip, and nothing else.
        //
        // The ticker used to pull the default list: 1741 pieces, 22 fields each,
        // 1.95MB of JSON parsed on the main thread to render 44 rows. It was the
        // longest chain on the homepage at ~3.1s. Selection moves here because the
        // server already holds the whole catalog warm in memory, so the browser
        // downloads the 44 it will actually paint.
        if (q.ticker) {
            const HOT = ['Audemars Piguet', 'Patek Philippe', 'F.P. Journe', 'Rolex',
                         'Richard Mille', 'Vacheron Constantin', 'A. Lange & Söhne', 'Cartier'];
            const VETO = ['richard-mille-rm-07-01-rm07-01-2be983'];
            // ?ticker=1 is the flag form and means "the usual strip", not "one
            // piece". Only a value above 1 is read as a count.
            const asked = Number(q.ticker);
            const want = Math.min(asked > 1 ? asked : 44, 60);

            const byBrand = {};
            for (const w of pieces) {
                if (!/-cutout\.webp$/.test(w.imageCutout || '')) continue;
                if (VETO.includes(w.slug)) continue;
                (byBrand[w.brand] = byBrand[w.brand] || []).push(w);
            }
            // Rotate by the day so the strip is not frozen on one set forever,
            // but stays identical within a day — the CDN caches this for 15
            // minutes and a per-request shuffle would make that pointless.
            const day = Math.floor(Date.now() / 864e5);
            const out = [];
            for (let round = 0; out.length < want; round++) {
                let added = 0;
                for (const b of HOT) {
                    const list = byBrand[b];
                    if (!list || !list.length) continue;
                    out.push(list[(day * 7 + round * 13) % list.length]);
                    added++;
                    if (out.length >= want) break;
                }
                if (!added) break;
            }
            return res.status(200).json(out.map(w => ({
                id: w.id, slug: w.slug, brand: w.brand, model: w.model,
                nickname: w.nickname, name: w.name, ref: w.ref, details: w.details,
                imageCutout: w.imageCutout, imageCutoutThumb: w.imageCutoutThumb,
            })));
        }

        if (q.id) {
            const piece = pieces.find(w => w.id === q.id);
            if (!piece) return res.status(404).json({ error: 'Piece not found' });
            return res.status(200).json(piece);
        }
        // list payload: the grid/ticker never use tags or secondary images —
        // stripping them cuts ~40% off the JSON the browser has to download.
        // imageCutout (scalar) stays: the homepage ticker needs it.
        // imageThumb/imageMedium (scalars) stay - the grid and ticker need them.
        const slim = pieces.map(w => {
            const { tags, images, imagesCutout, imagesMedium, ...rest } = w;
            return rest;
        });
        return res.status(200).json(slim);
    } catch (err) {
        console.error('get-inventory failed:', err && err.message);
        return res.status(500).json({ error: 'Failed to load inventory' });
    }
};
