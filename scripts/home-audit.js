/**
 * Measures /member/home rather than eyeballing a screenshot.
 *
 * Reuses member-shots.js's fixture harness verbatim — same planted session,
 * same routed network — and then asks the layout questions a photograph cannot
 * answer: do any two interactive elements overlap, does the scroll clear the
 * dock, and is every colour on the card actually a token.
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
    return json([]);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/member/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const lines = [];
    const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const label = (el) => (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 34) || '<no text>';

    // Every element a finger can hit, in document order.
    const hits = [...document.querySelectorAll('button, a[href], [role="button"]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; });

    // 1. Overlapping tap targets. Two controls sharing pixels means one of them
    //    is unreachable in that region, and the user cannot tell which.
    lines.push('== overlapping tap targets ==');
    let found = 0;
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        if (hits[i].contains(hits[j]) || hits[j].contains(hits[i])) continue;
        const a = rect(hits[i]), b = rect(hits[j]);
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) {
          found++;
          lines.push(`  ${Math.round(ox)}x${Math.round(oy)}px  "${label(hits[i])}"  OVER/UNDER  "${label(hits[j])}"`);
        }
      }
    }
    if (!found) lines.push('  none');

    // 2. Tap targets below the 44px accessibility floor.
    lines.push('== tap targets under 44px ==');
    const small = hits.map((el) => ({ el, r: rect(el) }))
      .filter(({ r }) => r.h < 44 || r.w < 44);
    lines.push(small.length ? small.map(({ el, r }) => `  ${Math.round(r.w)}x${Math.round(r.h)}  "${label(el)}"`).join('\n') : '  none');

    // 3. Does the scroll actually clear the floating dock?
    lines.push('== dock clearance ==');
    const scroller = document.querySelector('main') || document.scrollingElement;
    const pad = getComputedStyle(scroller).paddingBottom;
    lines.push(`  scroller padding-bottom: ${pad}  (--dock-clear is 116px)`);

    // 4. Hardcoded colours. The design system says every colour is a token;
    //    a literal hex in a style attribute is a value that cannot follow one.
    lines.push('== hardcoded hex in inline styles ==');
    const hexes = new Map();
    for (const el of document.querySelectorAll('[style]')) {
      for (const m of (el.getAttribute('style') || '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        hexes.set(m[0].toLowerCase(), (hexes.get(m[0].toLowerCase()) || 0) + 1);
      }
    }
    lines.push(hexes.size ? [...hexes].map(([h, n]) => `  ${h}  x${n}`).join('\n') : '  none');

    return lines.join('\n');
  });
}
