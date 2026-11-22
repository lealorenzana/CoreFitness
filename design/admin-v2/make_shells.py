# Builds shell-a.html and shell-b.html around the chosen dashboard (dashboard-b.html). Sample data.
import re, pathlib
here = pathlib.Path(__file__).parent
src = (here / 'dashboard-b.html').read_text(encoding='utf-8')
style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
page = re.search(r'(<div class="page">.*?</div></div></div>)', src, re.S).group(1)[:-len('</div></div>')]
script = re.search(r'(<script>\s*// The gym.*?</script>)', src, re.S).group(1)

P = {  # lucide-like paths
  'home': 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', 'bell': 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4',
  'check': 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', 'people': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  'pt': 'M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M2 11v2M22 11v2', 'cal': 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', 'card': 'M2 6h20v12H2zM2 10h20',
  'chart': 'M3 3v18h18M7 15l4-4 3 3 5-6', 'trophy': 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  'msg': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5V22h16',
  'gear': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  'help': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', 'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  'sun': 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  'swap': 'M7 15l-4-4 4-4M3 11h14M17 9l4 4-4 4M21 13H7', 'dots': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  'app': 'M7 2h10v20H7zM11 18h2', 'qr': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3z',
}
I = lambda k: f'<svg class="i" viewBox="0 0 24 24"><path d="{P[k]}"/></svg>'

head = lambda title, extra: f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="mock.css"><link rel="stylesheet" href="shell2.css"><style>{style}{extra}</style></head><body>'''
modejs = '<script>document.documentElement.dataset.mode = new URLSearchParams(location.search).get("mode") === "light" ? "light" : "dark";</script>'

# ── A ──
def a_link(label, icon, on=False, badge=''):
    return f'<a class="{"on" if on else ""}">{I(icon)}{label}{badge}</a>'
a_nav = ''.join([
  a_link('Today', 'home', True), a_link('Notifications', 'bell', badge='<span class="badge due">30</span>'), a_link('Attendance', 'check'),
  '<div class="gap"></div>',
  f'<div class="sec">{I("people")}People<span class="chev">›</span></div>',
  a_link('Personal training', 'pt', badge='<span class="badge due">15</span>'),
  f'<div class="sec">{I("cal")}Classes<span class="chev">›</span></div>',
  f'<div class="sec">{I("card")}Billing<span class="chev">›</span></div>',
  f'<div class="sec">{I("chart")}Reports<span class="chev">›</span></div>',
  f'<div class="sec">{I("trophy")}Engagement<span class="chev">›</span></div>',
  '<div class="gap"></div>',
  a_link('Communications', 'msg'), a_link('Gym chat', 'msg'),
  f'<div class="sec">{I("book")}Training<span class="chev">›</span></div>',
  '<div class="gap"></div>',
  a_link('Your app', 'app'), a_link('Settings', 'gear'), a_link('Your plan', 'card'), a_link('Help', 'help'),
])
a = head('Shell A: sections', '') + f'''
<div class="sa"><aside class="sa-side">
  <div class="sa-gym"><span class="logo">CF</span><span style="min-width:0"><b>Core Fitness Lab</b><small>Mamburao</small></span><span class="sw" title="Switch gym">{I("swap")}</span></div>
  <nav class="sa-nav">{a_nav}</nav>
  <div class="sa-me"><span class="av">GO</span><span><b>Gabby Owner</b><small>Owner</small></span><span class="more">{I("dots")}</span></div>
</aside>
<div class="main">
  <div class="sa-top">
    <div class="crumb"><b>Today</b></div>
    <div class="cmd">{I("search")}Search members, payments, pages<span class="kbd">Ctrl K</span></div>
    <button class="ico-btn" title="Light or dark">{I("sun")}</button>
    <button class="ico-btn" title="Alerts">{I("bell")}<span class="n">30</span></button>
  </div>
  {page}
</div></div>
<span class="ann">Shell A · sample data</span>
{modejs}{script}</body></html>'''
(here / 'shell-a.html').write_text(a, encoding='utf-8')

# ── B ──
rail = [('Desk', 'home', True, True), ('People', 'people', False, False), ('Coaching', 'pt', False, True), ('Money', 'card', False, False),
        ('Reports', 'chart', False, False), ('Engage', 'trophy', False, False), ('Messages', 'msg', False, False), ('Library', 'book', False, False)]
rail_html = ''.join(f'<a class="{"on" if on else ""}">{I(ic)}{lb}{"<span class=dot></span>" if dot else ""}</a>' for lb, ic, on, dot in rail)
b = head('Shell B: rail and tabs', '') + f'''
<div class="sb"><nav class="sb-rail">
  <span class="logo">CF</span>{rail_html}
  <a class="push">{I("gear")}Gym</a><a>{I("help")}Help</a>
  <span class="av me">GO</span>
</nav>
<div class="main">
  <div class="sb-top">
    <div class="row1">
      <span class="gymname">Core Fitness Lab <small>Mamburao</small></span>
      <div class="cmd">{I("search")}Search members, payments, pages<span class="kbd">Ctrl K</span></div>
      <button class="ico-btn" title="Light or dark">{I("sun")}</button>
      <button class="ico-btn" title="Alerts">{I("bell")}<span class="n">30</span></button>
    </div>
    <div class="row2"><span class="sec">Desk</span><a class="on">Today</a><a>Attendance</a><a>Notifications</a></div>
  </div>
  {page}
</div></div>
<span class="ann">Shell B · sample data</span>
{modejs}{script}</body></html>'''
(here / 'shell-b.html').write_text(b, encoding='utf-8')
print('ok')
