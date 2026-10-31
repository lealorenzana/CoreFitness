/**
 * Wave 2 of the lively member app (2026-10-27, mock-up approved): Today's
 * points chip and tiered flame, Train's week ring and last workout, You as a
 * trophy room (earned level, badges as medals, records), the season ladder
 * with "You" placed by the real score, the podium and your own row, and a
 * challenge you are close to said in amber. Every number from the fixture's
 * real-shaped rows. Setup copied from season-check.js. Member dev server on :5173.
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
    member_profiles: [{ profile_id: 'm1', experience_level: 'beginner', qr_code: 'QR', created_at: iso(-90, 9, 0), profiles: ME }],
    membership_plans: [PREMIUM, QUARTER],
    renewal_requests: [], payments: [{ id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'cash', status: 'completed', due_date: null, invoice_number: 'INV-2026-0002', notes: null, recorded_by: 'u9', paid_on: dstr(-10), created_at: iso(-10, 10, 0), plan_id: 'p3', plan_name: 'Premium' }],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: dstr(-9), expiry_date: dstr(21),
      never_expires: false, frozen_at: null, created_at: iso(-10, 9, 0), membership_plans: PREMIUM }],
    exercises: EX,
    attendance: [-1, -3, -7, -8, -9, -14, -15, -16].map((d, i) => ({ id: 'a' + i, member_id: 'm1', check_in_time: iso(d, 18, 20 + i), method: 'qr', activity: 'Gym floor' })),
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-1, 9, 0) },
      { id: 'r2', member_id: 'm1', name: 'Arms day', notes: null, position: 1, updated_at: iso(-1, 9, 0) }],
    workout_routine_exercises: [
      { id: 'x1', routine_id: 'r1', position: 0, exercise_id: 'e1', custom_name: null, target_sets: 3,
        target_reps: 8, target_weight_kg: 60, target_seconds: null, rest_seconds: 90 },
      { id: 'x2', routine_id: 'r1', position: 1, exercise_id: 'e2', custom_name: null, target_sets: 2,
        target_reps: 12, target_weight_kg: 100, target_seconds: null, rest_seconds: 60 },
      { id: 'x3', routine_id: 'r1', position: 2, exercise_id: 'e3', custom_name: null, target_sets: 2,
        target_reps: null, target_weight_kg: null, target_seconds: 20, rest_seconds: 30 }],
    workout_logs: [{ id: 'L1', member_id: 'm1', activity: 'Leg day', routine_id: 'r1', created_at: new Date(Date.now() - 6 * 60000).toISOString(),
      completed_at: null, duration_minutes: null, performed_on: dstr(0) }],
    workout_sets: [],
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
    // 0123. The template (repeats_weekly) must never show; its weekly copy must.
    challenges: [
      { id: 'qT', title: 'Train twice (template)', description: null, metric_key: 'training_days', target: 2,
        starts_on: dstr(-10), ends_on: dstr(30), reward_points: 50, image_url: null, is_active: true,
        repeats_weekly: true, parent_id: null, achievement_metrics: { label: 'Training days' } },
      { id: 'qW', title: 'Train twice this week', description: null, metric_key: 'training_days', target: 2,
        starts_on: dstr(-2), ends_on: dstr(4), reward_points: 50, image_url: null, is_active: true,
        repeats_weekly: false, parent_id: 'qT', achievement_metrics: { label: 'Training days' } },
    ],
    challenge_participants: [{ challenge_id: 'qW', member_id: 'm1', completed_on: null }],
    achievements: [
      { key: 'iron', title: 'Iron regular', description: 'You checked in 20 times.', requirement: 'Check in 20 times', icon: 'dumbbell', tier: 'gold',
        category: 'Consistency', audience: 'member', metric: 'checkins', metric2: null, rule_kind: 'metric', points: 0, secret: false, active: true, sort_order: 1 },
      { key: 'first', title: 'Off the mark', description: 'Three training days.', requirement: '3 training days', icon: 'rocket', tier: 'bronze',
        category: 'Getting started', audience: 'member', metric: 'training_days', metric2: null, rule_kind: 'metric', points: 0, secret: false, active: true, sort_order: 2 },
      { key: 'owl', title: 'Night owl', description: 'Twenty check-ins after 8pm.', requirement: '20 late check-ins', icon: 'moon', tier: 'silver',
        category: 'Habits', audience: 'member', metric: 'late', metric2: null, rule_kind: 'metric', points: 0, secret: false, active: true, sort_order: 3 }],
    achievement_unlocks: [
      { member_id: 'm1', achievement_key: 'iron', unlocked_on: dstr(-1), seen: true },
      { member_id: 'm1', achievement_key: 'first', unlocked_on: dstr(-40), seen: true }],
    season_tiers: [
      { id: 'tB', name: 'Bronze', points_needed: 100, rewards: { name: 'Protein shake' } },
      { id: 'tS', name: 'Silver', points_needed: 500, rewards: { name: 'Gym shirt' } },
      { id: 'tG', name: 'Gold', points_needed: 900, rewards: null },
    ],
    season_claims: [],
    personal_records: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: null, email: null,
      opening_time: '06:00', closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: null,
      activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
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
  let onBoards = false;
  const FN = {
    roll_weekly_quests: () => 1,
    claim_season_reward: (b) => { DB.season_claims.push({ tier_id: b.p_tier, handed_over_at: null, season_start: dstr(0).slice(0, 8) + '01' }); return 'c1'; },
    set_show_on_boards: (b) => { onBoards = b.p_on; DB.member_profiles[0].show_on_boards = b.p_on; return null; },
    my_season: () => [{ season_start: dstr(0).slice(0, 8) + '01', season_end: dstr(20), score: 320, rank: 3, members_ranked: 40 }],
    season_board: () => [
      { first_name: 'Ben', last_initial: 'C', score: 980, is_me: false },
      { first_name: 'Ana', last_initial: 'R', score: 900, is_me: false },
      { first_name: 'Mia', last_initial: 'S', score: 640, is_me: false },
      { first_name: 'Joy', last_initial: 'T', score: 410, is_me: false },
      { first_name: 'Lea', last_initial: 'L', score: 320, is_me: true },
    ],
    pr_wall: () => [{ first_name: 'Ana', last_initial: 'R', exercise_name: 'Deadlift', kind: 'weight', value: 140, achieved_at: new Date().toISOString() }],
    member_personal_records: () => [{ id: 'r1', exercise_name: 'Barbell Squat', kind: 'weight', value: 80, previous: 70, achieved_at: new Date().toISOString() }],
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
    my_features: FEATURES, plan_allows: true, member_points_balance: 360,
    member_progression: [{ level: 'intermediate', computed_level: 'intermediate', training_days: 40, verified_days: 30, logged_days: 10,
      consistent_weeks: 9, current_week_streak: 13, best_week_streak: 13, next_level: 'advanced', next_days: 60, next_weeks: 12, member_since: dstr(-200) }],
    sync_my_achievements: 0, challenge_progress: 1,
    my_streak: { target: 4, current: 13, best: 13, days_this_week: 3, needed: 1, days_left: 4, week: [true, true, true, false, false, false, false],
      today_index: 3, frozen: false, at_risk: false, out_of_reach: false, next_milestone: 26, nudges: true, history: [] },
    member_commitments: [], my_trainer_ratings: [],
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
      // 0123's trigger, as the fixture: every logged weight is a new record.
      if (t === 'workout_sets') list.forEach((s) => DB.personal_records.push({ id: 'pr-' + s.id, set_id: s.id }));
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



  const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  // 1 - the season page.
  // The finished workouts the hero reads its last one from.
  DB.workout_logs.push({ id: 'Lw', member_id: 'm1', activity: 'Push day', routine_id: 'r1', gym_workout_id: null, program_day_id: null,
    created_at: iso(-2, 18, 0), completed_at: iso(-2, 19, 0), duration_minutes: 40, performed_on: dstr(-2) });

  // 1. Today: the points chip and the tiered flame.
  await go('/member/home');
  await page.waitForTimeout(1500);
  let t = await text();
  const chip = await page.locator('[data-points-chip]').innerText().catch(() => '');
  out.push('Today shows the points, in the gym’s word: ' + (/360\s*points/.test(chip) ? 'yes' : 'NO ' + chip));
  out.push('…and the streak with its tier: ' + (/13-week streak · Blaze/.test(t) && (await page.locator('.lv-flame--blaze').count()) === 1 ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-today.png' });

  // 2. Train (simplify, 2026-10-28): Your plan says when the last workout was; the week's ring moved to Today's streak.
  DB.workout_logs = DB.workout_logs.filter((l) => l.completed_at);
  await go('/member/book-class');
  await page.waitForTimeout(1200);
  t = await text();
  out.push("Train's Your plan says when you last trained: " + (/last time 2 days ago/.test(t) ? 'yes' : 'NO ' + (t.match(/Your plan.{0,160}/) || [''])[0]));
  await page.screenshot({ path: 'shots/lively-train.png' });

  // 3. You: the trophy room.
  await go('/member/membership');
  await page.waitForTimeout(1800);
  t = await text();
  out.push('You opens on the earned level, with both requirements: ' + (/Intermediate/.test(t) && /Training days 40 \/ 60/.test(t) && /Consistent weeks 9 \/ 12/.test(t) ? 'yes' : 'NO'));
  out.push('…the badges as medals, newest shining: ' + ((await page.locator('[data-trophy-badges] .lv-medal').count()) === 2 && (await page.locator('[data-trophy-badges] .lv-medal--new').count()) === 1 ? 'yes' : 'NO'));
  out.push('…and the records: ' + (/Barbell Squat/.test(t) && /80 kg/.test(t) ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-you.png', fullPage: true });

  // 4. Achievements: earned ones are medals; a locked one is not.
  await go('/member/achievements');
  await page.waitForTimeout(1500);
  out.push('Achievements draws earned badges as medals: ' + ((await page.locator('.lv-medal').count()) >= 2 ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-badges.png' });

  // 5. Rewards: the coin and the balance.
  await go('/member/rewards');
  await page.waitForTimeout(1600);
  out.push('Rewards shows the turning coin and the balance: ' + ((await page.locator('[data-rewards-balance] .lv-coin').count()) === 1 && /360/.test(await text()) ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-rewards.png' });

  // 6. Challenges: one you are close to says so, in amber.
  await go('/member/challenges');
  await page.waitForTimeout(1500);
  t = await text();
  out.push('a challenge shows its days left as a chip: ' + ((await page.locator('[data-days-left]').count()) >= 1 ? 'yes' : 'NO'));
  out.push('…and one you are close to says so: ' + (/1 more and it is yours/.test(t) ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-challenges.png' });

  // 7. Season: the ladder, "You" between Bronze (100) and Silver (500) at 320; the podium; your own row.
  await go('/member/season');
  await page.waitForTimeout(2200);
  const ladder = await page.evaluate(() => {
    const you = document.querySelector('.season-ladder__you')?.getBoundingClientRect();
    const rung = (n) => document.querySelector(`[data-rung="${n}"]`)?.getBoundingClientRect();
    const b = rung(100), s = rung(500);
    if (!you || !b || !s) return 'missing';
    const mid = you.top + you.height / 2;
    return mid < b.top + b.height / 2 && mid > s.top + s.height / 2 ? 'between' : 'outside';
  });
  out.push('the season ladder places you between Bronze and Silver: ' + (ladder === 'between' ? 'yes' : 'NO ' + ladder));
  t = await text();
  out.push('…the top three stand on a podium: ' + ((await page.locator('[data-podium] .season-podium__step').count()) === 3 && /1\. Ben/.test(t) ? 'yes' : 'NO'));
  out.push('…and your own row is lit: ' + ((await page.locator('[data-board-me]').count()) === 1 ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/lively-season.png', fullPage: true });

  // 8. Reduced motion: the same screens arrive finished.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await go('/member/season');
  await page.waitForTimeout(1200);
  out.push('with reduced motion the ladder is already placed: ' + ((await page.locator('.season-ladder__you').count()) === 1 ? 'yes' : 'NO'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return out.join('\n');
}
