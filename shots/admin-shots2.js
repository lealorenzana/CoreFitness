async (page) => {
  // Same fixtures as admin-shots.js; only the interactions differ. Kept as a
  // second file rather than parameterised, because the first run is the "load
  // the page" pass and this is the "click something" pass, and mixing them
  // makes a failure ambiguous about which half broke.
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
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
  const session = {
    access_token: token, refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test',
            app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const A = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle',
    last_name: 'Facalarin', email: 'admin@corefitness.test', phone: null, photo_url: null,
    created_at: iso(-400, 9, 0) };
  const MEMBERS = [
    { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test',
      role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) },
    { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness.test',
      role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-80, 9, 0) },
    { id: 'm3', first_name: 'Ana', last_name: 'Reyes', email: 'ana@corefitness.test',
      role: 'member', status: 'suspended', phone: null, photo_url: null, created_at: iso(-60, 9, 0) },
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
    { id: 'p3', name: 'Premium', tier: 'premium', price: 1200, duration_days: 30, is_active: true,
      description: 'Everything', can_book_classes: true, can_book_pt: true,
      class_bookings_per_week: null, pt_sessions_per_month: 4 },
  ];
  const CLASSES = [
    { id: 'c1', name: 'Morning Yoga', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Studio A', class_type: 'group', scheduled_at: iso(1, 6, 0),
      duration_minutes: 60, template_id: 'ct1', created_at: iso(-30, 9, 0) },
    { id: 'c2', name: 'Strength Basics', trainer_id: 't2', level: 'beginner', capacity: 8,
      location: 'Main Floor', class_type: 'group', scheduled_at: iso(2, 6, 30),
      duration_minutes: 45, template_id: 'ct2', created_at: iso(-30, 9, 0) },
    { id: 'c3', name: 'Evening HIIT', trainer_id: 't1', level: 'intermediate', capacity: 20,
      location: 'Studio B', class_type: 'group', scheduled_at: iso(-4, 18, 0),
      duration_minutes: 90, template_id: 'ct3', created_at: iso(-30, 9, 0) },
  ];
  const BOOKINGS = [
    { id: 'b2', member_id: 'm2', class_id: 'c2', status: 'approved', requested_at: iso(-2, 9, 0),
      approved_at: iso(-2, 10, 0), rejected_at: null, approved_by: 't2',
      decided_by: 't2', decided_by_role: 'trainer', decided_at: iso(-2, 10, 0), classes: CLASSES[1] },
    { id: 'b3', member_id: 'm1', class_id: 'c3', status: 'rejected', requested_at: iso(-6, 9, 0),
      approved_at: null, rejected_at: iso(-4, 9, 0), approved_by: null,
      decided_by: null, decided_by_role: 'system', decided_at: iso(-4, 9, 0), classes: CLASSES[2] },
  ];
  const MEMBERSHIPS = MEMBERS.map((m, i) => ({
    id: `ms${i + 1}`, member_id: m.id, plan_id: PLANS[i % 2].id, status: 'active',
    start_date: dstr(-30), expiry_date: dstr(5 + i), never_expires: false, frozen_at: null,
    created_at: iso(-30, 9, 0), membership_plans: PLANS[i % 2],
  }));

  const TABLES = {
    profiles: [A, ...MEMBERS, ...TRAINERS],
    member_profiles: MEMBERS.map((m) => ({
      profile_id: m.id, gym_id: null, address: 'Mamburao, Occidental Mindoro',
      emergency_contact_name: 'Maria Lorenzana', emergency_contact_phone: '+639170000000',
      emergency_contact_relationship: 'Mother', qr_code: `QR-${m.id}`,
      experience_level: 'beginner', date_of_birth: '1998-04-12', gender: 'female',
      onboarding_completed_at: iso(-100, 9, 0), created_at: iso(-120, 9, 0), profiles: m,
    })),
    trainer_profiles: TRAINERS.map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning',
      bio: 'Ten years coaching.', availability: null, certifications: ['NASM-CPT'], profiles: t,
    })),
    membership_plans: PLANS,
    memberships: MEMBERSHIPS,
    payments: [{ id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1200, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0001', notes: null,
      recorded_by: 'u1', paid_on: dstr(0), created_at: iso(0, 9, 0) }],
    classes: CLASSES, class_templates: [], bookings: BOOKINGS, pt_sessions: [],
    attendance: [{ id: 'a1', member_id: 'm1', gym_id: null, check_in_time: iso(0, 6, 12),
      method: 'qr', recorded_by: 'u1' }],
    events: [], event_registrations: [], notifications: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: null, email: null, opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: 'ADMIN PANEL', max_freeze_days_per_year: 60,
      max_freeze_days_at_once: 30, updated_at: iso(0, 9, 0), updated_by: 'u1' }],
    trainer_availability: [],
    account_status_events: [
      { id: 'ase1', profile_id: 'm1', status: 'active', previous_status: 'suspended',
        reason: 'Dues settled on 2 September.', recorded_by: 'u1', created_at: iso(-5, 14, 0) },
      { id: 'ase2', profile_id: 'm1', status: 'suspended', previous_status: 'active',
        reason: 'Unpaid dues since August. Spoke to them on the 3rd.',
        recorded_by: 'u1', created_at: iso(-20, 11, 0) },
    ],
    membership_events: [], refund_rules: [],
    point_ledger: [
      { id: 'pl1', member_id: 'm1', points: 10, rule_key: 'checkin', source_table: 'attendance',
        source_id: 'a1', created_at: iso(0, 6, 12) },
      { id: 'pl2', member_id: 'm1', points: 15, rule_key: 'workout_logged',
        source_table: 'workout_logs', source_id: 'w1', created_at: iso(-1, 19, 0) },
      { id: 'pl3', member_id: 'm1', points: 25, rule_key: 'class_attended',
        source_table: 'bookings', source_id: 'b2', created_at: iso(-3, 7, 0) },
    ],
    rewards: [], reward_redemptions: [], trainer_ratings: [], trainer_credentials: [],
    trainer_feedback: [], workout_resources: [], achievements: [], achievement_unlocks: [],
    challenges: [], challenge_participants: [], activity_log: [], features: [],
    plan_features: [], point_rules: [], goal_templates: [], body_measurements: [],
    fitness_goals: [], workout_logs: [], workout_sets: [], pending_registrations: [],
    exercises: [],
  };

  const RPC = {
    member_points_balance: 340, sweep_stale_requests: 0, generate_class_instances: 0,
    plan_member_counts: [], member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    trainer_schedule_conflicts: [], admin_trainer_evaluations: [], refund_quote: [],
    frozen_days_last_year: 0, freezes_this_month: 0, set_account_status: null,
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const raw = req.url();
    const afterHost = raw.replace(/^https?:\/\/[^/]+/, '');
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

  await page.setViewportSize({ width: 1440, height: 900 });
  const out = [];

  // ── 1. Bookings, showing a decision made by a trainer ────────────────────
  await page.goto('http://localhost:5174/bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: /^All/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/08-bookings-who-decided.png' });
  out.push('08-bookings-who-decided');

  // ── 2. The suspend dialog, which now demands a reason ────────────────────
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const suspend = page.locator('[data-tip="Suspend account"]').first();
  if (await suspend.count()) {
    await suspend.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'shots/09-suspend-needs-a-reason.png' });
    out.push('09-suspend-needs-a-reason');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else {
    out.push('09 SKIPPED — no suspend control found');
  }

  // ── 3. The member drawer: CORE Points and the account history ───────────
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.getByText('Lea Lorenzana').first().click().catch(() => {});
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'shots/10-member-points-and-history.png' });
  out.push('10-member-points-and-history');

  return out.join('\n');
}
