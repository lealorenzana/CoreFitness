"""Verifies a member-app deploy — preview or production — the way DEPLOYMENT.md
says to, plus the three strings that prove the 7 September work is in it.

Usage:  python scripts/verify-deploy.py <base-url>

When you ship new member-app code, change the three marker strings below to
strings that exist only in the new code -- otherwise this keeps passing on an
old build.

HTML is fetched from a random *path*, not `/`: the root is edge-cached for
~30s after a promote and a query string is not part of the cache key, while
any unknown path is rewritten to index.html and forces a MISS.

A control string that has been in the app for weeks proves the bundle search
works; if it is missing, nothing else in the report can be trusted.
"""
import base64, json, random, re, sys, urllib.error, urllib.request

BASE = sys.argv[1].rstrip('/')

def get(path):
    req = urllib.request.Request(BASE + path, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get('content-type', ''), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('content-type', ''), e.read().decode('utf-8', 'replace')

results = []
def check(name, ok, detail=''):
    results.append(ok)
    print('  %s  %-44s %s' % ('PASS' if ok else 'FAIL', name, detail))

status, ctype, html = get('/verify-%d' % random.randint(10**6, 10**7))
title = (re.search(r'<title>(.*?)</title>', html) or [None, ''])[1]
check('<title> is the app, not a login wall', title == 'Core Fitness', repr(title))

# Every chunk, following references out of the entry bundle.
seen, queue, corpus = set(), re.findall(r'/assets/[\w.-]+\.js', html), ''
while queue:
    p = queue.pop()
    if p in seen:
        continue
    seen.add(p)
    s, ct, js = get(p)
    if 'javascript' not in ct:
        continue   # a retired chunk comes back as 200 text/html — content-type, never status
    corpus += js
    queue += ['/' + r for r in re.findall(r'assets/[\w.-]+\.js', js) if '/' + r not in seen]

print('  entry', re.findall(r'/assets/index-[\w-]+\.js', html), '| chunks', len(seen))
for label, s in [('CONTROL — old string, must be present', 'Checking your membership'),
                 ('PaymentChip ("In your plan")', 'In your plan'),
                 ('Clash warning in the picker', 'You are already booked for'),
                 ('Trainer overdue banner', 'waiting more than a day')]:
    check(label, s in corpus)

# The key checks. `sb_secret_` alone is supabase-js's own format test, never a key.
check('No secret key value in the bundle', not re.search(r'sb_secret_[A-Za-z0-9]', corpus))
jwts = re.findall(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+', corpus)
leaked = []
for t in jwts:
    try:
        body = t.split('.')[1]
        body += '=' * (-len(body) % 4)
        if 'service_role' in base64.urlsafe_b64decode(body).decode('utf-8', 'replace'):
            leaked.append(t[:20])
    except Exception:
        pass
check('No service-role JWT in the bundle', not leaked, '%d JWT(s) scanned' % len(jwts))

s, ct, body = get('/manifest.webmanifest')
try:
    m = json.loads(body)
except Exception:
    m = {}
check('Manifest unchanged (so the APK needs no rebuild)',
      'manifest' in ct and m.get('name') == 'Core Fitness' and m.get('start_url') == '/' and m.get('scope') == '/',
      '%s name=%r start=%r scope=%r' % (ct, m.get('name'), m.get('start_url'), m.get('scope')))

s, ct, body = get('/.well-known/assetlinks.json')
check('assetlinks.json served, same signing key', 'json' in ct and '51:A4' in body, ct)

s, ct, _ = get('/login')
check('/login resolves through the SPA rewrite', s == 200, str(s))

print('\n%d/%d passed' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
