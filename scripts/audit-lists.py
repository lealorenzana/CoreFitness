"""Histories are paged (2026-10-10).

"See all visits" was 321 check-ins in one scroll. Every screen that SHOWS a
history now pages it — and a history is fetched a page at a time where it can
grow without end. This lists every read of a history table in the apps'
lib/api modules that has neither .range( nor .limit( nor a date window
(.gte( / .lt( / .eq on a single day), so each one is a decision someone made,
not an accident:

    python scripts/audit-lists.py            report; exit 1 on an unknown one

A read that is fine whole — bounded by a date window, a single member's small
list, or a count (head: true) — goes in ALLOWED with the reason.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APPS = ['g-fitness-admin', 'g-fitness-member', 'corefitness-platform']
HISTORY = ['attendance', 'payments', 'activity_log', 'activity_feed', 'notifications', 'workout_logs',
           'point_ledger', 'shop_sales', 'gym_payments', 'support_messages', 'winback_sends']

# function name -> why reading it whole is right
ALLOWED = {
    'listMemberAttendance': "one member's check-ins, for the calendar and streak; the long list pages through listMemberAttendancePage",
    'listMemberPayments': "one member's payments (about twelve a year); every screen showing them pages them",
    'listWorkoutLogs': "one member's logs, for their stats and history; the history screen pages them",
    'listNotifications': "one person's own notifications; the Inbox pages them",
    'listBellNotifications': 'the bell holds only what the person has not cleared or archived',
    'listDayWorkouts': 'one calendar day (performed_on = day)',
    'listPayments': "the gym's payments, grouped by member on Payments, which pages the groups; move to a per-member summary view if a gym passes ~10,000",
}

READ = re.compile(r"\.from\('(" + '|'.join(HISTORY) + r")'\)")
BOUND = re.compile(r"\.range\(|\.limit\(|head:\s*true|\.gte\(|\.gt\(|\.lte\(|\.lt\(|\.single\(\)|\.maybeSingle\(\)")
FUNC = re.compile(r"export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=")

unknown = []
for app in APPS:
    for path in (ROOT / app / 'src' / 'lib' / 'api').glob('*.ts'):
        text = path.read_text(encoding='utf-8')
        for m in READ.finditer(text):
            # The statement: from .from( to the end of the chain (a ; or a blank line).
            end = text.find(';', m.end())
            chain = text[m.start(): end if end != -1 else len(text)]
            if BOUND.search(chain) or '.insert(' in chain or '.update(' in chain or '.delete(' in chain or '.upsert(' in chain:
                continue
            before = list(FUNC.finditer(text, 0, m.start()))
            name = (before[-1].group(1) or before[-1].group(2)) if before else '?'
            if name in ALLOWED:
                continue
            line = text.count('\n', 0, m.start()) + 1
            unknown.append(f"{path.relative_to(ROOT).as_posix()}:{line}  {name}() reads {m.group(1)} whole")

for u in unknown:
    print(u)
print(f'\n{len(unknown)} unbounded history read(s) — page them or add to ALLOWED with the reason'
      if unknown else 'every history read is paged, bounded or allowed with a reason')
sys.exit(1 if unknown else 0)
