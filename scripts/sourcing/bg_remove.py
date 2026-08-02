#!/usr/bin/env python3
"""Clean background removal for white/near-white product renders.
Only pixels connected to the image border are removed, so white dials,
mother-of-pearl, and light straps inside the watch are never touched.
Outputs trimmed, square-padded PNGs with feathered edges."""
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = os.path.join(os.path.dirname(__file__), 'wa_images')
OUT = os.path.join(os.path.dirname(__file__), 'wa_png')
os.makedirs(OUT, exist_ok=True)

flagged = []  # non-white backgrounds -> need manual/AI fallback

def process(fn):
    im = Image.open(os.path.join(SRC, fn)).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # background reference = median of border pixels
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    if bg.min() < 235:  # not a white-ish background; flag for fallback
        return 'flagged'

    # distance from background color
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    near_bg = dist < 18

    # only bg regions connected to the border count as background
    lab, n = ndimage.label(near_bg)
    border_labels = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    border_labels.discard(0)
    bgmask = np.isin(lab, list(border_labels))

    # soft alpha: fully opaque subject, feather 1.5px at boundary
    alpha = np.where(bgmask, 0.0, 1.0)
    alpha = ndimage.gaussian_filter(alpha, sigma=1.2)
    alpha = np.clip((alpha - 0.25) / 0.5, 0, 1)  # re-steepen, keep soft edge

    # de-fringe: pull edge pixels toward their color, not white halo
    out = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(out, 'RGBA')

    # trim to subject bbox, pad to square with 8% margin
    ys, xs = np.where(alpha > 0.05)
    if len(ys) == 0:
        return 'flagged'
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * 1.16)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    canvas.save(os.path.join(OUT, fn.rsplit('.', 1)[0] + '.png'))
    return 'ok'

files = sorted(f for f in os.listdir(SRC) if f.endswith('.jpg'))
ok = 0
for f in files:
    try:
        r = process(f)
    except Exception as e:
        r = f'error {e}'
    if r == 'ok':
        ok += 1
    else:
        flagged.append((f, r))

json.dump(flagged, open(os.path.join(os.path.dirname(__file__), 'wa_flagged.json'), 'w'), indent=1)
print(f'{ok}/{len(files)} clean, {len(flagged)} flagged')
for f, r in flagged[:15]:
    print('FLAG', f, r)
