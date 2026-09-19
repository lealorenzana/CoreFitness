/**
 * Rewards, Edit profile and Settings (0092) against a stateful fixture:
 * pace and per-rule counts, pinning a target, redeem with confirm, See all
 * requests; the new profile fields and the shared phone rule, the save bar;
 * the coaches the sharing switches apply to, and Download my data.
 * Writes shots/account-NN-*.png.
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
    role: 'member', status: 'active', phone: '09171112222', photo_url: null, created_at: iso(-90, 9, 0) };
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
      date_of_birth: '1998-04-12', gender: 'female', address: null, emergency_contact_name: null, emergency_contact_phone: null,
      emergency_contact_relationship: null, saving_for_reward: null }],
    rewards: [{ id: 'rw1', name: 'Shaker bottle', description: 'Leak-proof, 600 ml.', cost_points: 200, stock: 12, is_active: true },
      { id: 'rw2', name: 'Gym towel', description: 'Microfibre.', cost_points: 500, stock: 3, is_active: true }],
    reward_redemptions: [{ id: 'rd1', member_id: 'm1', reward_id: 'rw1', cost_points: 200, status: 'approved', requested_at: iso(-2, 9, 0),
      decision_note: null, fulfilled_at: null, rewards: { name: 'Shaker bottle' } }],
    point_rules: [{ key: 'checkin', label: 'Checked in at the gym', points: 10, is_active: true, sort_order: 1 },
      { key: 'workout', label: 'Logged a workout', points: 15, is_active: true, sort_order: 2 }],
    point_ledger: [0, -1, -3, -6, -9].map((d, i) => ({ id: 'pl' + i, member_id: 'm1', rule_key: i % 2 ? 'workout' : 'checkin',
      points: i % 2 ? 15 : 10, created_at: iso(d, 18, 0), point_rules: { label: i % 2 ? 'Logged a workout' : 'Checked in at the gym' } })),
    pt_sessions: [{ id: 'pt1', trainer_id: 't1', member_id: 'm1', starts_at: iso(-5, 9, 0), duration_minutes: 60, status: 'approved' }],
    public_trainers: [{ id: 't1', first_name: 'Bianca', last_name: 'Soriano', photo_url: null, specialization: 'Rehab', bio: null,
      availability: null, years_experience: 11, certifications: [], focus_areas: [], achievements: null }],
    notification_prefs: [], member_share_prefs: [],
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
    is_phone_taken: () => false,
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
    my_features: FEATURES, plan_allows: true, member_points_balance: 345,
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
        const rows = (typeof DB !== 'undefined' ? DB.profiles : TABLES.profiles) || [];
        const me = rows.find((p) => p.id === (route.request().headers()['x-fixture-user'] || session.user.id));
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
        // The column default (0051): a new request is pending.
        ...(t === 'reward_redemptions' ? { status: 'pending', requested_at: new Date().toISOString() } : {}),
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
  const shot = async (name) => page.screenshot({ path: `shots/account-${name}.png` });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };



  // 1 — Rewards: balance, pace, pin a target, redeem with confirm
  await go('/member/rewards');
  await shot('01-rewards');
  let text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  out.push('balance/pace: ' + (/CORE points \d+ \+\d+ this month[^|]{0,40}/i.exec(text) || ['MISSING'])[0]);
  out.push('ready banner: ' + (/Shaker bottle is ready/.exec(text) ? 'shown' : 'MISSING'));
  out.push('per-rule: ' + (/\d+× this month · \+\d+/.exec(text) || ['MISSING'])[0]);
  await page.getByRole('button', { name: /Gym towel/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Save for this' }).click();
  await page.waitForTimeout(1000);
  out.push('pinned: ' + (DB.member_profiles[0].saving_for_reward ?? 'NONE'));
  text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  out.push('target: ' + (/Saving for Gym towel[^|]{0,80}/.exec(text) || ['MISSING'])[0]);
  await shot('02-target');
  await page.getByRole('button', { name: /Shaker bottle/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Redeem', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('03-confirm');
  await page.getByRole('button', { name: /Yes, spend/ }).click();
  await page.waitForTimeout(1000);
  out.push('redeemed: ' + DB.reward_redemptions.filter((r) => r.status === 'pending').length + ' pending');
  await page.getByRole('button', { name: /See all requests/ }).click().catch(() => {});
  await page.waitForTimeout(900);
  out.push('requests page: ' + page.url().replace(/^https?:\/\/[^/]+/, ''));

  // 2 — Edit profile: loads member_profiles, completeness, phone rule, save
  await go('/member/profile/edit');
  await shot('04-edit');
  text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  out.push('completeness: ' + (/Still missing: [^.]+\./.exec(text) || /Complete — [^.]+\./.exec(text) || ['MISSING'])[0]);
  await page.getByLabel('Phone number').fill('0917 555 1234');
  // The emergency section's own first input — "Name" alone also matches "First name".
  const emName = page.locator('section', { hasText: 'Emergency contact' }).locator('input').first();
  await emName.fill('Maria Lorenzana').catch(() => {});
  await page.getByRole('button', { name: 'Parent' }).click();
  await page.waitForTimeout(300);
  out.push('save bar: ' + ((await page.getByRole('region', { name: 'Unsaved changes' }).count()) ? 'shown' : 'MISSING'));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(1200);
  const mp = DB.member_profiles[0];
  out.push(`saved: phone=${DB.profiles[0].phone} emergency=${mp.emergency_contact_name}/${mp.emergency_contact_relationship} phoneCheck=${JSON.stringify(CALLS.is_phone_taken ?? null)}`);
  await shot('05-edit-saved');

  // 3 — Settings: coaches named, test alert, data export (no real download needed)
  await go('/member/settings');
  await page.waitForTimeout(1500);
  await shot('06-settings');
  text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  out.push('coaches: ' + (/Coaches these switches apply to[^|]{0,40}/.exec(text) || /No coach has trained you yet/.exec(text) || ['MISSING'])[0]);
  out.push('share label: ' + (text.includes('Workouts and routines') ? 'updated' : 'OLD'));
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await dl;
  if (file) {
    const path = await file.path();
    const fs = await import('node:fs').catch(() => null);
    const body = fs && path ? JSON.parse(fs.readFileSync(path, 'utf-8')) : null;
    out.push('export: ' + file.suggestedFilename() + (body ? ` tables=${Object.keys(body.data).length} unavailable=${Object.keys(body.unavailable).length}` : ''));
  } else {
    out.push('export: NO DOWNLOAD');
  }
  out.push('call link: ' + ((await page.locator('a[href^="tel:"]').count()) ? 'present' : 'none'));
  return out.join(' | ');
}
