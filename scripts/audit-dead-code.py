"""Exports nothing imports, and pages no route reaches.

Two failure modes this project has actually shipped, which a build cannot catch
because both compile perfectly:

  * **A second copy that drifted.** Most `lib/api` modules exist once per app.
    When one is fixed and the other is not, the dead half is the trap: it looks
    authoritative, and it is wrong. The member app carried eight admin-only
    functions — approval, suspension, archiving — that nothing called and that
    RLS would have refused anyway.
  * **A feature with no route.** Two screens were built, correct, and linked
    from nowhere. "It ships when a route leads to it" is in CLAUDE.md because of
    them.

    python scripts/audit-dead-code.py            # both apps
    python scripts/audit-dead-code.py --pages    # only the route half

Deliberately crude: it counts identifier occurrences outside the defining file
rather than resolving imports, so re-exports and dynamic imports read as used.
It is a **lead generator, not a verdict** — check each hit before deleting, and
expect a handful of honest false positives (a hook used only by its own module's
tests, an export kept for the next screen). False negatives are the expensive
direction, and this errs the other way.
"""
import io, os, re, sys

APPS = ['g-fitness-admin', 'g-fitness-member']
EXPORT = re.compile(r'^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_]\w*)', re.M)
# Types are excluded: a type used only in a signature reads as unused here, and
# `noUnusedLocals` already fails the build for a genuinely orphaned one.

def walk(root, exts=('.ts', '.tsx')):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git')]
        for f in files:
            if f.endswith(exts):
                yield os.path.join(base, f)

def read(p):
    return io.open(p, encoding='utf-8', errors='replace').read()

def dead_exports(app):
    src = {p: read(p) for p in walk(os.path.join(app, 'src'))}
    findings = []
    for path, text in src.items():
        # Pages and route-level components are entered by the router, not by an
        # import that names them, so they are checked by dead_pages() instead.
        if os.sep + 'pages' + os.sep in path:
            continue
        for name in EXPORT.findall(text):
            uses = sum(len(re.findall(r'\b%s\b' % re.escape(name), t))
                       for p2, t in src.items() if p2 != path)
            if uses == 0:
                findings.append((path, name))
    return findings

def dead_pages(app):
    app_tsx = os.path.join(app, 'src', 'App.tsx')
    if not os.path.exists(app_tsx):
        return []
    routes = read(app_tsx)
    others = {p: read(p) for p in walk(os.path.join(app, 'src'))
              if os.sep + 'pages' + os.sep in p}
    findings = []
    for path in others:
        stem = os.path.basename(path).rsplit('.', 1)[0]
        if stem in routes:
            continue
        # A page can also be reached as a tab inside another page.
        linked = any(re.search(r'\b%s\b' % re.escape(stem), t)
                     for p2, t in others.items() if p2 != path)
        if not linked:
            findings.append(path)
    return findings

pages_only = '--pages' in sys.argv
total = 0
for app in APPS:
    if not pages_only:
        dead = dead_exports(app)
        print('\n%s - exports nothing else imports: %d' % (app, len(dead)))
        for path, name in sorted(dead):
            print('   %-58s %s' % (path.replace(app + os.sep, ''), name))
        total += len(dead)

    pages = dead_pages(app)
    print('\n%s - page files no route and no page mentions: %d' % (app, len(pages)))
    for p in sorted(pages):
        print('   %s' % p.replace(app + os.sep, ''))
    total += len(pages)

print('\n%d lead(s). Check each before deleting: this counts names, it does not resolve imports.' % total)
