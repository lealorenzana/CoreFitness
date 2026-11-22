# Notifications mock-up inside shell B. Sample data.
import pathlib, re
here = pathlib.Path(__file__).parent
att = (here / 'make_attendance.py').read_text(encoding='utf-8')
ns = {'__file__': str(here / 'make_attendance.py')}
exec(att.split('# ── A: the desk console')[0], ns)   # reuse P, I, shell(), COMMON
I, shell = ns['I'], ns['shell']

CSS = '''
.ib { flex: 1; min-height: 0; display: grid; grid-template-columns: 240px minmax(0, 1fr) minmax(0, 1.1fr); gap: 0;
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.ib > section { min-height: 0; display: flex; flex-direction: column; }
.ib > section + section { border-left: 1px solid var(--line); }
.fold { padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
.fold a { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; border-radius: 6px; color: var(--text-2); cursor: pointer; }
.fold a.on { background: var(--raised); color: var(--text); font-weight: 600; }
.fold a .c { margin-left: auto; font-size: 12px; color: var(--text-3); }
.fold a .c.warn { color: var(--action); font-weight: 650; }
.fold h4 { font-size: 12px; color: var(--text-3); font-weight: 500; padding: 14px 10px 6px; }
.tb { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); flex: none; }
.tb .mini { flex: 1; }
.cb { width: 14px; height: 14px; border: 1px solid var(--line-strong); border-radius: 3px; flex: none; }
.msg { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); cursor: pointer; align-items: flex-start; }
.msg.on { background: var(--raised); box-shadow: inset 2px 0 0 var(--primary-fg); }
.msg .u { width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; flex: none; background: transparent; }
.msg .u.on { background: var(--primary-fg); }
.msg .t { flex: 1; min-width: 0; }
.msg .t .h { display: flex; gap: 8px; } .msg .t .h b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.msg .t .h b.read { font-weight: 500; color: var(--text-2); }
.msg .t .h time { font-size: 12px; color: var(--text-3); flex: none; }
.msg .t p { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.msg .k { font-size: 12px; color: var(--text-3); }
.day { font-size: 12px; color: var(--text-3); padding: 12px 16px 4px; }
.rd { flex: 1; min-height: 0; padding: 24px; overflow: auto; }
.rd .kind { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }
.rd h2 { font-size: 20px; font-weight: 650; letter-spacing: -.01em; margin-top: 10px; text-wrap: balance; }
.rd .when { font-size: 12px; color: var(--text-3); margin-top: 4px; }
.rd .body { font-size: 14px; line-height: 1.6; margin-top: 18px; max-width: 60ch; }
.rd-act { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); flex: none; }
.rd-top { height: 52px; display: flex; align-items: center; gap: 4px; padding: 0 12px 0 24px; border-bottom: 1px solid var(--line); flex: none; color: var(--text-3); font-size: 12px; }
.rd-top .sp { flex: 1; }
'''
MSGS = [('Coach accepted, your turn', 'The coach accepted this class booking: Pia Garcia, Morning HIIT. Confirm it on Bookings.', 'Oct 27', True, 'Bookings'),
        ('Coach accepted, your turn', 'The coach accepted this 1-on-1: Lea Lorenzana, Oct 27, 5:00 PM. Confirm it on Bookings.', 'Oct 27', True, 'Bookings'),
        ('Coach accepted, your turn', 'The coach accepted this class booking: Pia Garcia, Strength Basics. Confirm it on Bookings.', 'Oct 27', True, 'Bookings'),
        ('Weekly backup finished', 'Your gym\'s data was backed up. Nothing to do.', 'Oct 25', False, 'Gym system'),
        ('New version of the app', 'The member app updated itself on every phone.', 'Oct 21', False, 'Gym system')]
rows = '<p class="day">Earlier</p>' + ''.join(
    f'<div class="msg{" on" if i == 0 else ""}"><span class="cb"></span><span class="u{" on" if un else ""}"></span>'
    f'<div class="t"><div class="h"><b class="{"" if un else "read"}">{t}</b><time>{d}</time></div><p>{m}</p></div></div>'
    for i, (t, m, d, un, k) in enumerate(MSGS))
body = f'''<div class="pg">
  <div class="ph"><div><h1>Notifications</h1><p>What needs you now, and every message sent to you.</p></div>
    <div style="margin-left:auto"><button class="btn">{I("check", 14)}Mark all as read</button></div></div>
  <div class="ib">
    <section><nav class="fold">
      <a>Needs attention<span class="c warn">27</span></a>
      <a class="on">Unread<span class="c">3</span></a><a>All<span class="c">5</span></a><a>Archived<span class="c">0</span></a>
      <h4>Kinds</h4><a>Bookings<span class="c">3 new</span></a><a>Gym system<span class="c">2</span></a>
    </nav></section>
    <section>
      <div class="tb"><span class="cb"></span><span class="mini">{I("search", 14)}Search messages</span></div>
      <div class="scroll">{rows}</div>
      <div class="tb" style="border-top:1px solid var(--line);border-bottom:0;height:44px;color:var(--text-3);font-size:12px">1 to 5 of 5 messages</div>
    </section>
    <section>
      <div class="rd-top"><span class="kind">{I("bell", 14)}Bookings</span><span class="sp"></span><button class="ico-btn">{I("check", 16)}</button><button class="ico-btn">{I("undo", 16)}</button></div>
      <div class="rd"><h2>Coach accepted, your turn</h2><p class="when">Received Tuesday, 27 October, 5:12 pm</p>
        <p class="body">The coach accepted this class booking: Pia Garcia, Morning HIIT. Confirm it on Bookings.</p></div>
      <div class="rd-act"><button class="btn go">Open Bookings</button><button class="btn">Archive</button><button class="btn" style="margin-left:auto;border:0;color:var(--text-2)">Delete</button></div>
    </section>
  </div></div>'''
(here / 'inbox.html').write_text(shell('Notifications: inbox', body, CSS).replace('<a class="on">Attendance</a><a>Notifications</a>', '<a>Attendance</a><a class="on">Notifications</a>'), encoding='utf-8')
print('ok')
