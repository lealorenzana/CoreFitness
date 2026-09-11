"""Turns the raw 1200x400 captures from resource-previews-capture.js into the
900x300 JPEGs both apps serve from public/resource-previews/ — the size and
format of 0061's nine previews.

Only the slugs in KEEP are written. The three left out were covered on first
load (two by a cookie-consent dialog, one by an ad overlay); 0061's rule is that
a screenshot of a banner is not a picture of the resource, and nothing was
clicked to get past one. Those rows keep image_url NULL and draw the monogram.

Run from the repo root after the capture script:  python scripts/resource-previews-process.py
"""
import os
from PIL import Image

RAW = 'shots/previews-raw'
KEEP = [
    'ace', 'nasm-library', 'musclewiki', 'exerciselibrary', 'visualbody', 'repdriver',
    'sbs-bundle', 'sbs-newsletter', 'strengthlog-programs', 'fitstra', 'ironlibrary',
    'sbs-home', 'nasm-resources', 'strengthlog-beginners', 'sbs-articles', 'examine',
    'nsca', 'acsm', 'strengthlog-app', 'trainsmart', 'liftlab', 'free-exercise-db',
]
LEFT_OUT = {'boostcamp-programs': 'cookie dialog', 'boostcamp-app': 'cookie dialog',
            'liftvault': 'ad overlay'}

for app in ('g-fitness-member', 'g-fitness-admin'):
    out = os.path.join(app, 'public', 'resource-previews')
    os.makedirs(out, exist_ok=True)
    for slug in KEEP:
        im = Image.open(os.path.join(RAW, slug + '.png')).convert('RGB')
        assert im.size == (1200, 400), (slug, im.size)
        im.resize((900, 300), Image.LANCZOS).save(
            os.path.join(out, slug + '.jpeg'), 'JPEG', quality=80, optimize=True, progressive=True)
    print('%s: wrote %d previews' % (app, len(KEEP)))

sizes = [os.path.getsize(os.path.join('g-fitness-member/public/resource-previews', s + '.jpeg')) // 1024 for s in KEEP]
print('sizes %d-%d KB, total %d KB' % (min(sizes), max(sizes), sum(sizes)))
print('left out:', ', '.join('%s (%s)' % kv for kv in LEFT_OUT.items()))
