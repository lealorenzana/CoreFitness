"""
Every English string the member app translates, and whether it has Filipino
(guides G3, 2026-10-31). Reads:

  * every literal `t('…')` in g-fitness-member/src
  * the labels, blurbs and eyebrows in components/layout/memberNav.ts, which
    the tab bar and More pass through `t()` as variables
  * every tour's name, titles and lines (lib/tours.ts), and the tour's buttons
  * the words maps screens pass through `t()` (CoachHome's STATE, WorkoutHome's
    library rows, TrainerSetup's PT_WORDS)

and lists each one missing from lib/i18n.ts, or whose Filipino is the English
word for word (allowed only for the app words the file's header names).
Exit 1 when anything is missing, so CI can run it.

    python scripts/i18n-missing.py
"""
import os, re, sys, json

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'g-fitness-member', 'src')
APP_WORDS = {'Inbox', 'Rewards', 'Assistant', 'Shop', 'Equipment', 'Profile', 'Settings', 'Workout', 'Coach', 'Classes',
             'Library', 'Programs', 'Chat', 'Progress', 'Targets', 'Progress photos', 'Private', 'Membership', 'Notifications',
             'Week', 'Day', 'week', 'weeks', 'exercise', 'exercises', 'reps', 'set', 'sets', 'photo', 'photos', 'reminder',
             'Rest day', 'body fat', 'Target:', 'Pages', 'page', 'confirmed', 'Welcome, Coach',
             'Alerts, privacy, sign-in, password, email', 'Personal training', 'Privacy policy', 'Progress, badges, membership',
             'Schedule', 'Single sessions', 'Terms of service'}

def read(p):
    return open(p, encoding='utf-8').read()

i18n = read(os.path.join(ROOT, 'lib', 'i18n.ts'))
body = i18n[i18n.index('const FIL'):i18n.index('};', i18n.index('const FIL'))]
fil = dict(re.findall(r'^\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'):\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'),', body, re.M))
fil = {json.loads(k) if k.startswith('"') else k[1:-1]: (json.loads(v) if v.startswith('"') else v[1:-1]) for k, v in fil.items()}

keys = set()
for d, _, files in os.walk(ROOT):
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            src = read(os.path.join(d, f))
            for m in re.finditer(r"\bt\('((?:[^'\\]|\\.)+)'\)", src):
                keys.add(m.group(1).replace("\\'", "'"))

nav = read(os.path.join(ROOT, 'components', 'layout', 'memberNav.ts'))
for name in ('label', 'blurb', 'eyebrow'):
    for m in re.finditer(name + r": '((?:[^'\\]|\\.)+)'", nav[nav.index('export const TABS'):]):
        keys.add(m.group(1))

def words_map(path, start):
    src = read(os.path.join(ROOT, path))
    i = src.index(start)
    block = src[i:src.index('};', i)]
    return re.findall(r":\s*'((?:[^'\\]|\\.)+)'", block)

for path, start in (('pages/train/CoachHome.tsx', 'const STATE'), ('pages/trainer/TrainerSetup.tsx', 'const PT_WORDS')):
    keys.update(words_map(path, start))
wh = read(os.path.join(ROOT, 'pages', 'train', 'WorkoutHome.tsx'))
lib = wh[wh.index('const library'):wh.index('];', wh.index('const library'))]
keys.update(re.findall(r"(?:label|blurb): '((?:[^'\\]|\\.)+)'", lib))

tours = read(os.path.join(ROOT, 'lib', 'tours.ts'))
keys.update(re.findall(r"(?:name|title|text): '((?:[^'\\]|\\.)+)'", tours))
keys.update(['Skip', 'Done', 'Next'])

missing = sorted(k for k in keys if k not in fil)
same = sorted(k for k in keys if k in fil and fil[k] == k and k not in APP_WORDS)
print(f'{len(keys)} strings pass through t(); {len(missing)} with no Filipino; {len(same)} left in English that are not app words.')
for k in missing:
    print('  MISSING  ' + k)
for k in same:
    print('  ENGLISH  ' + k)
sys.exit(1 if missing or same else 0)
