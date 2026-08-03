#!/usr/bin/env python3
"""Second-generation background fix across all processed catalogs.

Defect A (kept bg slab): opaque near-white region heavily adjacent to
transparency -> remove it (dial whites are ringed by case, so they don't touch
transparency and are safe).

Defect B (eaten white subject, e.g. white ceramic RM cases): the dist<18 flood
ate shaded whites. Re-flood from the ORIGINAL jpg at dist<8; if the subject
grows meaningfully, the tight version is right — then re-check defect A on it.

Writes fixed PNGs in place and a manifest of changed files.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = os.path.dirname(os.path.abspath(__file__))
PAIRS = [('wa_png', 'wa_images'), ('mens_png', 'mens_images'), ('op_png', 'op_images')]
changed = []

def flood(a, thresh):
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    near = dist < thresh
    lab, n = ndimage.label(near)
    bl = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1]); bl.discard(0)
    return np.isin(lab, list(bl)), bg

def finish(a, bgmask):
    alpha = np.where(bgmask, 0.0, 1.0)
    alpha = ndimage.gaussian_filter(alpha, sigma=1.2)
    alpha = np.clip((alpha - 0.25) / 0.5, 0, 1)
    out = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(out, 'RGBA')
    ys, xs = np.where(alpha > 0.05)
    if not len(ys): return None
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * 1.16)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas

def bg_slabs(a, bgmask):
    """near-white opaque components that touch transparency a lot = kept bg"""
    subject = ~bgmask
    white = subject & (a.min(axis=2) >= 238)
    lw, nw = ndimage.label(white)
    edge = ndimage.binary_dilation(bgmask, iterations=2)
    kill = np.zeros_like(bgmask)
    total = subject.sum() or 1
    for i in range(1, nw + 1):
        comp = lw == i
        sz = comp.sum()
        if sz < total * 0.01: continue
        touch = (comp & edge).sum()
        perim = comp.sum() ** 0.5 * 4
        if touch > perim * 0.35:   # strongly borders transparency -> bg slab
            kill |= comp
    return kill

for png_dir, src_dir in PAIRS:
    pd, sd = os.path.join(BASE, png_dir), os.path.join(BASE, src_dir)
    if not os.path.isdir(pd) or not os.path.isdir(sd): continue
    for fn in sorted(os.listdir(sd)):
        if not fn.endswith('.jpg'): continue
        dst = os.path.join(pd, fn.replace('.jpg', '.png'))
        if not os.path.exists(dst): continue
        try:
            a = np.asarray(Image.open(os.path.join(sd, fn)).convert('RGB')).astype(np.int16)
            loose, bgc = flood(a, 18)
            if bgc.min() < 235: continue
            tight, _ = flood(a, 8)
            grow = (loose & ~tight).sum() / max((~loose).sum(), 1)
            use = loose
            reason = None
            if grow > 0.06:          # loose flood ate >6% of the subject -> white case
                use = tight
                reason = 'restored-white-subject'
            slabs = bg_slabs(a, use)
            if slabs.sum() > (~use).sum() * 0.02:
                use = use | slabs
                reason = (reason + '+slab' if reason else 'removed-bg-slab')
            if reason:
                canvas = finish(a, use)
                if canvas is None: continue
                canvas.save(dst)
                changed.append((png_dir, fn.replace('.jpg', '.png'), reason, round(float(grow), 3)))
        except Exception as e:
            changed.append((png_dir, fn, 'ERROR ' + str(e)[:50], 0))

json.dump(changed, open(os.path.join(BASE, 'bg_fixed.json'), 'w'), indent=1)
print(len(changed), 'files fixed')
for c in changed[:25]: print(c)
