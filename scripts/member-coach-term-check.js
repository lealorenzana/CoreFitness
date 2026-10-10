/**
 * 0181 on the member's side: Train with a coach from their profile (the gym's
 * lengths, and who is paid), Your coach while waiting to pay the coach
 * directly (their GCash, the reference), and a running coaching whose coach
 * is on leave (pick a stand-in of the same specialty for a date range).
 *
 * Fixture from member-booking-modes-check.js (itself from member-nav-check.js).
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
    // The coach's roster (0082): one trainee.
    my_trainer_members: [{ member_id: 'mb1', name: 'Lea Lorenzana', photo_url: null, experience_level: 'beginner',
      last_visit: iso(-1, 18, 0), visits_last_30: 6 }],
    gym_programs: [
      { id: 'pF', name: 'Starter Strength', description: null, cover_url: null, level: 'beginner', weeks: 2,
        premium: false, published: true, hidden: false, created_at: iso(-5, 9, 0) },
      { id: 'pP', name: 'Advanced Block', description: null, cover_url: null, level: 'advanced', weeks: 1,
        premium: true, published: true, hidden: false, created_at: iso(-4, 9, 0) },
    ],
    classes: [{ id: 'c1', name: 'Sunrise HIIT', level: 'all_levels', class_type: 'hiit', location: 'Studio', capacity: 10,
      scheduled_at: iso(1, 7, 0), duration_minutes: 60, trainer_id: 't1', status: 'scheduled' }],
    class_availability: [{ class_id: 'c1', capacity: 10, booked_count: 2 }],
    bookings: [],
    public_trainers: [
      { id: 't1', first_name: 'Rae', last_name: 'Santos', photo_url: null, specialization: 'Strength', bio: null, availability: null,
        years_experience: 5, certifications: null, focus_areas: null, achievements: null, gym_id: 'gym-1', presence: 'available' },
      { id: 't2', first_name: 'Ben', last_name: 'Cruz', photo_url: null, specialization: 'Strength', bio: null, availability: null,
        years_experience: 3, certifications: null, focus_areas: null, achievements: null, gym_id: 'gym-1', presence: 'available' },
      { id: 't3', first_name: 'Yoga', last_name: 'Yu', photo_url: null, specialization: 'Yoga', bio: null, availability: null,
        years_experience: 2, certifications: null, focus_areas: null, achievements: null, gym_id: 'gym-1', presence: 'available' }],
    trainer_payment_methods: [{ id: 'pm1', trainer_id: 't1', kind: 'gcash', label: 'GCash', account_name: 'Rae Santos',
      account_number: '0917 222 3333', qr_url: null, active: true, created_at: iso(-3, 9, 0) }],
    coaching_prices: [],
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


  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const UPLOADED = [];
  DB.progress_photos = [
    { id: 'ph1', member_id: 'm1', path: 'gym-1/m1/a.jpg', pose: 'front', taken_on: dstr(-60), note: 'Start, 74 kg', created_at: iso(-60, 9, 0) },
    { id: 'ph2', member_id: 'm1', path: 'gym-1/m1/b.jpg', pose: 'front', taken_on: dstr(-2), note: '69 kg', created_at: iso(-2, 9, 0) },
    { id: 'ph3', member_id: 'm1', path: 'gym-1/m1/c.jpg', pose: 'side', taken_on: dstr(-2), note: null, created_at: iso(-2, 9, 1) },
  ];
  DB.member_share_prefs = [{ member_id: 'm1', share_photos: false }];
  const ROOM = { id: 'rm1', kind: 'pt', name: 'Lea · 1-on-1', description: null, trainer_id: 't1', trainer_name: 'Coach Rae',
    member_count: 1, post_count: 0, last_post_at: null, comments_on: true, archived: false, join_code: null, is_mine: false, full_access: true };
  const CALLS = {};
  let n2 = 0;
  const STATE = { status: null };
  const coachingRow = () => ({ id: 'k1', member_id: 'm1', member_name: 'Lea Lorenzana', member_photo: null, trainer_id: 't1',
    trainer_name: 'Rae Santos', trainer_photo: null, kind: 'pt', room_id: 'rm1', months: 3, status: STATE.status,
    fee_mode: 'trainer_direct', price: 1500, pay_reference: null, pay_sent_at: null,
    starts_on: STATE.status === 'active' ? dstr(-5) : null, ends_on: STATE.status === 'active' ? dstr(85) : null,
    started_by: 'member', created_at: iso(-5, 9, 0), standin_id: null, standin_trainer_id: null, standin_name: null,
    standin_from: null, standin_to: null, group_code: null, i_am: 'member' });
  const FN = {
    coaching_settings: () => [{ modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee_mode: 'trainer_direct' }],
    my_coachings: () => (STATE.status ? [coachingRow()] : []),
    request_coaching: () => { STATE.status = 'requested'; return 'k1'; },
    submit_coaching_payment: () => { STATE.status = 'payment_sent'; return null; },
    set_coaching_standin: () => 'sd1',
    coaching_sweep: () => 0,
    reserve_progress_photo: (b) => { const id = 'new' + (++n2); const p = `gym-1/m1/new${n2}.jpg`;
      DB.progress_photos.unshift({ id, member_id: 'm1', path: p, pose: b.p_pose, taken_on: b.p_taken_on || dstr(0), note: b.p_note, created_at: new Date().toISOString() });
      return [{ photo_id: id, path: p }]; },
    set_share_photos: (b) => { DB.member_share_prefs[0].share_photos = b.p_share; return null; },
    delete_progress_photo: () => null,
    sync_gym_rooms: () => 0,
    my_rooms: () => [ROOM],
    room_badges: () => [],
    room_classwork: () => [{ id: 'wp', kind: 'checkin', checkin_type: 'photo', title: 'Front photo, week 4', instructions: 'Same spot, same light.',
      due_on: dstr(2), gym_workout_id: null, workout_name: null, created_at: iso(-1, 9, 0), whole_room: true, targets: 1, turned_in: 0,
      late: 0, missing: 0, to_review: 0, my_status: 'assigned', my_answer_text: null, my_answer_number: null, my_return_comment: null, my_points: 0 }],
    submit_checkin_photo: () => 's1',
  };
  const RPC = {
    refund_quote: [{ percent: 70, amount: 1050, rule_label: 'Pro-rata for the 21 unused days of your term.', days_elapsed: 9,
      has_visited: true, paid_total: 1500, days_total: 30, days_unused: 21, prorata_percent: 70, floor_percent: 50, basis: 'prorata', fee_deducted: 0 }],
    gym_traffic: [1,2,3,4,5,6,0].flatMap((dow) => ['6am','9am','12pm','3pm','6pm','9pm'].map((band, k) =>
      ({ dow, band, visits: [8, 5, 2, 4, 14, 3][k] * 4, weeks: 4 }))),
    my_features: FEATURES, plan_allows: true, member_points_balance: 0,
    member_progression: [{ level: 1, points: 0, next_level_points: 100 }], sync_my_achievements: 0,
    member_commitments: [], my_trainer_ratings: [],
    my_booking_modes: [{ class_mode: 'off', pt_mode: 'instant' }],
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
    // Private storage (0132): signed links, and uploads into reserved slots.
    if (path.startsWith('/storage/v1/object/sign/')) {
      if (req.method() === 'POST') {
        const b = JSON.parse(req.postData() || '{}');
        return json((b.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/progress/${p}?token=t`, error: null })));
      }
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    }
    if (path.startsWith('/storage/v1/object/progress/')) {
      UPLOADED.push(path.replace('/storage/v1/object/progress/', ''));
      return json({ Key: path });
    }
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
  const shot = async (name) => page.screenshot({ path: `shots/run-${name}.png` });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };



  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');


  const pills = async () => page.evaluate(() => [...document.querySelectorAll('header button, [role="navigation"] button')]
    .map((b) => b.innerText.trim()).filter(Boolean));
  const strip = async (hub) => page.evaluate((h) => [...document.querySelectorAll(`[data-hub="${h}"] [role="tab"]`)]
    .map((b) => b.innerText.trim()), hub);
  const tap = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(1200); };

  // ---- a coach's profile: Train with them ----
  await go('/member/trainer/t1');
  let t = await text();
  out.push('the profile offers Train with them: ' + (/Train with Rae/.test(t) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /^Train with Rae$/ }).click();
  await page.waitForTimeout(600);
  t = await text();
  out.push("the gym's lengths, and that the coach is paid directly: " + (/1 month/.test(t) && /3 months/.test(t) && /You pay Rae directly/.test(t) ? 'yes' : 'MISSING'));
  await page.locator('[data-length="3"]').click();
  await page.getByRole('button', { name: /^Ask$/ }).click();
  await page.waitForTimeout(1200);
  out.push('asking sends the coach, 1-on-1 and the length: ' + (CALLS.request_coaching?.p_trainer === 't1' && CALLS.request_coaching?.p_kind === 'pt' && CALLS.request_coaching?.p_months === 3 ? 'yes' : 'MISSING ' + JSON.stringify(CALLS.request_coaching)));
  out.push('…and lands on Your coach: ' + (/\/member\/coach$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));

  // ---- Your coach: waiting for payment ----
  STATE.status = 'awaiting_payment';
  await go('/member/coach');
  t = await text();
  out.push("waiting for payment shows the coach's own GCash: " + (/Pay Rae/.test(t) && /0917 222 3333/.test(t) && /₱1,500/.test(t) ? 'yes' : 'MISSING'));
  await page.getByLabel('Payment reference').fill('GC-55512');
  await page.getByRole('button', { name: /^Send$/ }).click();
  await page.waitForTimeout(1000);
  out.push('the reference is sent: ' + (CALLS.submit_coaching_payment?.p_reference === 'GC-55512' ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-coach-pay.png' });

  // ---- active, coach on leave: pick a stand-in ----
  STATE.status = 'active';
  DB.public_trainers[0].presence = 'on_leave';
  await go('/member/coach');
  t = await text();
  out.push('active: until when, and the room: ' + (/Until/.test(t) && /Open your room/.test(t) ? 'yes' : 'MISSING'));
  out.push('the coach on leave is said: ' + ((await page.locator('[data-coach-away]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /Pick a stand-in coach/ }).click();
  await page.waitForTimeout(600);
  t = await text();
  out.push('the stand-ins are coaches of the same specialty: ' + (/Ben Cruz/.test(t) && !/Yoga Yu/.test(t) ? 'yes' : 'MISSING'));
  await page.getByText('Ben Cruz').first().click();
  await page.getByRole('button', { name: /^Set stand-in$/ }).click();
  await page.waitForTimeout(1000);
  out.push('the stand-in is set for a date range: ' + (CALLS.set_coaching_standin?.p_trainer === 't2' && /^\d{4}-\d{2}-\d{2}$/.test(CALLS.set_coaching_standin?.p_from ?? '') ? 'yes' : 'MISSING ' + JSON.stringify(CALLS.set_coaching_standin)));
  await page.screenshot({ path: 'shots/member-coach-active.png' });
  return out.join('\n');
}
