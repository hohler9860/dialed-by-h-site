// Shared watch-image pipeline.
//
// Extracted verbatim from the original api/img.js so that the one-time Notion
// import, the admin CMS uploader, and any future re-processing all produce
// BYTE-IDENTICAL output. If this pipeline ever changes, every consumer changes
// together — that is the whole point of it living here.
//
// Two variants come out of a single source image:
//   standard — 900x900 webp, piece trimmed and centered at 0.66 fill on #0d0d0d.
//              Used by the buy grid and watch pages.
//   cutout   — 520px transparent webp, no canvas. Used by the homepage ticker
//              and the celebrity card fallback (the old `?mode=cutout`).
//
// Cutout only exists for background-removed (alpha) sources. An opaque photo
// gets a square attention crop and has no meaningful cutout, so callers should
// fall back to the standard image — exactly what the old img.js did when it
// ignored `mode` on opaque input.

const sharp = require('sharp');

const SIZE = 900;
const FILL = 0.66;
const BG = { r: 13, g: 13, b: 13, alpha: 1 };
const CUTOUT_SIZE = 520;

// True when the source has real transparency, i.e. it is a background-removed
// piece rather than a plain photo. Mirrors the old `alphaCh.min < 200` check.
async function hasAlpha(buf) {
    const stats = await sharp(buf).ensureAlpha().stats();
    const alphaCh = stats.channels[3];
    return !!(alphaCh && alphaCh.min < 200);
}

// Clean the halo left behind by background removal, then trim to the piece.
// Kept step-for-step identical to the original: spread the alpha, cut steeply
// inside the fringe, then soften 1px back for anti-aliasing.
async function trimmedPiece(buf) {
    const img = sharp(buf).ensureAlpha();
    const cleaned = await img.recomb([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).toBuffer();
    const rgbBuf = await sharp(cleaned).removeAlpha().toBuffer();
    const alphaBuf = await sharp(cleaned).ensureAlpha().extractChannel(3)
        .blur(1.1)          // spread so threshold lands mid-fringe
        .linear(3.0, -420)  // steep cut ~= alpha 55% -> hard edge inside halo
        .blur(0.5)          // reintroduce 1px anti-aliasing
        .toBuffer();
    const halo = await sharp(rgbBuf).joinChannel(alphaBuf).png().toBuffer();
    return sharp(halo).trim({ threshold: 12 }).toBuffer();
}

// 900x900 on the dark canvas (alpha source), or a square attention crop (photo).
async function renderStandard(buf, alpha) {
    if (!alpha) {
        return sharp(buf)
            .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' })
            .webp({ quality: 84 })
            .toBuffer();
    }
    const trimmed = await trimmedPiece(buf);
    const meta = await sharp(trimmed).metadata();
    const target = Math.round(SIZE * FILL);
    const scale = Math.min(target / meta.width, target / meta.height);
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));
    const piece = await sharp(trimmed).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
    return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
        .composite([{ input: piece, left: Math.round((SIZE - w) / 2), top: Math.round((SIZE - h) / 2) }])
        .webp({ quality: 84 })
        .toBuffer();
}

// 520px transparent cutout. Null for opaque sources — caller falls back.
async function renderCutout(buf, alpha) {
    if (!alpha) return null;
    const trimmed = await trimmedPiece(buf);
    return sharp(trimmed)
        .resize(CUTOUT_SIZE, CUTOUT_SIZE, { fit: 'inside', kernel: 'lanczos3' })
        .webp({ quality: 84 })
        .toBuffer();
}

// Process one source image into both variants.
// -> { standard: Buffer, cutout: Buffer|null, alpha: boolean }
async function processWatchImage(buf) {
    const alpha = await hasAlpha(buf);
    const [standard, cutout] = await Promise.all([
        renderStandard(buf, alpha),
        renderCutout(buf, alpha),
    ]);
    return { standard, cutout, alpha };
}

module.exports = { processWatchImage, hasAlpha, SIZE, FILL, BG, CUTOUT_SIZE };
