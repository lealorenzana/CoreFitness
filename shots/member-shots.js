async (page) => {
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

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

  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  // ── Who is signed in is a parameter: the member pages and the trainer
  //    pages need different sessions, and re-planting mid-run is how you end
  //    up screenshotting one role's data under the other's chrome.
  const ROLE = 'trainer';  // flip to 'member' for the member-side shots
  const WHO = ROLE === 'trainer'
    ? { id: 't1', role: 'trainer', email: 'tere@corefitness.test' }
    : { id: 'm1', role: 'member', email: 'lea@corefitness.test' };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: WHO.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: WHO.id, aud: 'authenticated', role: 'authenticated', email: WHO.email,
            app_metadata: {}, user_metadata: {} },
  };

  const MEMBER = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test',
    role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) };
  const MEMBER2 = { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness.test',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-80, 9, 0) };
  const T1 = { id: 't1', first_name: 'Tere', last_name: 'Bautista', email: 'tere@corefitness.test',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) };
  const T2 = { id: 't2', first_name: 'Marco', last_name: 'Dela Cruz', email: 'marco@corefitness.test',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-200, 9, 0) };

  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1200, duration_days: 30,
    is_active: true, description: 'Everything', can_book_classes: true, can_book_pt: true,
    class_bookings_per_week: null, pt_sessions_per_month: 4 };

  // Two classes tomorrow: one the member has NOT booked, and one at the same
  // hour as an existing commitment so the clash marking is visible.
  const CLASSES = [
    { id: 'c1', name: 'Morning Yoga', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Studio A', class_type: 'group', scheduled_at: iso(1, 6, 0),
      duration_minutes: 60, template_id: 'ct1', created_at: iso(-30, 9, 0) },
    { id: 'c2', name: 'Strength Basics', trainer_id: 't2', level: 'beginner', capacity: 8,
      location: 'Main Floor', class_type: 'group', scheduled_at: iso(1, 6, 30),
      duration_minutes: 45, template_id: 'ct2', created_at: iso(-30, 9, 0) },
    { id: 'c3', name: 'Evening HIIT', trainer_id: 't1', level: 'intermediate', capacity: 20,
      location: 'Studio B', class_type: 'group', scheduled_at: iso(2, 18, 0),
      duration_minutes: 90, template_id: 'ct3', created_at: iso(-30, 9, 0) },
  ];

  // The member is already in Morning Yoga at 06:00 tomorrow, so Strength Basics
  // at 06:30 must render as a clash rather than as bookable.
  const BOOKINGS = [
    { id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved', requested_at: iso(-2, 9, 0),
      approved_at: iso(-2, 10, 0), rejected_at: null, approved_by: 't1',
      decided_by: 't1', decided_by_role: 'trainer', decided_at: iso(-2, 10, 0), classes: CLASSES[0] },
    { id: 'b9', member_id: 'm2', class_id: 'c3', status: 'pending', requested_at: iso(-3, 9, 0),
      approved_at: null, rejected_at: null, approved_by: null,
      decided_by: null, decided_by_role: null, decided_at: null, classes: CLASSES[2] },
  ];

  const PT = [
    { id: 's1', trainer_id: 't1', member_id: 'm2', starts_at: iso(2, 10, 0), duration_minutes: 60,
      status: 'pending', notes: null, requested_at: iso(-4, 11, 0), approved_at: null,
      approved_by: null, decided_by: null, decided_by_role: null, decided_at: null,
      payment_id: null, created_at: iso(-4, 11, 0) },
  ];

  const TABLES = {
    profiles: [MEMBER, MEMBER2, T1, T2],
    member_profiles: [MEMBER, MEMBER2].map((m) => ({
      profile_id: m.id, gym_id: null, address: 'Mamburao', emergency_contact_name: null,
      emergency_contact_phone: null, emergency_contact_relationship: null,
      qr_code: `QR-${m.id}`, experience_level: 'beginner', date_of_birth: '1998-04-12',
      gender: 'female', interests: ['yoga'], onboarding_completed_at: iso(-100, 9, 0),
      created_at: iso(-120, 9, 0), profiles: m,
    })),
    trainer_profiles: [T1, T2].map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning',
      bio: 'Ten years coaching members of every level in Mamburao.',
      availability: null, certifications: ['NASM-CPT', 'First Aid / CPR'], profiles: t,
    })),
    public_trainers: [T1, T2].map((t) => ({
      id: t.id, first_name: t.first_name, last_name: t.last_name, photo_url: null,
      specialization: 'Strength & conditioning',
      bio: 'Ten years coaching members of every level in Mamburao.',
      certifications: ['NASM-CPT', 'First Aid / CPR'],
    })),
    public_trainer_credentials: [
      { trainer_id: 't1', title: 'NASM Certified Personal Trainer', verified_on: iso(-60, 9, 0) },
      { trainer_id: 't1', title: 'First Aid / CPR', verified_on: iso(-120, 9, 0) },
    ],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active',
      start_date: dstr(-20), expiry_date: dstr(10), never_expires: false, frozen_at: null,
      created_at: iso(-20, 9, 0), membership_plans: PREMIUM }],
    classes: CLASSES,
    class_availability: CLASSES.map((c) => ({ class_id: c.id, capacity: c.capacity, booked_count: 3 })),
    bookings: BOOKINGS,
    pt_sessions: PT,
    trainer_busy_slots: [],
    trainer_availability: [
      { id: 'av1', trainer_id: 't1', day_of_week: 1, start_time: '06:00', end_time: '18:00' },
      { id: 'av2', trainer_id: 't2', day_of_week: 1, start_time: '06:00', end_time: '18:00' },
    ],
    trainer_rating_summary: [{ trainer_id: 't1', average_stars: 4.7, rating_count: 6 }],
    notifications: [
      { id: 'n1', user_id: WHO.id, type: 'system', title: 'Holiday hours this weekend',
        message: 'The gym closes at 6pm on Saturday and Sunday.', action_url: null,
        metadata: null, read: false, created_at: iso(-1, 10, 0) },
      { id: 'n2', user_id: WHO.id, type: 'payment', title: 'Payment received',
        message: 'The gym has confirmed your payment of PHP 1,200.',
        action_url: '/member/payments', metadata: { dedupe: 'payment:pay1:paid' },
        read: false, created_at: iso(0, 9, 30) },
      { id: 'n3', user_id: WHO.id, type: 'booking', title: 'Your session is confirmed',
        message: 'Tere Bautista accepted your request for Thursday 10:00.',
        action_url: '/member/bookings', metadata: null, read: true, created_at: iso(-2, 10, 5) },
    ],
    events: [
      { id: 'e1', title: 'Summer Fitness Challenge Launch',
        description: 'Eight weeks, four checkpoints, and a shirt for everyone who finishes.',
        starts_at: iso(6, 8, 0), duration_minutes: 180, location: 'Main Floor', capacity: 40,
        cancelled: false, is_featured: true, fee: null, what_to_bring: 'Towel and water',
        who_is_it_for: 'Everyone, no experience needed', contact: 'Front desk',
        image_url: null, created_by: null, created_at: iso(-5, 9, 0) },
      { id: 'e2', title: 'Nutrition Talk with a Dietitian',
        description: 'Practical eating around training, for people who cook at home.',
        starts_at: iso(14, 18, 0), duration_minutes: 90, location: 'Studio B', capacity: 25,
        cancelled: false, is_featured: false, fee: 150, what_to_bring: null,
        who_is_it_for: 'Premium members', contact: 'Tere', image_url: null,
        created_by: null, created_at: iso(-3, 9, 0) },
    ],
    event_registrations: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: null, email: null, opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, updated_at: iso(0, 9, 0), updated_by: null }],
    features: [], plan_features: [], point_ledger: [], attendance: [],
    body_measurements: [], fitness_goals: [], workout_logs: [], workout_sets: [],
    achievements: [], achievement_unlocks: [], challenges: [], challenge_participants: [],
    rewards: [], reward_redemptions: [], trainer_ratings: [], trainer_feedback: [],
    workout_resources: [], notification_prefs: [], member_share_prefs: [],
    push_subscriptions: [], payments: [], gym_plans: [], assistant_chats: [],
  };

  const RPC = {
    member_commitments: [
      { source: 'class', ref_id: 'b1', starts_at: iso(1, 6, 0), ends_at: iso(1, 7, 0),
        label: 'Morning Yoga' },
    ],
    member_points_balance: 340,
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    my_trainer_ratings: [
      { stars: 5, comment: 'Really patient with beginners. Explained every movement.',
        period: dstr(-6).slice(0, 8) + '01', created_at: iso(-6, 9, 0) },
      { stars: 4, comment: 'Good session, would like more time on cool-down.',
        period: dstr(-40).slice(0, 8) + '01', created_at: iso(-40, 9, 0) },
    ],
    plan_allows: true,
    // The real shape from `my_features()`: key, label, description, enabled.
    // A Premium member has all six, which is what makes the unlocked screens
    // render rather than showing a FeatureLock.
    my_features: [
      { key: 'workout_tracker', label: 'Workout tracker',
        description: 'Record exercises, sets, reps and weight.', enabled: true },
      { key: 'plan_builder', label: 'AI workout plan',
        description: 'A training plan built around your days and your goal.', enabled: true },
      { key: 'ai_model', label: 'Smarter AI assistant',
        description: 'General fitness questions answered by an AI model.', enabled: true },
      { key: 'points_earn', label: 'Earn CORE Points',
        description: 'Collect points for checking in and logging workouts.', enabled: true },
      { key: 'points_redeem', label: 'Redeem CORE Points',
        description: 'Exchange your points for gym rewards.', enabled: true },
      { key: 'challenges', label: 'Gym challenges',
        description: 'Join gym challenges and earn points.', enabled: true },
    ],
    sync_my_achievements: 0,
  };

  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const afterHost = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = afterHost.indexOf('?');
    const pathname = qi === -1 ? afterHost : afterHost.slice(0, qi);
    const query = qi === -1 ? '' : afterHost.slice(qi + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), '']
        : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*' } });

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

  // A phone, because that is what this app is.
  await page.setViewportSize({ width: 402, height: 880 });

  const out = [];
  // 5s, not 1.8s. The first run screenshotted the boot splash: ProtectedRoute
  // resolves a session, then a profile, then the page's own service assembles
  // several tables — and none of that had finished. A screenshot taken early
  // is not evidence of anything.
  const shoot = async (path, name, wait = 5000) => {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `shots/${name}.png` });
    out.push(`${name} <- ${path}`);
  };

  if (WHO.role === 'trainer') {
    await shoot('/trainer/bookings', '13-trainer-accept-decline');
    await shoot('/trainer/profile', '14-trainer-own-ratings-anonymous', 5500);
  } else {
    await shoot('/member/book-class', '11-member-booking-clash');
    await shoot('/member/notifications', '12-member-updates');
    await shoot('/member/trainer/t1', '15-trainer-credentials', 5500);
  }

  return out.join('\n');
}
