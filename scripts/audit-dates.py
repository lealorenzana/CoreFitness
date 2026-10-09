"""Every date picker names a mode (2026-10-10).

An evaluator set a gym-wide goal in 2002: the pickers accepted any year. Each app
now has ONE picker that takes a `mode` from lib/dateRules.ts (future / record /
history / birth). This fails on anything that bypasses it:

  * a raw <input type="date">, "month" or "datetime-local" (or TextInput type="date")
  * a dialog field declared  type: 'date'
  * a <DatePicker ...> or <DateField ...> without  mode=

    python scripts/audit-dates.py          exit 1 when something bypasses the rule
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPS = ['g-fitness-admin', 'g-fitness-member', 'corefitness-platform', 'corefitness-site']

RAW = re.compile(r"""type=["'](date|month|datetime-local)["']|type:\s*'date'""")
PICKER = re.compile(r'<(DatePicker|DateField)\b([^>]*?)/?>', re.S)

problems = []
for app in APPS:
    for path in (ROOT / app / 'src').rglob('*.tsx'):
        text = path.read_text(encoding='utf-8')
        rel = path.relative_to(ROOT).as_posix()
        for i, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith(('*', '//', '{/*')):
                continue
            if RAW.search(line):
                problems.append(f'{rel}:{i}  raw date input - use the app\'s picker with a mode')
        for m in PICKER.finditer(text):
            if 'mode=' not in m.group(2):
                line = text.count('\n', 0, m.start()) + 1
                problems.append(f'{rel}:{line}  <{m.group(1)}> without mode=')

for p in problems:
    print(p)
print(f'\n{len(problems)} date picker(s) bypass the rule' if problems else 'every date picker names a mode')
sys.exit(1 if problems else 0)
