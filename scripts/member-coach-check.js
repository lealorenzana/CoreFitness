/**
 * The AI coach in the assistant chat: named honestly, consent asked before
 * anything is sent, the question reaching the coach once, the streamed reply
 * shown whole and saved as the coach's, gym facts answered by the rules, and
 * nothing sent at the daily limit.
 *
 * Setup copied from member-shop-check.js.
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
  const COACH_POSTS = [];
  let FN_DEPLOYED = true;
  const COACH = { gym_id: 'gym-1', allowed: true, reason: null, used_today: 3, daily_limit: 30,
    used_month: 40, monthly_limit: 1500, consent: null };
  const FN = {
    shop_catalog: () => [
      { id: 'p1', name: 'Water 500ml', category: 'Drinks', description: null, price: 20, photo_url: null, availability: 'in_stock' },
      { id: 'p2', name: 'Whey scoop', category: 'Supplements', description: 'Chocolate', price: 60, photo_url: null, availability: 'low' },
      { id: 'p4', name: 'Pre-workout', category: 'Supplements', description: null, price: 80, photo_url: null, availability: 'sold_out' },
    ],
  };
  const RPC = {
    refund_quote: [{ percent: 70, amount: 1050, rule_label: 'Pro-rata for the 21 unused days of your term.', days_elapsed: 9,
      has_visited: true, paid_total: 1500, days_total: 30, days_unused: 21, prorata_percent: 70, floor_percent: 50, basis: 'prorata', fee_deducted: 0 }],
    gym_traffic: [1,2,3,4,5,6,0].flatMap((dow) => ['6am','9am','12pm','3pm','6pm','9pm'].map((band, k) =>
      ({ dow, band, visits: [8, 5, 2, 4, 14, 3][k] * 4, weeks: 4 }))),
    ai_coach_status: () => COACH,
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

    if (path.startsWith('/functions/v1/ai-coach')) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      if (!FN_DEPLOYED) return route.fulfill({ status: 404, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"Requested function was not found"}' });
      const posted = JSON.parse(req.postData() || '{}');
      // The readiness probe (an empty body) is answered as the deployed, configured function does.
      if (!posted.question) return route.fulfill({ status: 400, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"reason":"bad_question"}' });
      COACH_POSTS.push(posted);
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'data: {"type":"text","text":"Brace like "}\n\ndata: {"type":"text","text":"you are about to be poked."}\n\ndata: {"type":"done"}\n\n' });
    }
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
      if (fn === 'set_ai_coach_consent') { const b = JSON.parse(req.postData() || '{}'); CALLS[fn] = b; COACH.consent = b.p_reads_data; return json(null); }
      const r = RPC[fn]; return json(typeof r === 'function' ? r() : fn in RPC ? r : null); }
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
  await go('/member/settings');
  out.push('the coach switch is offered when allowed: ' + (/Let the coach read my training/.test(await text()) ? 'yes' : 'MISSING'));
  await go('/member/chatbot');
  let t = await text();
  out.push('coach named honestly: ' + (/training help from the AI coach/.test(t) ? 'yes' : 'MISSING'));
  out.push('messages left shown: ' + (/3 of 30 coach messages today/.test(t) ? 'yes' : 'MISSING'));
  await page.getByLabel('Your question').fill('How do I stay motivated on cold mornings?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1200);
  t = await text();
  out.push('consent asked before anything is sent: ' + (/Before the coach answers/.test(t) && !COACH_POSTS.length ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Yes, use my training' }).click();
  await page.waitForTimeout(2000);
  t = await text();
  out.push('consent saved: ' + (CALLS.set_ai_coach_consent?.p_reads_data === true ? 'yes' : 'MISSING'));
  out.push('the question reached the coach once: ' + (COACH_POSTS.length === 1 && COACH_POSTS[0].question === 'How do I stay motivated on cold mornings?' ? 'yes' : 'MISSING'));
  out.push('the streamed reply is shown whole: ' + (/Brace like you are about to be poked\./.test(t) ? 'yes' : 'MISSING'));
  out.push('saved as the coach\'s: ' + ((DB.assistant_messages ?? []).some((m) => m.source === 'coach') ? 'yes' : 'MISSING'));
  // Gym facts still come from the rules, never the model.
  const before = COACH_POSTS.length;
  await page.getByLabel('Your question').fill('What time do you open?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  out.push('a gym fact is answered by the rules: ' + (COACH_POSTS.length === before ? 'yes' : 'NO, sent to the model'));
  // The rules' personal answers must never ride along as history: consent covered
  // the listed fields, not the check-in code, plan or points the rules quote.
  await page.getByLabel('Your question').fill('What is my check-in code?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  const codeMatch = /check-in code is ([A-Z0-9 -]+?)\. Tap/i.exec(await text());
  out.push('the rules answer the check-in code from the fixture: ' + (codeMatch ? 'yes' : 'MISSING'));
  const beforeHist = COACH_POSTS.length;
  await page.getByLabel('Your question').fill('How do I stay motivated on rainy evenings?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(2000);
  const post = COACH_POSTS[beforeHist];
  const hist = post?.history ?? [];
  const histText = JSON.stringify(hist);
  out.push('the second coach question was sent: ' + (post && post.question === 'How do I stay motivated on rainy evenings?' ? 'yes' : 'MISSING'));
  out.push('history has no rules answer: ' + (codeMatch && !histText.includes(codeMatch[1]) && !/Your check-in code/i.test(histText) && !/We open|opening hours|Mamburao/i.test(histText) ? 'yes' : 'NO, a rules answer was sent'));
  out.push('history is the coach exchange only: ' + (hist.length === 2 && hist[0].role === 'user' && hist[0].content === 'How do I stay motivated on cold mornings?' && hist[1].role === 'assistant' && /Brace like/.test(hist[1].content) ? 'yes' : 'NO ' + histText));
  out.push('history omits the current question: ' + (!histText.includes('rainy evenings') ? 'yes' : 'NO, duplicated'));
  const before2 = COACH_POSTS.length;
  // At the limit: the rules' answer stands and the reason is said.
  COACH.allowed = false; COACH.reason = 'daily_limit'; COACH.used_today = 30;
  await go('/member/chatbot');
  await page.getByLabel('Your question').fill('Why do I wake up tired after sleeping late?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  out.push('at the limit nothing is sent: ' + (COACH_POSTS.length === before2 ? 'yes' : 'NO, sent anyway'));
  out.push('the limit is explained: ' + (/used today's 30 messages/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-coach.png' });
  // Over the limit with consent on, the switch stays so consent can be withdrawn.
  await go('/member/settings');
  out.push('the coach switch stays at the limit while consent is on: ' + (/Let the coach read my training/.test(await text()) ? 'yes' : 'MISSING'));
  return out.join('\n');
}
