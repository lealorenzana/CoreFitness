/**
 * Motion check (Nocturne, 2026-09-17).
 *
 * Proves the motion layer in index.css does what it says: screens and sections
 * animate, every animated element finishes fully opaque, the tab bar's mark and
 * icon respond, the check-in block breathes, and a member who asked for reduced
 * motion gets none of it. Same fixture harness as nocturne-shots.js.
 *
 * Playwright runner's `filename`, member dev server on :5173.
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
      { id: 'w1', title: 'Full-body starter', provider: 'NHS Live Well', url: 'https://www.nhs.uk/live-well/exercise/',  description: 'Three moves, no equipment, twenty minutes.',
        category: 'strength', level: 'beginner', media_url: null, image_url: null, body_part: 'full body',
        equipment: null, duration_minutes: 20, is_published: true, sort_order: 1, created_at: iso(-40, 9, 0) },
      { id: 'w2', title: 'Mobility before lifting', provider: 'r/bodyweightfitness', url: 'https://www.reddit.com/r/bodyweightfitness/wiki/',  description: 'Ten minutes that make the first set feel easier.',
        category: 'mobility', level: 'beginner', media_url: null, image_url: null, body_part: 'hips',
        equipment: null, duration_minutes: 10, is_published: true, sort_order: 2, created_at: iso(-40, 9, 0) },
      { id: 'w3', title: 'Push day, intermediate', provider: 'StrengthLevel', url: 'https://strengthlevel.com/',  description: 'Chest, shoulders and triceps in five movements.',
        category: 'strength', level: 'intermediate', media_url: null, image_url: null, body_part: 'upper body',
        equipment: 'barbell', duration_minutes: 45, is_published: true, sort_order: 3, created_at: iso(-38, 9, 0) },
    ],
    rewards: [{ id: 'r1', name: 'Shaker bottle', description: 'Collect at the desk.', cost_points: 200,
      stock: 5, is_active: true, image_url: null, created_at: iso(-30, 9, 0) },
      { id: 'r2', name: 'One free PT session', description: 'Sixty minutes with any coach.',
        cost_points: 800, stock: 2, is_active: true, image_url: null, created_at: iso(-30, 9, 0) }],
    point_rules: [{ key: 'checkin', label: 'Checked in at the gym', points: 10, is_active: true, sort_order: 1 },
      { key: 'workout_logged', label: 'Logged a workout', points: 15, is_active: true, sort_order: 2 }],
    // Real columns: `rule_key` and the joined rule's label (0051), not `reason`.
    point_ledger: [-1, -2, -4].map((d, i) => ({ id: `pl${i}`, member_id: 'm1', rule_key: 'checkin', points: 10,
      created_at: iso(d, 6, 41), point_rules: { label: 'Checked in at the gym' } })),
    challenges: [{ id: 'ch1', title: 'Twelve sessions in September', description: 'Three a week, near enough.',
      metric_key: 'check_ins', target: 12, starts_on: dstr(-13), ends_on: dstr(17), is_active: true,
      reward_points: 250, image_url: null, achievement_metrics: { label: 'Check-ins' },
      created_at: iso(-14, 9, 0) }],
    challenge_participants: [{ id: 'cp1', challenge_id: 'ch1', member_id: 'm1', joined_at: iso(-13, 9, 0), completed_on: null }],
    workout_logs: [-1, -2, -4, -5].map((d, i) => ({ id: `wl${i}`, member_id: 'm1',
      performed_on: dstr(d), activity: 'Strength', duration_minutes: 55, notes: null,
      source: 'manual', completed_at: iso(d, 8, 30), created_at: iso(d, 7, 40) })),
    workout_sets: [],
    body_measurements: [{ id: 'bm1', member_id: 'm1', measured_on: dstr(-30), weight_kg: 61.5,
      height_cm: 163, waist_cm: 74, created_at: iso(-30, 9, 0) },
      { id: 'bm2', member_id: 'm1', measured_on: dstr(-2), weight_kg: 60.1, height_cm: 163,
        waist_cm: 72, created_at: iso(-2, 9, 0) }],
    // Real columns (0020): title, metric, start_value, target_value, deadline.
    fitness_goals: [{ id: 'g1', member_id: 'm1', title: 'Get to 58 kg', metric: 'weight_kg',
      start_value: 61.5, target_value: 58, deadline: dstr(45), status: 'active',
      created_at: iso(-30, 9, 0), achieved_at: null }],
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
    public_trainers: [{ id: 't1', first_name: 'Kenji', last_name: 'Ramos',
      specialization: 'Strength & conditioning', bio: 'Ten years coaching, mostly barbells.',
      photo_url: null, availability: 'Weekdays, 8 AM to 5 PM', years_experience: 10,
      certifications: ['NASM-CPT'], focus_areas: ['Strength', 'Technique'] }],
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
    notification_prefs: [{ user_id: 'm1', sound_enabled: true, cat_booking: true, cat_payment: true, cat_membership: true, cat_event: false }],
    member_share_prefs: [{ member_id: 'm1', share_measurements: true, share_goals: true, share_workouts: false }],
    push_subscriptions: [], assistant_chats: [], workout_plans: [],
    gym_plans: [1, 3, 5].map((d) => ({ id: `gp${d}`, member_id: 'm1', day_of_week: d, active: true,
      remind_at: '17:00:00', last_reminded_on: null, created_at: iso(-20, 9, 0) })),
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
    // The RPC's real columns — `getProgression` maps these, and the old
    // `{ level, points }` shape rendered "undefined checked in".
    member_progression: [{ level: 'intermediate', computed_level: 'intermediate', training_days: 41,
      verified_days: 37, logged_days: 4, consistent_weeks: 9, current_week_streak: 3, best_week_streak: 6,
      next_level: 'advanced', next_days: 59, next_weeks: 15, member_since: dstr(-120) }],
    member_commitments: [],
    my_trainer_ratings: [],
    may_rate_trainer: false,
    sync_my_achievements: 0,
    // A scalar, as the real RPC returns — an array here renders NaN.
    challenge_progress: 7,
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
    // Content-Range carries the real row count: `count: 'exact', head: true`
    // reads nothing but this header, and a fixed "0-2/3" made every existence
    // check answer yes (the bar showed "Checked in" to a member who was not).
    const json = (b, s = 200, total = Array.isArray(b) ? b.length : 1) => route.fulfill({ status: s,
      contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': total ? `0-${total - 1}/${total}` : '*/0', 'Access-Control-Allow-Origin': '*',
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
        if (v === 'is.null' && rows.length) rows = rows.filter((r) => r[k] == null);
        const g = /^gte\.(.*)$/.exec(v);
        if (g && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) >= g[1]);
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

  const out = [];
  const check = (name, ok, detail) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail != null ? ` — ${detail}` : ''}`);
  const BASE = 'http://localhost:5173';

  // ── 1. Motion on: the screen and its sections animate, and END visible ────
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${BASE}/member/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForSelector('main .noc-stack', { timeout: 9000 });

  const names = await page.evaluate(() => {
    const screen = document.querySelector('main > .noc-screen');
    const stack = document.querySelector('main .noc-stack');
    return {
      screen: screen ? getComputedStyle(screen).animationName : null,
      first: stack?.children[0] ? getComputedStyle(stack.children[0]).animationName : null,
      thirdDelay: stack?.children[2] ? getComputedStyle(stack.children[2]).animationDelay : null,
      stackCount: stack ? stack.children.length : 0,
    };
  });
  check('screen fades in', names.screen === 'noc-fade', names.screen);
  check('sections rise', names.first === 'noc-rise', names.first);
  check('sections are staggered', names.thirdDelay === '0.09s', names.thirdDelay);

  // The rule that matters: whatever animates must finish fully visible.
  await page.waitForTimeout(1500);
  const settled = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.noc-stack > *, .noc-rows > *, .noc-screen')];
    const faint = els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.999);
    const running = document.getAnimations().filter((a) => a.playState === 'running')
      .map((a) => a.animationName ?? a.constructor.name);
    return { total: els.length, faint: faint.length, running: [...new Set(running)] };
  });
  check('every animated element ends fully opaque', settled.faint === 0, `${settled.total} checked, ${settled.faint} faint`);
  check('only the check-in breathe keeps running', settled.running.every((n) => n === 'noc-breathe'), settled.running.join(',') || 'none');

  // ── 2. The tab bar: the mark moves, the icon pops ──────────────────────────
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.waitForTimeout(80);
  const bar = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    const btns = [...nav.querySelectorAll('button')];
    const train = btns.find((b) => b.textContent.includes('Train'));
    const today = btns.find((b) => b.textContent.includes('Today'));
    return {
      pop: getComputedStyle(train.querySelector('.noc-pop')).animationName,
      trainMarkTransition: getComputedStyle(train.querySelector('.noc-mark')).transitionProperty,
      todayPop: today.querySelector('.noc-pop') != null,
    };
  });
  await page.screenshot({ path: 'shots/motion-mid-train.png', animations: 'allow' });
  check('chosen tab icon pops', bar.pop === 'noc-pop', bar.pop);
  check('the tab you left does not pop', bar.todayPop === false);
  check('the tab mark transitions its scale', /transform/.test(bar.trainMarkTransition), bar.trainMarkTransition);
  await page.waitForTimeout(600);
  const marks = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    return [...nav.querySelectorAll('.noc-mark')].map((m) => new DOMMatrix(getComputedStyle(m).transform).a);
  });
  check('mark sits under Train only', marks[0] === 0 && marks[1] === 1 && marks[2] === 0, JSON.stringify(marks));

  // ── 3. Check-in block breathes until checked in ────────────────────────────
  const breathe = await page.evaluate(() => {
    const b = document.querySelector('nav[aria-label="Main"] button[aria-label^="Check in"]');
    return b ? getComputedStyle(b).animationName : 'no block';
  });
  check('check-in block breathes', breathe === 'noc-breathe', breathe);

  // ── 4. Reduced motion: nothing animates at all ─────────────────────────────
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/member/membership`, { waitUntil: 'domcontentloaded' });
  // The boot splash has its own fade and spinner, outside this motion layer.
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForSelector('main .noc-stack', { timeout: 9000 });
  await page.waitForTimeout(300);
  const still = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running')
      .map((a) => a.animationName ?? a.transitionProperty ?? 'anim'),
    stack: getComputedStyle(document.querySelector('main .noc-stack').children[0]).animationName,
  }));
  const ours = still.running.filter((n) => String(n).startsWith('noc-'));
  check('reduced motion: none of the motion layer runs', ours.length === 0 && still.stack === 'none',
    `ours=${ours.join(',') || 'none'}; other=${still.running.filter((n) => !String(n).startsWith('noc-')).join(',') || 'none'}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  return out.join('\n');
}
