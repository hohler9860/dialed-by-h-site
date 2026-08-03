#!/usr/bin/env python3
"""Men's catalog prepare: scrape core-brand collections, download, bg-remove."""
import json, os, re, urllib.request, concurrent.futures

BASE = os.path.dirname(os.path.abspath(__file__))
HANDLES = ['rolex', 'patek-philippe', 'audemars-piguet', 'richard-mille',
           'vacheron-constantin', 'a-lange-sohne', 'f-p-journe', 'cartier', 'omega', 'tudor']
EXCLUDE = re.compile(
    r'haute joaillerie|high jewel|misteriosi|secret watch|grandmaster|crash|minute repeater|'
    r'sonnerie|grande? complication\b|baguette diamonds|sapphire crystal case|tiffany|'
    r'RM\s?27|emerald dial|ruby dial|sapphire dial', re.I)
VENDORS = {'Rolex', 'Patek Philippe', 'Audemars Piguet', 'Richard Mille', 'Vacheron Constantin',
           'A. Lange & Söhne', 'A. Lange & Sohne', 'F.P.Journe', 'F.P. Journe', 'Cartier', 'OMEGA', 'Omega', 'Tudor'}

seen_ids, rows, excluded = set(), [], 0
for h in HANDLES:
    page = 1
    while True:
        url = f'https://wristaficionado.com/collections/{h}/products.json?limit=250&page={page}'
        try:
            d = json.load(urllib.request.urlopen(url, timeout=60))
        except Exception as e:
            print('FETCH FAIL', h, page, e); break
        ps = d['products']
        if not ps: break
        for p in ps:
            if p['id'] in seen_ids: continue
            seen_ids.add(p['id'])
            if p['vendor'] not in VENDORS: continue
            if EXCLUDE.search(p['title']): excluded += 1; continue
            if not p['images']: continue
            rows.append({'pid': p['id'], 'title': p['title'], 'vendor': p['vendor'],
                         'image': p['images'][0]['src'], 'tags': ', '.join(p.get('tags', [])),
                         'file': f"mens-{p['id']}.jpg"})
        page += 1
print(f'scraped {len(rows)} kept, {excluded} excluded, {len(seen_ids)} raw')
json.dump(rows, open(f'{BASE}/wa_mens.json', 'w'), indent=1)

os.makedirs(f'{BASE}/mens_images', exist_ok=True)
os.makedirs(f'{BASE}/mens_png', exist_ok=True)

def dl(r):
    p = f"{BASE}/mens_images/{r['file']}"
    if os.path.exists(p) and os.path.getsize(p) > 1000: return None
    try:
        req = urllib.request.Request(r['image'].split('?')[0] + '?width=1200', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=45) as resp, open(p, 'wb') as f:
            f.write(resp.read())
        return None
    except Exception as e:
        return f"{r['file']}: {e}"

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    errs = [e for e in ex.map(dl, rows) if e]
print(f'downloaded, {len(errs)} errors')

import numpy as np
from PIL import Image
from scipy import ndimage
flagged, ok = [], 0
for r in rows:
    src = f"{BASE}/mens_images/{r['file']}"
    dst = f"{BASE}/mens_png/{r['file'].replace('.jpg', '.png')}"
    if os.path.exists(dst): ok += 1; continue
    if not os.path.exists(src): flagged.append((r['file'], 'missing')); continue
    try:
        a = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        bg = np.median(border, axis=0)
        if bg.min() < 235: flagged.append((r['file'], 'nonwhite')); continue
        dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
        near = dist < 18
        lab, n = ndimage.label(near)
        bl = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1]); bl.discard(0)
        alpha = np.where(np.isin(lab, list(bl)), 0.0, 1.0)
        alpha = ndimage.gaussian_filter(alpha, sigma=1.2)
        alpha = np.clip((alpha - 0.25) / 0.5, 0, 1)
        out = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
        img = Image.fromarray(out, 'RGBA')
        ys, xs = np.where(alpha > 0.05)
        if not len(ys): flagged.append((r['file'], 'empty')); continue
        img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        side = int(max(img.size) * 1.16)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
        canvas.save(dst)
        ok += 1
    except Exception as e:
        flagged.append((r['file'], str(e)[:60]))
json.dump(flagged, open(f'{BASE}/mens_flagged.json', 'w'), indent=1)
print(f'processed {ok}, flagged {len(flagged)}')
