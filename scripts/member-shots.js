/**
 * Photographs the member app, screen by screen, on a phone-sized viewport.
 *
 * The design pass needs to *see* the app, and the app is behind a login. This
 * plants a session and answers every Supabase call from fixtures, so the shots
 * are of the real components with realistic content and nothing touches the
 * live project. Premium plan, so no screen is locked and every design is
 * visible.
 *
 * Writes shots/member-NN-<name>.png. `shots/.gitignore` excludes *.png, so
 * these are regenerated, never committed.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) };
  const COACH = { id: 't1', first_name: 'Kenji', last_name: 'Ramos', email: 'kenji@corefitness-test.com',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email,
            app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    // The ~6 legacy pages read this cache; without it they render signed-out.
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana',
      email: 'lea@corefitness-test.com', role: 'member' }));
  }, [KEY, session]);

  const PLAN = { id: 'p-prem', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30,
    is_active: true, description: 'Everything the gym offers.', can_book_classes: true,
    can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };

  const CLASSES = [
    { id: 'c1', name: 'Morning Strength', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Main floor', class_type: 'strength', scheduled_at: iso(0, 7, 0),
      duration_minutes: 60, created_at: iso(-9, 9, 0) },
    { id: 'c2', name: 'HIIT Express', trainer_id: 't1', level: 'intermediate', capacity: 16,
      location: 'Studio', class_type: 'cardio', scheduled_at: iso(1, 18, 0),
      duration_minutes: 45, created_at: iso(-9, 9, 0) },
    { id: 'c3', name: 'Mobility & Core', trainer_id: 't1', level: 'beginner', capacity: 10,
      location: 'Studio', class_type: 'mobility', scheduled_at: iso(2, 6, 30),
      duration_minutes: 40, created_at: iso(-9, 9, 0) },
  ];

  const TABLES = {
    profiles: [ME, COACH],
    member_profiles: [{ profile_id: 'm1', gym_id: null, address: 'Mamburao, Occidental Mindoro',
      emergency_contact_name: 'Maria Lorenzana', emergency_contact_phone: '+639170000000',
      emergency_contact_relationship: 'Mother', qr_code: 'm1', experience_level: 'intermediate',
      training_focus: 'cutting', date_of_birth: '1998-04-12', gender: 'female', interests: ['strength'],
      terms_accepted_at: iso(-120, 9, 2), onboarding_completed_at: iso(-119, 9, 0),
      created_at: iso(-120, 9, 0), profiles: ME }],
    membership_plans: [PLAN],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p-prem', status: 'active',
      start_date: dstr(-12), expiry_date: dstr(18), never_expires: false, frozen_at: null,
      created_at: iso(-12, 9, 0), membership_plans: PLAN }],
    classes: CLASSES,
    class_availability: CLASSES.map((c, i) => ({ ...c, booked: [7, 12, 3][i], seats_left: [5, 4, 7][i] })),
    bookings: [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved',
      requested_at: iso(-2, 10, 0), approved_at: iso(-2, 11, 0), rejected_at: null,
      decided_by: 't1', decided_by_role: 'trainer', decided_at: iso(-2, 11, 0), classes: CLASSES[0] }],
    pt_sessions: [{ id: 'pt1', member_id: 'm1', trainer_id: 't1', starts_at: iso(1, 16, 0),
      duration_minutes: 60, status: 'pending', notes: 'Deadlift technique',
      payment_id: null, created_at: iso(-1, 9, 0) }],
    attendance: [-1, -2, -4, -5, -7, -9, -11].map((d, i) => ({ id: `a${i}`, member_id: 'm1',
      gym_id: null, check_in_time: iso(d, 6, 40), method: 'qr', recorded_by: 'u1' })),
    payments: [{ id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0042', notes: null,
      recorded_by: 'u1', paid_on: dstr(-12), created_at: iso(-12, 9, 0) }],
    notifications: [
      { id: 'n1', user_id: 'm1', type: 'booking', title: 'Your session is confirmed',
        message: 'Kenji approved your Tuesday 4:00 PM session.', action_url: '/member/bookings',
        metadata: null, read: false, created_at: iso(0, 8, 10) },
      { id: 'n2', user_id: 'm1', type: 'membership', title: 'Payment received',
        message: 'Thanks — ₱1,500 recorded at the desk.', action_url: '/member/payments',
        metadata: null, read: true, created_at: iso(-12, 9, 5) },
    ],
    events: [{ id: 'e1', title: 'Barangay fun run', description: 'Five kilometres along the bay.',
      starts_at: iso(6, 5, 30), location: 'Mamburao plaza', capacity: 50, is_published: true,
      image_url: null, created_at: iso(-20, 9, 0) }],
    event_registrations: [],
    workout_resources: [
      { id: 'w1', title: 'Full-body starter', description: 'Three moves, no equipment, twenty minutes.',
        category: 'strength', level: 'beginner', media_url: null, image_url: null, body_part: 'full body',
        equipment: null, duration_minutes: 20, is_published: true, sort_order: 1, created_at: iso(-40, 9, 0) },
      { id: 'w2', title: 'Mobility before lifting', description: 'Ten minutes that make the first set feel easier.',
        category: 'mobility', level: 'beginner', media_url: null, image_url: null, body_part: 'hips',
        equipment: null, duration_minutes: 10, is_published: true, sort_order: 2, created_at: iso(-40, 9, 0) },
      { id: 'w3', title: 'Push day, intermediate', description: 'Chest, shoulders and triceps in five movements.',
        category: 'strength', level: 'intermediate', media_url: null, image_url: null, body_part: 'upper body',
        equipment: 'barbell', duration_minutes: 45, is_published: true, sort_order: 3, created_at: iso(-38, 9, 0) },
    ],
    rewards: [{ id: 'r1', name: 'Shaker bottle', description: 'Collect at the desk.', cost_points: 200,
      stock: 5, is_active: true, image_url: null, created_at: iso(-30, 9, 0) },
      { id: 'r2', name: 'One free PT session', description: 'Sixty minutes with any coach.',
        cost_points: 800, stock: 2, is_active: true, image_url: null, created_at: iso(-30, 9, 0) }],
    point_rules: [{ id: 'pr1', action: 'check_in', points: 10, label: 'Check in', is_active: true }],
    point_ledger: [{ id: 'pl1', member_id: 'm1', points: 10, reason: 'check_in', created_at: iso(-1, 6, 41) }],
    challenges: [{ id: 'ch1', title: 'Twelve sessions in September', description: 'Three a week, near enough.',
      metric: 'workouts', target: 12, starts_on: dstr(-13), ends_on: dstr(17), is_active: true,
      created_at: iso(-14, 9, 0) }],
    challenge_participants: [{ id: 'cp1', challenge_id: 'ch1', member_id: 'm1', joined_at: iso(-13, 9, 0) }],
    workout_logs: [-1, -2, -4, -5].map((d, i) => ({ id: `wl${i}`, member_id: 'm1',
      performed_on: dstr(d), activity: 'Strength', duration_minutes: 55, notes: null,
      source: 'manual', created_at: iso(d, 7, 40) })),
    workout_sets: [],
    body_measurements: [{ id: 'bm1', member_id: 'm1', measured_on: dstr(-30), weight_kg: 61.5,
      height_cm: 163, waist_cm: 74, created_at: iso(-30, 9, 0) },
      { id: 'bm2', member_id: 'm1', measured_on: dstr(-2), weight_kg: 60.1, height_cm: 163,
        waist_cm: 72, created_at: iso(-2, 9, 0) }],
    fitness_goals: [{ id: 'g1', member_id: 'm1', kind: 'weight', target_value: 58,
      target_date: dstr(45), created_at: iso(-30, 9, 0), achieved_at: null }],
    // Real column names, or the catalogue builds a def with an undefined tier
    // and the unlock overlay takes the whole app down with it — which is how
    // the first run of this script produced sixteen shots of the splash screen.
    achievements: [
      { key: 'first_checkin', audience: 'member', title: 'First check-in',
        description: 'You showed up.', requirement: 'Check in once.', icon: 'Footprints',
        tier: 'bronze', category: 'Attendance', rule_kind: 'metric', metric: 'check_ins',
        threshold: 1, builtin: true, active: true, sort_order: 1 },
      { key: 'ten_sessions', audience: 'member', title: 'Ten sessions in',
        description: 'Ten workouts logged.', requirement: 'Log ten workouts.', icon: 'Dumbbell',
        tier: 'silver', category: 'Training', rule_kind: 'metric', metric: 'workouts',
        threshold: 10, builtin: true, active: true, sort_order: 2 },
    ],
    // Already seen: the celebration is a modal over every screen, and a shot of
    // it is a shot of the celebration rather than of the page underneath.
    achievement_unlocks: [{ achievement_key: 'first_checkin', unlocked_on: dstr(-119), seen: true }],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength & conditioning',
      bio: 'Ten years coaching, mostly barbells.', availability: null, certifications: ['NASM-CPT'],
      profiles: COACH }],
    public_trainers: [{ profile_id: 't1', first_name: 'Kenji', last_name: 'Ramos',
      specialization: 'Strength & conditioning', bio: 'Ten years coaching, mostly barbells.',
      photo_url: null }],
    public_trainer_credentials: [{ trainer_id: 't1', title: 'NASM Certified Personal Trainer',
      verified_at: iso(-100, 9, 0) }],
    trainer_rating_summary: [{ trainer_id: 't1', average_stars: 4.6, rating_count: 9 }],
    trainer_availability: [{ id: 'ta1', trainer_id: 't1', weekday: 2, start_time: '08:00',
      end_time: '17:00', is_active: true }],
    trainer_busy_slots: [], trainer_ratings: [], trainer_feedback: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 555 0101', email: 'hello@corefitness.ph', opening_time: '06:00',
      closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: null,
      activity_options: ['Strength', 'Cardio', 'Mobility'], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 'm1', bookings: true, payments: true, announcements: true }],
    member_share_prefs: [{ member_id: 'm1', share_measurements: true, share_goals: true, share_workouts: false }],
    push_subscriptions: [], assistant_chats: [], gym_plans: [], workout_plans: [],
    membership_events: [], refund_rules: [], features: [], plan_features: [],
    pending_registrations: [], reward_redemptions: [], activity_feed: [],
  };

  const RPC = {
    // Real labels, not the keys. `planAccess` reads `label`, so a fixture that
    // sets `label: key` puts "points_earn" on the plan list and invites the
    // reader to file a bug against the app.
    my_features: [
      { key: 'workout_tracker', label: 'Workout tracker', description: '', enabled: true },
      { key: 'plan_builder', label: 'Training plan builder', description: '', enabled: true },
      { key: 'ai_model', label: 'Fitness assistant', description: '', enabled: true },
      { key: 'points_earn', label: 'Earn CORE Points', description: '', enabled: true },
      { key: 'points_redeem', label: 'Spend CORE Points', description: '', enabled: true },
      { key: 'challenges', label: 'Gym challenges', description: '', enabled: true },
    ],
    plan_allows: true,
    member_points_balance: 340,
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    member_commitments: [],
    my_trainer_ratings: [],
    may_rate_trainer: false,
    sync_my_achievements: 0,
    challenge_progress: [{ challenge_id: 'ch1', progress: 7, target: 12 }],
    goal_progress: [{ goal_id: 'g1', progress: 0.4 }],
    freezes_this_month: 0,
    frozen_days_last_year: 0,
    member_exercise_history: [],
    workout_session_summary: [],
    member_points_ledger: [],
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const query = qi === -1 ? '' : after.slice(qi + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-2/3', 'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range' } });

    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
      let rows = TABLES[table] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(wantsObject ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(wantsObject ? (rows[0] ?? null) : rows);
    }
    if (pathname.startsWith('/storage/')) return json({});
    if (pathname.startsWith('/functions/')) return json({});
    return json([]);
  });

  // A real phone, not a desktop window pretending: 393x852 is a current iPhone
  // and sits inside the Android range the gym's members actually carry.
  await page.setViewportSize({ width: 393, height: 852 });

  const SCREENS = [
    ['01-home',        '/member/home'],
    ['02-book',        '/member/book-class'],
    ['03-history',     '/member/booking-history'],
    ['04-progress',    '/member/progress'],
    ['05-workouts',    '/member/workouts'],
    ['06-profile',     '/member/profile'],
    ['07-attendance',  '/member/attendance-history'],
    ['08-membership',  '/member/membership'],
    ['09-rewards',     '/member/rewards'],
    ['10-challenges',  '/member/challenges'],
    ['11-notifications', '/member/notifications'],
    ['12-settings',    '/member/settings'],
    ['13-track',       '/member/track'],
    ['14-trainers',    '/member/trainers'],
    ['15-events',      '/member/events'],
    ['16-payments',    '/member/payments'],
  ];

  const out = [];
  for (const [name, path] of SCREENS) {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
    // The boot splash holds for MIN_SPLASH_MS (2.5s) by design, so a shorter
    // wait photographs the splash on every screen — which is exactly what the
    // first run of this script produced.
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1400);
    const url = page.url().replace('http://localhost:5173', '');
    await page.screenshot({ path: `shots/member-${name}.png` });
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 90);
    out.push(`${name.padEnd(18)} ${url.padEnd(22)} ${text}`);
  }
  return out.join('\n');
}
