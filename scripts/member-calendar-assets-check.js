/** Local fixture checks for mapped calendar assets and month swipes. No live writes. */
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
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(18,0,0,0);
  const nextMonthClass = new Date(now.getFullYear(),now.getMonth()+1,7,10,0,0);
  DB.classes = [tomorrow,nextMonthClass].map((d,i)=>({id:'cal-class-'+i,name:i?'Next month strength':'Tomorrow mobility',scheduled_at:d.toISOString(),duration_minutes:45,capacity:12,level:'all_levels',class_type:'Fitness',trainer_id:null,location:'Studio',is_active:true}));
  DB.achievements = ['gold','silver'].map((tier,i)=>({key:'cal-badge-'+i,title:i?'Steady steps':'First milestone',description:'A real earned achievement from your training.',requirement:'Keep training.',icon:'Star',tier,category:'Training',audience:'member',active:true,sort_order:i,secret:false,rule_kind:'manual'}));
  DB.achievement_unlocks = DB.achievements.map(a=>({user_id:'m1',achievement_key:a.key,unlocked_on:dstr(-1),seen:true}));
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
  let inSquad = false;
  // The streak card's data, as my_streak() returns it (0151). Mutable: Save changes it.
  let STREAK = { target: 3, current: 4, best: 6, days_this_week: 2, needed: 1, days_left: 1,
    week: [true, false, true, false, false, false, false], today_index: 6, frozen: false,
    at_risk: true, out_of_reach: false, next_milestone: 12, nudges: true,
    // 0153: a four-day training plan, and a gym closed on Sundays.
    plan_days: 4, closed_days: [0],
    // The last twelve weeks (0152), oldest first: two before joining, a missed week,
    // a frozen week, four reached, and this week in progress.
    history: ['before', 'before', 'hit', 'miss', 'hit', 'frozen', 'hit', 'hit', 'hit', 'hit', 'hit', 'current'].map((state, i) => ({
      week: new Date(Date.UTC(2026, 6, 13 + i * 7)).toISOString().slice(0, 10),
      days: state === 'hit' ? 3 : state === 'current' ? 2 : state === 'miss' ? 1 : 0, state })) };
  let settled = false;
  const FN = {
    my_streak: () => STREAK,
    settle_my_streak: () => { if (settled) return []; settled = true; return [4]; },
    set_streak_target: (b) => { STREAK = { ...STREAK, target: b.p_target, nudges: b.p_nudges,
      needed: Math.max(0, b.p_target - STREAK.days_this_week) }; return null; },
    settle_squads: () => 0,
    settle_gym_goals: () => 0,
    join_squad: (b) => { if (b.p_code !== 'ABCDEF') throw new Error('bad code'); inSquad = true; return 'sq1'; },
    create_squad: () => { inSquad = true; return 'sq1'; },
    leave_squad: () => { inSquad = false; return null; },
    my_squad: () => !inSquad ? [] : [
      { squad_id: 'sq1', squad_name: 'Iron Barkada', code: 'ABCDEF', weekly_target: 9, squad_days: 4,
        member_id: 'm2', first_name: 'Ana', days_this_week: 3, is_me: false },
      { squad_id: 'sq1', squad_name: 'Iron Barkada', code: 'ABCDEF', weekly_target: 9, squad_days: 4,
        member_id: 'm1', first_name: 'Lea', days_this_week: 1, is_me: true },
      { squad_id: 'sq1', squad_name: 'Iron Barkada', code: 'ABCDEF', weekly_target: 9, squad_days: 4,
        member_id: 'm3', first_name: 'Joy', days_this_week: 0, is_me: false }],
    squad_board: () => [{ squad_name: 'Iron Barkada', members: 3, days: 4, weekly_target: 9, reached: false, is_mine: inSquad },
      { squad_name: 'Morning Crew', members: 4, days: 12, weekly_target: 10, reached: true, is_mine: false }],
    current_gym_goal: () => [{ id: 'g1', title: '1,000 training days in October', metric: 'training_days', target: 1000,
      starts_on: dstr(-5), ends_on: dstr(20), reward_points: 50, reached: false, progress: 412, contributors: 88, mine: 2 }],
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


  const base='http://localhost:5173';const checks=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/member/gym-plan');await page.waitForSelector('#boot',{state:'detached',timeout:15000});
  const calendar=page.locator('[data-art-calendar]');await calendar.waitFor();
  const initialMonth=await calendar.locator('h2').innerText();
  const key=await calendar.locator('[data-calendar-month]').getAttribute('data-calendar-month');
  await calendar.getByRole('button',{name:'Next month',exact:true}).click();
  await page.waitForTimeout(80);
  check(await calendar.locator('[data-calendar-month]').count()===2,'Month change renders outgoing and incoming pages');
  await page.waitForTimeout(400);check(await calendar.locator('h2').innerText()!==initialMonth,'Next month changes the live dates');
  await calendar.getByRole('button',{name:'Previous month',exact:true}).click();await page.waitForTimeout(400);
  check(await calendar.locator('[data-calendar-month]').getAttribute('data-calendar-month')===key,'Previous month restores the correct month');
  const day=calendar.locator('[data-calendar-date]').first();const before=await day.getAttribute('aria-pressed');await day.click();
  check(await day.getAttribute('aria-pressed')!==before,'Choosing a training date toggles the recurring weekday');
  const view=calendar.locator('.art-calendar-viewport');await view.scrollIntoViewIfNeeded();const box=await view.boundingBox();
  await page.mouse.move(box.x+box.width-15,box.y+80);await page.mouse.down();await page.mouse.move(box.x+15,box.y+80,{steps:8});await page.mouse.up();await page.waitForTimeout(400);
  check(await calendar.locator('h2').innerText()!==initialMonth,'Horizontal swipe changes month');
  await page.screenshot({path:'output/playwright/member-calendar-plan.png'});
  await page.evaluate(()=>window.__cfNavigate('/member/attendance-history'));await calendar.waitFor();await page.waitForTimeout(600);
  await calendar.locator('[data-calendar-date]:not(:disabled)').first().click();await page.getByRole('dialog').waitFor();
  check(await page.getByRole('dialog').count()===1,'Attendance date opens the real day details');
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.screenshot({path:'output/playwright/member-calendar-attendance.png'});
  await page.evaluate(()=>window.__cfNavigate('/member/book-class?tab=classes'));await calendar.waitFor();await page.waitForTimeout(700);
  await calendar.getByRole('button',{name:'Next month',exact:true}).click();await page.waitForTimeout(400);
  const nextKey=`${nextMonthClass.getFullYear()}-${String(nextMonthClass.getMonth()+1).padStart(2,'0')}-07`;
  await calendar.locator('[data-calendar-date="'+nextKey+'"]').click();
  await page.getByText('Next month strength',{exact:true}).waitFor();
  check(true,'Class calendar maps a future month date to the matching class');
  await page.screenshot({path:'output/playwright/member-calendar-classes.png'});
  check(errors.length===0,'No uncaught browser errors');
  return checks;
}


