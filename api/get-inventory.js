// Single multi-purpose endpoint (Hobby plan caps serverless functions at 12):
//  - GET  default          -> JSON array of all pieces
//  - GET  ?id=<pieceId>    -> JSON for one piece
//  - GET  ?slug=<slug>     -> server-rendered watch HTML  (rewrite: /watch/:slug)
//  - GET  ?sitemap=1       -> dynamic sitemap XML         (rewrite: /sitemap.xml)
//  - POST + Bearer         -> admin CMS actions (see handleAdmin)
//
// The admin actions live here rather than in their own pieces-admin.js purely
// because of that 12-function cap: api/ is already at exactly 12.
const crypto = require('crypto');
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
// Same Bearer scheme and same timing-safe compare as leads-admin.js. This gates
// catalogue writes and image uploads on the SAME shared ADMIN_PASSWORD, so a
// sloppy compare here would weaken every admin endpoint, not just this one.
function timingSafeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

async function handleAdmin(req, res) {
    const expected = process.env.ADMIN_PASSWORD;
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!expected || !timingSafeEq(token, expected)) {
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
            const VETO = ['richard-mille-rm-07-01-rm07-01-2be983'];
            // ?ticker=1 is the flag form and means "the usual strip", not "one
            // piece". Only a value above 1 is read as a count.
            const asked = Number(q.ticker);
            const want = Math.min(asked > 1 ? asked : 44, 60);

            // Brands were bucketed on the raw string, so "F.P.Journe" and
            // "F.P. Journe" counted as different makers and the 71 pieces
            // spelled without the space could never reach the homepage. Squash
            // the key so a spelling slip cannot hide stock.
            const brandKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            const eligible = pieces.filter(w =>
                /-cutout\.webp$/.test(w.imageCutout || '') && !VETO.includes(w.slug));
            if (!eligible.length) return res.status(200).json([]);

            // Selection used to be a modular jump per brand across eight
            // favoured names only. That stranded every other brand outright and,
            // because
            // the jump could land on the same slot repeatedly, reached about 72%
            // of the catalog over two months. Two blocks instead:
            //
            //   1. the newest pieces, so stock added today is on the homepage
            //      today rather than waiting for its brand's turn
            //   2. a window over everything else that advances by its own width
            //      each day, so consecutive days carry on where yesterday
            //      stopped and every piece is reached in about 52 days
            //
            // Both stay fixed within a day: the CDN caches this for 15 minutes,
            // so a per-request shuffle would only defeat the cache.
            const newest = (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
            const byNew = eligible.slice().sort(newest);

            const day = Math.floor(Date.now() / 864e5);
            const freshCount = Math.min(Math.ceil(want / 4), byNew.length);
            const picked = byNew.slice(0, freshCount);

            const rest = byNew.slice(freshCount);
            const span = Math.max(1, want - freshCount);
            if (rest.length) {
                // Split the remaining slots between brands in proportion to how
                // much of that brand is in stock, and let each brand sweep its
                // own pool by exactly its share each day. Big pools get more
                // slots, so every brand finishes its lap in the same ~52 days
                // instead of Royal Oaks taking half a year while Tudor repeats
                // nightly. A contiguous window over the whole catalog reached
                // everything too, but the catalog is grouped by brand, so a day
                // only ever showed four or five makers.
                const pools = new Map();
                for (const w of rest) {
                    const k = brandKey(w.brand);
                    if (!pools.has(k)) pools.set(k, []);
                    pools.get(k).push(w);
                }
                // Largest first, so rounding leftovers land on the deepest pools.
                const keys = [...pools.keys()].sort((a, b) => pools.get(b).length - pools.get(a).length);
                const share = new Map();
                let handed = 0;
                for (const k of keys) {
                    const n = Math.max(1, Math.round(span * pools.get(k).length / rest.length));
                    share.set(k, n);
                    handed += n;
                }
                // Proportional shares rarely sum to the target; settle the
                // difference against the biggest pools, never below one slot.
                for (let i = 0; handed > span && i < keys.length; i = (i + 1) % keys.length) {
                    const k = keys[i];
                    if (share.get(k) > 1) { share.set(k, share.get(k) - 1); handed--; }
                    else if (keys.every(x => share.get(x) <= 1)) break;
                }
                for (let i = 0; handed < span; i = (i + 1) % keys.length) {
                    share.set(keys[i], share.get(keys[i]) + 1); handed++;
                }
                for (const k of keys) {
                    const list = pools.get(k);
                    const n = Math.min(share.get(k), list.length);
                    const start = (day * share.get(k)) % list.length;
                    for (let i = 0; i < n && picked.length < want; i++) {
                        picked.push(list[(start + i) % list.length]);
                    }
                }
            }

            // The catalog is grouped by brand, so a straight window can be a
            // dozen Royal Oaks in a row. Deal the picks out round-robin by brand
            // so the strip reads as a range. Order only, nothing added or lost.
            const queues = new Map();
            for (const w of picked) {
                const k = brandKey(w.brand);
                if (!queues.has(k)) queues.set(k, []);
                queues.get(k).push(w);
            }
            // Always deal from whichever brand has the most left, rather than
            // cycling in a fixed order. Plain round-robin drains the one-piece
            // brands early and leaves the deep ones stacked at the end, which
            // showed as eleven Royal Oaks in a row.
            const out = [];
            const lists = [...queues.values()];
            while (out.length < picked.length) {
                const lastKey = out.length ? brandKey(out[out.length - 1].brand) : null;
                let pick = null, fallback = null;
                for (const q of lists) {
                    if (!q.length) continue;
                    if (!fallback || q.length > fallback.length) fallback = q;
                    if (brandKey(q[0].brand) === lastKey) continue;
                    if (!pick || q.length > pick.length) pick = q;
                }
                // Prefer the deepest queue of a different brand; only repeat a
                // brand when it is the sole one with anything left.
                const from = pick || fallback;
                if (!from) break;
                out.push(from.shift());
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
