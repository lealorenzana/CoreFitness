"""The gyms on this service, as a stranger sees them.

Asks the live database rather than trusting a screen or a report — the same
rule as `probe-migrations.py`, and for the same reason (0070 was believed
pasted for a day and had never run).

It calls `list_gyms()`, which is granted to `anon`, so it needs no password and
no DB credentials: exactly what a member opening the phone app would get. That
also makes it the honest check on a rename, a join policy, or a gym that should
have dropped off the public list.

    python scripts/probe-gyms.py
"""
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / 'g-fitness-member' / '.env.local'

if not ENV.exists():
    sys.exit(f'No {ENV}. Copy .env.example and fill it in (supabase/README.md).')

env = ENV.read_text(encoding='utf-8')
URL = re.search(r'VITE_SUPABASE_URL\s*=\s*(\S+)', env).group(1).strip().rstrip('/')
KEY = re.search(r'VITE_SUPABASE_ANON_KEY\s*=\s*(\S+)', env).group(1).strip()


def rpc(fn, body=None):
    req = urllib.request.Request(
        f'{URL}/rest/v1/rpc/{fn}',
        data=json.dumps(body or {}).encode(),
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or 'null'), r.status
    except urllib.error.HTTPError as e:
        return e.read().decode()[:200], e.code


rows, status = rpc('list_gyms', {'p_search': None})
if status != 200:
    sys.exit(f'list_gyms failed ({status}): {rows}')

if not rows:
    print('No gym is publicly listed.')
    print('That is correct if every gym is on the code or closed door (0110),')
    print('and a problem if one of them should be findable in the app.')
    sys.exit(0)

print(f'{len(rows)} gym(s) a stranger can find in the member app:\n')
for g in rows:
    # accent/accent_action arrive from 0112; an older database omits them.
    main = g.get('accent') or 'violet'
    action = g.get('accent_action') or 'amber'
    logo = 'logo set' if g.get('logo_url') else 'no logo'
    print(f"  {g['name']}")
    print(f"    /join/{g['slug']}  ·  {main}/{action}  ·  {logo}")

print('\nThe two colours are "where you are" and "what you can do next" (0112).')
print('Both the same means an app in one colour throughout.')
