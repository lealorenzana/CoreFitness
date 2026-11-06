/**
 * Light mode (0234) on the member and coach app: with the device in light mode and
 * no choice saved, the app is light; every main screen and the More sheet keep
 * their text readable (contrast of at least 3:1 against what is behind it); a
 * premium theme takes its light version; a saved Dark wins over the device.
 *
 * Fixture from member-theme-check.js. Member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sessionFor = (id, email) => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} },
  });
  const now = new Date();
  const dstr = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const iso = (d, h, m = 0) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const MEMBER = 'a3f92b00-0000-4000-8000-000000000001';
  const COACH = 'b7c2d100-0000-4000-8000-000000000002';
  const ME = { id: MEMBER, first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@door-test.com', role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9) };
  const COACH_ROW = { id: COACH, first_name: 'Gabby', last_name: 'Coach', email: 'coach@door-test.com', role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9) };
  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30, is_active: true, description: 'All',
    can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };
  const DB = {
    profiles: [ME, COACH_ROW],
    member_profiles: [{ profile_id: MEMBER, experience_level: 'beginner', qr_code: MEMBER, created_at: iso(-90, 9), profiles: ME }],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: MEMBER, plan_id: 'p3', status: 'active', start_date: dstr(-5), expiry_date: dstr(25), never_expires: false, frozen_at: null, created_at: iso(-5, 9), membership_plans: PREMIUM }],
    attendance: [{ id: 'a1', member_id: MEMBER, check_in_time: iso(-2, 18), method: 'qr', activity: 'Class' }],
    gym_settings: [{ id: true, gym_name: 'Core Fitness Lab', address: 'Mamburao', phone: null, email: null, opening_time: '06:00', closing_time: '21:00',
      // The Lab's real list (2026-10-18): thirty of them pushed the QR off the sheet.
      activity_options: ['Strength', 'Free Weights', 'Weight Machines', 'Bodyweight', 'Cardio', 'Treadmill', 'Stationary Bike', 'Elliptical', 'Rowing',
        'Jump Rope', 'HIIT', 'Circuit Training', 'Functional Training', 'Core & Abs', 'Group Class', 'Zumba', 'Aerobics', 'Yoga', 'Pilates', 'Spinning',
        'Dance', 'Boxing', 'Muay Thai', 'Martial Arts', 'Stretching & Mobility', 'Sports', 'Personal Training', 'Class', 'Other'], member_activity_pick: true, coach_checkin_on: true, updated_at: iso(0, 9), updated_by: null }],
    checkin_picks: [{ member_id: MEMBER, today: null, today_on: null, usual: 'Cardio' }],
    coach_checkins: [{ id: 'cc1', trainer_id: COACH, day: dstr(-1), check_in_time: iso(-1, 6, 12) }],
  };
  const CALLS = [];
  const match = (rows, params) => rows.filter((r) => params.every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k) || !(k in r)) return true;
    let m = /^eq\.(.*)$/.exec(v); if (m) return String(r[k]) === m[1];
    m = /^gte\.(.*)$/.exec(v); if (m) return String(r[k]) >= m[1];
    m = /^lte\.(.*)$/.exec(v); if (m) return String(r[k]) <= m[1];
    return true;
  }));

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const sub = (() => {
      try {
        const raw = (req.headers()['authorization'] || '').split(' ')[1].split('.')[1];
        return JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).sub;
      } catch { return null; }
    })();
    const me = DB.profiles.find((p) => p.id === sub) ?? ME;
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? sessionFor(me.id, me.email).user : sessionFor(me.id, me.email));
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: me.role, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'set_my_checkin_pick') {
        const row = DB.checkin_picks[0];
        row.today = body.p_activity; row.today_on = dstr(0);
        if (body.p_usual === true) row.usual = body.p_activity; else if (body.p_usual === false) row.usual = null;
        return json([{ today: row.today, usual: row.usual }]);
      }
      if (fn === 'my_features') return json(['workout_tracker'].map((key) => ({ key, label: key, description: key, enabled: true })));
      if (fn === 'my_rooms' || fn === 'my_conversations' || fn === 'review_queue' || fn === 'my_room_photos' || fn === 'room_badges') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
    if (req.method() !== 'GET') return json([], 201);
    const rows = match(DB[t] ?? [], params);
    return json(one ? (rows[0] ?? null) : rows);
  });

  const out = [];
  const has = (label, ok, detail = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + detail}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p, who) => {
    await page.evaluate(([k, s, trainer]) => {
      localStorage.setItem(k, JSON.stringify(s));
      if (trainer) localStorage.setItem('trainerMode', 'true'); else localStorage.removeItem('trainerMode');
    }, [KEY, sessionFor(who.id, who.email), who.role === 'trainer']).catch(() => undefined);
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1800);
  };
  await page.addInitScript(([k, s]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, sessionFor(MEMBER, ME.email)]);

  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  let mode = 'system';
  let premium = null;
  const H = { 'Access-Control-Allow-Origin': '*' };
  const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
  await page.route('**/rest/v1/rpc/my_color_mode', (r) => json(r, mode));
  await page.route('**/rest/v1/rpc/my_gym_premium_theme', (r) => json(r, premium));
  await page.emulateMedia({ colorScheme: 'light' });

  // What the owner asked for (2026-11-03): in light every word is plainly seen, fills are solid, and
  // nothing dark is left behind. Three findings, each walked up to the first painted background:
  //   words (or a field's typed value) under 3:1 against what is behind them;
  //   a gradient behind words — light mode's fills are solid (a photo's scrim is exempt);
  //   a near-black block bigger than a dot — a dark-mode fill that never turned light.
  const faint = () => page.evaluate(() => {
    const rgb = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const kept = (el) => !!el.closest('.keep-dark, img, video, canvas, svg, [data-photo-viewer], [data-tv-preview]');
    // Returns a colour, or 'gradient' when words sit on one, or 'photo' when a picture is behind them.
    const bgOf = (el, ignoreImage) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const img = cs.backgroundImage;
        if (!ignoreImage && img && img !== 'none') return img.includes('url(') ? 'photo' : { grad: `${n.tagName.toLowerCase()}.${String(n.className).split(' ').slice(0, 2).join('.')} ${img.slice(0, 70)}` };
        const c = rgb(cs.backgroundColor); if (c && c[3] > 0.6) return c;
      }
      return [246, 246, 249, 1];
    };
    const label = (el) => `"${String(/^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value : el.textContent ?? '').trim().slice(0, 24)}"`;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5 || kept(el)) continue;
      const field = /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|color|file|hidden/.test(el.type) && el.value?.trim();
      const words = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (field || words) {
        const fg = rgb(cs.color); const bg = bgOf(el, !!field);
        if (bg && bg.grad) { bad.push(`gradient behind ${label(el)} [${bg.grad}]`); continue; }
        if (!fg || !Array.isArray(bg) || fg[3] < 0.5) continue;
        const c = ratio(fg, bg);
        if (c < 3) bad.push(`${label(el)} ${c.toFixed(1)}:1`);
        continue;
      }
      const c = rgb(cs.backgroundColor);
      if (c && c[3] > 0.8 && lum(c) < 0.05 && r.width * r.height > 900) bad.push(`dark block <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}> ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(bad)].slice(0, 8);
  });

  await go('/member/home', ME);
  say('with the device in light mode, the app is light', (await page.evaluate(() => document.documentElement.dataset.mode)) === 'light');
  const bad = [];
  // Every screen a route leads to (App.tsx) — the member's, then the coach's.
  const MEMBER_PAGES = ['home', 'train', 'you', 'membership', 'notifications', 'settings', 'progress', 'achievements', 'rewards', 'chatbot',
    'events', 'trainers', 'coach', 'equipment', 'book-class', 'booking-history', 'sessions', 'book-session', 'workouts', 'workouts/today',
    'programs', 'progress-photos', 'coach-notes', 'shop', 'rooms', 'messages', 'plan', 'track', 'track/log', 'rewards/requests', 'challenges',
    'season', 'season/records', 'squad', 'refer', 'refer/invited', 'challenges/completed', 'activity', 'workout-history', 'body', 'targets',
    'progress/reached', 'progress/readings', 'gym-plan', 'profile', 'profile/edit', 'help', 'change-password', 'change-email', 'payments',
    'renew', 'training', 'pause-or-cancel', 'waiver', 'visits'].map((x) => '/member/' + x);
  const COACH_PAGES = ['home', 'today', 'packages', 'schedule', 'members', 'rooms', 'messages', 'availability', 'equipment', 'profile',
    'settings', 'help', 'exercises', 'achievements', 'notifications'].map((x) => '/trainer/' + x);
  for (const p of [...MEMBER_PAGES, ...COACH_PAGES]) {
    await go(p, p.startsWith('/trainer') ? COACH_ROW : ME);
    await page.waitForTimeout(600);
    const f = await faint();
    if (f.length) bad.push(`${p}: ${f.join(' | ')}`);
    await page.screenshot({ path: `shots/member-light${p.replace(/\//g, '-')}.png` });
  }
  await go('/member/home', ME);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.waitForTimeout(700);
  const fm = await faint(); if (fm.length) bad.push(`More: ${fm.join(' | ')}`);
  await page.screenshot({ path: 'shots/member-light-more.png' });
  say('every main screen and More readable in light (3:1 or better)', bad.length === 0, bad.join(' || '));

  premium = 'midnight_gold';
  await go('/member/home', ME);
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim());
  say('a premium theme takes its light version', bg.toUpperCase() === '#F8F6EF', bg);
  await page.screenshot({ path: 'shots/member-light-premium.png' });
  premium = null;

  mode = 'dark';
  await go('/member/home', ME);
  say('a saved Dark wins over the device', (await page.evaluate(() => document.documentElement.dataset.mode)) === 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  return out.join('\n');
}
