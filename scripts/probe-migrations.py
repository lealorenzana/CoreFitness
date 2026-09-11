"""Which migrations are actually live, and does the anonymous boundary hold?

Needs no database credentials. Over REST the anon key reports the *schema*: a
missing table answers PGRST205, a missing function PGRST202, a missing column
42703, and a live-but-protected object answers 42501 — which is a pass, not a
failure. That distinction is the whole point of this script.

    python scripts/probe-migrations.py

Reads the URL and anon key from g-fitness-admin/.env.local.

Deliberately probes THREE independent objects per migration. One missing object
could be a single failed statement; three is a file that never ran, and the two
need different fixes.
"""
import io, os, re, json, sys, urllib.request, urllib.error

ENV = os.path.join('g-fitness-admin', '.env.local')
if not os.path.exists(ENV):
    sys.exit('Cannot find %s — run this from the repository root.' % ENV)

env = io.open(ENV, encoding='utf-8').read()
URL = re.search(r'VITE_SUPABASE_URL\s*=\s*(\S+)', env).group(1).strip().rstrip('/')
KEY = re.search(r'VITE_SUPABASE_ANON_KEY\s*=\s*(\S+)', env).group(1).strip()

HEAD = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}


def _call(path, data=None):
    headers = dict(HEAD)
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(URL + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode('utf-8', 'replace')[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:200]
    except Exception as e:                                  # noqa: BLE001
        return 0, str(e)[:200]


def table(name, col='*'):
    return _call('/rest/v1/%s?select=%s&limit=1' % (name, col))


def rpc(name, payload=None):
    return _call('/rest/v1/rpc/' + name, json.dumps(payload or {}).encode())


def verdict(status, body):
    if status == 404 and 'PGRST205' in body: return 'NOT PASTED (no such table)'
    if status == 404 and 'PGRST202' in body: return 'NOT PASTED (no such function)'
    if status == 400 and '42703' in body:    return 'NOT PASTED (no such column)'
    if status == 400 and '42883' in body:    return 'NOT PASTED (no such function)'
    if status == 401 and '42501' in body:    return 'LIVE - anon correctly refused'
    if status in (200, 204):                 return 'LIVE'
    if status == 403:                        return 'LIVE - refused'
    return 'HTTP %s: %s' % (status, body[:70])


NIL = '00000000-0000-0000-0000-000000000000'

CHECKS = [
    ('0068', 'rpc member_commitments',         lambda: rpc('member_commitments', {'p_member': NIL})),
    ('0068', 'rpc trainer_schedule_conflicts', lambda: rpc('trainer_schedule_conflicts')),
    ('0069', 'account_status_events',          lambda: table('account_status_events', 'id')),
    ('0069', 'rpc account_lockout_reason',     lambda: rpc('account_lockout_reason', {'p_email': 'nobody@example.invalid'})),
    ('0070', 'refund_rules',                   lambda: table('refund_rules', 'label')),
    ('0070', 'rpc frozen_days_last_year',      lambda: rpc('frozen_days_last_year', {'p_member': NIL})),
    ('0070', 'pt_sessions.payment_id',         lambda: table('pt_sessions', 'payment_id')),
    ('0071', 'bookings.decided_by_role',       lambda: table('bookings', 'decided_by_role')),
    ('0071', 'rpc sweep_stale_requests',       lambda: rpc('sweep_stale_requests')),
    ('0072', 'trainer_feedback',               lambda: table('trainer_feedback', 'id')),
    ('0072', 'public_trainer_credentials',     lambda: table('public_trainer_credentials', 'title')),
    ('0072', 'rpc my_trainer_ratings',         lambda: rpc('my_trainer_ratings')),
    ('0073', 'gym_settings.refund_fee',        lambda: table('gym_settings', 'refund_processing_fee')),
    ('0073', 'rpc refund_quote',               lambda: rpc('refund_quote', {'p_membership': NIL})),
    # 0074 replaces three function *bodies* and creates no table, column or
    # function anyone calls — so it leaves no schema trace, and this probe would
    # have reported it live before it ever ran. The marker exists for that.
    ('0074', 'rpc migration_0074_applied',     lambda: rpc('migration_0074_applied')),
    # 0075 inserts library rows the anon key cannot read (0019's policy), so it
    # carries a marker too.
    ('0075', 'rpc migration_0075_applied',     lambda: rpc('migration_0075_applied')),
]

print('project: %s' % URL)
print()
print('%-6s %-34s %-5s %s' % ('MIG', 'OBJECT', 'HTTP', 'READING'))
print('-' * 96)

missing = {}
for mig, obj, fn in CHECKS:
    status, body = fn()
    reading = verdict(status, body)
    print('%-6s %-34s %-5s %s' % (mig, obj, status, reading))
    if reading.startswith('NOT PASTED'):
        missing.setdefault(mig, 0)
        missing[mig] += 1

print()
if not missing:
    print('All probed migrations are live.')
else:
    for mig, n in sorted(missing.items()):
        total = sum(1 for m, _, _ in CHECKS if m == mig)
        if n == total:
            print('%s: NOT PASTED - all %d objects absent. Paste it.' % (mig, total))
        else:
            print('%s: PARTIAL - %d of %d objects absent. A statement failed '
                  'mid-file; re-paste it (every migration is re-runnable).' % (mig, n, total))
