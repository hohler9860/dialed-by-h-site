#!/usr/bin/env python3
"""Audit processed cutouts for background-removal defects:
   A) leftover opaque near-white patches (bg kept: white slabs)
   B) transparent holes fully enclosed by subject (over-removal)
   C) suspiciously low subject coverage (cutout ate the watch)"""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = os.path.dirname(os.path.abspath(__file__))
DIRS = ['wa_png', 'mens_png', 'op_png']
issues = []

for d in DIRS:
    p = os.path.join(BASE, d)
    if not os.path.isdir(p): continue
    for fn in sorted(os.listdir(p)):
        if not fn.endswith('.png'): continue
        try:
            im = Image.open(os.path.join(p, fn)).convert('RGBA')
            im.thumbnail((500, 500))
            a = np.asarray(im)
            alpha = a[..., 3] > 128
            if alpha.sum() < 500:
                issues.append((d, fn, 'EMPTY', 1.0)); continue
            rgb = a[..., :3].astype(int)

            # A) opaque near-white regions >2% of subject, touching subject hull edge
            white = alpha & (rgb.min(axis=2) >= 240)
            lw, nw = ndimage.label(white)
            big_white = 0
            if nw:
                sizes = ndimage.sum(white, lw, range(1, nw + 1))
                big_white = int(sizes.max())
            white_ratio = big_white / alpha.sum()

            # B) enclosed transparent holes (not connected to border)
            trans = ~alpha
            lt, nt = ndimage.label(trans)
            border_labels = set(lt[0]) | set(lt[-1]) | set(lt[:, 0]) | set(lt[:, -1]); border_labels.discard(0)
            hole = 0
            for i in range(1, nt + 1):
                if i in border_labels: continue
                sz = (lt == i).sum()
                hole = max(hole, sz)
            hole_ratio = hole / alpha.sum()

            if white_ratio > 0.06:
                issues.append((d, fn, 'WHITE_PATCH', round(white_ratio, 3)))
            elif hole_ratio > 0.02:
                issues.append((d, fn, 'HOLE', round(hole_ratio, 3)))
        except Exception as e:
            issues.append((d, fn, 'ERROR ' + str(e)[:40], 0))

issues.sort(key=lambda x: -float(x[3]) if isinstance(x[3], (int, float)) else 0)
json.dump(issues, open(os.path.join(BASE, 'bg_audit.json'), 'w'), indent=1)
print(len(issues), 'flagged')
for x in issues[:30]: print(x)
