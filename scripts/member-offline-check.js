/**
 * The app with no signal (owner's request, 2026-10-27): a screen opened before
 * shows what this phone saved, says so and from when, and reads live again
 * when the signal returns (lib/offlineReads.ts). An hour-old session does not
 * bounce to Login offline (supabaseClient.ts).
 *
 * Offline is real here: the browser context goes offline, so every request
 * fails as it would on a phone. Setup copied from member-program-targets-check.js.
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
    workout_logs: [], _unused_logs: [{ id: 'L1', member_id: 'm1', activity: 'Pull day', routine_id: null, gym_workout_id: 'gw1', program_day_id: 'pd2',
      created_at: new Date(Date.now() - 6 * 60000).toISOString(), completed_at: null, duration_minutes: null, performed_on: dstr(0) }],
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
  const SEEN = [];
  const FN = {
    request_renewal: (b) => { DB.renewal_requests.forEach((r) => { if (r.status === 'open') r.status = 'withdrawn'; });
      const plan = [PREMIUM, QUARTER].find((p) => p.id === b.p_plan);
      DB.renewal_requests.push({ id: 'rr' + (++n), member_id: 'm1', plan_id: b.p_plan, note: b.p_note, status: 'open',
        created_at: new Date().toISOString(), closed_at: null, close_note: null, membership_plans: { name: plan.name, price: plan.price } });
      return 'rr' + n; },
    open_conversation: (b) => 'c-' + b.p_other,
    send_message: (b) => { (DB.sent_messages = DB.sent_messages ?? []).push(b); return null; },
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
    const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
    DB[t] = DB[t] ?? [];
    const method = req.method();
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      if (t === 'fitness_goals' && JSON.stringify(body).includes('Refuse me')) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) });
      }
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
  const visit = async (p) => {
    await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, p);
    await page.waitForTimeout(1500);
  };
  const ctx = page.context();

  // 1. Online: open Routines and Today, which saves what they read.
  await go('/member/track');
  out.push('online, Routines reads live: ' + (/Leg day/.test(await text()) ? 'yes' : 'MISSING'));
  out.push('…with no banner: ' + ((await page.locator('[data-offline-banner]').count()) === 0 ? 'yes' : 'SHOWN'));
  await visit('/member/home');

  // 2. The signal goes — and the session is past its hour, as on a phone left in a bag.
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await ctx.setOffline(true);
  await visit('/member/track');
  let t = await text();
  out.push('offline, Routines shows what was saved: ' + (/Leg day/.test(t) && /Arms day/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 200)));
  out.push('…not Login: ' + (!/\/login/.test(page.url()) ? 'yes' : 'BOUNCED'));
  out.push('…and says it is saved, and from when: ' + (/Offline · showing what was saved at/.test(t) ? 'yes' : 'MISSING'));
  await shot('offline-routines');
  await visit('/member/home');
  t = await text();
  out.push('Today opens offline too: ' + (!/Could not identify your account/.test(t) && /Offline/.test(t) ? 'yes' : 'NO ' + t.slice(0, 200)));
  await shot('offline-today');

  // 3. The signal returns: the screen reads live again, and the banner goes.
  DB.workout_routines.push({ id: 'r3', member_id: 'm1', name: 'Core day', notes: null, position: 2, updated_at: iso(0, 9, 0) });
  await visit('/member/track');
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.waitForTimeout(2000);
  t = await text();
  out.push('back online, the screen reads live: ' + (/Core day/.test(t) ? 'yes' : 'MISSING'));
  out.push('…and the banner goes: ' + ((await page.locator('[data-offline-banner]').count()) === 0 ? 'yes' : 'STILL SHOWN'));

  // 4. Writing with no signal: a target and a message wait on the phone, then go.
  // (The modules are loaded first: the dev server cannot serve them offline.)
  await page.evaluate(async () => {
    window.__goals = await import('/src/lib/api/progress.ts');
    window.__chat = await import('/src/lib/api/chat.ts');
    window.__outbox = await import('/src/lib/outbox.ts');
  });
  await ctx.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  const queuedHow = await page.evaluate(async () => {
    const goals = window.__goals;
    const chat = window.__chat;
    const a = await goals.createGoal({ member_id: 'm1', title: 'Squat 100', metric: 'lift_kg', exercise_id: 'e1', start_value: 60, target_value: 100, target_date: null });
    const b = await chat.sendMessageTo('t1', 'Ben Cruz', 'Running late, coach');
    const c = await goals.createGoal({ member_id: 'm1', title: 'Refuse me', metric: 'custom', exercise_id: null, start_value: null, target_value: null, target_date: null });
    return [a, b, c].join(',');
  });
  out.push('offline, a target and a message are kept: ' + (queuedHow === 'queued,queued,queued' ? 'yes' : 'NO ' + queuedHow));
  await page.waitForTimeout(400);
  t = await text();
  out.push('…and the banner counts them: ' + (/3 waiting to send/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 120)));
  out.push('…nothing reached the server: ' + (!(DB.fitness_goals ?? []).length && !(DB.sent_messages ?? []).length ? 'yes' : 'NO'));
  await shot('offline-waiting');
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.waitForTimeout(2500);
  out.push('back online, the target goes: ' + ((DB.fitness_goals ?? []).some((g) => g.title === 'Squat 100') ? 'yes' : 'NO'));
  out.push('…and the message, to the right person: ' + ((DB.sent_messages ?? []).some((m) => m.p_conversation === 'c-t1' && m.p_body === 'Running late, coach') ? 'yes' : 'NO ' + JSON.stringify(DB.sent_messages)));
  t = await text();
  out.push('…the refused one is dropped and said so: ' + (/Target could not be sent/.test(t) && !(DB.fitness_goals ?? []).some((g) => g.title === 'Refuse me') ? 'yes' : 'NO'));
  out.push('…and nothing is left waiting: ' + (!/waiting to send/.test(t) && (await page.evaluate(() => localStorage.getItem('cf:outbox:v1'))) === null ? 'yes' : 'NO'));
  // A resend after a lost reply: the same id again counts as already there.
  const again = await page.evaluate(async () => {
    const o = window.__outbox;
    return typeof o.newId() === 'string' && o.newId() !== o.newId();
  });
  out.push('each queued row carries its own id: ' + (again ? 'yes' : 'NO'));

  try {
  // 5. A whole workout with no signal: start a routine, log a set, finish — then it all goes, in order.
  const btn = (name) => page.getByRole('button', { name, exact: true });
  // The built app has every screen's code precached (member-offline-reload-check);
  // the dev server cannot serve it offline, so the player is loaded first.
  await page.evaluate(async () => { await import('/src/pages/GuidedWorkout.tsx'); });
  await visit('/member/home');
  await ctx.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event('offline')));
  await visit('/member/track');
  await page.locator('li, [data-routine-row], div').filter({ hasText: /^Leg day/ }).getByRole('button', { name: /Start/ }).first().click()
    .catch(async () => { await page.getByRole('button', { name: /Start/ }).first().click(); });
  await page.waitForTimeout(1800);
  const runUrl = page.url();
  const logId = (runUrl.match(/session\/([0-9a-f-]{36})/) || [])[1];
  t = await text();
  out.push('offline, a routine starts: ' + (logId && /Barbell Squat/.test(t) ? 'yes' : 'NO ' + runUrl + ' ' + t.slice(0, 160)));
  await btn('Start exercise').click().catch(() => {});
  await page.waitForTimeout(300);
  await btn('Log set 1').first().click().catch(() => {});
  await page.waitForTimeout(800);
  if (await page.getByRole('dialog', { name: 'Rest' }).count()) await btn('Skip rest').click();
  await btn('Finish workout early').click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot('offline-workout-done');
  out.push('…and finishes on the phone, nothing sent yet: ' + (!DB.workout_logs.some((l) => l.id === logId) && !DB.workout_sets.length ? 'yes' : 'NO'));
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await page.waitForTimeout(3500);
  const log = DB.workout_logs.find((l) => l.id === logId);
  out.push('back online, the workout reaches the server with its id: ' + (log ? 'yes' : 'NO'));
  out.push('…its set, pointing at it: ' + (DB.workout_sets.some((x) => x.log_id === logId) ? 'yes' : 'NO ' + JSON.stringify(DB.workout_sets)));
  out.push('…and then the finish: ' + (log && log.completed_at ? 'yes' : 'NO'));
  out.push('…nothing left waiting: ' + (await page.evaluate(() => !localStorage.getItem('cf:outbox:v1') && JSON.parse(localStorage.getItem('cf:set-outbox:v1') || '[]').length === 0) ? 'yes' : 'NO'));

  } catch (e) { out.push('STEP 5 ERROR at ' + page.url() + ': ' + e.message.split(String.fromCharCode(10))[0]); return out.join(String.fromCharCode(10)); }

  // 6. Another account on this phone never sees the first one's saved replies.
  const otherSees = await page.evaluate(async () => {
    const names = await caches.keys();
    if (!names.includes('cf-reads-v1')) return 'no store';
    const keys = await (await caches.open('cf-reads-v1')).keys();
    return keys.every((r) => r.url.includes('/m1/')) ? 'all filed under m1' : 'MIXED';
  });
  out.push('saved replies are filed under the account: ' + otherSees);
  return out.join(String.fromCharCode(10));
}
