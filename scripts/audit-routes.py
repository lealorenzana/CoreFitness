"""Routes nothing links to.

`audit-dead-code.py --pages` finds a page no route renders. This finds the
subtler one: a route that exists, resolves, renders correctly — and that a
member can only reach by typing the URL. Two screens shipped that way here, and
neither was noticed by a build, a lint or a test.

    python scripts/audit-routes.py

A route counts as reachable when its path appears in a `navigate(...)`, a
`<Link to=...>`, a `<NavLink to=...>`, a dock/sidebar table, or a notification's
`action_url` — anywhere outside App.tsx itself, including the SQL that writes
those action_urls, because a notification a member taps is a real way in.

Judgement still required: a detail route like `/member/class/:id` is reached by
building the string, so it shows up here and is fine. Read the list, do not
obey it.
"""
import io, os, re

APPS = ['g-fitness-admin', 'g-fitness-member']
ROUTE = re.compile(r'<Route\s+path="([^"]+)"')

def walk(root, exts):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git')]
        for f in files:
            if f.endswith(exts):
                yield os.path.join(base, f)

def read(p):
    return io.open(p, encoding='utf-8', errors='replace').read()

# The SQL is searched too: 0030/0051-0055/0071 write notification action_urls,
# and a screen reachable only from a notification is still reachable.
sql = ''.join(read(p) for p in walk('supabase', ('.sql',)))

for app in APPS:
    app_tsx = os.path.join(app, 'src', 'App.tsx')
    if not os.path.exists(app_tsx):
        continue
    routes_src = read(app_tsx)
    others = ''.join(read(p) for p in walk(os.path.join(app, 'src'), ('.ts', '.tsx'))
                     if not p.endswith('App.tsx'))
    haystack = others + sql

    orphans = []
    for path in ROUTE.findall(routes_src):
        if path in ('*', '/', ''):
            continue
        clean = path.split('/:')[0].strip('/')          # drop :params
        if not clean:
            continue
        last = clean.split('/')[-1]
        # Either the full segment path or its last segment appearing in a link.
        if re.search(r'["\'`/]%s["\'`/?]' % re.escape(last), haystack):
            continue
        orphans.append(path)

    print('\n%s — routes with no link anywhere: %d' % (app, len(orphans)))
    for p in orphans:
        print('   %s' % p)

print('\nA detail route built as a string (`/member/class/${id}`) lists here and is fine. '
      'A whole feature listing here is the bug this script exists for.')
