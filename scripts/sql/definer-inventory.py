"""
Every function as of its LAST definition across supabase/migrations, with
whether it is SECURITY DEFINER and which tables it touches. Tenancy work
starts here: a definer function skips RLS, so each one that reads or writes a
gym's rows must scope itself to one gym.

    python scripts/sql/definer-inventory.py            # definer functions only
    python scripts/sql/definer-inventory.py --all      # every function
"""
import os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase', 'migrations')

FN = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\((.*?)\)\s*returns(.*?)\$(\w*)\$(.*?)\$\4\$',
                re.I | re.S)
TABLE = re.compile(r'\b(?:from|join|into|update|delete\s+from)\s+(?:public\.)?([a-z_]+)', re.I)

last = {}
for f in sorted(os.listdir(MIG)):
    if not re.match(r'^\d{4}_.*\.sql$', f):
        continue
    s = open(os.path.join(MIG, f), encoding='utf-8').read()
    s = re.sub(r'--[^\n]*', '', s)
    for m in FN.finditer(s):
        name, header, body = m.group(1).lower(), m.group(3), m.group(5)
        definer = bool(re.search(r'security\s+definer', header + s[m.end():m.end() + 200], re.I))
        tables = sorted({t.lower() for t in TABLE.findall(body)} - {'new', 'old', 'select', 'unnest', 'generate_series', 'jsonb_array_elements', 'lateral'})
        last[name] = (f[:4], definer, tables)

show_all = '--all' in sys.argv
rows = [(n, v) for n, v in sorted(last.items()) if show_all or v[1]]
for name, (mig, definer, tables) in rows:
    print(f"{mig}  {'DEFINER' if definer else 'invoker'}  {name:38} {', '.join(tables)}")
print(f'\n{len(rows)} functions' + ('' if show_all else ' are SECURITY DEFINER'))
