# Attendance mock-ups A and B inside shell B (rail + header tabs). Sample data.
import pathlib
here = pathlib.Path(__file__).parent
P = {
  'home': 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', 'people': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  'pt': 'M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M2 11v2M22 11v2', 'card': 'M2 6h20v12H2zM2 10h20', 'chart': 'M3 3v18h18M7 15l4-4 3 3 5-6',
  'trophy': 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z', 'msg': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5V22h16', 'gear': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  'help': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', 'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  'bell': 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4', 'qr': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z',
  'check': 'M20 6 9 17l-5-5', 'tablet': 'M5 2h14v20H5zM11 18h2', 'tv': 'M2 7h20v12H2zM8 3l4 4 4-4', 'down': 'M12 3v12M6 11l6 6 6-6M4 21h16',
  'undo': 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3', 'tag': 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  'coach': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 11l2 2 4-4',
}
I = lambda k, s=16: f'<svg class="i" width="{s}" height="{s}" viewBox="0 0 24 24"><path d="{P[k]}"/></svg>'

rail = [('Desk', 'home', True), ('People', 'people', False), ('Coaching', 'pt', False), ('Money', 'card', False), ('Reports', 'chart', False),
        ('Engage', 'trophy', False), ('Messages', 'msg', False), ('Library', 'book', False)]
def shell(title, body, extra_css):
    r = ''.join(f'<a class="{"on" if on else ""}">{I(ic)}{lb}</a>' for lb, ic, on in rail)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="mock.css"><link rel="stylesheet" href="shell2.css"><style>{COMMON}{extra_css}</style></head><body>
<div class="sb"><nav class="sb-rail"><span class="logo">CF</span>{r}<a class="push">{I("gear")}Gym</a><a>{I("help")}Help</a><span class="av me">GO</span></nav>
<div class="main"><div class="sb-top"><div class="row1"><span class="gymname">Core Fitness Lab <small>Mamburao</small></span>
<div class="cmd">{I("search")}Search anything<span class="kbd">Ctrl K</span></div><button class="ico-btn">{I("bell", 18)}<span class="n">30</span></button></div>
<div class="row2"><span class="sec">Desk</span><a>Today</a><a class="on">Attendance</a><a>Notifications</a></div></div>
{body}</div></div><span class="ann">{title} · sample data</span>
<script>document.documentElement.dataset.mode = new URLSearchParams(location.search).get("mode") === "light" ? "light" : "dark";</script></body></html>'''

COMMON = '''
.pg { flex: 1; min-height: 0; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.ph { display: flex; align-items: center; gap: 16px; flex: none; }
.ph h1 { font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
.ph p { color: var(--text-2); font-size: 13px; }
.seg2 { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line-strong); border-radius: 8px; }
.seg2 a { padding: 5px 12px; border-radius: 6px; color: var(--text-2); font-weight: 600; cursor: pointer; white-space: nowrap; }
.seg2 a.on { background: var(--raised); color: var(--text); }
.seg2 a em { font-style: normal; color: var(--text-3); font-weight: 500; margin-left: 4px; }
.live { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); }
.live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--primary-fg); }
.find { display: flex; gap: 8px; }
.find .in { flex: 1; height: 48px; border: 1px solid var(--line-strong); border-radius: 8px; display: flex; align-items: center; gap: 10px; padding: 0 14px; font-size: 15px; color: var(--text-3); background: var(--surface); }
.find .in b { color: var(--text); font-weight: 500; }
.find .kb { margin-left: auto; font-size: 11px; border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 6px; color: var(--text-3); }
.find .go { height: 48px; padding: 0 18px; border-radius: 8px; background: var(--action); color: var(--on-action); font-weight: 650; display: inline-flex; align-items: center; gap: 8px; }
.tagrow { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 12px; flex-wrap: nowrap; }
.tagrow .t { height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line-strong); display: inline-flex; align-items: center; color: var(--text-2); font-weight: 600; white-space: nowrap; }
.tagrow .t.on { border-color: var(--primary-fg); color: var(--text); background: var(--raised); }
.okbar { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: var(--raised); }
.okbar .c { width: 24px; height: 24px; border-radius: 50%; background: var(--fill-primary); color: #fff; display: grid; place-items: center; flex: none; }
.okbar .c svg { stroke: #fff; }
.okbar .t { flex: 1; min-width: 0; } .okbar .t b { font-weight: 600; } .okbar .t span { color: var(--text-2); font-size: 12px; margin-left: 8px; }
.btn.sm { height: 28px; font-size: 12px; padding: 0 10px; }
table.log { width: 100%; border-collapse: collapse; font-size: 13px; }
table.log th { text-align: left; font-size: 12px; color: var(--text-3); font-weight: 500; padding: 8px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--surface); }
table.log td { padding: 9px 16px; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.log td.n b { font-weight: 600; } table.log td.n span { color: var(--text-3); margin-left: 8px; font-size: 12px; }
table.log td.m { color: var(--text-2); } table.log td.r { text-align: right; }
table.log .how { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); }
.filters { display: flex; align-items: center; gap: 8px; }
.mini { height: 30px; border: 1px solid var(--line-strong); border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; color: var(--text-3); font-size: 12px; min-width: 180px; }
.kv { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.kv:last-child { border-bottom: 0; }
.kv .t { flex: 1; min-width: 0; } .kv .t b { display: block; font-weight: 600; } .kv .t span { color: var(--text-2); font-size: 12px; }
.kv > svg.i { color: var(--text-3); }
.stack { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px; margin-top: 8px; }
.stack i { display: block; background: var(--primary-fg); } .stack i.b { opacity: .55; } .stack i.c { background: var(--line-strong); }
.leg { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; color: var(--text-2); }
.leg span { display: inline-flex; align-items: center; gap: 5px; }
.spark { display: flex; align-items: flex-end; gap: 3px; height: 36px; }
.spark i { flex: 1; background: var(--primary-fg); opacity: .8; border-radius: 2px 2px 0 0; }
.spark i.f { opacity: .2; }
'''

ROWS = [('6:05 pm', 'Ana Par', 'Free Plan', 'qr', 'Desk scan', 'Cardio', 'Front desk'), ('5:48 pm', 'Ben Cruz', 'Premium', 'tablet', 'Kiosk', 'Weight Training', 'Their pick'),
        ('5:31 pm', 'Carla Diaz', 'Premium', 'tablet', 'Kiosk', 'Strength', 'Their pick'), ('4:12 pm', 'Ana Iturralde', 'Premium', 'qr', 'Typed', 'Weight Training', 'Front desk'),
        ('3:40 pm', 'Dino Santos', 'Free Trial', 'tablet', 'Kiosk', 'Not recorded', ''), ('12:05 pm', 'Ana Andrada', 'Free Trial', 'qr', 'Desk scan', 'Cardio', 'Front desk'),
        ('10:05 am', 'Angelica Lopez', 'Premium', 'tablet', 'Kiosk', 'Weight Training', 'Their pick'), ('9:05 am', 'Aileen Navarro', 'Free Plan', 'qr', 'Desk scan', 'Cardio', 'Front desk'),
        ('7:30 am', 'Ella Reyes', 'Premium', 'tablet', 'Kiosk', 'Strength', 'Their pick'), ('6:12 am', 'Franco Lim', 'Premium', 'tablet', 'Kiosk', 'Cardio', 'Their pick')]
def log(n):
    return ''.join(f'<tr><td>{t}</td><td class="n"><b>{nm}</b><span>{pl}</span></td><td><span class="how">{I(ic, 14)}{how}</span></td><td class="m">{act}</td><td class="m">{by}</td><td class="r"><button class="btn sm" style="border:0;color:var(--text-2)">Undo</button></td></tr>' for t, nm, pl, ic, how, act, by in ROWS[:n])
TH = '<thead><tr><th>Time</th><th>Member</th><th>How</th><th>Activity</th><th>Tagged by</th><th></th></tr></thead>'
FIND = f'''<div class="find"><div class="in">{I("search", 18)}Name, phone or the code under their QR<span class="kb">Enter</span></div><button class="go">{I("qr", 18)}Scan QR</button></div>'''
TAGS = f'''<div class="tagrow">{I("tag", 14)}Tag the next check-in <span class="t on">None</span><span class="t">Weight Training</span><span class="t">Cardio</span><span class="t">Strength</span><span class="t">More</span></div>'''
OK = f'''<div class="okbar"><span class="c">{I("check", 14)}</span><div class="t"><b>Ana Par is in</b><span>6:05 pm · Cardio · tagged at the desk</span></div><button class="btn sm">Undo</button></div>'''

# ── A: the desk console. One job on the left (find, check in, see it land, the log); the day on a right rail.
A_CSS = '''
.a-wrap { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; }
.a-main { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.a-side { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.a-fig { padding: 14px 16px; border-bottom: 1px solid var(--line); }
.a-fig:last-child { border-bottom: 0; }
.a-fig .l { font-size: 12px; color: var(--text-2); display: flex; justify-content: space-between; }
.a-fig .n { font-size: 22px; font-weight: 650; letter-spacing: -.02em; margin-top: 2px; }
.a-fig .n.hero { font-size: 40px; letter-spacing: -.04em; line-height: 1.05; }
.a-fig .d { font-size: 12px; color: var(--text-3); }
.a-hero { display: flex; align-items: flex-end; gap: 16px; }
.a-hero .spark { flex: 1; }
'''
A = f'''<div class="pg">
  <div class="ph"><div><h1>Attendance</h1><p><span class="live">Live</span> · Sunday, 22 November · open until 10:00 pm</p></div>
    <div class="seg2" style="margin-left:auto"><a class="on">Today<em>42</em></a><a>Walk-ins<em>3</em></a><a>History</a></div></div>
  <div class="a-wrap">
    <div class="a-main">
      <section class="box" style="flex:none"><div style="padding:16px;display:flex;flex-direction:column;gap:12px">{FIND}{OK}{TAGS}</div></section>
      <section class="box" style="flex:1">
        <header><h2>Today's check-ins <span class="count">42</span></h2><span class="aside"><span class="seg2"><a class="on">All</a><a>Kiosk<em>24</em></a><a>Desk scan<em>11</em></a><a>Typed<em>7</em></a></span>
          <span class="mini">{I("search", 14)}Find in today</span><button class="btn sm">{I("down", 14)}Export</button></span></header>
        <div class="scroll"><table class="log">{TH}<tbody>{log(10)}</tbody></table></div>
      </section>
    </div>
    <div class="a-side">
      <section class="box" style="flex:none">
        <div class="a-fig"><div class="l">Checked in today<span>9 more than last Sunday</span></div>
          <div class="a-hero"><div class="n hero">42</div><div class="spark">{"".join(f'<i style="height:{h}%"{" class=f" if k > 11 else ""}></i>' for k, h in enumerate([30,80,60,40,20,20,10,45,35,25,40,55,0,0,0,0,0]))}</div></div></div>
        <div class="a-fig"><div class="l">How they came in</div><div class="stack"><i style="flex:24"></i><i class="b" style="flex:11"></i><i class="c" style="flex:7"></i></div>
          <div class="leg"><span>Kiosk 24</span><span>Desk scan 11</span><span>Typed 7</span></div></div>
        <div class="a-fig" style="display:flex;gap:24px"><div><div class="l">Walk-ins</div><div class="n">3</div><div class="d">₱450 in the drawer</div></div>
          <div><div class="l">Members this week</div><div class="n">96</div><div class="d">of 128 active, 75%</div></div></div>
      </section>
      <section class="box" style="flex:1">
        <header><h2>At the door</h2></header>
        <div class="kv">{I("tablet", 18)}<div class="t"><b>Kiosk</b><span><span class="dot"></span> 24 today · last 5:48 pm</span></div><button class="btn sm">Open</button></div>
        <div class="kv">{I("tv", 18)}<div class="t"><b>Lobby TV</b><span>Classes, records and the gym goal</span></div><button class="btn sm">Open</button></div>
        <div class="kv">{I("coach", 18)}<div class="t"><b>2 of 3 coaches in</b><span>Jen 5:50 am · Dante 1:10 pm</span></div><button class="btn sm">See all</button></div>
        <div class="kv" style="border:0"><span></span><div class="t"><span style="color:var(--primary-fg);font-weight:600">How the kiosk works</span></div></div>
      </section>
    </div>
  </div></div>'''
(here / 'attendance-a.html').write_text(shell('Attendance A: desk console', A, A_CSS), encoding='utf-8')

# ── B: log first. Search across the top, the day's figures as one strip, the log fills the page; door and coaches in the head.
B_CSS = '''
.strip2 { display: grid; grid-template-columns: minmax(0,1.3fr) repeat(3, minmax(0,1fr)); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; flex: none; }
.strip2 > div { padding: 12px 16px; min-width: 0; } .strip2 > div + div { border-left: 1px solid var(--line); }
.strip2 .l { font-size: 12px; color: var(--text-2); } .strip2 .n { font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
.strip2 .n.hero { font-size: 36px; letter-spacing: -.04em; line-height: 1.05; } .strip2 .d { font-size: 12px; color: var(--text-3); }
.ph .tools { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.coachchip { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line-strong); color: var(--text-2); font-weight: 600; }
.bar1 { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; flex: none; }
'''
B = f'''<div class="pg">
  <div class="ph"><div><h1>Attendance</h1><p><span class="live">Live</span> · Sunday, 22 November · open until 10:00 pm</p></div>
    <div class="tools"><span class="coachchip">{I("coach", 14)}2 of 3 coaches in</span><button class="btn">{I("tablet", 14)}Kiosk</button><button class="btn">{I("tv", 14)}Lobby TV</button>
      <div class="seg2"><a class="on">Today<em>42</em></a><a>Walk-ins<em>3</em></a><a>History</a></div></div></div>
  <section class="box" style="flex:none"><div style="padding:16px;display:flex;flex-direction:column;gap:12px">{FIND}<div class="bar1">{TAGS}<span></span></div>{OK}</div></section>
  <section class="strip2">
    <div style="display:flex;gap:16px;align-items:flex-end"><div><div class="l">Checked in today</div><div class="n hero">42</div><div class="d">9 more than last Sunday</div></div>
      <div class="spark" style="flex:1">{"".join(f'<i style="height:{h}%"{" class=f" if k > 11 else ""}></i>' for k, h in enumerate([30,80,60,40,20,20,10,45,35,25,40,55,0,0,0,0,0]))}</div></div>
    <div><div class="l">How they came in</div><div class="stack"><i style="flex:24"></i><i class="b" style="flex:11"></i><i class="c" style="flex:7"></i></div><div class="leg"><span>Kiosk 24</span><span>Desk 11</span><span>Typed 7</span></div></div>
    <div><div class="l">Walk-ins</div><div class="n">3</div><div class="d">₱450 in the drawer</div></div>
    <div><div class="l">Members this week</div><div class="n">96</div><div class="d">of 128 active, 75%</div></div>
  </section>
  <section class="box" style="flex:1">
    <header><h2>Today's check-ins <span class="count">42</span></h2><span class="aside"><span class="seg2"><a class="on">All</a><a>Kiosk<em>24</em></a><a>Desk scan<em>11</em></a><a>Typed<em>7</em></a></span>
      <span class="mini">{I("search", 14)}Find in today</span><button class="btn sm">{I("down", 14)}Export</button></span></header>
    <div class="scroll"><table class="log">{TH}<tbody>{log(10)}</tbody></table></div>
  </section></div>'''
(here / 'attendance-b.html').write_text(shell('Attendance B: log first', B, B_CSS), encoding='utf-8')
print('ok')
