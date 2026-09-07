async (page) => {
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  // A structurally valid JWT. Never sent anywhere real — page.route answers
  // before it leaves the browser.
  // Hand-rolled base64url: Buffer has failed in this harness before, and btoa
  // is not defined in the Playwright server process either.
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', outStr = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) outStr += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return outStr;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;

  const session = {
    access_token: token, refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test',
            app_metadata: {}, user_metadata: {} },
  };

  // addInitScript so the session is in place before any module reads it, and
  // survives every navigation — a reload would otherwise land on the login page.
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, session]);

  // ── Fixtures ────────────────────────────────────────────────────────────
  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const PROFILE_ADMIN = {
    id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: '+639171234567', photo_url: null,
    created_at: iso(-400, 9, 0),
  };

  const MEMBERS = [
    { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test',
      role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) },
    { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness.test',
      role: 'member', status: 'active', phone: '+639173334444', photo_url: null, created_at: iso(-80, 9, 0) },
    { id: 'm3', first_name: 'Ana', last_name: 'Reyes', email: 'ana@corefitness.test',
      role: 'member', status: 'suspended', phone: '+639175556666', photo_url: null, created_at: iso(-60, 9, 0) },
    { id: 'm4', first_name: 'Jose', last_name: 'Cruz', email: 'jose@corefitness.test',
      role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-30, 9, 0) },
  ];

  const TRAINERS = [
    { id: 't1', first_name: 'Tere', last_name: 'Bautista', email: 'tere@corefitness.test',
      role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) },
    { id: 't2', first_name: 'Marco', last_name: 'Dela Cruz', email: 'marco@corefitness.test',
      role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-200, 9, 0) },
  ];

  const PLANS = [
    { id: 'p1', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true,
      description: 'Gym access', can_book_classes: true, can_book_pt: false,
      class_bookings_per_week: 2, pt_sessions_per_month: null },
    { id: 'p2', name: 'Free Trial', tier: 'freemium', price: 0, duration_days: 30, is_active: true,
      description: '1-month trial', can_book_classes: true, can_book_pt: true,
      class_bookings_per_week: 3, pt_sessions_per_month: 1 },
    { id: 'p3', name: 'Premium', tier: 'premium', price: 1200, duration_days: 30, is_active: true,
      description: 'Everything', can_book_classes: true, can_book_pt: true,
      class_bookings_per_week: null, pt_sessions_per_month: 4 },
  ];

  const CLASS_TEMPLATES = [
    { id: 'ct1', name: 'Morning Yoga', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Studio A', day_of_week: 1, start_time: '06:00:00', duration_minutes: 60,
      active: true, created_at: iso(-90, 9, 0) },
    { id: 'ct2', name: 'Strength Basics', trainer_id: 't2', level: 'beginner', capacity: 8,
      location: 'Main Floor', day_of_week: 1, start_time: '06:30:00', duration_minutes: 45,
      active: true, created_at: iso(-90, 9, 0) },
    { id: 'ct3', name: 'Evening HIIT', trainer_id: 't1', level: 'intermediate', capacity: 20,
      location: 'Studio B', day_of_week: 3, start_time: '18:00:00', duration_minutes: 90,
      active: true, created_at: iso(-90, 9, 0) },
    { id: 'ct4', name: 'Zumba', trainer_id: 't2', level: 'all_levels', capacity: 25,
      location: 'Studio A', day_of_week: 4, start_time: '17:00:00', duration_minutes: 60,
      active: true, created_at: iso(-90, 9, 0) },
    { id: 'ct5', name: 'Saturday Circuit', trainer_id: 't1', level: 'advanced', capacity: 15,
      location: 'Main Floor', day_of_week: 6, start_time: '09:00:00', duration_minutes: 120,
      active: true, created_at: iso(-90, 9, 0) },
  ];

  const CLASSES = CLASS_TEMPLATES.map((t, i) => ({
    id: `c${i + 1}`, name: t.name, trainer_id: t.trainer_id, level: t.level, capacity: t.capacity,
    location: t.location, class_type: 'group', scheduled_at: iso(i + 1, 6 + i * 2, 0),
    duration_minutes: t.duration_minutes, template_id: t.id, created_at: iso(-30, 9, 0),
  }));

  const ATTENDANCE = [
    { id: 'a1', member_id: 'm1', gym_id: null, check_in_time: iso(0, 6, 12), method: 'qr', recorded_by: 'u1' },
    { id: 'a2', member_id: 'm2', gym_id: null, check_in_time: iso(0, 7, 3), method: 'manual', recorded_by: 'u1' },
    { id: 'a3', member_id: 'm4', gym_id: null, check_in_time: iso(0, 8, 45), method: 'qr', recorded_by: 'u1' },
    { id: 'a4', member_id: 'm1', gym_id: null, check_in_time: iso(-1, 6, 30), method: 'qr', recorded_by: 'u1' },
    { id: 'a5', member_id: 'm2', gym_id: null, check_in_time: iso(-1, 17, 20), method: 'qr', recorded_by: 'u1' },
    { id: 'a6', member_id: 'm4', gym_id: null, check_in_time: iso(-2, 7, 15), method: 'manual', recorded_by: 'u1' },
  ];

  const EVENTS = [
    { id: 'e1', title: 'Summer Fitness Challenge Launch', description: 'Kick-off for the 8-week challenge.',
      event_date: dstr(6), start_time: '08:00', end_time: '11:00', location: 'Main Floor',
      capacity: 40, is_featured: true, fee: null, what_to_bring: 'Towel and water',
      who_is_it_for: 'All members', contact: 'Front desk', image_url: null, created_at: iso(-5, 9, 0) },
    { id: 'e2', title: 'Nutrition Talk with a Dietitian', description: 'Practical eating for training.',
      event_date: dstr(14), start_time: '18:00', end_time: '19:30', location: 'Studio B',
      capacity: 25, is_featured: false, fee: 150, what_to_bring: null,
      who_is_it_for: 'Premium members', contact: 'Tere', image_url: null, created_at: iso(-3, 9, 0) },
  ];

  const NOTIFICATIONS = [
    { id: 'n1', user_id: 'm1', type: 'system', title: 'Holiday hours this weekend',
      message: 'The gym closes at 6pm on Saturday and Sunday.', action_url: null,
      metadata: null, read: false, created_at: iso(-1, 10, 0) },
    { id: 'n2', user_id: 'm2', type: 'system', title: 'Holiday hours this weekend',
      message: 'The gym closes at 6pm on Saturday and Sunday.', action_url: null,
      metadata: null, read: true, created_at: iso(-1, 10, 0) },
    { id: 'n3', user_id: 'm1', type: 'payment', title: 'Payment received',
      message: 'The gym has confirmed your payment of PHP 1,200.', action_url: '/member/payments',
      metadata: { dedupe: 'payment:pay1:paid' }, read: false, created_at: iso(0, 9, 30) },
  ];

  const BOOKINGS = [
    { id: 'b1', member_id: 'm1', class_id: 'c1', status: 'pending', requested_at: iso(-3, 14, 0),
      approved_at: null, rejected_at: null, approved_by: null,
      decided_by: null, decided_by_role: null, decided_at: null, classes: CLASSES[0] },
    { id: 'b2', member_id: 'm2', class_id: 'c2', status: 'approved', requested_at: iso(-2, 9, 0),
      approved_at: iso(-2, 10, 0), rejected_at: null, approved_by: 't2',
      decided_by: 't2', decided_by_role: 'trainer', decided_at: iso(-2, 10, 0), classes: CLASSES[1] },
    { id: 'b3', member_id: 'm4', class_id: 'c3', status: 'rejected', requested_at: iso(-5, 9, 0),
      approved_at: null, rejected_at: iso(-4, 9, 0), approved_by: null,
      decided_by: null, decided_by_role: 'system', decided_at: iso(-4, 9, 0), classes: CLASSES[2] },
  ];

  const PT_SESSIONS = [
    { id: 's1', trainer_id: 't1', member_id: 'm1', starts_at: iso(2, 10, 0), duration_minutes: 60,
      status: 'pending', notes: null, requested_at: iso(-4, 11, 0), approved_at: null,
      approved_by: null, decided_by: null, decided_by_role: null, decided_at: null,
      payment_id: null, created_at: iso(-4, 11, 0) },
    { id: 's2', trainer_id: 't2', member_id: 'm2', starts_at: iso(3, 14, 0), duration_minutes: 60,
      status: 'approved', notes: 'Focus on deadlift form', requested_at: iso(-1, 8, 0),
      approved_at: iso(-1, 9, 0), approved_by: 't2', decided_by: 't2', decided_by_role: 'trainer',
      decided_at: iso(-1, 9, 0), payment_id: 'pay1', created_at: iso(-1, 8, 0) },
  ];

  const MEMBERSHIPS = MEMBERS.map((m, i) => ({
    id: `ms${i + 1}`, member_id: m.id, plan_id: PLANS[i % 3].id, status: 'active',
    start_date: dstr(-30), expiry_date: dstr(0 + i), never_expires: false,
    frozen_at: null, created_at: iso(-30, 9, 0), membership_plans: PLANS[i % 3],
  }));

  const PAYMENTS = [
    { id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1200, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0001', notes: null,
      recorded_by: 'u1', paid_on: dstr(0), created_at: iso(0, 9, 0) },
    { id: 'pay2', member_id: 'm2', membership_id: 'ms2', amount: 1200, method: 'cash',
      status: 'pending', due_date: dstr(3), invoice_number: 'CF-2026-0002', notes: null,
      recorded_by: 'u1', paid_on: dstr(0), created_at: iso(-1, 9, 0) },
  ];

  const TABLES = {
    profiles: [PROFILE_ADMIN, ...MEMBERS, ...TRAINERS],
    member_profiles: MEMBERS.map((m) => ({
      profile_id: m.id, gym_id: null, address: 'Mamburao, Occidental Mindoro',
      emergency_contact_name: null, emergency_contact_phone: null,
      emergency_contact_relationship: null, qr_code: `QR-${m.id}`,
      experience_level: 'beginner', date_of_birth: '1998-04-12', gender: 'female',
      onboarding_completed_at: iso(-100, 9, 0), created_at: iso(-120, 9, 0), profiles: m,
    })),
    trainer_profiles: TRAINERS.map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning', bio: 'Ten years coaching.',
      availability: null, certifications: ['NASM-CPT'], profiles: t,
    })),
    membership_plans: PLANS,
    memberships: MEMBERSHIPS,
    payments: PAYMENTS,
    classes: CLASSES,
    class_templates: CLASS_TEMPLATES,
    bookings: BOOKINGS,
    pt_sessions: PT_SESSIONS,
    attendance: ATTENDANCE,
    events: EVENTS,
    event_registrations: [],
    notifications: NOTIFICATIONS,
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 123 4567', email: 'hello@corefitness.test', opening_time: '06:00',
      closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: 'ADMIN PANEL',
      max_freeze_days_per_year: 60, max_freeze_days_at_once: 30,
      updated_at: iso(0, 9, 0), updated_by: 'u1' }],
    trainer_availability: [
      { id: 'av1', trainer_id: 't1', day_of_week: 2, start_time: '09:00', end_time: '17:00' },
      { id: 'av2', trainer_id: 't2', day_of_week: 2, start_time: '09:00', end_time: '17:00' },
    ],
    account_status_events: [
      { id: 'ase1', profile_id: 'm3', status: 'suspended', previous_status: 'active',
        reason: 'Unpaid dues since August. Spoke to them on the 3rd.',
        recorded_by: 'u1', created_at: iso(-7, 11, 0) },
    ],
    membership_events: [],
    refund_rules: [
      { id: 'rr1', priority: 10, label: 'Cancelled within 7 days and never visited — full refund',
        min_days: 0, max_days: 7, requires_visits: false, percent: 100, is_active: true },
      { id: 'rr2', priority: 20, label: 'Cancelled within 7 days after visiting — half refund',
        min_days: 0, max_days: 7, requires_visits: true, percent: 50, is_active: true },
    ],
    point_ledger: [
      { id: 'pl1', member_id: 'm1', points: 10, rule_key: 'checkin', source_table: 'attendance',
        source_id: 'a1', created_at: iso(0, 6, 12) },
      { id: 'pl2', member_id: 'm1', points: 15, rule_key: 'workout_logged',
        source_table: 'workout_logs', source_id: 'w1', created_at: iso(-1, 19, 0) },
    ],
    rewards: [], reward_redemptions: [],
    trainer_ratings: [], trainer_credentials: [], trainer_feedback: [],
    workout_resources: [], achievements: [], achievement_unlocks: [],
    challenges: [], challenge_participants: [], activity_log: [],
    features: [], plan_features: [], point_rules: [], goal_templates: [],
    body_measurements: [], fitness_goals: [], workout_logs: [], workout_sets: [],
    pending_registrations: [], exercises: [],
  };

  const RPC = {
    member_points_balance: 340,
    sweep_stale_requests: 0,
    generate_class_instances: 0,
    plan_member_counts: [{ plan_id: 'p1', member_count: 1 }, { plan_id: 'p2', member_count: 2 },
                         { plan_id: 'p3', member_count: 1 }],
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    trainer_schedule_conflicts: [],
    admin_trainer_evaluations: [],
    refund_quote: [],
    frozen_days_last_year: 0,
    freezes_this_month: 0,
  };

  // ── The route. page.route survives reloads; a window.fetch patch does not. ─
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    // Hand-parsed: `URL` is not defined in the Playwright server sandbox.
    const raw = req.url();
    const afterHost = raw.replace(/^https?:\/\/[^/]+/, '');
    const qIndex = afterHost.indexOf('?');
    const pathname = qIndex === -1 ? afterHost : afterHost.slice(0, qIndex);
    const query = qIndex === -1 ? '' : afterHost.slice(qIndex + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1
        ? [decodeURIComponent(kv), '']
        : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const accept = req.headers()['accept'] || '';
    const wantsObject = accept.includes('vnd.pgrst.object');

    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*' },
    });

    if (pathname.startsWith('/auth/v1/')) {
      if (pathname.includes('/user')) return json(session.user);
      return json({ ...session });
    }

    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn] : null);
    }

    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
      let rows = TABLES[table] ?? [];

      // Honour `id=eq.x` well enough that a detail read finds its row.
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

  const out = [];
  const shoot = async (path, name, wait = 1400) => {
    await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `shots/${name}.png` });
    out.push(`${name} <- ${path}`);
  };

  await page.setViewportSize({ width: 1440, height: 900 });

  await shoot('/attendance', '01-attendance-today');
  await shoot('/attendance-history', '02-attendance-history');
  await shoot('/notifications', '03-communications-announcements');
  await shoot('/events', '04-communications-events');
  await shoot('/schedule', '05-schedule-export', 2200);
  await shoot('/bookings', '06-bookings-decided-by');
  await shoot('/members', '07-members');

  return out.join('\n');
}
