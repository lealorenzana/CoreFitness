/**
 * 0211 against fixtures: with the connection gone, the kiosk and the desk save a
 * scan on the device with the time it was scanned and say "saved", never "checked
 * in"; back online it is sent to record_offline_checkin(); a scan the rules refuse
 * is shown to the desk (never on the kiosk) with the reason. The fixture is
 * admin-door-check.js's.
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'lea@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date();
  const iso = (d, h = 9, m = 5) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const day = (d) => { const x = new Date(now.getTime() + 8 * 3600000); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const mid = (i) => `a${i}a00000-0000-4000-8000-00000000000${i}`;
  const NAMES = [['Andrea', 'Santos'], ['Andrea', 'Tolentino'], ['Carlo', 'Bautista'], ['Mika', 'Ramos'], ['Rhea', 'Cruz'], ['Leo', 'Navarro'], ['Ivy', 'Aquino'], ['Bea', 'Reyes'], ['Hans', 'Lim']];
  const members = NAMES.map(([f, l], i) => ({ id: mid(i), role: 'member', status: 'active', first_name: f, last_name: l,
    email: `${f.toLowerCase()}.${l.toLowerCase()}@door-test.com`, phone: null, photo_url: null, created_at: iso(-200 + i) }));
  const COACH = 'c1ab0001-0000-4000-8000-000000000001';
  const PLANS = [{ id: 'p1', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true }];
  const TABLES = {
    profiles: [admin, ...members],
    member_profiles: members.map((m) => ({ profile_id: m.id, gym_id: 'gym-1', qr_code: m.id, experience_level: 'beginner', created_at: m.created_at, profiles: m })),
    membership_plans: PLANS,
    memberships: members.map((m, i) => ({ id: `ms${i}`, member_id: m.id, plan_id: 'p1', status: 'active', start_date: day(-20), expiry_date: day(20),
      never_expires: false, frozen_at: null, created_at: iso(-20), membership_plans: PLANS[0] })),
    attendance: [
      { id: 'a1', member_id: mid(0), check_in_time: iso(0, 8, 41), method: 'qr', activity: 'Class', activity_by: 'member', source: 'kiosk' },
      { id: 'a2', member_id: mid(2), check_in_time: iso(0, 8, 30), method: 'qr', activity: 'Cardio', activity_by: 'desk', source: 'desk' },
      { id: 'a3', member_id: mid(3), check_in_time: iso(0, 7, 5), method: 'manual', activity: null, activity_by: null, source: 'desk' },
      ...Array.from({ length: 40 }, (_, k) => ({ id: `h${k}`, member_id: mid(k % 9), check_in_time: iso(-1 - (k % 20), 6 + (k % 10)), method: k % 3 ? 'qr' : 'manual', activity: k % 2 ? 'Gym floor' : null })),
    ],
    checkin_picks: [{ member_id: mid(1), today: 'Class', today_on: day(0), usual: 'Class' }],
    gym_settings: [{ id: true, gym_id: 'gym-1', gym_name: 'Core Fitness Lab', // The Lab's real list (2026-10-18): thirty chips in four rows pushed the log off the screen.
      activity_options: ['Gym floor', 'Class', 'Cardio', 'Strength', 'Free Weights', 'Weight Machines', 'Bodyweight', 'Treadmill', 'Stationary Bike', 'Elliptical',
        'Rowing', 'Jump Rope', 'HIIT', 'Circuit Training', 'Functional Training', 'Core & Abs', 'Group Class', 'Zumba', 'Aerobics', 'Yoga', 'Pilates',
        'Spinning', 'Dance', 'Boxing', 'Muay Thai', 'Martial Arts', 'Stretching & Mobility', 'Sports', 'Personal Training', 'Other'], closing_time: '21:00:00',
      member_activity_pick: true, coach_checkin_on: true, day_pass_on: true, day_pass_price: 150, pack5_price: 650, pack10_price: null, guest_nudge_visits: 3, day_pass_classes: false, updated_at: iso(-2), updated_by: null }],
    gyms: [{ id: 'gym-1', created_at: iso(-30) }],
    payments: [], notifications: [], bookings: [], pt_sessions: [], gym_invitations: [],
  };
  const COACHES = [
    { trainer_id: COACH, first_name: 'Gabby', last_name: 'Coach', photo_url: null, checked_in_at: null, checkin_id: null },
    { trainer_id: 'c2ab0002-0000-4000-8000-000000000002', first_name: 'Paolo', last_name: 'Dizon', photo_url: null, checked_in_at: iso(0, 6, 12), checkin_id: 'cc2' },
    { trainer_id: 'c3ab0003-0000-4000-8000-000000000003', first_name: 'Jen', last_name: 'Lacsamana', photo_url: null, checked_in_at: null, checkin_id: null },
  ];
  const CALLS = [];
  const RPC = {
    my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [],
    guest_visits_on: [{ id: 'v1', guest_id: 'g1', name: 'Rico Abad', phone: '09175550111', kind: 'day', amount: 150, method: 'cash', visited_at: iso(0, 10, 21), voided: false, visits_left: 0 }],
    frequent_guests: [{ guest_id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visits: 4, spent: 520, last_visit: day(-3) }],
    find_guest: [{ id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visits_left: 3, visits_this_month: 3, last_visit: day(-3) }],
    guest_visits_between: [
      { id: 'hv1', guest_id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visit_day: day(-1), visited_at: iso(-1, 8, 2), kind: 'day', amount: 150, method: 'online', voided: false, recorded_by_name: 'Gabby Desk' },
      { id: 'hv2', guest_id: 'g3', name: 'Jules Tan', phone: null, visit_day: day(-2), visited_at: iso(-2, 17, 40), kind: 'day', amount: 150, method: 'cash', voided: false, recorded_by_name: 'Gabby Desk' },
      { id: 'hv3', guest_id: 'g1', name: 'Rico Abad', phone: '09175550111', visit_day: day(-3), visited_at: iso(-3, 9, 0), kind: 'pack5', amount: 650, method: 'cash', voided: true, recorded_by_name: 'Lea Lorenzana' },
    ],
    record_guest_visit: [{ guest_id: 'g2', visits_left: 2, amount: 0, visits_this_month: 4, suggest_membership: true }],
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* GET */ }
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'door_coaches') return json(COACHES);
      if (fn === 'record_coach_checkin') {
        const c = COACHES.find((x) => x.trainer_id === body.p_trainer);
        if (c) { c.checked_in_at = new Date().toISOString(); c.checkin_id = 'new'; }
        return json([{ id: 'new', check_in_time: new Date().toISOString(), first_name: c?.first_name ?? null }]);
      }
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET') return json([], 201);
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        let m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
        m = /^gte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) >= m[1]);
        m = /^lte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) <= m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  const BAD = /Something went wrong|Couldn'?t load|Could not load|Failed to load|is not a function|Cannot read prop|NaN|\[object Object\]|Invalid Date|undefined/;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const has = (label, ok) => out.push(`  ${label}: ${ok ? 'yes' : 'MISSING'}`);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const noScroll = async () => page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight : 999; });
  const visit = async (path, shot) => {
    errs.length = 0;
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    const t = await text();
    const bad = BAD.exec(t);
    out.push(`${path}: ${bad ? 'ERROR TEXT "' + t.slice(Math.max(0, bad.index - 40), bad.index + 60) + '"' : 'renders'}${errs.length ? ' | PAGE ERROR ' + errs.join(' || ') : ''}`);
    if (shot) await page.screenshot({ path: `shots/door-${shot}.png` });
    return t;
  };

  // ── 0211: check-ins with no connection ──────────────────────────────────────────────────────────
  // The answer the database gives each saved scan, set per step below.
  let answer = 'recorded';
  const SENT = [];
  await page.route('**/rest/v1/rpc/record_offline_checkin', async (route) => {
    SENT.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(answer) });
  });
  const queued = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cf-checkin-outbox:'))
    .reduce((n, k) => n + JSON.parse(localStorage.getItem(k) || '[]').length, 0));
  const qr = (m) => `CF1.${Date.now().toString(36)}.${m}`.toUpperCase();

  // The kiosk, open while online; then the connection drops and a member scans.
  await visit('/kiosk', null);
  await page.context().setOffline(true);
  await page.getByLabel('Check-in code').fill(qr(mid(4)));
  await page.getByLabel('Check-in code').press('Enter');
  await page.waitForTimeout(1200);
  let t = await text();
  has('offline, the kiosk saves the scan and says "saved", never "checked in"', /Saved,/.test(t) && /recorded as soon as it is back/.test(t) && !/You are checked in/.test(t));
  has('…one scan waits on this device', (await queued()) === 1);
  has('…and the kiosk says so, without naming anyone', /No connection · 1 check-in saved on this device/.test(await page.locator('[data-kiosk-offline]').innerText()));
  await page.screenshot({ path: 'shots/offline-kiosk.png' });

  // The connection comes back: the saved scan is sent, with the time it was scanned.
  answer = 'recorded';
  await page.context().setOffline(false);
  await page.waitForTimeout(2500);
  const k = SENT[SENT.length - 1];
  has('back online, the scan is sent for the database to check', !!k && k.p_member === mid(4) && k.p_source === 'kiosk' && k.p_method === 'qr');
  has('…with the time it was scanned, not when it was sent', !!k && Date.now() - Date.parse(k.p_scanned_at) < 60_000 && Date.now() - Date.parse(k.p_scanned_at) > 1500);
  has('…and the queue empties', (await queued()) === 0);

  // The desk: offline it saves too; the rules refuse it later, and the desk is told who and why.
  await visit('/attendance', null);
  await page.context().setOffline(true);
  await page.getByLabel('Check-in code or name').fill(qr(mid(5)));
  await page.getByLabel('Check-in code or name').press('Enter');
  await page.waitForTimeout(1200);
  has('offline, the desk saves the check-in on the computer', /saved on this computer/.test(await text()) && (await queued()) === 1);
  answer = 'no_membership';
  await page.context().setOffline(false);
  await page.waitForTimeout(2500);
  const notice = (await page.locator('[data-offline-scans]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  has('a scan the rules refuse is shown to the desk, with the reason', /Not recorded/.test(notice) && /no usable membership that day/.test(notice) && /at the desk/.test(notice));
  has('…and is no longer waiting', (await queued()) === 0);
  await page.screenshot({ path: 'shots/offline-desk.png' });
  await page.getByRole('button', { name: 'Dismiss the refused check-ins' }).click();
  await page.waitForTimeout(300);
  has('the desk can dismiss it once handled', (await page.locator('[data-offline-scans]').count()) === 0);
  return out.join('\n');
}
