/**
 * The Achievements gallery (0093) against a fixture: the collection ring, the
 * trophy shelf, "Closest to unlocking" with real numbers, the Earned/Locked
 * filter, the detail sheet with progress and rarity — then the same screen as
 * it is before 0093 is pasted (both RPCs 404), which must still work.
 * Writes shots/ach-NN-*.png.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
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
    workout_routine_exercises: [{ id: 'x1', routine_id: 'r1', position: 0, exercise_id: 'e1', custom_name: null, target_sets: 3,
      target_reps: 8, target_weight_kg: 60, target_seconds: null, rest_seconds: 90 }],
    workout_logs: [], workout_sets: [],
    achievements: [
      ['first_checkin', 'First Step', 'Footprints', 'bronze', 'Getting started', 'verified_days', 1],
      ['days_10', 'Getting Into It', 'Dumbbell', 'bronze', 'Milestones', 'training_days', 10],
      ['days_25', 'Regular', 'CalendarCheck', 'silver', 'Milestones', 'training_days', 25],
      ['days_50', 'Half Century', 'Medal', 'gold', 'Milestones', 'training_days', 50],
      ['streak_4', 'Month of Momentum', 'Flame', 'silver', 'Consistency', 'best_week_streak', 4],
      ['class_ten', 'Class Regular', 'HeartHandshake', 'gold', 'Training', 'classes_attended', 10],
      ['early_bird', 'Early Bird', 'Sunrise', 'silver', 'Habits', 'early_checkins', 5],
      ['level_intermediate', 'Intermediate', 'Award', 'gold', 'Level', null, null],
      ['gym_hero', 'Gym Hero', 'Crown', 'platinum', 'Special', null, null],
    ].map(([key, title, icon, tier, category, metric, threshold], k) => ({ key, audience: 'member', title,
      description: title + ' — you did it.', requirement: 'Rule for ' + title + '.', icon, tier, category,
      rule_kind: key === 'gym_hero' ? 'manual' : metric ? 'metric' : 'builtin', metric, threshold, metric2: null, threshold2: null,
      active: true, builtin: true, sort_order: k })),
    achievement_unlocks: [{ achievement_key: 'first_checkin', unlocked_on: dstr(-40), seen: true, user_id: 'm1' },
      { achievement_key: 'days_10', unlocked_on: dstr(-6), seen: true, user_id: 'm1' }],
    achievement_metrics: [{ key: 'training_days', label: 'Training days', unit: 'days', is_boolean: false },
      { key: 'best_week_streak', label: 'Best streak', unit: 'weeks', is_boolean: false },
      { key: 'classes_attended', label: 'Classes', unit: 'classes', is_boolean: false },
      { key: 'early_checkins', label: 'Early', unit: 'check-ins', is_boolean: false },
      { key: 'verified_days', label: 'Verified', unit: 'days', is_boolean: false }],
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
    member_progression: [{ level: 1, points: 0, next_level_points: 100 }], sync_my_achievements: 0,
    member_commitments: [], my_trainer_ratings: [],
    achievement_progress: [
      { achievement_key: 'first_checkin', value: 14, threshold: 1, value2: null, threshold2: null },
      { achievement_key: 'days_10', value: 18, threshold: 10, value2: null, threshold2: null },
      { achievement_key: 'days_25', value: 18, threshold: 25, value2: null, threshold2: null },
      { achievement_key: 'days_50', value: 18, threshold: 50, value2: null, threshold2: null },
      { achievement_key: 'streak_4', value: 3, threshold: 4, value2: null, threshold2: null },
      { achievement_key: 'class_ten', value: 0, threshold: 10, value2: null, threshold2: null },
      { achievement_key: 'early_bird', value: 2, threshold: 5, value2: null, threshold2: null },
      { achievement_key: 'level_intermediate', value: 18, threshold: 20, value2: 2, threshold2: 6 }],
    achievement_rarity: [{ achievement_key: 'days_25', holders: 9, audience_size: 74 },
      { achievement_key: 'first_checkin', holders: 60, audience_size: 74 },
      { achievement_key: 'days_10', holders: 30, audience_size: 74 }],
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
        const rows = (typeof DB !== 'undefined' ? DB.profiles : TABLES.profiles) || [];
        const me = rows.find((p) => p.id === (route.request().headers()['x-fixture-user'] || session.user.id));
        return json(me ? [{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness',
          role: me.role, status: me.status, lock_reason: null, short_name: null, logo_url: null,
          accent: 'violet', gym_count: 1 }] : []);
      }
      if (globalThis.__pre93 && ['achievement_progress', 'achievement_rarity'].includes(fn)) return json({ code: 'PGRST202', message: 'no fn' }, 404);
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
  const shot = async (name) => page.screenshot({ path: `shots/ach-${name}.png` });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };



  const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  globalThis.__pre93 = false;

  // 1 — with 0093
  await go('/member/achievements');
  await page.waitForTimeout(600);
  await shot('01-top');
  let t = await text();
  out.push('ring: ' + (/(\d+)% collected/.exec(t) || ['MISSING'])[0]);
  out.push('closest: ' + (/Closest to unlocking (.{0,160})/.exec(t) || ['', 'MISSING'])[1]);
  out.push('shelf: ' + (/Recently earned/.test(t) ? 'shown' : 'MISSING'));
  await page.getByRole('tab', { name: /Locked/ }).click();
  await page.waitForTimeout(400);
  t = await text();
  out.push('locked filter hides earned: ' + (!/unlocked \w{3} \d/.test(t) ? 'yes' : 'NO'));
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await shot('02-locked');
  await page.getByRole('button', { name: /Regular/ }).first().click();
  await page.waitForTimeout(700);
  const sheet = page.getByRole('dialog');
  const st = (await sheet.innerText()).replace(/\s+/g, ' ');
  out.push('detail: ' + st.slice(0, 200));
  await shot('03-detail-locked');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('tab', { name: /Earned/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Getting Into It/ }).last().click();
  await page.waitForTimeout(700);
  out.push('earned detail: ' + (await page.getByRole('dialog').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await shot('04-detail-earned');
  await page.keyboard.press('Escape');

  // 2 — before 0093: no numbers, no rarity, nothing broken
  globalThis.__pre93 = true;
  await go('/member/achievements');
  await page.waitForTimeout(600);
  t = await text();
  out.push('pre-0093: closest=' + (/Closest to unlocking/.test(t) ? 'SHOWN' : 'hidden') + ' rules=' + (/Rule for Regular/.test(t) ? 'shown' : 'MISSING')
    + ' error=' + (/Could not load/.test(t) ? 'YES' : 'no'));
  await shot('05-pre0093');
  globalThis.__pre93 = false;
  return out.join('\n');
}
