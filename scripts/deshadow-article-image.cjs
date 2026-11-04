#!/usr/bin/env node
// Removes a brand's soft floor shadow from a flat article image shot on white.
// Grows outward from the background through neutral, gently changing pixels, which is
// what a blurred shadow is, and stops at the crisp outline of the watch. Only touches the
// rows you name, so dials above them can never be affected. Always look at the result:
// used 2026-11-03 on 11 article images, originals kept in storage.
// Usage: node scripts/deshadow-article-image.cjs in.webp out.webp 0.72 0.85
const sharp = require('sharp');

async function deshadow(input, from, to, opts = {}) {
    const maxSat = opts.maxSat ?? 16, maxStep = opts.maxStep ?? 12, minL = opts.minL ?? 70;
    const edgeT = opts.edgeT ?? 1.6, coreT = opts.coreT ?? 6, grow = opts.grow ?? 7;
    const { data, info } = await sharp(input).rotate().flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, N = W * H;
    const L = new Float32Array(N), S = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
        L[i] = (r + g + b) / 3;
        S[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    // The background colour is the median of the image's outer edge.
    const edge = [];
    for (let x = 0; x < W; x += 2) edge.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y += 2) edge.push(y * W, y * W + W - 1);
    const sorted = edge.slice().sort((a, b) => L[a] - L[b]);
    const mid = sorted[sorted.length >> 1];
    const bg = [data[mid * 3], data[mid * 3 + 1], data[mid * 3 + 2]], bgL = L[mid];

    // A blurred shadow is smooth. Anything real, even a faint white strap against white,
    // has a crisp outline, so crisp pixels become a wall the fill cannot cross. The wall
    // is stricter where the image is light, because that is where a watch can blend in.
    const y0 = Math.round(H * from), y1 = Math.round(H * to);
    const K = [1, 4, 6, 4, 1], wall = new Uint8Array(N);
    for (let y = Math.max(2, y0 - 2); y < Math.min(H - 2, y1 + 2); y++) for (let x = 2; x < W - 2; x++) {
        let sum = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += K[dy + 2] * K[dx + 2] * L[(y + dy) * W + x + dx];
        const i = y * W + x, r = Math.abs(L[i] - sum / 256);
        if (r > (L[i] > bgL - 45 ? edgeT : coreT)) wall[i] = 1;
    }
    const thick = wall.slice();
    for (let y = y0; y < y1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (wall[i]) { thick[i - 1] = thick[i + 1] = 1; if (i - W >= 0) thick[i - W] = 1; if (i + W < N) thick[i + W] = 1; }
    }

    const seen = new Uint8Array(N), queue = [];
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (Math.abs(L[i] - bgL) <= 3 && S[i] <= maxSat && !thick[i]) { seen[i] = 1; queue.push(i); }
    }
    const neighbours = (i) => {
        const x = i % W, y = (i - x) / W, out = [];
        if (x > 0) out.push(i - 1);
        if (x < W - 1) out.push(i + 1);
        if (y > y0) out.push(i - W);
        if (y < y1 - 1) out.push(i + W);
        return out;
    };
    while (queue.length) {
        const i = queue.pop();
        for (const n of neighbours(i)) {
            if (seen[n] || thick[n] || S[n] > maxSat || L[n] < minL || L[n] > bgL + 6) continue;
            if (Math.abs(L[n] - L[i]) > maxStep) continue;
            seen[n] = 1; queue.push(n);
        }
    }
    // The last few pixels under a strap are the darkest part of the shadow and read as
    // crisp. Keep following a shadow inward while it only gets darker. A light strap
    // edge fails this test, so it survives.
    for (let pass = 0; pass < grow; pass++) {
        const add = [];
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!seen[i] || L[i] > bgL - 4) continue;
            for (const n of neighbours(i)) {
                if (seen[n] || S[n] > maxSat || L[n] < minL) continue;
                if (L[n] <= L[i] + 2 && L[n] >= L[i] - maxStep * 2) add.push(n);
            }
        }
        add.forEach((n) => { seen[n] = 1; });
    }
    // Tiny specks left inside a cleared shadow are compression noise, not watch.
    const done = new Uint8Array(N);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const s = y * W + x;
        if (seen[s] || done[s]) continue;
        const blob = [s]; done[s] = 1; let neutral = S[s] <= maxSat && L[s] >= 120;
        for (let k = 0; k < blob.length && blob.length <= 40; k++) for (const n of neighbours(blob[k])) {
            if (seen[n] || done[n]) continue;
            done[n] = 1; blob.push(n); if (S[n] > maxSat || L[n] < 120) neutral = false;
        }
        if (blob.length <= 40 && neutral) blob.forEach((n) => { seen[n] = 1; });
    }
    // A strap as pale as the background has no edge to stop at, so it gets traced by hand:
    // opts.trace = [{ box:[x0,y0,x1,y1], keep:[[x,y],...] }]. Inside the box, everything
    // outside the outline is cleared and everything inside it is kept.
    const inside = (poly, x, y) => {
        let hit = false;
        for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
            const [xa, ya] = poly[a], [xb, yb] = poly[b];
            if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit;
        }
        return hit;
    };
    for (const t of opts.trace || []) {
        const [bx0, by0, bx1, by1] = t.box;
        for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
            const i = y * W + x;
            seen[i] = inside(t.keep, x + 0.5, y + 0.5) ? 0 : S[i] <= maxSat && L[i] >= minL ? 1 : seen[i];
        }
    }
    // Smooth the cut so strap bottoms keep a clean, soft edge instead of tiny teeth.
    const r = opts.smooth ?? 2, soft = new Uint8Array(N);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        let on = 0, all = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
            all++;
            if (yy < y0 || yy >= y1 ? false : seen[yy * W + xx]) on++;
        }
        const i = y * W + x;
        soft[i] = on * 2 >= all || ((y < y0 + r || y >= y1 - r) && seen[i]) ? 255 : 0;
    }
    const blurred = await sharp(soft, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).raw().toBuffer({ resolveWithObject: true });
    const alpha = blurred.data, step = blurred.info.channels;
    let darkest = 255, changed = 0;
    for (let i = 0; i < N; i++) {
        const a = alpha[i * step] / 255;
        if (a <= 0) continue;
        if (a > 0.5 && Math.abs(L[i] - bgL) > 1.5) { changed++; if (L[i] < darkest) darkest = L[i]; }
        for (let c = 0; c < 3; c++) data[i * 3 + c] = Math.round(bg[c] * a + data[i * 3 + c] * (1 - a));
    }
    const output = await sharp(data, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92, smartSubsample: true }).toBuffer();
    return { output, width: W, height: H, changed, darkest: Math.round(darkest), bg };
}

module.exports = { deshadow };

if (require.main === module) {
    const [, , input, out, from, to] = process.argv;
    if (!to) { console.error('Usage: deshadow-article-image.cjs in out fromFraction toFraction'); process.exit(1); }
    deshadow(input, +from, +to).then((r) => {
        require('fs').writeFileSync(out, r.output);
        console.log(`${r.width}x${r.height}, ${r.changed} shadow pixels removed, darkest ${r.darkest}`);
    }).catch((e) => { console.error(e); process.exit(1); });
}
