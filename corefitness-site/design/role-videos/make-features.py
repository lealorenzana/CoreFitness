"""Writes the six feature videos (one HyperFrames project each) from one page shell.
Each scene: the real Lab capture, dimmed, with rebuilt pieces popping out of it (owner's reference style).
Every word and number comes from that capture or the app's own strings; the rest is labelled demo data."""
import os, shutil

TICK = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
CURSOR = '<svg id="cursor" width="52" height="62" viewBox="0 0 22 26"><path d="M2 2l17 12-7.5 1.2L15.5 23l-3.4 1.5-3.6-7.8L2 21.5z" fill="#fff" stroke="#17121e" stroke-width="1.6" stroke-linejoin="round"/></svg>'

SHELL = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={w}, height={h}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <script src="assets/kit.js"></script>
    <link rel="stylesheet" href="assets/pieces.css" />
    <style>
      html, body {{ width: {w}px; height: {h}px; }}
{css}
    </style>
  </head>
  <body>
    <div id="root" class="phone" data-composition-id="{id}" data-start="0" data-duration="8" data-fps="30" data-width="{w}" data-height="{h}">
      <!-- The real Core Fitness Lab member app, demo records. -->
      <img id="screen" class="clip" src="assets/{img}" alt="" data-start="0" data-duration="8" data-track-index="0" />
      <div id="dim" class="clip" data-start="0" data-duration="8" data-track-index="1"><i></i></div>
      <div id="pieces" class="clip" data-start="0" data-duration="8" data-track-index="2">
{body}
      </div>
      <div id="cursor-host" class="clip" data-start="0" data-duration="8" data-track-index="3">{cursor}</div>
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      const k = kit(tl);
{js}
      window.__timelines['{id}'] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""

V = {}

V['checkin'] = dict(img='member-qr.png', w=540, h=1170, css="""
      #code { left: 50px; top: 130px; width: 440px; text-align: center; }
      .frame { position: relative; width: 300px; height: 300px; margin: 6px auto 20px; }
      .frame img { display: block; width: 100%; height: 100%; border-radius: 22px; }
      .corner { position: absolute; width: 64px; height: 64px; border: 8px solid #7c3aed; }
      .c1 { left: -16px; top: -16px; border-right: 0; border-bottom: 0; border-radius: 20px 0 0 0; }
      .c2 { right: -16px; top: -16px; border-left: 0; border-bottom: 0; border-radius: 0 20px 0 0; }
      .c3 { left: -16px; bottom: -16px; border-right: 0; border-top: 0; border-radius: 0 0 0 20px; }
      .c4 { right: -16px; bottom: -16px; border-left: 0; border-top: 0; border-radius: 0 0 20px 0; }
      #beam { position: absolute; left: -8px; right: -8px; top: 0; height: 7px; border-radius: 4px; background: #f5a524; box-shadow: 0 0 24px #f5a524; opacity: 0; }
      #flash { position: absolute; inset: 0; border-radius: 22px; background: #7c3aed; opacity: 0; }
      .refresh { height: 10px; border-radius: 5px; background: rgba(255,255,255,0.1); overflow: hidden; margin: 0 20px 12px; }
      .refresh i { display: block; height: 100%; background: #7c3aed; transform-origin: 0 50%; }
      #ok { left: 50px; top: 740px; width: 440px; }
      #note { position: absolute; left: 50px; top: 870px; width: 440px; text-align: center; font-size: 25px; color: #c9bddb; background: #1f1829; border: 2px solid rgba(255,255,255,0.1); border-radius: 22px; padding: 16px 20px; box-shadow: 0 20px 40px rgba(8,4,14,0.5); }""",
  body=f"""        <div id="code" class="card"><div class="card-head">Check in</div>
          <div class="frame"><img id="qr" src="assets/qr.svg" alt="" /><i id="flash"></i><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i><i id="beam"></i></div>
          <div class="refresh"><i id="bar"></i></div><span class="lab">Refreshes itself every 60 seconds</span></div>
        <div id="ok" class="chip"><span class="tick">{TICK}</span><div><b>Checked in</b><span>Boxing · your usual</span></div></div>
        <div id="note">The desk can still change it.</div>""",
  cursor='', js="""
      k.dim(0.4, 7.0);
      k.pop('#code', 0.7);
      tl.fromTo('#bar', { scaleX: 1 }, { scaleX: 0.15, duration: 1.4, ease: 'none' }, 1.0);
      // The code refreshes itself: it turns over and comes back new (mirrored), the timer starts again.
      tl.to('#qr', { rotationY: 90, duration: 0.18, ease: 'power2.in' }, 2.4);
      tl.set('#qr', { scaleX: -1 }, 2.58);
      tl.fromTo('#qr', { rotationY: -90 }, { rotationY: 0, duration: 0.2, ease: 'power2.out', immediateRender: false }, 2.58);
      tl.to('#bar', { scaleX: 1, duration: 0.2 }, 2.6);
      tl.to('#bar', { scaleX: 0.6, duration: 2.6, ease: 'none' }, 2.85);
      // The desk scans it.
      tl.to('#beam', { opacity: 1, duration: 0.1 }, 3.2);
      tl.fromTo('#beam', { y: 0 }, { y: 292, duration: 0.55, ease: 'power1.inOut', yoyo: true, repeat: 1 }, 3.2);
      tl.to('#beam', { opacity: 0, duration: 0.1 }, 4.3);
      tl.fromTo('#flash', { opacity: 0 }, { opacity: 0.55, duration: 0.1, yoyo: true, repeat: 1 }, 4.3);
      k.pop('#ok', 4.45);
      tl.fromTo('#note', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }, 4.6);
      k.away(['#note', '#ok', '#code'], 6.6, 40);""")

V['workout'] = dict(img='workout-player.png', w=540, h=1170, css="""
      #ex { left: 26px; top: 250px; width: 488px; }
      .set { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-top: 2px solid rgba(255,255,255,0.07); }
      .set > span:first-child { width: 90px; color: #b3a5c6; font-size: 25px; }
      .set b { flex: 1; font-size: 31px; }
      .box { position: relative; overflow: hidden; width: 62px; height: 62px; border-radius: 18px; display: grid; place-items: center; border: 2px solid rgba(255,255,255,0.2); }
      .box.on { background: #7c3aed; border-color: #7c3aed; }
      #rest { left: 26px; top: 600px; width: 488px; }
      #rest .num { font-size: 64px; }
      #finish { position: absolute; left: 26px; top: 780px; width: 488px; text-align: center; padding: 20px; font-size: 28px; }
      #prog { left: 26px; top: 600px; width: 488px; display: block; }
      .segs { display: flex; gap: 10px; margin-top: 14px; }
      .segs i { flex: 1; height: 12px; border-radius: 6px; background: rgba(255,255,255,0.12); }
      #seg1 { background: #f5a524; transform-origin: 0 50%; }""",
  body=f"""        <div id="ex" class="card"><div class="card-head">Barbell Squat <em>2 × 10 @ 60 kg</em></div>
          <div class="set" id="s1"><span>Set 1</span><b>60 kg × 10</b><span class="box on">{TICK}</span></div>
          <div class="set" id="s2"><span>Set 2</span><b>60 kg × 10</b><span class="box" id="box2"><span id="t2">{TICK}</span><i class="ripple" id="rip2"></i></span></div></div>
        <div id="rest" class="chip"><div><span class="lab">Rest</span><b class="num" id="clock">0:30</b></div></div>
        <span class="btn amber" id="finish">Finish exercise<i class="ripple" id="rip3"></i></span>
        <div id="prog" class="chip"><b id="ptxt">Exercise 1 of 3 · 0 done</b><div class="segs"><i id="seg1"></i><i></i><i></i></div></div>""",
  cursor=CURSOR, js="""
      k.dim(0.4, 7.0);
      k.pop('#ex', 0.7);
      k.stack(['#s1', '#s2'], 0.95);
      tl.fromTo('#t2', { opacity: 0 }, { opacity: 0, duration: 0.01 }, 0);
      tl.set('#seg1', { scaleX: 0 }, 0);
      k.cursorIn(470, 1100, 1.4);
      k.tap('box2', 2.3, 'rip2');
      tl.fromTo('#box2', { backgroundColor: 'rgba(124,58,237,0)', borderColor: 'rgba(255,255,255,0.2)' }, { backgroundColor: 'rgba(124,58,237,1)', borderColor: 'rgba(124,58,237,1)', duration: 0.15 }, 2.36);
      tl.to('#t2', { opacity: 1, duration: 0.15 }, 2.38);
      // The rest timer starts on its own and counts down.
      k.pop('#rest', 2.6);
      k.count('clock', 30, 26, 2.9, 1.2, (n) => '0:' + String(Math.ceil(n)).padStart(2, '0'));
      k.pop('#finish', 3.3);
      k.tap('finish', 4.5, 'rip3');
      k.away('#rest', 4.5, 0);
      k.pop('#prog', 4.65);
      k.flip(5.0, (d) => { k.$('ptxt').textContent = d ? 'Exercise 2 of 3 · 1 done' : 'Exercise 1 of 3 · 0 done'; });
      tl.to('#seg1', { scaleX: 1, duration: 0.4, ease: 'power2.out' }, 5.0);
      k.glide({ x: 380, y: 1060 }, 5.2);
      tl.to('#cursor', { opacity: 0, duration: 0.25 }, 6.3);
      k.away(['#prog', '#finish', '#ex'], 6.6, 40);""")

V['progress'] = dict(img='member-progress.png', w=540, h=912, css="""
      #stats { left: 26px; top: 96px; width: 488px; }
      .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
      .three .num { font-size: 58px; }
      .three .lab { font-size: 22px; margin: 6px 0 0; }
      #best { left: 26px; top: 380px; width: 488px; display: block; }
      .weeks { display: flex; gap: 10px; margin-top: 14px; }
      .weeks i { flex: 1; height: 46px; border-radius: 12px; background: #7c3aed; }
      #recent { left: 26px; top: 590px; width: 488px; }
      .day { flex: none; width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center; text-align: center; font-size: 17px; line-height: 1.05; color: #c9bddb; border: 2px solid rgba(255,255,255,0.14); }
      .day b { font-size: 25px !important; color: #fff; }""",
  body="""        <div id="stats" class="card"><div class="card-head">Progress</div><div class="three">
          <div><b class="num" id="a">0</b><span class="lab">training days</span></div>
          <div><b class="num" id="b">0</b><span class="lab">weeks with two or more</span></div>
          <div><b class="num" id="c">0</b><span class="lab">days as a member</span></div></div></div>
        <div id="best" class="chip"><b>Your best streak: 6 weeks</b><span class="lab" style="margin:4px 0 0">Train 3 days in a week to start a new one</span>
          <div class="weeks"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        <div id="recent" class="card"><div class="card-head">Recent workouts</div>
          <div class="row" id="w1"><span class="day">OCT<b>27</b></span><div><b>Push day</b><span>1 min</span></div></div>
          <div class="row" id="w2"><span class="day">OCT<b>16</b></span><div><b>Program day</b><span>50 min</span></div></div></div>""",
  cursor='', js="""
      k.dim(0.4, 7.0);
      k.pop('#stats', 0.7);
      k.count('a', 0, 303, 0.95); k.count('b', 0, 90, 1.05); k.count('c', 0, 409, 1.15);
      k.pop('#best', 2.6);
      tl.fromTo('#best .weeks i', { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.3, stagger: 0.12, ease: 'back.out(2)' }, 2.95);
      k.pop('#recent', 4.0);
      k.stack(['#w1', '#w2'], 4.25, 0.25);
      k.away(['#recent', '#best', '#stats'], 6.5, 40);""")

V['bookings'] = dict(img='member-bookings.png', w=540, h=912, css="""
      #open { left: 26px; top: 110px; width: 488px; }
      #open p { font-size: 25px; color: #c9bddb; line-height: 1.35; }
      #book { display: block; text-align: center; margin-top: 20px; padding: 18px; font-size: 28px; }
      #req { left: 26px; top: 110px; width: 488px; display: block; }
      #req .lab { margin-bottom: 12px; }
      .when { font-size: 34px !important; }
      #pill { display: table; margin-top: 16px; font-size: 25px; font-weight: 700; padding: 8px 18px; border-radius: 999px; color: #f5a524; background: rgba(245,165,36,0.16); }
      #hint { position: absolute; left: 26px; top: 470px; width: 488px; font-size: 25px; color: #c9bddb; line-height: 1.35; background: #1f1829; border: 2px solid rgba(255,255,255,0.1); border-radius: 22px; padding: 16px 20px; box-shadow: 0 20px 40px rgba(8,4,14,0.5); }
      #tabs { left: 26px; top: 640px; width: 488px; }""",
  body="""        <div id="open" class="card"><div class="card-head">Your week is open</div><p>Book a class or a 1-on-1.</p><span class="btn amber" id="book">Book a session<i class="ripple" id="rip"></i></span></div>
        <div id="req" class="chip"><span class="lab">Next session</span><b class="when">Sun, Nov 1 · 10:00 AM</b><span>1-on-1 with Gabby Coach</span><em id="pill">Requested</em></div>
        <div id="hint">It shows here straight away, even before the coach confirms it.</div>
        <div id="tabs" class="chip"><div><b id="up">Upcoming · 0</b><span>Past · 64 · Cancelled · 0</span></div></div>""",
  cursor=CURSOR, js="""
      k.dim(0.4, 7.0);
      k.pop('#open', 0.6);
      k.cursorIn(470, 860, 0.9);
      k.tap('book', 2.1, 'rip');
      k.away('#open', 2.3, -20);
      k.pop('#req', 2.5);
      tl.fromTo('#hint', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 2.8);
      k.pop('#tabs', 3.2);
      k.flip(3.5, (d) => { k.$('up').textContent = d ? 'Upcoming · 1' : 'Upcoming · 0'; });
      k.glide({ x: 420, y: 820 }, 2.45);
      // The coach accepts: the pill turns violet with a bounce.
      k.flip(4.4, (d) => { const p = k.$('pill'); p.textContent = d ? 'Accepted' : 'Requested'; p.style.color = d ? '#efe7ff' : '#f5a524'; p.style.background = d ? 'rgba(124,58,237,0.6)' : 'rgba(245,165,36,0.16)'; });
      tl.fromTo('#pill', { scale: 1 }, { scale: 1.15, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, 4.4);
      tl.to('#cursor', { opacity: 0, duration: 0.25 }, 6.2);
      k.away(['#tabs', '#hint', '#req'], 6.5, 40);""")

V['assistant'] = dict(img='member-assistant.png', w=540, h=1170, css="""
      .bubble { position: absolute; max-width: 400px; padding: 18px 22px; border-radius: 26px; font-size: 27px; line-height: 1.3; }
      .me { right: 26px; background: #7c3aed; border-bottom-right-radius: 8px; }
      .ai { left: 26px; background: #1f1829; border: 2px solid rgba(255,255,255,0.1); border-bottom-left-radius: 8px; }
      #q1 { top: 230px; } #typing { top: 330px; } #a1 { top: 330px; } #q2 { top: 500px; }
      #typing i { display: inline-block; width: 12px; height: 12px; margin: 0 4px; border-radius: 50%; background: #c9bddb; }
      #prop { left: 26px; top: 600px; width: 488px; display: block; }
      #prop .lab { color: #f5a524; font-weight: 700; }
      .two { display: flex; gap: 12px; margin-top: 18px; }
      .two .btn { flex: 1; text-align: center; padding: 14px; }
      #chips { position: absolute; left: 20px; right: 20px; top: 930px; display: flex; flex-wrap: wrap; gap: 12px; }
      #chips span { font-size: 25px; font-weight: 700; padding: 12px 20px; border-radius: 999px; background: #1f1829; border: 2px solid rgba(124,58,237,0.6); }""",
  body="""        <div id="chips"><span id="hours">Hours</span><span>Pricing</span><span>Trainers</span><span>Book a class</span></div>
        <div id="q1" class="bubble me">Hours</div>
        <div id="typing" class="bubble ai"><i></i><i></i><i></i></div>
        <div id="a1" class="bubble ai">Today the gym is open 6:00 am to 9:00 pm.</div>
        <div id="q2" class="bubble me">Put leg day on Friday</div>
        <div id="prop" class="chip"><span class="lab">A suggestion</span><b id="ptxt">Add Leg day to Friday</b><span id="psub">Nothing changes until you tap Apply</span>
          <div class="two" id="btns"><span class="btn amber" id="apply">Apply<i class="ripple" id="rip"></i></span><span class="btn">Discard</span></div></div>""",
  cursor=CURSOR, js="""
      k.dim(0.4, 7.0);
      tl.fromTo('#chips span', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.08, ease: 'back.out(1.6)' }, 0.6);
      k.cursorIn(300, 1120, 0.9);
      k.tap('hours', 1.7);
      k.pop('#q1', 1.85);
      k.pop('#typing', 2.2);
      tl.to('#typing i', { y: -8, duration: 0.18, stagger: 0.1, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 2.3);
      tl.to('#typing', { opacity: 0, duration: 0.12 }, 3.05);
      k.pop('#a1', 3.1);
      k.pop('#q2', 3.55);
      k.pop('#prop', 3.9);
      k.tap('apply', 5.2, 'rip');
      k.flip(5.3, (d) => { k.$('ptxt').textContent = d ? 'Leg day added to Friday' : 'Add Leg day to Friday'; k.$('psub').textContent = d ? 'You can undo it' : 'Nothing changes until you tap Apply'; });
      tl.to('#btns', { opacity: 0, duration: 0.2 }, 5.3);
      k.glide({ x: 420, y: 1080 }, 5.4);
      tl.to('#cursor', { opacity: 0, duration: 0.25 }, 6.2);
      k.away(['#prop', '#q2', '#a1', '#q1', '#chips'], 6.6, 30);""")

V['renewal'] = dict(img='member-renewal.png', w=540, h=1170, css="""
      #mem { left: 26px; top: 150px; width: 488px; display: block; }
      #mem .num { font-size: 72px; }
      .track { height: 14px; border-radius: 7px; background: rgba(255,255,255,0.1); margin: 16px 0 22px; overflow: hidden; }
      #fill { display: block; height: 100%; width: 41.7%; background: #7c3aed; transform-origin: 0 50%; }
      #renew { display: block; text-align: center; padding: 18px; font-size: 27px; }
      #sheet { left: 26px; top: 560px; width: 488px; }
      #sheet .row { border: 2px solid rgba(255,255,255,0.1); margin: 10px 0 0; }
      #done { left: 26px; top: 920px; width: 488px; }""",
  body=f"""        <div id="mem" class="chip"><span class="lab">Premium · active</span><b class="num"><span id="days">0</span><em style="font-style:normal;font-size:30px;color:#b3a5c6"> of 60 days left</em></b>
          <div class="track"><i id="fill"></i></div><span class="btn amber" id="renew">Renew or change plan<i class="ripple" id="rip"></i></span></div>
        <div id="sheet" class="card"><div class="card-head">Renew Premium</div>
          <div class="row"><div><b>Pay in the app</b><span>QRPh, GCash, Maya or card</span></div></div>
          <div class="row" id="desk"><div><b>Pay at the desk</b><span>Cash at the front desk</span></div><i class="ripple" id="rip2"></i></div></div>
        <div id="done" class="chip"><span class="tick">{TICK}</span><div><b>Renewal requested · Quarterly</b><span>The desk knows you are coming</span></div></div>""",
  cursor=CURSOR, js="""
      k.dim(0.4, 7.0);
      k.pop('#mem', 0.7);
      k.count('days', 0, 25, 0.95, 1.2);
      tl.fromTo('#fill', { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power2.out' }, 0.95);
      k.cursorIn(300, 1120, 1.5);
      k.tap('renew', 2.5, 'rip');
      k.pop('#sheet', 2.7);
      k.tap('desk', 4.0, 'rip2');
      tl.fromTo('#desk', { backgroundColor: 'rgba(124,58,237,0)' }, { backgroundColor: 'rgba(124,58,237,0.35)', duration: 0.2 }, 4.05);
      k.pop('#done', 4.4);
      k.glide({ x: 430, y: 1120 }, 4.7);
      tl.to('#cursor', { opacity: 0, duration: 0.25 }, 6.2);
      k.away(['#done', '#sheet', '#mem'], 6.4, 40);""")

SRC = r'C:\Users\USER\Documents\GABBY FILES\EYA MI AMOR\EYA CAPSTONE FILES\CAPSTONE PROJ SYSTEM\main\CoreFitness\corefitness-site\design\website-mockup-v2\public\mockup-art'
for vid, v in V.items():
    os.makedirs(f'{vid}/assets', exist_ok=True)
    shutil.copy(os.path.join(SRC, v['img']), f'{vid}/assets/')
    with open(f'{vid}/index.html', 'w', encoding='utf8') as f:
        f.write(SHELL.format(id=vid, **v))
print('wrote', ', '.join(V))
