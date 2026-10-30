/**
 * The big moments (wave 1, 2026-10-27; mock-up approved): Today's arrival once a
 * day, a kiosk check-in the app did not see, a higher earned level, a target the
 * database settled, a challenge finished — each with its real numbers (the
 * ledger row that paid for it), each played once and marked on the account
 * (0216). The owner's switch makes them a small card; the phone's reduce-motion
 * setting makes them still; before 0216 none of the replaying ones play.
 * The workout finish shows the points the ledger paid for that workout.
 *
 * Setup copied from member-program-targets-check.js. Member dev server on :5173.
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

  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9, 0) };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana', email: 'lea@corefitness-test.com', role: 'member' }));
  }, [KEY, session]);

  const QUARTER = { id: 'p4', name: 'Quarterly', tier: 'premium', price: 4200, duration_days: 90, is_active: true,
    description: 'Three months', can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };
  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30, is_active: true,
    description: 'All', can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };
  const EX = [
    { id: 'e1', name: 'Barbell Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 1 },
    { id: 'e2', name: 'Leg Press', muscle_group: 'legs', equipment: 'machine', is_timed: false, is_active: true, sort_order: 2 },
    { id: 'e3', name: 'Plank', muscle_group: 'core', equipment: 'bodyweight', is_timed: true, is_active: true, sort_order: 3 },
  ];
  let n = 0;
  const uid = (p) => `${p}-${++n}`;
  const DB = {
    profiles: [ME],
    member_profiles: [{ profile_id: 'm1', experience_level: 'beginner', qr_code: 'QR', created_at: iso(-90, 9, 0), profiles: ME,
      celebration_sounds: true, celebrated_level: 'beginner', arrival_on: dstr(-1), checkin_celebrated_on: dstr(-1), celebrated_challenges: [] }],
    gym_settings_moments: true,
    membership_plans: [PREMIUM, QUARTER],
    renewal_requests: [], payments: [{ id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'cash', status: 'completed', due_date: null, invoice_number: 'INV-2026-0002', notes: null, recorded_by: 'u9', paid_on: dstr(-10), created_at: iso(-10, 10, 0), plan_id: 'p3', plan_name: 'Premium' }],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: dstr(-9), expiry_date: dstr(21),
      never_expires: false, frozen_at: null, created_at: iso(-10, 9, 0), membership_plans: PREMIUM }],
    exercises: EX,
    attendance: [{ id: 'aT', member_id: 'm1', check_in_time: iso(0, 7, 0), method: 'qr', activity: 'Cardio' },
      ...[-1, -3, -7, -8, -9, -14, -15, -16].map((d, i) => ({ id: 'a' + i, member_id: 'm1', check_in_time: iso(d, 18, 20 + i), method: 'qr', activity: 'Gym floor' }))],
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-1, 9, 0) },
      { id: 'r2', member_id: 'm1', name: 'Arms day', notes: null, position: 1, updated_at: iso(-1, 9, 0) }],
    workout_routine_exercises: [
      { id: 'x1', routine_id: 'r1', position: 0, exercise_id: 'e1', custom_name: null, target_sets: 3,
        target_reps: 8, target_weight_kg: 60, target_seconds: null, rest_seconds: 90 },
      { id: 'x2', routine_id: 'r1', position: 1, exercise_id: 'e2', custom_name: null, target_sets: 2,
        target_reps: 12, target_weight_kg: 100, target_seconds: null, rest_seconds: 60 },
      { id: 'x3', routine_id: 'r1', position: 2, exercise_id: 'e3', custom_name: null, target_sets: 2,
        target_reps: null, target_weight_kg: null, target_seconds: 20, rest_seconds: 30 }],
    workout_logs: [{ id: 'L1', member_id: 'm1', activity: 'Pull day', routine_id: null, gym_workout_id: 'gw1', program_day_id: 'pd2',
      created_at: new Date(Date.now() - 6 * 60000).toISOString(), completed_at: null, duration_minutes: null, performed_on: dstr(0) }],
    workout_sets: [],
    gym_workouts: [{ id: 'gw1', name: 'Pull day', notes: null, updated_at: iso(-9, 9, 0), gym_workout_items: [] }],
    member_profiles_markers: true,
    fitness_goals: [
      { id: 'g1', member_id: 'm1', title: 'Squat 100 kg', metric: 'lift_kg', start_value: 60, target_value: 100, template_key: null,
        achieved_on: dstr(0), celebrated_at: null, created_at: iso(-30, 9, 0) },
      { id: 'g0', member_id: 'm1', title: 'Old target', metric: 'lift_kg', start_value: 40, target_value: 50, template_key: null,
        achieved_on: dstr(-20), celebrated_at: iso(-20, 9, 0), created_at: iso(-60, 9, 0) }],
    challenge_participants: [{ challenge_id: 'c1', member_id: 'm1', completed_on: dstr(0), challenges: { title: 'October visits' } }],
    point_ledger: [
      { id: 'p1', member_id: 'm1', rule_key: 'checkin', points: 10, source_table: 'attendance', source_id: 'aT', created_at: iso(0, 7, 0) },
      { id: 'p2', member_id: 'm1', rule_key: 'goal_achieved', points: 100, source_table: 'fitness_goals', source_id: 'g1', created_at: iso(0, 7, 0) },
      { id: 'p3', member_id: 'm1', rule_key: 'challenge_complete', points: 250, source_table: 'challenge_participants', source_id: 'c1', created_at: iso(0, 7, 0) }],
    gym_plans: [{ id: 'g1', member_id: 'm1', day_of_week: new Date().getDay(), remind_at: '18:00:00', active: true,
      last_reminded_on: null, routine_id: null, created_at: iso(-5, 9, 0) },
      { id: 'g2', member_id: 'm1', day_of_week: (new Date().getDay() + 2) % 7, remind_at: '18:00:00', active: true,
      last_reminded_on: null, routine_id: null, created_at: iso(-5, 9, 0) }],
    workout_resources: [
      { id: 'w1', title: 'Yoga With Adriene', provider: 'YouTube', url: 'https://youtube.com/x', image_url: null, description: 'Yoga', category: 'Follow-along', level: 'all_levels', is_active: true, sort_order: 1 },
      { id: 'w2', title: 'Bodyweight workouts', provider: 'Darebee', url: 'https://darebee.com', image_url: null, description: 'No equipment', category: 'Bodyweight', level: 'beginner', is_active: true, sort_order: 2 },
      { id: 'w3', title: 'StrongLifts 5x5', provider: 'StrongLifts', url: 'https://stronglifts.com', image_url: null, description: 'Barbell', category: 'Strength programs', level: 'beginner', is_active: true, sort_order: 3 },
    ],
    saved_resources: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: null, email: null,
      opening_time: '06:00', closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: null,
      activity_options: [], updated_at: iso(0, 9, 0), updated_by: null, celebrations: true, celebration_sounds: true }],
  };
  const FEATURES = ['workout_tracker', 'plan_builder', 'ai_model', 'points_earn', 'points_redeem', 'challenges']
    .map((key) => ({ key, label: key, description: key, enabled: true }));

  // Embeds the fixture understands: routine → its exercises → exercise names;
  // a log → its sets → exercise names.
  const embed = (t, r) => {
    if (t === 'workout_routines') {
      return { ...r, workout_routine_exercises: DB.workout_routine_exercises.filter((x) => x.routine_id === r.id)
        .map((x) => ({ ...x, exercises: EX.find((e) => e.id === x.exercise_id) ?? null })) };
    }
    if (t === 'workout_logs') {
      return { ...r, workout_sets: DB.workout_sets.filter((s) => s.log_id === r.id)
        .map((s) => ({ ...s, exercises: EX.find((e) => e.id === s.exercise_id) ?? null })) };
    }
    return r;
  };
  const match = (rows, params) => rows.filter((r) => params.every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k)) return true;
    if (!(k in r)) return true;
    if (v === 'is.null') return r[k] == null;
    if (v === 'not.is.null') return r[k] != null;
    let m = /^eq\.(.*)$/.exec(v); if (m) return String(r[k]) === m[1];
    m = /^gte\.(.*)$/.exec(v); if (m) return String(r[k]) >= m[1];
    m = /^lte\.(.*)$/.exec(v); if (m) return String(r[k]) <= m[1];
    return true;
  }));

  const CALLS = {};
  const SEEN = [];
  const FN = {
    request_renewal: (b) => { DB.renewal_requests.forEach((r) => { if (r.status === 'open') r.status = 'withdrawn'; });
      const plan = [PREMIUM, QUARTER].find((p) => p.id === b.p_plan);
      DB.renewal_requests.push({ id: 'rr' + (++n), member_id: 'm1', plan_id: b.p_plan, note: b.p_note, status: 'open',
        created_at: new Date().toISOString(), closed_at: null, close_note: null, membership_plans: { name: plan.name, price: plan.price } });
      return 'rr' + n; },
    withdraw_renewal_request: () => { DB.renewal_requests.forEach((r) => { if (r.status === 'open') r.status = 'withdrawn'; }); return null; },
  };
  const RPC = {
    refund_quote: [{ percent: 70, amount: 1050, rule_label: 'Pro-rata for the 21 unused days of your term.', days_elapsed: 9,
      has_visited: true, paid_total: 1500, days_total: 30, days_unused: 21, prorata_percent: 70, floor_percent: 50, basis: 'prorata', fee_deducted: 0 }],
    gym_traffic: [1,2,3,4,5,6,0].flatMap((dow) => ['6am','9am','12pm','3pm','6pm','9pm'].map((band, k) =>
      ({ dow, band, visits: [8, 5, 2, 4, 14, 3][k] * 4, weeks: 4 }))),
    my_features: FEATURES, plan_allows: true, member_points_balance: 0,
    member_progression: [{ level: 'intermediate', computed_level: 'intermediate', training_days: 40, verified_days: 30, logged_days: 10,
      consistent_weeks: 9, current_week_streak: 3, best_week_streak: 5, next_level: 'advanced', next_days: 60, next_weeks: 12, member_since: dstr(-200) }],
    sync_my_achievements: 0,
    my_streak: { target: 4, current: 3, best: 5, days_this_week: 3, needed: 1, days_left: 4, week: [true, false, true, true, false, false, false],
      today_index: 3, frozen: false, at_risk: false, out_of_reach: false, next_milestone: 4, nudges: true, history: [] },
    member_points_balance: 360,
    member_commitments: [], my_trainer_ratings: [],
    // Week 2 of a program: squat +2.5 kg a week, plank the same.
    program_day_targets: [
      { item_id: 'i1', item_position: 0, exercise_id: 'e1', exercise_name: 'Barbell Squat', sets: 3, reps: 8, seconds: null, weight_kg: 42.5,
        rest_seconds: 90, progress_kind: 'weight', prev_sets: 3, prev_reps: 8, prev_seconds: null, prev_weight_kg: 40 },
      { item_id: 'i2', item_position: 1, exercise_id: 'e3', exercise_name: 'Plank', sets: 2, reps: null, seconds: 30, weight_kg: null,
        rest_seconds: 30, progress_kind: 'none', prev_sets: 2, prev_reps: null, prev_seconds: 30, prev_weight_kg: null }],
    member_last_sets: [{ exercise_id: 'e1', set_number: 1, reps: 8, weight_kg: 50, duration_seconds: null },
      { exercise_id: 'e1', set_number: 2, reps: 8, weight_kg: 50, duration_seconds: null }],
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
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });

    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/')) SEEN.push(req.method() + ' ' + path.replace('/rest/v1/', '') + ' ' + params.filter(([k]) => k === 'select').map(([, v]) => v).join(''));
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rest/v1/rpc/')[1];
      // One gym (docs/TENANCY.md): my_gym_context answers from this fixture's
      // own profiles, so the sign-in gates see the role they always did.
      if (fn === 'my_gym_context') {
        // Each fixture keeps its rows differently (DB, TABLES, tables()); take
        // whichever exists rather than naming one and crashing the run in the others.
        const rows = (() => {
          try { return DB.profiles; } catch { /* not this fixture */ }
          try { return TABLES.profiles; } catch { /* nor this */ }
          try { return tables().profiles; } catch { /* nor this */ }
          return [];
        })() || [];
        // Who is asking: the `sub` of the bearer token the app just sent. Read
        // from the request rather than a fixture variable, because the fixtures
        // name their session differently and some mint one per role.
        const sub = (() => {
          try {
            const raw = (route.request().headers()['authorization'] || '').split(' ')[1].split('.')[1];
            return JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).sub;
          } catch { return null; }
        })();
        const me = rows.find((p) => p.id === sub) || rows[0];
        return json(me ? [{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness',
          role: me.role, status: me.status, lock_reason: null, short_name: null, logo_url: null,
          accent: 'violet', gym_count: 1 }] : []);
      }
      if (fn in FN) { const b = JSON.parse(req.postData() || '{}'); CALLS[fn] = b; return json(FN[fn](b)); }
      return json(fn in RPC ? RPC[fn] : null); }
    if (!path.startsWith('/rest/v1/')) return json([]);
    if (globalThis.__pre0216 && /celebrat|arrival_on/.test(after)) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column member_profiles.arrival_on does not exist' }) });
    }
    const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
    DB[t] = DB[t] ?? [];
    const method = req.method();
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      const list = (Array.isArray(body) ? body : [body]).map((r) => ({
        id: uid(t), created_at: new Date().toISOString(),
        ...(t === 'workout_logs' ? { performed_on: dstr(0), completed_at: null, duration_minutes: null } : {}),
        ...r,
      }));
      DB[t].push(...list);
      return json(one ? list[0] : list, 201);
    }
    if (method === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}');
      const hit = match(DB[t], params);
      hit.forEach((r) => Object.assign(r, body));
      return json(one ? hit[0] ?? null : hit);
    }
    if (method === 'DELETE') {
      const hit = match(DB[t], params);
      DB[t] = DB[t].filter((r) => !hit.includes(r));
      if (t === 'workout_routines') DB.workout_routine_exercises = DB.workout_routine_exercises.filter((x) => !hit.some((h) => h.id === x.routine_id));
      return json(hit);
    }
    const rows = match(DB[t], params).map((r) => embed(t, r));
    return json(one ? rows[0] ?? null : rows);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  const out = [];
  const shot = async (name) => page.screenshot({ path: `shots/run-${name}.png` });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };

  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const mp = () => DB.member_profiles[0];
  const kind = async () => page.evaluate(() => document.querySelector('[data-moment]')?.getAttribute('data-moment') || '');
  const next = async () => {
    const done = page.locator('[data-moment-done]');
    if (await done.count()) await done.first().click(); else await page.locator('.mo-layer').first().click();
    await page.waitForTimeout(900);
  };

  // 1. The day's first open: the arrival on Today, then the moments in turn.
  await go('/member/home');
  await page.waitForTimeout(1200);
  let t = await text();
  out.push('the arrival plays on Today: ' + ((await page.locator('[data-daily-arrival]').count()) === 1 && /3-week streak/.test(t) && /Earned level: Intermediate/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 200)));
  out.push('…with what the next level needs, not its totals: ' + (/Advanced needs 20 more training days and 3 more consistent weeks/.test(t) ? 'yes' : 'NO ' + (t.match(/Advanced[^.]*/) || [''])[0]));
  out.push('…and is marked played today: ' + (mp().arrival_on === dstr(0) ? 'yes' : 'NO ' + mp().arrival_on));
  out.push('…with nothing over it while it plays: ' + ((await kind()) === '' ? 'yes' : 'NO (' + (await kind()) + ')'));
  await shot('moments-arrival');

  // The moments waited their turn; they play once the arrival folds away.
  await page.waitForTimeout(7500);
  out.push('a kiosk check-in the app did not see plays: ' + ((await kind()) === 'checkin' ? 'yes' : 'NO (' + (await kind()) + ')'));
  t = await text();
  out.push('…with the visit, this week and the points it paid: ' + (/You're in, Lea/.test(t) && /Cardio today/.test(t) && /\+10/.test(t) && /3 of 4 days this week/.test(t) ? 'yes' : 'NO ' + t.slice(0, 260)));
  out.push('…and the balance after: ' + (/360 total/.test(t) ? 'yes' : 'NO'));
  out.push('…marked on the account: ' + (mp().checkin_celebrated_on === dstr(0) ? 'yes' : 'NO'));
  out.push('…in the gym’s word, saying what they were for: ' + (/\+10 points for the visit/.test(t) ? 'yes' : 'NO'));
  await shot('moments-checkin');
  await next();

  out.push('then the higher earned level: ' + ((await kind()) === 'level' ? 'yes' : 'NO (' + (await kind()) + ')'));
  t = await text();
  out.push('…named, never numbered: ' + (/Intermediate/.test(t) && !/Level \d/.test(t) ? 'yes' : 'NO'));
  out.push('…and remembered: ' + (mp().celebrated_level === 'intermediate' ? 'yes' : 'NO'));
  await page.waitForTimeout(2600);
  await shot('moments-level');
  await next();

  out.push('then the target the database settled: ' + ((await kind()) === 'target' ? 'yes' : 'NO (' + (await kind()) + ')'));
  t = await text();
  out.push('…with the points it paid: ' + (/Squat 100 kg/.test(t) && /\+100/.test(t) ? 'yes' : 'NO'));
  out.push('…marked on the target: ' + (DB.fitness_goals.find((g) => g.id === 'g1').celebrated_at ? 'yes' : 'NO'));
  out.push('…and an old one is not replayed: ' + (!/Old target/.test(t) ? 'yes' : 'REPLAYED'));
  await page.waitForTimeout(2600);
  await shot('moments-target');
  await next();

  out.push('then the challenge: ' + ((await kind()) === 'challenge' ? 'yes' : 'NO (' + (await kind()) + ')'));
  t = await text();
  out.push('…with its reward: ' + (/October visits/.test(t) && /\+250/.test(t) ? 'yes' : 'NO'));
  out.push('…remembered: ' + (JSON.stringify(mp().celebrated_challenges) === '["c1"]' ? 'yes' : 'NO ' + JSON.stringify(mp().celebrated_challenges)));
  await page.waitForTimeout(2600);
  await shot('moments-challenge');
  await next();
  out.push('and then nothing is left on screen: ' + ((await kind()) === '' ? 'yes' : 'NO (' + (await kind()) + ')'));

  // 2. Opening again: nothing replays.
  await go('/member/home');
  await page.waitForTimeout(4500);
  out.push('opening again replays nothing: ' + ((await kind()) === '' && (await page.locator('[data-daily-arrival]').count()) === 0 ? 'yes' : 'NO (' + (await kind()) + ')'));

  // 3. The owner turned celebrations down: a small card.
  DB.gym_settings[0].celebrations = false;
  mp().checkin_celebrated_on = dstr(-1);
  // The card steps aside by itself after a few seconds, so it is watched for from the start of the load.
  const seen = page.waitForSelector('[data-moment-card]', { state: 'attached', timeout: 12000 }).then(() => true, () => false);
  await page.goto('http://localhost:5173/member/home', { waitUntil: 'domcontentloaded' });
  const card = await seen;
  out.push('with celebrations off, the moment is a small card: ' + (card && (await page.locator('.mo-layer').count()) === 0 ? 'yes' : 'NO'));
  await page.waitForTimeout(400);
  await shot('moments-card');
  await page.waitForTimeout(3500);
  out.push('…which steps aside by itself: ' + ((await page.locator('[data-moment-card]').count()) === 0 ? 'yes' : 'NO'));
  DB.gym_settings[0].celebrations = true;

  // 4. The phone asks for less motion: the moment arrives finished and still.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  mp().checkin_celebrated_on = dstr(-1);
  await go('/member/home');
  await page.waitForTimeout(4000);
  out.push('with reduced motion, it arrives still: ' + ((await page.locator('.mo-layer.mo-still').count()) === 1 && /You're in/.test(await text()) ? 'yes' : 'NO'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // 5. Before 0216: nothing that would replay plays at all.
  globalThis.__pre0216 = true;
  mp().checkin_celebrated_on = dstr(-1); mp().arrival_on = dstr(-1);
  await go('/member/home');
  await page.waitForTimeout(4500);
  out.push('before 0216, no arrival and no replaying moment: ' + ((await kind()) === '' && (await page.locator('[data-daily-arrival]').count()) === 0 ? 'yes' : 'NO (' + (await kind()) + ')'));
  globalThis.__pre0216 = false;
  mp().checkin_celebrated_on = dstr(0); mp().arrival_on = dstr(0);

  // 6. Settings: the member's own switch, saved on the account.
  await go('/member/settings?section=notifications');
  await page.getByRole('switch', { name: /Sounds for big moments/ }).click();
  await page.waitForTimeout(700);
  out.push('the member turns their moment sounds off, on the account: ' + (mp().celebration_sounds === false ? 'yes' : 'NO'));

  // 7. The workout finish: the stats, then the points this workout was paid.
  DB.workout_logs.push({ id: 'L9', member_id: 'm1', activity: 'Leg day', routine_id: 'r1', gym_workout_id: null, program_day_id: null,
    created_at: new Date(Date.now() - 20 * 60000).toISOString(), completed_at: null, duration_minutes: null, performed_on: dstr(0) });
  DB.point_ledger.push({ id: 'p9', member_id: 'm1', rule_key: 'workout_logged', points: 15, source_table: 'workout_logs', source_id: 'L9', created_at: iso(0, 9, 0) });
  await go('/member/track/session/L9');
  const btn = (name) => page.getByRole('button', { name, exact: true });
  await btn('Start exercise').click().catch(() => {});
  await page.waitForTimeout(300);
  await btn('Log set 1').first().click().catch(() => {});
  await page.waitForTimeout(800);
  if (await page.getByRole('dialog', { name: 'Rest' }).count()) await btn('Skip rest').click();
  await btn('Finish workout early').click().catch(() => {});
  await page.waitForTimeout(5500);
  t = await text();
  out.push('the finish screen counts up to the real stats: ' + ((await page.locator('[data-finish-stats] .mo-tile-dim.on').count()) === 4 ? 'yes' : 'NO'));
  out.push('…shows the points this workout was paid: ' + (/\+15 points for the workout/.test(t) ? 'yes' : 'NO'));
  out.push('…and the earned level: ' + (/Earned level: Intermediate/.test(t) ? 'yes' : 'NO'));
  await shot('moments-finish');

  // 8. A workout that paid nothing says why — only what the database knows (0219).
  const finishBare = async (id, counts) => {
    DB.workout_logs.push({ id, member_id: 'm1', activity: 'Quick one', routine_id: 'r1', gym_workout_id: null, program_day_id: null,
      created_at: new Date(Date.now() - 20 * 60000).toISOString(), completed_at: null, duration_minutes: null, performed_on: dstr(0), counts });
    await go('/member/track/session/' + id);
    await btn('Start exercise').click().catch(() => {});
    await page.waitForTimeout(300);
    await btn('Log set 1').first().click().catch(() => {});
    await page.waitForTimeout(800);
    if (await page.getByRole('dialog', { name: 'Rest' }).count()) await btn('Skip rest').click();
    await btn('Finish workout early').click().catch(() => {});
    await page.waitForTimeout(5500);
    return text();
  };
  t = await finishBare('L10', false);
  out.push('a workout too short to count shows no points: ' + (!/points for the workout/.test(t) ? 'yes' : 'NO'));
  out.push('…and says what earns them: ' + (/3 or more sets and at least 10 minutes/.test(t) ? 'yes' : 'NO'));
  t = await finishBare('L11', true);
  out.push('a second counting workout today says the day is already paid: ' + (/once a day, and today's are already in/.test(t) && !/points for the workout/.test(t) ? 'yes' : 'NO'));
  return out.join(String.fromCharCode(10));
}
