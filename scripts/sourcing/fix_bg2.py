import json, os
import numpy as np
from PIL import Image
from scipy import ndimage
BASE = os.path.dirname(os.path.abspath(__file__))
PAIRS = [('wa_png', 'wa_images'), ('mens_png', 'mens_images'), ('op_png', 'op_images')]

def build(a, grad, barrier):
    dist_map = np.sqrt(((a - np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)) ** 2).sum(axis=2))
    near = dist_map < 18
    if barrier: near = near & (grad < 40)
    lab, n = ndimage.label(near)
    bl = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1]); bl.discard(0)
    bgmask = np.isin(lab, list(bl))
    if barrier: bgmask = ndimage.binary_dilation(bgmask, iterations=2) & (dist_map < 18)
    return bgmask, dist_map

def slab_bad(a, bgmask):
    subject = ~bgmask
    white = subject & (a.min(axis=2) >= 238)
    lw, nw = ndimage.label(white)
    edge = ndimage.binary_dilation(bgmask, iterations=2)
    tot = subject.sum() or 1
    for i in range(1, nw + 1):
        comp = lw == i
        if comp.sum() < tot * 0.03: continue
        if (comp & edge).sum() > (comp.sum() ** 0.5 * 4) * 0.35: return True
    return False

def finish(a, bgmask, dst):
    alpha = np.where(bgmask, 0.0, 1.0)
    alpha = ndimage.gaussian_filter(alpha, sigma=1.2)
    alpha = np.clip((alpha - 0.25) / 0.5, 0, 1)
    out = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(out, 'RGBA')
    ys, xs = np.where(alpha > 0.05)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(img.size) * 1.16)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    canvas.save(dst)

changed = []
for pd, sd in PAIRS:
    pdir, sdir = os.path.join(BASE, pd), os.path.join(BASE, sd)
    if not os.path.isdir(sdir): continue
    for fn in sorted(os.listdir(sdir)):
        if not fn.endswith('.jpg'): continue
        dst = os.path.join(pdir, fn.replace('.jpg', '.png'))
        if not os.path.exists(dst): continue
        try:
            im = Image.open(os.path.join(sdir, fn)).convert('RGB')
            a = np.asarray(im).astype(np.int16)
            g = np.asarray(im.convert('L')).astype(np.int16)
            grad = np.hypot(ndimage.sobel(g, axis=1), ndimage.sobel(g, axis=0))
            plain, _ = build(a, grad, False)
            barr, _ = build(a, grad, True)
            rescue = (plain & ~barr).sum() / max((~plain).sum(), 1)
            if rescue > 0.03 and not slab_bad(a, barr):
                finish(a, barr, dst)
                changed.append((pd, fn.replace('.jpg', '.png'), 'barrier-rescue', round(float(rescue), 3)))
        except Exception as e:
            changed.append((pd, fn, 'ERROR ' + str(e)[:40], 0))

prev = json.load(open(os.path.join(BASE, 'bg_fixed.json')))
seen = {(x[0], x[1]) for x in prev}
allfixed = prev + [c for c in changed if (c[0], c[1]) not in seen]
json.dump(allfixed, open(os.path.join(BASE, 'bg_fixed.json'), 'w'), indent=1)
print(len(changed), 'barrier rescues; manifest total', len(allfixed))
for c in changed[:20]: print(c)
