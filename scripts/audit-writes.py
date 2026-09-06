import io, os, re, json

ROOTS = ['g-fitness-admin/src/lib/api', 'g-fitness-member/src/lib/api']
OUT = os.environ.get('AUDIT_JSON')  # optional: set it to also dump JSON

findings = []

for root in ROOTS:
    app = 'admin' if 'admin' in root else 'member'
    for fn in sorted(os.listdir(root)):
        if not fn.endswith('.ts'):
            continue
        path = os.path.join(root, fn).replace(os.sep, '/')
        src = io.open(path, encoding='utf-8').read()

        for m in re.finditer(r'await\s+supabase\s*\.?\s*\n?\s*\.from\(([^)]*)\)((?:[^;]|\n)*?);', src):
            chain = m.group(0)
            if not any(op in chain for op in ('.update(', '.delete(', '.upsert(')):
                continue
            op = ('update' if '.update(' in chain else
                  'delete' if '.delete(' in chain else 'upsert')
            guarded = '.select(' in chain
            line = src[:m.start()].count('\n') + 1
            before = src[:m.start()]
            names = re.findall(r'export (?:async )?function (\w+)', before)
            findings.append({
                'app': app,
                'module': fn,
                'line': line,
                'op': op,
                'fn': names[-1] if names else '(module scope)',
                'table': m.group(1).strip().strip("'\""),
                'guarded': guarded,
            })

unguarded = [f for f in findings if not f['guarded']]
print('writes found: %d | guarded: %d | UNGUARDED: %d'
      % (len(findings), len(findings) - len(unguarded), len(unguarded)))
print()
for f in unguarded:
    print('%-7s %-24s %-7s %-34s %-22s :%d'
          % (f['app'], f['module'], f['op'], f['fn'], f['table'], f['line']))

if OUT:
    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(unguarded, indent=1))
    print()
    print('written to', OUT)
