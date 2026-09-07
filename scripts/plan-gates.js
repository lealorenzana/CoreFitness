// Drives the member app once per plan and reports what each one actually
// unlocks. Answers TEST_MATRIX §2 (tests 2.1–2.4) without needing anyone's
// password.
//
// ── What this proves, and what it does not ──────────────────────────────────
//
// It exercises the **real application code** — `useFeatures`, `FeatureLock`,
// and every gated screen's own branching — against a controlled `my_features()`
// answer for each tier. So it proves the app locks the right screens, that a
// lock explains itself in the words the database gave it, and that no route
// disappears.
//
// It does **not** prove RLS. The network is routed, so nothing here reaches
// Postgres; a member who gets past the UI is a separate test (2.6) that needs a
// real signed-in session. Do not read a pass here as "the gate holds".
//
// ── How to run it ───────────────────────────────────────────────────────────
//
// Paste the whole file into the Playwright MCP runner
// (`browser_run_code_unsafe`) with the member dev server up on :5173. It
// returns a report object; it takes no screenshots.
//
// ── The expectations are not written by hand ────────────────────────────────
//
// `DEFAULTS` below is transcribed from migration 0049's `insert into features`
// seed, which is the only place the per-tier answer is defined. If a row here
// disagrees with the app, check 0049 *and* the admin's plan matrix before
// calling it a bug — `plan_features.enabled` is what actually decides, and an
// admin who unticks a box is not overruled by a default.

async (page) => {
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  // `btoa` and `Buffer` are both undefined in this runner's process.
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

  // ── The six gateable areas, exactly as migration 0049 seeds them ──────────
  //    [default_free, default_freemium, default_premium]
  const DEFAULTS = {
    workout_tracker: [false, true, true],
    plan_builder:    [false, false, true],
    ai_model:        [false, false, true],
    points_earn:     [false, true, true],
    points_redeem:   [false, false, true],
    challenges:      [false, true, true],
  };
  const LABELS = {
    workout_tracker: ['Workout tracker', 'Record exercises, sets, reps and weight, and see your training history.'],
    plan_builder:    ['AI workout plan', 'Answer a few questions and get a training plan built around your days and your goal.'],
    ai_model:        ['Smarter AI assistant', 'General fitness and training questions answered by an AI model. Everyone can still ask the assistant about the gym, your membership and your bookings.'],
    points_earn:     ['Earn CORE Points', 'Collect points for checking in, logging workouts and attending sessions.'],
    points_redeem:   ['Redeem CORE Points', 'Exchange your points for gym rewards.'],
    challenges:      ['Gym challenges', 'Join gym challenges and earn points for finishing them.'],
  };

  // The gym sells three (0060). Index into DEFAULTS by tier position.
  const PLANS = [
    { name: 'Free Plan',  tier: 'free',     idx: 0, price: 0,    days: null, classes: false, pt: false, perWeek: null, perMonth: null },
    { name: 'Free Trial', tier: 'freemium', idx: 1, price: 0,    days: 30,   classes: true,  pt: false, perWeek: 1,    perMonth: null },
    { name: 'Premium',    tier: 'premium',  idx: 2, price: 1500, days: 30,   classes: true,  pt: true,  perWeek: null, perMonth: null },
  ];

  // Mutable: the route handler reads it, so one registration serves all three
  // runs. Re-registering per plan leaves the old handler in place and the first
  // one wins — which silently tests the same plan three times.
  let PLAN = PLANS[0];

  const featuresFor = (plan) => Object.keys(DEFAULTS).map((key) => ({
    key,
    label: LABELS[key][0],
    description: LABELS[key][1],
    enabled: DEFAULTS[key][plan.idx],
  }));

  const WHO = { id: 'm1', role: 'member', email: 'free.member@corefitness-test.com' };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: WHO.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: WHO.id, aud: 'authenticated', role: 'authenticated', email: WHO.email,
            app_metadata: {}, user_metadata: {} },
  };
  const MEMBER = { id: 'm1', first_name: 'Test', last_name: 'Member', email: WHO.email,
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9, 0) };

  const planRow = () => ({
    id: `p-${PLAN.tier}`, name: PLAN.name, tier: PLAN.tier, price: PLAN.price,
    duration_days: PLAN.days ?? 30, is_active: true, description: PLAN.name,
    can_book_classes: PLAN.classes, can_book_pt: PLAN.pt,
    class_bookings_per_week: PLAN.perWeek, pt_sessions_per_month: PLAN.perMonth,
  });

  const tables = () => ({
    profiles: [MEMBER],
    member_profiles: [{ profile_id: 'm1', gym_id: null, address: 'Mamburao',
      emergency_contact_name: null, emergency_contact_phone: null,
      emergency_contact_relationship: null, qr_code: 'QR-m1', experience_level: 'beginner',
      date_of_birth: '1998-04-12', gender: 'female', interests: [],
      onboarding_completed_at: iso(-80, 9, 0), created_at: iso(-90, 9, 0), profiles: MEMBER }],
    membership_plans: [planRow()],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: `p-${PLAN.tier}`, status: 'active',
      start_date: dstr(-10), expiry_date: PLAN.days ? dstr(20) : null,
      never_expires: PLAN.days === null, frozen_at: null, created_at: iso(-10, 9, 0),
      membership_plans: planRow() }],
    // The free library (0019) is never gated. It needs rows, or "no resources
    // yet" would be indistinguishable from a lock.
    workout_resources: [
      { id: 'w1', title: 'Bodyweight basics', description: 'A first session with no equipment.',
        category: 'strength', level: 'beginner', media_url: null, body_part: 'full body',
        equipment: null, duration_minutes: 20, is_published: true, created_at: iso(-40, 9, 0) },
      { id: 'w2', title: 'Warm-up routine', description: 'Ten minutes before anything heavy.',
        category: 'mobility', level: 'beginner', media_url: null, body_part: 'full body',
        equipment: null, duration_minutes: 10, is_published: true, created_at: iso(-40, 9, 0) },
    ],
    rewards: [{ id: 'r1', name: 'Free shaker bottle', description: 'Collect at the desk.',
      cost_points: 200, stock: 5, is_active: true, created_at: iso(-30, 9, 0) }],
    point_rules: [{ id: 'pr1', action: 'check_in', points: 10, label: 'Check in', is_active: true }],
    challenges: [{ id: 'ch1', title: 'August step challenge', description: 'Walk it off.',
      metric: 'workouts', target: 12, starts_on: dstr(-5), ends_on: dstr(20),
      is_active: true, created_at: iso(-6, 9, 0) }],
    classes: [], bookings: [], pt_sessions: [], attendance: [], notifications: [],
    events: [], event_registrations: [], point_ledger: [], reward_redemptions: [],
    challenge_participants: [], workout_logs: [], workout_sets: [], body_measurements: [],
    fitness_goals: [], achievements: [], achievement_unlocks: [], trainer_profiles: [],
    public_trainers: [], trainer_availability: [], trainer_busy_slots: [],
    class_availability: [], features: [], plan_features: [], payments: [],
    notification_prefs: [], member_share_prefs: [], push_subscriptions: [],
    assistant_chats: [], gym_plans: [], trainer_ratings: [], trainer_feedback: [],
    public_trainer_credentials: [], trainer_rating_summary: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao',
      phone: null, email: null, opening_time: '06:00', closing_time: '21:00',
      logo_url: null, short_name: 'CF', tagline: null, activity_options: [],
      updated_at: iso(0, 9, 0), updated_by: null }],
  });

  const rpcs = () => ({
    my_features: featuresFor(PLAN),
    // `plan_allows` is asked per key by some callers; the fixture cannot see
    // which, so it answers from the plan rather than blanket-true. A blanket
    // true here would unlock screens the report then calls "correctly open".
    plan_allows: DEFAULTS.workout_tracker[PLAN.idx],
    member_points_balance: 120,
    member_progression: [{ level: 2, points: 120, next_level_points: 300 }],
    member_commitments: [],
    my_trainer_ratings: [],
    sync_my_achievements: 0,
  });

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
      const R = rpcs();
      return json(fn in R ? R[fn] : null);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
      let rows = tables()[table] ?? [];
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

  await page.setViewportSize({ width: 402, height: 880 });

  const LOCK_LINE = "isn't part of your current membership";
  const FAIL_LINE = "Couldn't check your membership";
  const BUSY_LINE = 'Checking your membership';

  // 5s, not 2s. `ProtectedRoute` resolves a session, then a profile, then the
  // page's own service; a screen read early is not evidence of anything.
  const visit = async (path, wait = 5000) => {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(wait);
    return {
      url: page.url().replace('http://localhost:5173', ''),
      text: (await page.locator('body').innerText()).replace(/\s+/g, ' '),
    };
  };

  const report = [];

  for (const plan of PLANS) {
    PLAN = plan;
    const rows = [];

    // ── The six gated areas ────────────────────────────────────────────────
    const CHECKS = [
      ['workout_tracker', '/member/track'],
      ['plan_builder',    '/member/plan'],
      ['ai_model',        '/member/chatbot'],
      ['points_earn',     '/member/rewards'],
      ['challenges',      '/member/challenges'],
    ];

    for (const [key, path] of CHECKS) {
      const { url, text } = await visit(path);
      const expected = DEFAULTS[key][plan.idx];
      const locked = text.includes(LOCK_LINE);
      const failed = text.includes(FAIL_LINE);
      const busy = text.includes(BUSY_LINE);
      // A route that redirected is a screen that HID rather than locked, which
      // is the one outcome this whole design exists to prevent.
      const hidden = !url.startsWith(path);
      const state = failed ? 'check-failed' : busy ? 'still-loading'
        : hidden ? 'HIDDEN' : locked ? 'locked' : 'open';
      rows.push({
        key, path, expected: expected ? 'open' : 'locked', got: state,
        pass: state === (expected ? 'open' : 'locked'),
        // The lock must speak in the database's words, not the component's.
        wordsFromDb: locked ? text.includes(LABELS[key][0]) : null,
      });
    }

    // ── points_redeem is not a screen: it is the Redeem button on Rewards ───
    //    TEST_MATRIX said "Rewards page", which is wrong — the page is gated on
    //    points_earn, and redeeming is gated inside it.
    {
      const { text } = await visit('/member/rewards');
      const expected = DEFAULTS.points_redeem[plan.idx];
      const earns = DEFAULTS.points_earn[plan.idx];
      const told = text.includes('does not include redeeming them yet');
      const state = !earns ? 'n/a — page locked on points_earn'
        : told ? 'locked, and says so' : 'open';
      rows.push({
        key: 'points_redeem', path: '/member/rewards (Redeem button)',
        expected: !earns ? 'n/a' : expected ? 'open' : 'locked, and says so',
        got: state,
        pass: !earns ? true : state === (expected ? 'open' : 'locked, and says so'),
        wordsFromDb: null,
      });
    }

    // ── The chathead lives in the shell, not on a route ─────────────────────
    {
      await visit('/member/home');
      // Counted in the DOM, never by visibility. `FloatingChathead` starts at
      // `opacity: 0` and is animated in, and on a non-compositing page no
      // animation runs — an `isVisible()` check would report every plan as
      // locked, including Premium.
      const chathead = await page.locator('.cursor-grab').count();
      const expected = DEFAULTS.ai_model[plan.idx];
      rows.push({
        key: 'ai_model (chathead)', path: '/member/home',
        expected: expected ? 'present' : 'absent',
        got: chathead > 0 ? 'present' : 'absent',
        pass: (chathead > 0) === expected, wordsFromDb: null,
      });
    }

    // ── The free library is never gated (0019) ─────────────────────────────
    {
      const { url, text } = await visit('/member/workouts');
      const reachable = url.startsWith('/member/workouts') && !text.includes(LOCK_LINE);
      const hasContent = text.includes('Bodyweight basics') || text.includes('Warm-up routine');
      rows.push({
        key: 'free library (never gated)', path: '/member/workouts',
        expected: 'open, with resources', got: reachable ? (hasContent ? 'open, with resources' : 'open but empty') : 'LOCKED OR HIDDEN',
        pass: reachable && hasContent, wordsFromDb: null,
      });
    }

    report.push({ plan: plan.name, tier: plan.tier, rows });
  }

  const failures = report.flatMap((p) => p.rows.filter((r) => !r.pass).map((r) => `${p.plan}: ${r.key} — expected ${r.expected}, got ${r.got}`));
  return { report, failures, summary: failures.length ? `${failures.length} FAILED` : 'all pass' };
}
