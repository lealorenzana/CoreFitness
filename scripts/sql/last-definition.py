"""
Print the LAST definition of each named function, verbatim, with the
migration it came from — the text a rewrite must start from (plan rule:
never rewrite a function from memory).

    python scripts/sql/last-definition.py cancel_booking notify_once
"""
import os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG = os.path.join(REPO, 'supabase', 'migrations')

HEAD = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(', re.I)

def definitions():
    found = {}
    for f in sorted(os.listdir(MIG)):
        if not re.match(r'^\d{4}_.*\.sql$', f):
            continue
        s = open(os.path.join(MIG, f), encoding='utf-8').read()
        for m in HEAD.finditer(s):
            # The body is delimited by the first $tag$ after the header and its twin.
            tag = re.compile(r'\$(\w*)\$').search(s, m.end())
            if not tag:
                continue
            end = s.find(tag.group(0), tag.end())
            if end < 0:
                continue
            stop = s.find(';', end + len(tag.group(0)))
            found[m.group(1).lower()] = (f, s[m.start():stop + 1])
    return found

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    defs = definitions()
    for name in sys.argv[1:]:
        f, text = defs.get(name.lower(), ('-', '(not found)'))
        print(f'-- ===== {name}  (last: {f})\n{text}\n')
