/**
 * Routines and the guided workout (0086), end to end against a stateful fixture.
 *
 * Plants a Premium member, answers Supabase from an in-memory database that
 * actually applies inserts, updates and deletes, then: builds a routine, starts
 * it, ticks sets (rest timer), finishes each exercise, finishes the workout,
 * and opens that day in Attendance. Writes shots/routines-NN-*.png.
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
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: dstr(-10), expiry_date: dstr(20),
      never_expires: false, frozen_at: null, created_at: iso(-10, 9, 0), membership_plans: PREMIUM }],
    exercises: EX,
    attendance: [{ id: 'a1', member_id: 'm1', check_in_time: iso(0, 7, 5), method: 'qr', activity: 'Gym floor' }],
    workout_routines: [], workout_routine_exercises: [], workout_logs: [], workout_sets: [],
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

  const RPC = {
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
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn] : null); }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
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
  const shot = async (name) => page.screenshot({ path: `shots/routines-${name}.png` });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };

  // 1 — the empty hub
  await go('/member/track');
  await shot('01-empty');
  out.push('hub: ' + ((await page.locator('main').innerText()).includes('No routines yet') ? 'empty state' : 'MISSING empty state'));

  // 2 — build "Leg day": squat, leg press, plank
  await page.getByRole('button', { name: 'New routine' }).click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder('e.g. Leg day').fill('Leg day');
  for (const name of ['Barbell Squat', 'Leg Press', 'Plank']) {
    await page.locator('main button', { hasText: /Choose|Pick|Select|exercise/i }).last().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: new RegExp(name) }).first().click();
    await page.waitForTimeout(300);
  }
  // Squat: 2 sets, 60 kg; rest 30 s so the timer is short
  const kg = page.getByPlaceholder('—').first();
  await kg.fill('60').catch(() => {});
  await page.getByLabel('Fewer sets').first().click();
  await page.locator('select').first().selectOption('30');
  await shot('02-editor');
  await page.getByRole('button', { name: 'Save routine' }).click();
  await page.waitForTimeout(1200);
  await shot('03-hub');
  out.push('routine saved: ' + DB.workout_routines.length + ' routine, ' + DB.workout_routine_exercises.length + ' exercises; ' +
    DB.workout_routine_exercises.map((x) => `${x.exercise_id}:${x.target_sets}x${x.target_reps ?? x.target_seconds}@${x.target_weight_kg ?? '-'} rest ${x.rest_seconds}`).join(', '));

  // 3 — start it
  await page.getByRole('button', { name: 'Start Leg day' }).click();
  await page.waitForTimeout(1500);
  await shot('04-up-next');
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Done with set 1' }).click();
  await page.waitForTimeout(900);
  await shot('05-resting');
  const resting = await page.locator('main').innerText();
  out.push('after set 1: rest timer ' + (/Rest\s+0:\d\d/.test(resting) ? 'showing' : 'MISSING'));
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Done with set 2' }).click();
  await page.waitForTimeout(900);
  await shot('06-exercise-done');
  out.push('squat sets saved: ' + DB.workout_sets.filter((s) => s.exercise_id === 'e1').map((s) => `${s.weight_kg}x${s.reps}`).join(', '));

  // 4 — next exercise, finish it early; plank one set then finish workout early
  await page.getByRole('button', { name: 'Next exercise' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await page.getByRole('button', { name: 'Done with set 1' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Finish exercise' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await page.getByRole('button', { name: 'Done with set 1' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await shot('07-plank');
  await page.getByRole('button', { name: /Finish workout/ }).first().click();
  await page.waitForTimeout(1200);
  await shot('08-finished');
  const log = DB.workout_logs[0];
  out.push(`workout: activity=${log?.activity} routine=${log?.routine_id ? 'set' : 'none'} completed=${log?.completed_at ? 'yes' : 'no'} sets=${DB.workout_sets.length}`);

  // 5 — the day in Attendance
  await page.getByRole('button', { name: 'See it in Attendance' }).click();
  await page.waitForTimeout(1500);
  await page.locator('button[aria-label*="workout done"]').first().click();
  await page.waitForTimeout(1000);
  await shot('09-attendance-day');
  const sheet = await page.getByRole('dialog').innerText().catch(() => '');
  out.push('day sheet: ' + sheet.replace(/\s+/g, ' ').slice(0, 160));
  return out.join('\n');
}
