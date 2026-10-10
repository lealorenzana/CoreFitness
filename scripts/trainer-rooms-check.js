/**
 * Coaching rooms, the trainer's side (0128/0129): the Rooms tab, a room's four
 * tabs, posting, assigning a check-in, reviewing a hand-in (with the sets the
 * member logged) and returning it with a comment, the grade book's flags, and
 * the group code. The rules themselves are proven in scripts/sql/rooms.mjs and
 * classwork.mjs; this proves the screens send and show them.
 *
 * Setup copied from trainer-assign-check.js.
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
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9, 0) };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana', email: 'lea@corefitness-test.com', role: 'trainer' }));
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

  const ROLE = 'trainer';
  let FULL = true;

  // ---- coaching rooms fixture (0128/0129) -------------------------------------------------
  const today = dstr(0);
  const ROOMS = [
    { id: 'rm1', kind: 'class', name: 'Morning HIIT', description: null, trainer_id: 't1', trainer_name: 'Coach Rae',
      member_count: 2, post_count: 1, last_post_at: iso(-1, 9, 0), comments_on: true, archived: false,
      join_code: null, is_mine: ROLE === 'trainer', full_access: FULL },
    { id: 'rm2', kind: 'group', name: '8-week fat loss', description: 'Two check-ins a week', trainer_id: 't1', trainer_name: 'Coach Rae',
      member_count: 1, post_count: 0, last_post_at: null, comments_on: true, archived: false,
      join_code: ROLE === 'trainer' ? 'QWERTY' : null, is_mine: ROLE === 'trainer', full_access: FULL },
  ];
  const POSTS = [{ post_id: 'po1', created_at: iso(-1, 9, 0), body: 'Bring water tomorrow!', photo_url: null, video_url: null,
    author_name: 'Coach Rae', can_delete: ROLE === 'trainer',
    comments: [{ id: 'c1', body: 'Got it coach!', created_at: iso(-1, 10, 0), author: 'Ana R.', is_trainer: false, can_delete: false }] }];
  const WORK = [
    { id: 'w1', kind: 'workout', checkin_type: null, title: 'Leg day', instructions: 'Go heavy', due_on: dstr(2),
      gym_workout_id: 'gw1', workout_name: 'Leg Day A', created_at: iso(-2, 9, 0), whole_room: true,
      targets: 2, turned_in: 1, late: 0, missing: 0, to_review: 1, my_status: 'assigned', my_answer_text: null,
      my_answer_number: null, my_return_comment: null, my_points: 0 },
    { id: 'w2', kind: 'checkin', checkin_type: 'weight', title: 'Weigh-in', instructions: null, due_on: dstr(1),
      gym_workout_id: null, workout_name: null, created_at: iso(-2, 9, 0), whole_room: true,
      targets: 2, turned_in: 0, late: 0, missing: 0, to_review: 0, my_status: 'assigned', my_answer_text: null,
      my_answer_number: null, my_return_comment: null, my_points: 0 },
  ];
  const CALLS = {};
  const FN = {
    sync_gym_rooms: () => 0,
    my_rooms: () => ROOMS.map((r) => ({ ...r, full_access: FULL })),
    room_badges: () => [{ room_id: 'rm1', to_review: ROLE === 'trainer' ? 1 : 0, due_soon: 2 }],
    trainer_review_queue: () => ROLE !== 'trainer' ? [] : [{ submission_id: 's1', assignment_id: 'w1', room_id: 'rm1',
      room_name: 'Morning HIIT', title: 'Leg day', member_name: 'Ana Reyes', turned_in_at: iso(0, 7, 0), late: false }],
    room_stream: () => [
      ...(DB.room_posts || []).map((p) => ({ post_id: p.id, created_at: p.created_at, body: p.body, photo_url: null,
        video_url: p.video_url, author_name: 'Coach Rae', can_delete: true, comments: [] })),
      ...POSTS.map((p) => ({ ...p, comments: [...p.comments, ...(DB.room_comments || []).filter((c) => c.post_id === p.post_id)
        .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, author: 'Lea L.', is_trainer: false, can_delete: true }))] })),
    ],
    room_people: () => [
      { member_id: 't1', name: 'Coach Rae', photo_url: null, is_trainer: true, is_me: ROLE === 'trainer' },
      { member_id: 'mb1', name: ROLE === 'trainer' ? 'Ana Reyes' : 'Ana R.', photo_url: null, is_trainer: false, is_me: false },
      { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, is_trainer: false, is_me: ROLE !== 'trainer' },
    ],
    room_classwork: () => WORK,
    create_assignment: () => 'w9',
    assignment_detail: () => [
      { member_id: 'mb1', name: 'Ana Reyes', photo_url: null, status: RETURNED ? 'returned' : 'turned_in', submission_id: 's1',
        turned_in_at: iso(0, 7, 0), answer_text: null, answer_number: null, return_comment: RETURNED ? 'Great depth!' : null,
        returned_at: RETURNED ? iso(0, 8, 0) : null,
        workout: [{ exercise: 'Barbell Squat', set: 1, reps: 8, kg: 60, seconds: null }] },
      { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, status: 'assigned', submission_id: null, turned_in_at: null,
        answer_text: null, answer_number: null, return_comment: null, returned_at: null, workout: null },
    ],
    return_submission: () => { RETURNED = true; return null; },
    room_progress: () => [
      { member_id: 'mb1', name: 'Ana Reyes', photo_url: null, assigned: 3, on_time: 1, late: 0, missing: 2,
        last_workout_at: iso(-12, 9, 0), classes_booked: 8, classes_attended: 5, latest_weight: 64.5,
        cells: [{ assignment: 'a', status: 'on_time' }, { assignment: 'b', status: 'missing' }, { assignment: 'c', status: 'missing' }],
        flags: ['missing_work', 'inactive'] },
      { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, assigned: 3, on_time: 3, late: 0, missing: 0,
        last_workout_at: iso(-1, 9, 0), classes_booked: 8, classes_attended: 8, latest_weight: null,
        cells: [{ assignment: 'a', status: 'on_time' }, { assignment: 'b', status: 'on_time' }, { assignment: 'c', status: 'on_time' }],
        flags: [] },
    ],
    join_room: () => 'rm2',
    submit_checkin: () => null,
    start_assignment: () => 'L1',
    classwork_due_sweep: () => 0,
    my_due_classwork: () => ROLE === 'trainer' ? [] : [
      { assignment_id: 'w2', room_id: 'rm1', room_name: 'Morning HIIT', title: 'Weigh-in', kind: 'checkin', due_on: dstr(1) }],
  };
  let RETURNED = false;
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


  const pressTab = async (name) => { await page.getByRole('tab', { name }).click().catch(async () => page.getByRole('button', { name, exact: true }).click()); await page.waitForTimeout(800); };

  await go('/trainer/rooms');
  let t = await text();
  out.push('Rooms tab in the bar: ' + ((await page.locator('nav').getByText('Rooms', { exact: true }).count()) > 0 ? 'shown' : 'MISSING'));
  out.push('to review first: ' + (/1 to review/.test(t) && /Ana Reyes · Leg day/.test(t) ? 'shown' : 'MISSING'));
  // Discord layout (2026-10-10): rooms are round pictures on the rail, grouped by kind.
  const rail = await page.evaluate(() => [...document.querySelectorAll('[data-rail-room]')].map((b) => b.getAttribute('aria-label')));
  out.push('class and group rooms on the rail: ' + (rail.includes('Morning HIIT') && rail.includes('8-week fat loss') ? 'shown' : 'MISSING ' + JSON.stringify(rail)));
  out.push('grouped Classes / 1-on-1 / Groups: ' + ((await page.locator('[data-rail-group="class"]').count()) === 1 && (await page.locator('[data-rail-group="group"]').count()) === 1 ? 'yes' : 'MISSING'));
  out.push('all my members kept, once: ' + ((await page.getByText('All my members', { exact: true }).count()) === 1 ? 'one tap away' : 'MISSING'));
  out.push('the coach and their status in the corner: ' + ((await page.locator('[data-presence]').count()) === 1 ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-rooms.png' });

  // A room on the rail opens its channels; a channel opens the room over the list.
  await page.locator('[data-rail-room="rm1"]').click();
  await page.waitForTimeout(500);
  const chans = await page.evaluate(() => [...document.querySelectorAll('[data-channels] button')].map((b) => b.textContent.trim()));
  out.push('a room lists its channels: ' + (chans.some((c) => /# Stream/.test(c)) && chans.some((c) => /# Classwork/.test(c)) ? 'yes' : 'MISSING ' + JSON.stringify(chans)));
  await page.locator('[data-channels] button', { hasText: '# Stream' }).click();
  await page.waitForTimeout(1300);
  t = await text();
  out.push('opens the room: ' + (/\/trainer\/rooms\/rm1$/.test(page.url()) ? 'rm1' : 'MISSING ' + page.url()));
  out.push('four tabs: ' + (['Stream', 'Classwork', 'People', 'Progress'].every((x) => t.includes(x)) ? 'Stream · Classwork · People · Progress' : 'MISSING'));
  out.push('the stream with a comment: ' + (/Bring water tomorrow!/.test(t) && /Got it coach!/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel('New post').fill('Class moved to 7:30 on Friday');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.waitForTimeout(1200);
  out.push('posting: ' + ((DB.room_posts || []).some((p) => p.body === 'Class moved to 7:30 on Friday' && p.room_id === 'rm1' && p.gym_id === 'gym-1')
    && /Class moved to 7:30 on Friday/.test(await text()) ? 'sent and shown' : 'MISSING ' + JSON.stringify(DB.room_posts)));
  await page.screenshot({ path: 'shots/trainer-room-stream.png' });

  await pressTab('Classwork');
  t = await text();
  out.push('classwork with counts: ' + (/Leg day/.test(t) && /1 of 2 turned in/.test(t) && /1 to review/.test(t) ? 'shown' : 'MISSING'));
  await page.getByRole('button', { name: 'Assign', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Check-in', exact: true }).click();
  await page.getByLabel('Check-in type').selectOption('weight');
  await page.getByLabel('Title').fill('Monday weigh-in');
  await page.screenshot({ path: 'shots/trainer-assign.png' });
  await page.locator('#phone-overlay-root').getByRole('button', { name: 'Assign', exact: true }).click();
  await page.waitForTimeout(1200);
  const ca = CALLS.create_assignment;
  out.push('assigning a check-in: ' + (ca && ca.p_room === 'rm1' && ca.p_kind === 'checkin' && ca.p_checkin_type === 'weight'
    && ca.p_title === 'Monday weigh-in' && ca.p_assigned_to === null ? 'sent to the whole room' : 'MISSING ' + JSON.stringify(ca)));

  await page.getByText('Leg day', { exact: true }).first().click();
  await page.waitForTimeout(1300);
  t = await text();
  out.push('what they did: ' + (/To review/.test(t) && /Barbell Squat · set 1: 8 × 60 kg/.test(t) ? 'sets shown' : 'MISSING'));
  await page.getByLabel('Comment for Ana Reyes').fill('Great depth!');
  await page.getByRole('button', { name: 'Return with comment' }).click();
  await page.waitForTimeout(1300);
  out.push('return with comment: ' + (CALLS.return_submission?.p_submission === 's1' && CALLS.return_submission?.p_comment === 'Great depth!'
    && /You: Great depth!/.test(await text()) ? 'sent and shown' : 'MISSING ' + JSON.stringify(CALLS.return_submission)));
  await page.screenshot({ path: 'shots/trainer-return.png' });

  await go('/trainer/rooms/rm1?tab=progress');
  t = await text();
  out.push('grade book flags: ' + (/2\+ missing/.test(t) && /No workout in 10 days/.test(t) && /1 person needs a look/.test(t) ? 'shown' : 'MISSING'));
  out.push('grade book figures: ' + (/5 of last 8 classes/.test(t) && /64\.5 kg/.test(t) && /33%/.test(t) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-progress.png', fullPage: true });

  await go('/trainer/rooms/rm2?tab=people');
  t = await text();
  out.push('group code for its trainer: ' + (/QWERTY/.test(t) && /Make a new code/.test(t) ? 'shown' : 'MISSING'));

  await go('/trainer/home');
  out.push('home nudge: ' + (/1 turned in, waiting for your comment/.test(await text()) ? 'shown' : 'MISSING'));

  return out.join('\n');
}
