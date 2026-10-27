/**
 * The door (0200) on the phone: a member picks what they are doing today on
 * their QR sheet, from the gym's own activities, and may make it their usual
 * (a different pick for today leaves the usual alone); a coach, when the owner
 * has coach check-in on, has a QR button on the hub that opens their own
 * rotating code (CFC1.…) and their week; with it off there is no button.
 *
 * Member dev server on :5173. Screenshots to shots/door-member-*.png.
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

  // ── Redesign, Inbox: one row of tabs, Archived and Read all in the header, repeats fold, a tile per kind ──
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' };
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  let n = 0;
  const row = (type, title, message, hours, extra = {}) => ({ id: `n${++n}`, user_id: MEMBER, type, title, message, created_at: ago(hours),
    read: false, action_url: null, image_url: null, archived_at: null, cleared_at: null, ...extra });
  const NOTES = [
    row('attendance', 'Checked in', 'You checked in at the kiosk.', 1),
    row('gym_plan', 'Push day', 'You planned Push day today at 5:30 PM.', 6, { action_url: '/member/gym-plan' }),
    row('system', 'We are closed today', 'We open again tomorrow at 7 AM.', 26, { from_gym: true }),
    ...[3, 4, 5, 6].map((d) => row('attendance', 'Checked in', 'Your QR code was scanned at the front desk.', d * 24 + 2)),
    ...[1, 2, 3, 4, 5].map((i) => row('achievement', 'Badge unlocked', `Badge ${i}.`, 24 * 9 + i)),
    row('system', 'You can claim a reward', 'You have 4665 G Points — enough for Locker.', 24 * 9, { action_url: '/member/rewards' }),
    ...Array.from({ length: 22 }, (_, i) => row('booking', `Class tomorrow ${i}`, 'Spin 45 at 6:00 PM.', 24 * 10 + i)),
    row('payment', 'Payment received', '₱1,500 for Premium.', 24 * 20, { read: true }),
    row('info', 'Old news', 'Filed away.', 24 * 30, { archived_at: ago(24 * 29), read: true }),
  ];
  await page.route(/\/rest\/v1\/notifications\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { ...H, 'Content-Range': `0-${NOTES.length - 1}/${NOTES.length}` }, body: JSON.stringify(NOTES) });
  });
  const main = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  await go('/member/notifications', ME);
  await page.waitForTimeout(1500);
  const tabs = await page.getByRole('tablist').first().getByRole('tab').allInnerTexts();
  say('one row of tabs: All, Unread, From the gym', (await page.getByRole('tablist').count()) === 1
    && /All/.test(tabs[0]) && /Unread/.test(tabs[1]) && /From the gym/.test(tabs[2] ?? ''), JSON.stringify(tabs));
  say('Read all and Archived are header buttons', (await page.getByRole('button', { name: 'Mark all as read' }).count()) === 1
    && (await page.getByRole('button', { name: 'Archived' }).count()) === 1);
  let m = await main();
  // Folding is per day-group, so how many fold depends on the weekday; at least two always do.
  const foldN = Number(/Checked in ×(\d+)/.exec(m)?.[1] ?? 0);
  say('repeated check-ins in a group fold into one row', foldN >= 2, (m.match(/Checked in[^·]{0,6}/g) ?? []).join(' | '));
  say('five badges fold into one row', /Badge unlocked ×5/.test(m));
  say('the gym\'s closure stands alone', /We are closed today/.test(m));
  const pin = (await page.locator('[data-pinned]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  say('the gym\'s own message is pinned on top, once', /Pinned · from the gym/i.test(pin) && /We are closed today/.test(pin)
    && (m.match(/We are closed today/g) ?? []).length === 1, pin.slice(0, 120));
  say('each kind has its own tile', (await page.locator('[data-notification-kind="attendance"]').count()) > 0
    && (await page.locator('[data-notification-kind="system"]').count()) > 0 && (await page.locator('[data-notification-kind="booking"]').count()) > 0);
  say('the pager counts real notifications (36 in the inbox → two pages)', /36 notifications/.test(m) || /page 1 of 2/i.test(m), m.slice(-160));
  await page.screenshot({ path: 'shots/member-inbox.png' });

  await page.locator('[data-fold="Checked in"]').getByRole('button').first().click();
  await page.waitForTimeout(500);
  // The fold's own row has a tile too, so opened it holds N + 1.
  say('a fold opens to show each one', (await page.locator('[data-fold="Checked in"] [data-notification-kind="attendance"]').count()) === foldN + 1);
  await page.screenshot({ path: 'shots/member-inbox-open.png' });

  await page.getByRole('button', { name: 'Select' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Select all · 36/ }).click();
  say('Select all selects every real notification', /36 selected/.test(await main()));
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Archived' }).click();
  await page.waitForTimeout(600);
  m = await main();
  say('Archived shows what was filed away, with a way back', /Old news/.test(m) && !/We are closed today/.test(m)
    && (await page.getByRole('button', { name: 'Back to the inbox' }).count()) === 1);

  await go('/member/notifications', ME);
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: /From the gym/ }).click();
  await page.waitForTimeout(1200);
  say('From the gym opens the gym\'s own page', /\/member\/events/.test(page.url()), page.url());
  say('nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return out.join('\n');
}
