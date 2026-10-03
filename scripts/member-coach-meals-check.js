/**
 * 0146 in the member app: a meal guide the coach proposes arrives as a card
 * that lists every section and meal idea with the fixed general-guidance line
 * under it; Apply sends apply_ai_proposal; Progress → Meals shows the applied
 * guide (my_meal_guide) as rows with "Built with the coach" and the same line,
 * and with no guide says so and points at the coach. Privacy says who sees it.
 * The Meals tab and its More link are drawn only when the member has a guide or
 * the coach is theirs; a deep link with neither lands on the gated empty state.
 *
 * Setup copied from member-coach-tools-check.js.
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
    // Arms day came from an applied proposal (0145); Leg day is the member's own.
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-1, 9, 0), source: 'member' },
      { id: 'r2', member_id: 'm1', name: 'Arms day', notes: null, position: 1, updated_at: iso(-1, 9, 0), source: 'coach' }],
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
      last_reminded_on: null, routine_id: null, created_at: iso(-5, 9, 0), source: 'member' },
      // The coach set this day (an applied schedule proposal).
      { id: 'g2', member_id: 'm1', day_of_week: (new Date().getDay() + 2) % 7, remind_at: '18:00:00', active: true,
      last_reminded_on: null, routine_id: 'r1', created_at: iso(-5, 9, 0), source: 'coach' }],
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
  // Consent already given, setup done (no `onboarded` reads as done): straight to the coach.
  const COACH = { gym_id: 'gym-1', allowed: true, reason: null, used_today: 3, daily_limit: 30,
    used_month: 40, monthly_limit: 1500, consent: true };

  // ── 0145: the proposals, in memory, as my_ai_proposals() would return them ──
  const PROP = (id, kind, summary, payload, status, minsAgo) => ({ id, gym_id: 'gym-1', member_id: 'm1', kind, payload, summary,
    status, undo: null, created_at: new Date(Date.now() - minsAgo * 60000).toISOString(), decided_at: status === 'pending' ? null : new Date().toISOString() });
  const PROPOSALS = [];
  // 0146: the coach proposes a meal guide — portions by hand, never numbers.
  const SECTIONS = [
    { title: 'Breakfast', items: ['2 eggs for protein, a fist of rice', 'A banana or a cup of papaya'] },
    { title: 'Lunch', items: ['A palm of grilled bangus, two cupped hands of pinakbet'] },
    { title: 'Snacks', items: ['A thumb of peanuts'] },
  ];
  const REPLIES = [
    { text: 'Here are simple meals for your week.', proposal: PROP('P5', 'meals.set', 'Everyday meals for your training days',
      { sections: SECTIONS }, 'pending', 0) },
  ];
  // What my_meal_guide() returns: the applied guide's sections, or null for none.
  let MEAL_GUIDE = null;
  const RPC_CALLS = [];
  let APPLY_REFUSAL = null;
  const decide = (b, from, to) => {
    RPC_CALLS.push(b);
    const p = PROPOSALS.find((x) => x.id === b.p_id && x.status === from);
    if (p) { p.status = to; p.decided_at = new Date().toISOString(); }
    return p;
  };

  const FN = {
    my_ai_proposals: () => PROPOSALS,
    my_meal_guide: () => MEAL_GUIDE,
    apply_ai_proposal: (b) => { const p = decide({ fn: 'apply', ...b }, 'pending', 'applied'); return { kind: p?.kind, routine_id: 'rNew' }; },
    undo_ai_proposal: (b) => { decide({ fn: 'undo', ...b }, 'applied', 'undone'); return null; },
    discard_ai_proposal: (b) => { decide({ fn: 'discard', ...b }, 'pending', 'discarded'); return null; },
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
      const posted = JSON.parse(req.postData() || '{}');
      // The readiness probe (an empty body) is answered as the deployed, configured function does.
      if (!posted.question) return route.fulfill({ status: 400, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"reason":"bad_question"}' });
      COACH_POSTS.push(posted);
      // The function stores the proposal (create_ai_proposal) and streams it beside the text.
      const r = REPLIES[Math.min(COACH_POSTS.length, REPLIES.length) - 1];
      PROPOSALS.push(r.proposal);
      const frame = (o) => `data: ${JSON.stringify(o)}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: (r.text ? frame({ type: 'text', text: r.text }) : '')
          + frame({ type: 'proposal', id: r.proposal.id, kind: r.proposal.kind, summary: r.proposal.summary, payload: r.proposal.payload })
          + frame({ type: 'done' }) });
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
      // A refusal from apply_ai_proposal: PostgREST's shape for a raised exception.
      if (fn === 'apply_ai_proposal' && APPLY_REFUSAL) {
        const b = JSON.parse(req.postData() || '{}'); RPC_CALLS.push({ fn: 'apply', refused: true, ...b });
        return json({ code: 'P0001', message: APPLY_REFUSAL, details: null, hint: null }, 400);
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
  const card = (id) => page.locator(`[data-proposal="${id}"]`).first();
  const cardText = async (id) => ((await card(id).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const ask = async (q) => {
    await page.getByLabel('Your question').fill(q);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(2200);
  };
  const tap = async (id, name) => { await card(id).getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(900); };

  const FIXED = 'This is general guidance, not a diet plan. For anything medical — diabetes, pregnancy, allergies, an eating disorder — see a doctor or a registered nutritionist-dietitian.';

  // ── The card ──
  await go('/member/chatbot');
  // Worded so the app's own rules pass it to the coach (an eating question is answered by the rules).
  await ask('Can you build me a weekly guide?');
  let c = await cardText('P5');
  out.push('the meals card shows the summary: ' + (/Everyday meals for your training days/.test(c) ? 'yes' : 'MISSING ' + c));
  out.push('the meals card is labelled a meal guide: ' + (/Meal guide/i.test(c) ? 'yes' : 'MISSING ' + c));
  out.push('the meals card shows every section title: ' + (['Breakfast', 'Lunch', 'Snacks'].every((s) => c.toLowerCase().includes(s.toLowerCase())) ? 'yes' : 'MISSING ' + c));
  out.push('the meals card shows every item: ' + (SECTIONS.every((s) => s.items.every((i) => c.includes(i))) ? 'yes' : 'MISSING ' + c));
  // Each item sits under its own section.
  const firstSection = ((await card('P5').locator('[data-meal-section]').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  out.push('items sit under their section: ' + (/Breakfast/i.test(firstSection) && firstSection.includes('2 eggs for protein') && !firstSection.includes('bangus') ? 'yes' : 'MISSING ' + firstSection));
  out.push('the meals card shows the fixed line: ' + (c.includes(FIXED) ? 'yes' : 'MISSING ' + c));
  await card('P5').scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: 'shots/member-coach-meals-card.png' });

  await tap('P5', 'Apply');
  c = await cardText('P5');
  out.push('Apply sends apply_ai_proposal with the id: ' + (RPC_CALLS.some((x) => x.fn === 'apply' && x.p_id === 'P5') ? 'yes' : 'MISSING'));
  out.push('the card then says Applied, with Undo: ' + (/Applied/.test(c) && /Undo/.test(c) ? 'yes' : 'MISSING ' + c));
  out.push('the fixed line stays after Apply: ' + (c.includes(FIXED) ? 'yes' : 'MISSING'));

  // ── Progress → Meals with a guide ──
  MEAL_GUIDE = SECTIONS;
  await go('/member/progress?tab=meals');
  let t = await text();
  out.push('Progress has a Meals tab, selected: ' + (await page.getByRole('tab', { name: 'Meals', selected: true }).count() === 1 ? 'yes' : 'MISSING'));
  // The fifth tab overflows a phone's row: opened by link it must be scrolled into view, not cut off.
  const tabBox = await page.getByRole('tab', { name: 'Meals' }).boundingBox();
  out.push('the Meals tab is fully on screen at 393px: ' + (tabBox && tabBox.x >= 0 && tabBox.x + tabBox.width <= 393 ? 'yes' : 'NO ' + JSON.stringify(tabBox)));
  out.push('the Meals tab says Built with the coach: ' + (/Built with the coach/i.test(t) ? 'yes' : 'MISSING'));
  out.push('the Meals tab shows every section and item: ' + (SECTIONS.every((s) => t.toLowerCase().includes(s.title.toLowerCase()) && s.items.every((i) => t.includes(i))) ? 'yes' : 'MISSING ' + t.slice(0, 400)));
  out.push('the Meals tab shows the fixed line: ' + (t.includes(FIXED) ? 'yes' : 'MISSING'));
  out.push('the Meals tab shows no empty state: ' + (!/No meal guide yet/.test(t) ? 'yes' : 'STILL SHOWN'));
  // Rows on the page, not a card per row: four items, four rows, none inside a card of its own.
  const rows = await page.locator('[data-meal-guide] [data-meal-item]').count();
  out.push('items are rows on the page: ' + (rows === 4 ? 'yes' : 'NO, ' + rows + ' rows'));
  // A card is a filled or bordered box: walk from each item up to the guide and count any.
  const carded = await page.locator('[data-meal-guide] [data-meal-item]').evaluateAll((els) => els.filter((e) => {
    for (let n = e; n && !n.hasAttribute('data-meal-guide'); n = n.parentElement) {
      const cs = getComputedStyle(n);
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const boxed = parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0;
      if (filled || boxed) return true;
    }
    return false;
  }).length);
  out.push('no item sits in a card: ' + (carded === 0 ? 'yes' : 'NO, ' + carded + ' carded'));
  await page.screenshot({ path: 'shots/member-meals-tab.png', fullPage: true });

  // ── Progress → Meals with none ──
  MEAL_GUIDE = null;
  await go('/member/progress?tab=meals');
  t = await text();
  out.push('with no guide the tab says so: ' + (/No meal guide yet\. Ask the coach for one\./.test(t) ? 'yes' : 'MISSING'));
  out.push('with no guide nothing is invented: ' + (!/Breakfast|Built with the coach/i.test(t) ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/member-meals-empty.png' });
  // No guide, but the coach is theirs: Meals is offered on Progress's own row of tabs.
  await go('/member/progress');
  out.push('no guide, coach offered: Progress shows a Meals tab: ' + (await page.getByRole('tab', { name: 'Meals' }).count() === 1 ? 'yes' : 'MISSING'));
  await go('/member/progress?tab=meals');
  await page.getByRole('button', { name: 'Ask the coach' }).click();
  await page.waitForTimeout(1200);
  out.push('the empty state links to the assistant: ' + (new URL(page.url()).pathname === '/member/chatbot' ? 'yes' : 'MISSING ' + page.url()));

  // ── With the coach not ready (function answers 404), the empty state promises nothing ──
  // coachReady() is remembered for the page's life, so this is a fresh load.
  await page.route('**/functions/v1/ai-coach', (route) => route.fulfill({ status: 404, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"Function not found"}' }));
  await go('/member/progress?tab=meals');
  t = await text();
  out.push('coach not ready: the tab still says no guide yet: ' + (/No meal guide yet\./.test(t) ? 'yes' : 'MISSING'));
  out.push('coach not ready: no Ask the coach: ' + (await page.getByRole('button', { name: 'Ask the coach' }).count() === 0
    && !/Ask the coach for one|The coach suggests/.test(t) ? 'yes' : 'STILL SHOWN'));
  // Neither a guide nor the coach: Meals is not offered — no tab on Progress, no link in More.
  await go('/member/progress');
  const tabsNow = await page.getByRole('tab').count();
  out.push('no guide, coach not ready: no Meals tab: ' + (tabsNow === 0 ? 'MISSING the Progress tabs'
    : await page.getByRole('tab', { name: 'Meals' }).count() === 0 ? 'yes' : 'STILL SHOWN'));
  await go('/member/home');
  await page.getByRole('button', { name: 'More', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1300);
  // The sheet must be open (its Goals link drawn) for "no Meals link" to mean anything.
  const sheetOpen = await page.getByRole('button', { name: 'Goals', exact: true }).count() === 1;
  out.push('no guide, coach not ready: no Meals in the More sheet: ' + (!sheetOpen ? 'MISSING the More sheet'
    : await page.getByRole('button', { name: 'Meals', exact: true }).count() === 0 ? 'yes' : 'STILL SHOWN'));
  // A guide alone brings it back, with the coach still not ready.
  MEAL_GUIDE = SECTIONS;
  await go('/member/progress');
  out.push('a guide alone shows the Meals tab: ' + (await page.getByRole('tab', { name: 'Meals' }).count() === 1 ? 'yes' : 'MISSING'));
  MEAL_GUIDE = null;
  await page.unroute('**/functions/v1/ai-coach');

  // ── The coach switched off for this member: the same ──
  Object.assign(COACH, { allowed: false, reason: 'switched_off' });
  await go('/member/progress?tab=meals');
  t = await text();
  out.push('coach switched off: no Ask the coach: ' + (await page.getByRole('button', { name: 'Ask the coach' }).count() === 0
    && /No meal guide yet\./.test(t) ? 'yes' : 'STILL SHOWN'));
  await go('/member/progress');
  out.push('coach switched off, no guide: no Meals tab: ' + (await page.getByRole('tab').count() === 0 ? 'MISSING the Progress tabs'
    : await page.getByRole('tab', { name: 'Meals' }).count() === 0 ? 'yes' : 'STILL SHOWN'));
  // At a message limit the coach is still theirs (the chat shows it), so the link stays.
  Object.assign(COACH, { reason: 'daily_limit', used_today: 30 });
  await go('/member/progress?tab=meals');
  out.push('at the daily limit the link stays: ' + (await page.getByRole('button', { name: 'Ask the coach' }).count() === 1 ? 'yes' : 'MISSING'));
  Object.assign(COACH, { allowed: true, reason: null, used_today: 3 });

  // ── A failed read says so, never "no guide" ──
  await page.route('**/rest/v1/rpc/my_meal_guide', (route) => route.fulfill({ status: 500, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 'XX000', message: 'Server error' }) }));
  await go('/member/progress?tab=meals');
  t = await text();
  out.push('a failed read is not shown as no guide: ' + (!/No meal guide yet/.test(t) && /Server error|could not be loaded/i.test(t) ? 'yes' : 'NO ' + t.slice(0, 300)));
  await page.unroute('**/rest/v1/rpc/my_meal_guide');

  // ── The More sheet lists Meals among Progress's links ──
  await go('/member/home');
  MEAL_GUIDE = SECTIONS;
  await page.getByRole('button', { name: 'More', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const moreMeals = page.getByRole('button', { name: 'Meals', exact: true });
  out.push('the More sheet links Meals: ' + (await moreMeals.count() === 1 ? 'yes' : 'MISSING'));
  await moreMeals.click().catch(() => {});
  await page.waitForTimeout(1200);
  out.push('…and it opens Progress → Meals: ' + (/\/member\/progress\?tab=meals$/.test(page.url()) && /Built with the coach/i.test(await text()) ? 'yes' : 'MISSING ' + page.url()));

  // ── Privacy says whose it is ──
  await go('/privacy');
  out.push('Privacy says who sees a meal guide: ' + ((await text()).includes("If you apply a meal guide from the coach, it is yours: coaches you train with see it only if you share your goals with them, and the gym's desk and owner never see it.") ? 'yes' : 'MISSING'));
  return out.join('\n');
}
