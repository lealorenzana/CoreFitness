/**
 * The coach's proposals (0145) in the member app: a card under the reply that
 * names the routine and every exercise; Apply → Applied with Undo; Undo →
 * Undone; Discard → Discarded; the "Changes from the coach" sheet grouping them;
 * an apply refused by the database showing its own sentence; proposal cards never
 * sent back as history; and the coach's mark on My routines and Training plan.
 *
 * Setup copied from member-coach-check.js.
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
  // One applied a while ago, so the sheet has something in every group.
  const PROPOSALS = [PROP('P0', 'routine.replace', 'Lighter arms day for this week',
    { routine_id: 'r2', name: 'Arms day', exercises: [{ exercise_id: 'e2', target_sets: 2, target_reps: 12, rest_seconds: 60 }] }, 'applied', 600)];
  // What the coach proposes on each successive question.
  const REPLIES = [
    { text: 'Here is a push day to start with.', proposal: PROP('P1', 'routine.create', 'A push day with squats and planks',
      { name: 'Push day', exercises: [
        { exercise_id: 'e1', target_sets: 3, target_reps: 10, rest_seconds: 90 },
        { exercise_id: 'e3', target_sets: 3, target_seconds: 30, rest_seconds: 60 }] }, 'pending', 0) },
    { text: 'Two days a week suits you.', proposal: PROP('P2', 'schedule.set', 'Train Monday and Thursday',
      { days: [{ day_of_week: 1, routine_id: 'r1' }, { day_of_week: 4 }] }, 'pending', 0) },
    { text: 'A goal keeps you honest.', proposal: PROP('P3', 'goal.create', 'Squat your bodyweight by December',
      { title: 'Squat 70 kg', metric: 'weight_kg', target_value: 70, target_date: '2026-12-01' }, 'pending', 0) },
    // A proposal and no words at all: still the coach's reply.
    { text: '', proposal: PROP('P4', 'goal.create', 'Train three times a week',
      { title: 'Three a week', metric: 'workouts_per_week', target_value: 3 }, 'pending', 0) },
  ];
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
      COACH_POSTS.push(JSON.parse(req.postData() || '{}'));
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

  await go('/member/chatbot');
  // ── A routine proposal arrives with the reply ──
  await ask('Can you build me a push day?');
  let c = await cardText('P1');
  out.push('the reply text is shown: ' + (/Here is a push day to start with\./.test(await text()) ? 'yes' : 'MISSING'));
  out.push('the card shows the summary: ' + (/A push day with squats and planks/.test(c) ? 'yes' : 'MISSING'));
  out.push('the card names the routine: ' + (/Push day/.test(c) ? 'yes' : 'MISSING'));
  out.push('the card lists a reps exercise: ' + (c.includes('Barbell Squat — 3 × 10, rest 90 s') ? 'yes' : 'MISSING ' + c));
  out.push('the card lists a timed exercise: ' + (c.includes('Plank — 3 × 30 s, rest 60 s') ? 'yes' : 'MISSING ' + c));
  // Directly under it: the element before the card is that reply's text.
  const above = await card('P1').evaluate((el) => el.previousElementSibling?.textContent ?? '').catch(() => '');
  out.push('the card sits under that reply: ' + (/Here is a push day to start with\./.test(above) ? 'yes' : 'MISSING ' + above));
  await page.screenshot({ path: 'shots/member-coach-card.png' });

  await tap('P1', 'Apply');
  c = await cardText('P1');
  out.push('Apply sends apply_ai_proposal with the id: ' + (RPC_CALLS.some((x) => x.fn === 'apply' && x.p_id === 'P1') ? 'yes' : 'MISSING'));
  out.push('the card then says Applied, with Undo: ' + (/Applied/.test(c) && /Undo/.test(c) && !/Apply\b/.test(c.replace('Applied', '')) ? 'yes' : 'MISSING ' + c));
  await tap('P1', 'Undo');
  c = await cardText('P1');
  out.push('Undo sends undo_ai_proposal: ' + (RPC_CALLS.some((x) => x.fn === 'undo' && x.p_id === 'P1') ? 'yes' : 'MISSING'));
  out.push('the card then says Undone: ' + (/Undone/.test(c) && !/\bUndo\b/.test(c.replace('Undone', '')) ? 'yes' : 'MISSING ' + c));

  // ── A second proposal, discarded; the first card is not sent back as history ──
  await ask('How do I stay motivated on rainy evenings?');
  const post = COACH_POSTS[1];
  const histText = JSON.stringify(post?.history ?? []);
  out.push('history is the coach exchange only: ' + ((post?.history ?? []).length === 2 && /Here is a push day/.test(histText) ? 'yes' : 'NO ' + histText));
  out.push('no proposal card in history: ' + (!/squats and planks|Barbell Squat|Applied|Undone/.test(histText) ? 'yes' : 'NO, a card was sent'));
  c = await cardText('P2');
  out.push('a schedule card names each day: ' + (c.includes('Mon — Leg day') && c.includes('Thu — Any workout') && c.includes('Sun — Rest') ? 'yes' : 'MISSING ' + c));
  await tap('P2', 'Discard');
  c = await cardText('P2');
  out.push('Discard sends discard_ai_proposal: ' + (RPC_CALLS.some((x) => x.fn === 'discard' && x.p_id === 'P2') ? 'yes' : 'MISSING'));
  out.push('the card then says Discarded: ' + (/Discarded/.test(c) && !/\bApply\b/.test(c) ? 'yes' : 'MISSING ' + c));

  // ── An apply the database refuses shows its own sentence ──
  await ask('How do I stay motivated on cold mornings?');
  c = await cardText('P3');
  out.push('a goal card shows its target: ' + (c.includes('Squat 70 kg') && c.includes('Target: 70 kg by Dec 1, 2026') ? 'yes' : 'MISSING ' + c));
  APPLY_REFUSAL = 'You already have a goal with that title.';
  await tap('P3', 'Apply');
  c = await cardText('P3');
  out.push('a refused apply shows the database sentence: ' + (/You already have a goal with that title\./.test(await text()) ? 'yes' : 'MISSING'));
  out.push('a refused apply leaves Apply on the card: ' + (/\bApply\b/.test(c) && !/Applied/.test(c) ? 'yes' : 'NO ' + c));
  APPLY_REFUSAL = null;

  // ── The changes sheet, grouped ──
  await page.getByRole('button', { name: 'Changes from the coach' }).click();
  await page.waitForTimeout(1200);
  const group = async (name) => ((await page.getByRole('dialog').locator(`section[aria-label="${name}"]`).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const waiting = await group('Waiting');
  const applied = await group('Applied');
  const gone = await group('Undone or discarded');
  out.push('the sheet: Waiting holds the refused goal: ' + (/Squat your bodyweight by December/.test(waiting) && !/push day|Monday/.test(waiting) ? 'yes' : 'MISSING ' + waiting));
  out.push('the sheet: Applied holds the earlier change: ' + (/Lighter arms day/.test(applied) && /Replaces: Arms day/.test(applied) && /Undo/.test(applied) ? 'yes' : 'MISSING ' + applied));
  out.push('the sheet: undone and discarded together: ' + (/A push day with squats/.test(gone) && /Train Monday and Thursday/.test(gone) && /Undone/.test(gone) && /Discarded/.test(gone) ? 'yes' : 'MISSING ' + gone));
  await page.screenshot({ path: 'shots/member-coach-changes.png' });
  // Apply from the sheet moves it to Applied.
  await page.getByRole('dialog').locator('[data-proposal="P3"]').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForTimeout(1000);
  out.push('Apply from the sheet moves it to Applied: ' + (RPC_CALLS.some((x) => x.fn === 'apply' && x.p_id === 'P3' && !x.refused)
    && /Squat your bodyweight/.test(await group('Applied')) ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ── Once the sheet reads the server, the server's status wins over a local tap ──
  PROPOSALS.find((p) => p.id === 'P3').status = 'undone';   // undone on another phone
  await page.getByRole('button', { name: 'Changes from the coach' }).click();
  await page.waitForTimeout(1200);
  out.push('the sheet takes the server status over the local tap: ' + (/Squat your bodyweight/.test(await group('Undone or discarded'))
    && !/Squat your bodyweight/.test(await group('Applied')) ? 'yes' : 'NO, the local status stuck'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  out.push('the chat card follows the server too: ' + (/Undone/.test(await cardText('P3')) ? 'yes' : 'NO ' + await cardText('P3')));

  // ── A reply that is only a proposal is the coach's, with its own line ──
  const savedBefore = (DB.assistant_messages ?? []).length;
  await ask('How do I stay motivated after a bad week?');
  const line = "Here's a suggestion — nothing changes until you tap Apply.";
  const above4 = await card('P4').evaluate((el) => el.previousElementSibling?.textContent ?? '').catch(() => '');
  out.push('a proposal with no text shows the coach line above its card: ' + (above4.includes(line) ? 'yes' : 'MISSING ' + above4));
  out.push('no rules fallback for it: ' + (!/I'm not sure|I don't have an answer/i.test(above4) ? 'yes' : 'NO ' + above4));
  const saved4 = (DB.assistant_messages ?? []).slice(savedBefore).find((m) => m.role === 'assistant');
  out.push('it is saved as the coach reply: ' + (saved4 && saved4.source === 'coach' && saved4.body === line ? 'yes' : 'MISSING ' + JSON.stringify(saved4)));

  // ── The coach's mark on the member's own screens ──
  await go('/member/track');
  let t = await text();
  out.push('My routines marks the coach routine: ' + ((t.match(/Built with the coach/g) || []).length === 1 ? 'yes' : 'MISSING'));
  out.push('the mark is on Arms day: ' + (await page.locator('button', { hasText: 'Arms day' }).filter({ hasText: 'Built with the coach' }).count() > 0 ? 'yes' : 'MISSING'));
  await go('/member/gym-plan');
  t = await text();
  out.push('Training plan marks the day the coach set: ' + ((t.match(/Set by the coach/g) || []).length === 1 ? 'yes' : 'MISSING ' + (t.match(/Set by the coach/g) || []).length));

  // The Privacy page says what the coach may change.
  await go('/privacy');
  out.push('Privacy says nothing changes until Apply: ' + (/nothing changes until you tap Apply, and you can undo a change afterwards\./.test(await text()) ? 'yes' : 'MISSING'));
  return out.join('\n');
}
