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

  // ── The member's QR sheet ──
  await go('/member/home', ME);
  await page.locator('nav[aria-label="Main"] button[aria-label*="code"]').click();
  await page.waitForTimeout(1200);
  const pick = page.locator('[data-activity-pick]');
  const sel = pick.locator('[data-activity-select]');
  has('the QR sheet asks what they are doing today, as a dropdown of the gym\'s list', (await pick.count()) === 1 && (await sel.locator('option').count()) === 30);
  const qrBox = await page.locator('[role="dialog"][aria-label="Check-in QR code"] svg').first().boundingBox();
  has('with thirty activities the QR is full size and on screen', !!qrBox && qrBox.height >= 200 && qrBox.y >= 0 && qrBox.y + qrBox.height <= 852, JSON.stringify(qrBox));
  has('…one dropdown, not a wall of chips', (await pick.locator('button').count()) === 0 && await sel.evaluate((e) => e.getBoundingClientRect().height < 60));
  has('…with their usual already chosen', (await sel.inputValue()) === 'Cardio');
  has('…and the switch on, since it is their usual', await pick.getByRole('switch').isChecked());
  await sel.selectOption('Class'); await page.waitForTimeout(500);
  let c = CALLS.filter(([f]) => f === 'set_my_checkin_pick').pop();
  has('a different pick just for today leaves the usual alone', !!c && c[1].p_activity === 'Class' && c[1].p_usual === null, JSON.stringify(c));
  has('…the dropdown shows it and the switch says it is not the usual', (await sel.inputValue()) === 'Class' && !(await pick.getByRole('switch').isChecked()) && /Your usual: Cardio/.test(await pick.innerText()));
  await pick.getByRole('switch').click(); await page.waitForTimeout(500);
  c = CALLS.filter(([f]) => f === 'set_my_checkin_pick').pop();
  has('turning the switch on makes it the usual', !!c && c[1].p_activity === 'Class' && c[1].p_usual === true);
  await page.screenshot({ path: 'shots/door-member-sheet.png' });
  has('the sheet still shows the QR and the code', (await page.locator('[role="dialog"][aria-label="Check-in QR code"] svg').count()) >= 1 && /A3F 92B/.test(await page.locator('[role="dialog"]').innerText()));

  // ── The coach's QR ──
  await go('/trainer/home', COACH_ROW);
  has('the coach has a QR button on the hub when coach check-in is on', (await page.locator('[data-coach-qr]').count()) === 1);
  await page.locator('[data-coach-qr]').click(); await page.waitForTimeout(1200);
  const sheet = page.locator('[data-coach-checkin]');
  const st = (await sheet.innerText().catch(() => '')).replace(/\s+/g, ' ');
  has("…which opens their own code and their week", (await sheet.count()) === 1 && /B7C 2D1/.test(st) && /Not in yet/.test(st) && /1 day/.test(st), st.slice(0, 200));
  const qrValue = await sheet.locator('svg').first().evaluate((svg) => !!svg.querySelector('path')).catch(() => false);
  has('…with a QR drawn', qrValue);
  await page.screenshot({ path: 'shots/door-member-coach.png' });
  DB.gym_settings[0].coach_checkin_on = false;
  await go('/trainer/home', COACH_ROW);
  has('with coach check-in off, no QR button', (await page.locator('[data-coach-qr]').count()) === 0);
  has('no page errors', errs.length === 0, errs.join(' || '));
  return out.join('\n');
}
