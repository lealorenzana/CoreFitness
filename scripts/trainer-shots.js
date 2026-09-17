/**
 * The trainer app, screen by screen, at phone size.
 *
 * Same idea as member-shots.js and deliberately much smaller: the trainer
 * screens read a narrow set of tables, so the fixture can be too. Plants a
 * trainer session, answers every Supabase call locally, writes
 * shots/trainer-NN-*.png.
 *
 * Playwright runner's `filename` argument, member dev server on :5173 — the
 * trainer role lives in the same app.
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
  const now = new Date();
  const iso = (d, h, m) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const dstr = (d) => { const x = new Date(now); x.setDate(now.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

  const ME = { id: 't1', first_name: 'Kenji', last_name: 'Ramos', email: 'kenji@corefitness-test.com',
    role: 'trainer', status: 'active', phone: '+639181234567', photo_url: null, created_at: iso(-300, 9, 0) };
  const M1 = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-120, 9, 0) };
  const M2 = { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-60, 9, 0) };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 't1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 't1', name: 'Kenji Ramos', email: 'kenji@corefitness-test.com', role: 'trainer' }));
  }, [KEY, session]);

  const CLASSES = [
    { id: 'c1', name: 'Morning Strength', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Main floor', class_type: 'strength', scheduled_at: iso(0, 7, 0), duration_minutes: 60, created_at: iso(-9, 9, 0) },
    { id: 'c2', name: 'HIIT Express', trainer_id: 't1', level: 'intermediate', capacity: 16,
      location: 'Studio', class_type: 'cardio', scheduled_at: iso(1, 18, 0), duration_minutes: 45, created_at: iso(-9, 9, 0) },
  ];

  const TABLES = {
    profiles: [ME, M1, M2],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength & conditioning',
      bio: 'Ten years coaching, mostly barbells.', availability: null, years_experience: 10,
      certifications: ['NASM-CPT'], focus_areas: ['Strength'], achievements: null, profiles: ME }],
    member_profiles: [M1, M2].map((m) => ({ profile_id: m.id, gym_id: null, qr_code: m.id,
      experience_level: 'intermediate', created_at: m.created_at, profiles: m })),
    memberships: [], membership_plans: [],
    classes: CLASSES,
    class_availability: CLASSES.map((c, i) => ({ class_id: c.id, capacity: c.capacity, booked_count: [7, 12][i] })),
    bookings: [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'pending',
      requested_at: iso(-1, 10, 0), approved_at: null, rejected_at: null, decided_by: null,
      decided_by_role: null, decided_at: null, classes: CLASSES[0] }],
    // `requested_at` is NOT NULL default now() in 0015, so a live row always has
    // one — and the queue sorts on it. Omitting it here threw "Cannot read
    // properties of undefined (reading 'localeCompare')" onto the screen and
    // emptied every filter. Third fixture column to do this (slot_minutes,
    // day_of_week): when a trainer screen looks broken, diff the fixture
    // against the migration before reading the component.
    pt_sessions: [{ id: 'pt1', member_id: 'm2', trainer_id: 't1', starts_at: iso(1, 16, 0),
      duration_minutes: 60, status: 'pending', notes: 'Deadlift technique', payment_id: null,
      requested_at: iso(-2, 9, 0), created_at: iso(-2, 9, 0) },
      { id: 'pt2', member_id: 'm1', trainer_id: 't1', starts_at: iso(-3, 8, 0),
        duration_minutes: 60, status: 'approved', notes: null, payment_id: 'pay1',
        requested_at: iso(-6, 9, 0), created_at: iso(-6, 9, 0) },
      // Approved AND still ahead — the only shape that shows the coach's own
      // cancel control (0081). The past one above must not, and that asymmetry
      // is the point: cancel_booking() refuses a session that has started, so
      // offering the button there would be offering a refusal.
      { id: 'pt3', member_id: 'm1', trainer_id: 't1', starts_at: iso(4, 9, 0),
        duration_minutes: 60, status: 'approved', notes: null, payment_id: null,
        requested_at: iso(-1, 9, 0), created_at: iso(-1, 9, 0) }],
    // slot_minutes is NOT NULL with a CHECK in the real schema (0015); leaving
    // it out of the fixture put "NaN slots a week" on the schedule screen and
    // sent me looking for a bug in the app.
    trainer_availability: [1, 3, 5].map((d, i) => ({ id: `ta${i}`, trainer_id: 't1', day_of_week: d,
      start_time: '08:00', end_time: '17:00', slot_minutes: 60, is_active: true })),
    trainer_credentials: [{ id: 'cr1', trainer_id: 't1', title: 'NASM Certified Personal Trainer',
      file_path: null, mime_type: null, status: 'verified', verified_at: iso(-100, 9, 0), note: null }],
    trainer_feedback: [{ id: 'f1', trainer_id: 't1', member_id: 'm1', note: 'Good progress on hinge pattern.',
      recommendation: 'Two sessions a week.', created_at: iso(-4, 9, 0) }],
    // 0082: the roster reads this narrowed view, not the three unfiltered
    // tables it used to join on the phone.
    my_trainer_members: [M1, M2].map((m, i) => ({
      member_id: m.id, name: `${m.first_name} ${m.last_name}`, photo_url: null,
      experience_level: 'intermediate', last_visit: iso(-(i + 1), 7, 0),
      visits_last_30: [6, 3][i], upcoming_with_me: [1, 0][i],
    })),
    trainer_ratings: [], trainer_evaluation_months: [], trainer_busy_slots: [],
    notifications: [{ id: 'n1', user_id: 't1', type: 'booking', title: 'New session request',
      message: 'Miguel asked for Tuesday 4:00 PM.', action_url: '/trainer/bookings', metadata: null,
      read: false, created_at: iso(0, 8, 30) }],
    attendance: [], workout_logs: [], body_measurements: [], fitness_goals: [],
    achievements: [], achievement_unlocks: [], member_share_prefs: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 555 0101', email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00',
      logo_url: null, short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 't1', bookings: true, payments: true, announcements: true }],
    push_subscriptions: [], events: [], workout_resources: [], class_templates: [],
  };
  const RPC = {
    my_trainer_ratings: [], trainer_schedule_conflicts: [], sweep_stale_requests: 0,
    my_features: [], plan_allows: true, member_progression: [{ level: 2, points: 90, next_level_points: 300 }],
    admin_trainer_evaluations: [], sync_my_achievements: 0,
  };

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
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-1/2', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });

    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn] : null); }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(one ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 393, height: 852 });

  const SCREENS = [
    ['01-home', '/trainer/home'], ['02-bookings', '/trainer/bookings'],
    ['03-schedule', '/trainer/schedule'], ['04-members', '/trainer/members'],
    ['05-availability', '/trainer/availability'], ['06-profile', '/trainer/profile'],
    ['07-settings', '/trainer/settings'], ['08-edit-profile', '/trainer/profile/edit'],
  ];
  const out = [];
  for (const [name, path] of SCREENS) {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `shots/trainer-${name}.png` });
    out.push(`${name.padEnd(16)} ${page.url().replace('http://localhost:5173', '').padEnd(24)} ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 70)}`);
  }

  // The member detail is a glass sheet (portalled) — open it and prove it takes taps.
  await page.goto('http://localhost:5173/trainer/members', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator('main button', { hasText: 'Lea Lorenzana' }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/trainer-09-member-sheet.png' });
  await page.getByRole('button', { name: 'Send a recommendation' }).click();
  await page.waitForTimeout(300);
  const formShown = await page.getByPlaceholder('What they should do next…').isVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(300);
  const closed = await page.getByRole('dialog').count() === 0;
  out.push(`member sheet: form opens=${formShown} closes=${closed}`);
  return out.join('\n');
}
