/**
 * Goals (0087) against a stateful fixture: pace, projection, the three tracked
 * kinds, and creating a strength goal through the flow.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 * Writes shots/goals-NN-*.png.
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
  const dstr = (d) => { const x = new Date(now); x.setDate(now.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const iso = (d) => `${dstr(d)}T09:00:00+08:00`;

  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90) };
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
  const m = (d, w, extra = {}) => ({ id: `bm${d}`, member_id: 'm1', measured_on: dstr(d), weight_kg: w, height_cm: null,
    body_fat_pct: null, chest_cm: null, waist_cm: null, hips_cm: null, arms_cm: null, thighs_cm: null, notes: null,
    created_at: iso(d), ...extra });
  const DB = {
    profiles: [ME],
    member_profiles: [{ profile_id: 'm1', experience_level: 'beginner', qr_code: 'QR', created_at: iso(-90), profiles: ME }],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: dstr(-10), expiry_date: dstr(20),
      never_expires: false, frozen_at: null, created_at: iso(-10), membership_plans: PREMIUM }],
    // 80 → 77 → 75, then a chest-only reading that must not blank the weight
    body_measurements: [m(-40, 80), m(-20, 77), m(-3, 75), m(-1, null, { chest_cm: 90 })],
    exercises: [{ id: 'e1', name: 'Barbell Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 1 }],
    goal_templates: [{ key: 'stay_active', label: 'Maintain an active routine', description: 'Keep ticking over.',
      measured_as: 'Days you trained in the last 30 days.', target_default: 12, is_active: true, sort_order: 1 }],
    fitness_goals: [
      { id: 'g1', member_id: 'm1', title: 'Get to 70 kg', metric: 'weight_kg', start_value: 80, target_value: 70,
        target_date: dstr(60), achieved_on: null, created_at: iso(-40), template_key: null, exercise_id: null },
      { id: 'g2', member_id: 'm1', title: 'Squat 100 kg', metric: 'lift_kg', start_value: 60, target_value: 100,
        target_date: null, achieved_on: null, created_at: iso(-30), template_key: null, exercise_id: 'e1' },
      { id: 'g3', member_id: 'm1', title: 'Maintain an active routine', metric: 'custom', start_value: null, target_value: 12,
        target_date: null, achieved_on: null, created_at: iso(-10), template_key: 'stay_active', exercise_id: null },
    ],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: null, email: null,
      opening_time: '06:00', closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: null,
      activity_options: [], updated_at: iso(0), updated_by: null }],
  };
  const FEATURES = ['workout_tracker', 'plan_builder', 'ai_model', 'points_earn', 'points_redeem', 'challenges']
    .map((key) => ({ key, label: key, description: key, enabled: true }));
  const RPC = {
    my_features: FEATURES, plan_allows: true, member_points_balance: 0, sync_my_achievements: 0,
    member_progression: [{ level: 1, points: 0, next_level_points: 100 }], member_commitments: [],
    settle_my_goals: 0,
    goal_progress: 8,
    member_exercise_history: [
      { performed_on: dstr(-25), top_weight_kg: 65, top_reps: 5 },
      { performed_on: dstr(-12), top_weight_kg: 72.5, top_reps: 5 },
      { performed_on: dstr(-2), top_weight_kg: 80, top_reps: 3 },
    ],
  };

  const posted = [];
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
    const match = (rows) => rows.filter((r) => params.every(([k, v]) => {
      if (['select', 'order', 'limit', 'offset', 'columns'].includes(k) || !(k in r)) return true;
      const mm = /^eq\.(.*)$/.exec(v); return mm ? String(r[k]) === mm[1] : true;
    }));
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: `new${DB[t].length}`, created_at: new Date().toISOString(),
        achieved_on: null, template_key: null, exercise_id: null, start_value: null, target_value: null, target_date: null, ...r }));
      DB[t].push(...list); posted.push({ t, body });
      return json(one ? list[0] : list, 201);
    }
    if (req.method() === 'PATCH') { const hit = match(DB[t]); hit.forEach((r) => Object.assign(r, JSON.parse(req.postData() || '{}'))); return json(hit); }
    if (req.method() === 'DELETE') { const hit = match(DB[t]); DB[t] = DB[t].filter((r) => !hit.includes(r)); return json(hit); }
    const rows = match(DB[t]);
    return json(one ? rows[0] ?? null : rows);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/member/progress?tab=goals', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/goals-01-list.png', fullPage: false });
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const out = [];
  out.push('weight current 75 (not blanked by chest-only reading): ' + /Now 75 kg/.test(text));
  out.push('weight 50% there: ' + /50%/.test(text));
  out.push('pace shown: ' + (/(On track|Ahead|Behind)/.exec(text)?.[0] ?? 'NONE'));
  out.push('projection shown: ' + /current rate/.test(text));
  out.push('lift current 80: ' + /Now 80 kg/.test(text));
  out.push('habit 8 of 12: ' + /8 of 12/.test(text));

  // Create a strength goal through the flow
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /A lift/ }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /Choose an exercise/ }).last().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Barbell Squat/ }).last().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Target (kg)').fill('120');
  await page.getByRole('button', { name: /Next/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/goals-02-create-finish.png' });
  await page.getByRole('button', { name: /Set goal/ }).click();
  await page.waitForTimeout(1500);
  const created = posted.find((p) => p.t === 'fitness_goals');
  out.push('created: ' + JSON.stringify(created?.body ?? null));
  await page.screenshot({ path: 'shots/goals-03-after.png' });
  return out.join('\n');
}
