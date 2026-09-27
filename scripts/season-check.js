/**
 * 0123 in the member app: the season, quests, and a record celebrated.
 *
 *   - Season: this month's score, own rank, points to the next tier, Claim
 *     (then "At the desk"), the record wall, your records, and the board —
 *     which lists you only after you opt in.
 *   - Challenges: this week's quest shown, its template never, no Leave on it.
 *   - Player: a logged set the database calls a record gets its celebration.
 *
 * Setup copied from workout-run-check.js. Member dev server on :5173.
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
    season_tiers: [
      { id: 'tB', name: 'Bronze', points_needed: 100, rewards: { name: 'Protein shake' } },
      { id: 'tS', name: 'Silver', points_needed: 500, rewards: { name: 'Gym shirt' } },
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
      { first_name: 'Ana', last_initial: 'R', score: 900, is_me: false },
      ...(onBoards ? [{ first_name: 'Lea', last_initial: 'L', score: 320, is_me: true }] : []),
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
    my_features: FEATURES, plan_allows: true, member_points_balance: 0,
    member_progression: [{ level: 1, points: 0, next_level_points: 100 }], sync_my_achievements: 0,
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
  await go('/member/season');
  let t = await text();
  out.push('season score: ' + (/320\s*points this month/.test(t) ? '320' : 'MISSING'));
  out.push('own rank: ' + (/#3 of 40/.test(t) ? '#3 of 40' : 'MISSING'));
  out.push('next tier: ' + (/180 to Silver · Gym shirt/.test(t) ? '180 to Silver' : 'MISSING'));
  out.push('record wall: ' + (/Ana R\. · Deadlift/.test(t) && /140 kg/.test(t) ? 'shown' : 'MISSING'));
  out.push('your records: ' + (/Barbell Squat/.test(t) && /up from 70 kg/.test(t) ? 'shown' : 'MISSING'));
  out.push('not on the board until opted in: ' + (/Lea L\./.test(t) ? 'MISSING (listed)' : 'absent'));
  await page.getByRole('button', { name: 'Claim' }).first().click();
  await page.waitForTimeout(1200);
  out.push('claim sent: ' + (CALLS.claim_season_reward?.p_tier === 'tB' ? 'Bronze' : 'MISSING'));
  t = await text();
  out.push('claimed tier waits at the desk: ' + (/At the desk/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel('Show me on the boards').click();
  await page.waitForTimeout(1200);
  out.push('opt-in sent: ' + (CALLS.set_show_on_boards?.p_on === true ? 'on' : 'MISSING'));
  t = await text();
  out.push('then on the board: ' + (/Lea L\. \(you\)/.test(t) ? 'listed' : 'MISSING'));
  await page.screenshot({ path: 'shots/season.png', fullPage: true });

  // 2 - quests on the challenges page.
  await go('/member/challenges');
  t = await text();
  out.push("this week's quests: " + (/This week's quests/i.test(t) && /Train twice this week/.test(t) ? 'shown' : 'MISSING'));
  out.push('template hidden: ' + (/\(template\)/.test(t) ? 'MISSING (template shown)' : 'hidden'));
  out.push('no Leave on a quest: ' + ((await page.getByRole('button', { name: 'Leave' }).count()) === 0 ? 'none' : 'MISSING (Leave shown)'));
  out.push('quests rolled on load: ' + ('roll_weekly_quests' in CALLS ? 'yes' : 'MISSING'));
  out.push('season linked: ' + ((await page.getByRole('button', { name: "This month's season" }).count()) === 1 ? 'yes' : 'MISSING'));

  // 3 - a record, celebrated in the player.
  await go('/member/track/session/L1');
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Log set 1' }).first().click();
  await page.waitForTimeout(1500);
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  out.push('record celebrated: ' + (/New personal record — Barbell Squat/.test(body) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/season-pr-toast.png' });

  return out.join('\n');
}
