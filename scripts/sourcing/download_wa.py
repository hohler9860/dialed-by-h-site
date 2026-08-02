#!/usr/bin/env python3
"""Filter WA women's catalog and download cover images at high res."""
import csv, os, re, json, urllib.request, concurrent.futures

SRC = os.path.join(os.path.dirname(__file__), 'wristaficionado_womens_watches.csv')
OUT = os.path.join(os.path.dirname(__file__), 'wa_images')
os.makedirs(OUT, exist_ok=True)

# "crazy" exclusions per Henry: high jewelry / secret / exotic gem-set pieces
EXCLUDE = re.compile(
    r'haute joaillerie|high jewel|misteriosi|secret watch|grandmaster|'
    r'serpenti seduttori high|full pavé sapphire|rainbow full|'
    r'emerald dial|ruby dial|sapphire dial',
    re.I)

def refslug(title):
    # pull a reference-ish token from title, else slugify the tail
    m = re.search(r'\b([A-Z0-9]{2,}[0-9][A-Z0-9/.\-]*)\b', title)
    ref = m.group(1) if m else title[-20:]
    return re.sub(r'[^a-z0-9]+', '-', ref.lower()).strip('-')

rows = list(csv.DictReader(open(SRC)))
keep, excluded = [], []
for r in rows:
    if EXCLUDE.search(r['title']):
        excluded.append(r['title'])
    elif not r['image']:
        excluded.append(r['title'] + '  [NO IMAGE]')
    else:
        keep.append(r)

# stable unique filename: brand-refslug, dedupe with -2, -3...
seen = {}
for r in keep:
    base = re.sub(r'[^a-z0-9]+', '-', r['vendor'].lower()).strip('-') + '-' + refslug(r['title'])
    n = seen.get(base, 0) + 1
    seen[base] = n
    r['file'] = f"{base}{'' if n == 1 else '-' + str(n)}.jpg"

def dl(r):
    path = os.path.join(OUT, r['file'])
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return None
    url = r['image'].split('?')[0] + '?width=1200'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as resp, open(path, 'wb') as f:
            f.write(resp.read())
        return None
    except Exception as e:
        return f"{r['file']}: {e}"

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    errs = [e for e in ex.map(dl, keep) if e]

json.dump(keep, open(os.path.join(os.path.dirname(__file__), 'wa_keep.json'), 'w'), indent=1)
json.dump(excluded, open(os.path.join(os.path.dirname(__file__), 'wa_excluded.json'), 'w'), indent=1)
print(f"kept {len(keep)}, excluded {len(excluded)}, download errors {len(errs)}")
for e in errs[:10]:
    print('ERR', e)
