/**
 * 0153: a gym publishes version 2 of its house rules; a member who agreed to
 * version 1 (and is up to date on the Terms and Privacy Policy) sees one row on
 * Today — the house rules — which opens /terms#house-rules; the rules are shown
 * word for word with "You agreed to version 1"; "Agree to these rules" sends
 * the id of the version in effect.
 *
 * Same planted session and routed network as home-audit.js / member-terms-check.js.
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
  ];
  const TABLES = {
    profiles: [ME, COACH],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', experience_level: 'intermediate',
      onboarding_completed_at: iso(-119, 9, 0), created_at: iso(-120, 9, 0), profiles: ME }],
    membership_plans: [PLAN],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p-prem', status: 'active',
      start_date: dstr(-12), expiry_date: dstr(18), never_expires: false, frozen_at: null,
      created_at: iso(-12, 9, 0), membership_plans: PLAN }],
    classes: CLASSES,
    class_availability: CLASSES.map((c) => ({ ...c, booked: 7, seats_left: 5 })),
    bookings: [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved',
      requested_at: iso(-2, 10, 0), approved_at: iso(-2, 11, 0), rejected_at: null,
      decided_by: 't1', decided_by_role: 'trainer', decided_at: iso(-2, 11, 0), classes: CLASSES[0] }],
    pt_sessions: [{ id: 'pt1', member_id: 'm1', trainer_id: 't1', starts_at: iso(1, 16, 0),
      duration_minutes: 60, status: 'pending', notes: 'Deadlift technique',
      payment_id: null, created_at: iso(-1, 9, 0) }],
    attendance: [-1, -2, -4, -5, -7, -9, -11].map((d, i) => ({ id: `a${i}`, member_id: 'm1',
      gym_id: null, check_in_time: iso(d, 6, 40), method: 'qr', recorded_by: 'u1' })),
    notifications: [{ id: 'n1', user_id: 'm1', type: 'booking', title: 'Your session is confirmed',
      message: 'Kenji approved it.', action_url: '/member/bookings', metadata: null,
      read: false, created_at: iso(0, 8, 10) }],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', short_name: 'CF' }],
    workout_logs: [], workout_sets: [], body_measurements: [], fitness_goals: [],
    achievements: [], achievement_unlocks: [], notification_prefs: [], member_share_prefs: [],
    challenges: [], challenge_participants: [], point_ledger: [], point_rules: [],
    rewards: [], events: [], event_registrations: [], workout_resources: [],
    trainer_profiles: [], public_trainers: [], trainer_availability: [], workout_plans: [],
    membership_events: [], payments: [], plan_features: [], features: [], activity_feed: [],
    // 0151: agreed to an older Terms at sign-up, and to the current Privacy Policy.
    terms_acceptances: [
      { document: 'member_terms', version: '2099-01-01', accepted_at: iso(-30, 9, 0), source: 'in_app' },
      { document: 'member_privacy', version: '2026-09-19', accepted_at: iso(-30, 9, 0), source: 'signup' },
    ],
  };
  const RPC = {
    my_features: [
      { key: 'workout_tracker', label: 'Workout tracker', description: '', enabled: true },
      { key: 'plan_builder', label: 'Training plan builder', description: '', enabled: true },
      // Without this the chathead does not mount, and the overlap check passes
      // by not testing the element that causes it. Omitted on the first run,
      // which is exactly the kind of green that means nothing.
      { key: 'ai_model', label: 'Fitness assistant', description: '', enabled: true },
      { key: 'points_earn', label: 'Earn CORE Points', description: '', enabled: true },
      { key: 'challenges', label: 'Gym challenges', description: '', enabled: true },
    ],
    plan_allows: true, member_points_balance: 340,
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    member_commitments: [], challenge_progress: [], goal_progress: [],
    sync_my_achievements: 0, my_trainer_ratings: [], may_rate_trainer: false,
    accept_member_terms: 1,
    accept_house_rules: true,
    my_house_rules: { id: 'hr2', version: 2, body: 'Towels on benches.\nNo chalk on the platform.\n90 minutes at peak hours.',
      published_at: iso(-1, 9, 0), accepted_at: null, agreed_version: 1 },
  };
  const accepted = [];

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
      if (fn === 'accept_member_terms' || fn === 'accept_house_rules') accepted.push({ fn, ...JSON.parse(req.postData() || '{}') });
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
    return json([]);
  });


  const failures = [];
  const notes = [];
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/member/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const strip = page.locator('section:has-text("Updated for you to read")');
  if (!(await strip.count())) failures.push('Today shows nothing for a member behind on the house rules');
  else {
    const text = await strip.innerText();
    notes.push(`today: ${text.replace(/\n+/g, ' | ')}`);
    if (!/house rules/i.test(text) || !/Version 2/.test(text)) failures.push('the strip does not name the house rules and their version');
    if (/Terms of Service|Privacy Policy/.test(text)) failures.push('the strip asks about documents the member is up to date on');
    await strip.locator('text=house rules').click();
    await page.waitForTimeout(3500);
    const url = new URL(page.url());
    notes.push(`tap: ${url.pathname}${url.hash}`);
    if (url.pathname + url.hash !== '/terms#house-rules') failures.push(`the row opened ${url.pathname}${url.hash}`);
  }

  const block = page.locator('#house-rules');
  if (!(await block.count())) failures.push('MISSING: no house rules on the Terms page');
  else {
    const top = await block.evaluate((el) => el.getBoundingClientRect().top);
    if (top < 0 || top > 852) failures.push(`#house-rules is not on screen after the tap (top ${Math.round(top)})`);
    const said = await block.innerText();
    notes.push(`block: ${said.replace(/\n+/g, ' | ')}`);
    if (!/90 minutes at peak hours/.test(said)) failures.push('the rules are not shown word for word');
    if (!/You agreed to version 1/.test(said)) failures.push('the block does not say which version they agreed to');
    await block.locator('button:has-text("Agree to these rules")').click();
    await page.waitForTimeout(800);
    const after = await block.innerText();
    if (!/You agreed to these rules/.test(after)) failures.push('after agreeing, the block does not say so');
    const sent = accepted.find((a) => a.fn === 'accept_house_rules');
    notes.push(`sent: ${JSON.stringify(sent ?? null)}`);
    if (sent?.p_rules !== 'hr2') failures.push('accept_house_rules was not sent the version in effect');
  }
  return { failures, notes };
}
