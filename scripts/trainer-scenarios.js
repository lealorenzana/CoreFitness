// The panel's trainer scenarios, driven end to end.
//
// Covers TEST_MATRIX §3.1.3–3.1.4 (half-open overlap), §3.2 (two trainers, one
// slot — the panel's own question) and §3.4's human half (a member who has been
// waiting, and a trainer who goes quiet).
//
// ── Why the booking half runs through the module, not the screen ────────────
//
// `listOpenPtSlots()` is where the answer is computed. Reading it directly
// through the dev server — `await import('/src/services/…')`, which Vite
// transforms on the fly — lets this assert *which* slots exist rather than
// which ones a picker happened to render, and it does not depend on a tab
// switching under automation. The queue half is a real page visit, because
// "the trainer sees that someone has been waiting three days" is a claim about
// a screen.
//
// ── What it does not prove ──────────────────────────────────────────────────
//
// Nothing here reaches Postgres. 0068's triggers are the boundary that stops a
// double booking; this proves the app agrees with them and offers the member
// the truth *before* the write. Both matter and neither substitutes.
//
// Run with `browser_run_code_unsafe` (filename), member dev server on :5173.

async (page) => {
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;

  const now = new Date();
  // Everything happens tomorrow: `computeOpenSlots` refuses to offer a slot in
  // the past, so "today at 10:00" is silently empty for most of a working day
  // and the run would pass for the wrong reason.
  const at = (h, m) => {
    const x = new Date(now); x.setDate(now.getDate() + 1); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const ago = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const DOW = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDay();

  const P = (id, first, last, role) => ({ id, first_name: first, last_name: last,
    email: `${id}@corefitness-test.com`, role, status: 'active', phone: null,
    photo_url: null, created_at: ago(24 * 300) });

  const M1 = P('m1', 'Lea', 'Lorenzana', 'member');
  const M2 = P('m2', 'Miguel', 'Santos', 'member');
  const T1 = P('t1', 'Tere', 'Bautista', 'trainer');
  const T2 = P('t2', 'Marco', 'Dela Cruz', 'trainer');
  const T3 = P('t3', 'Ana', 'Reyes', 'trainer');

  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30,
    is_active: true, description: 'Everything', can_book_classes: true, can_book_pt: true,
    class_bookings_per_week: null, pt_sessions_per_month: null };

  // ── The scenario ──────────────────────────────────────────────────────────
  //  · Both coaches work 06:00–18:00 tomorrow, in 30-minute slots.
  //  · Trainer A has a PT session at 12:00 and teaches a class at 14:00.
  //  · Trainer B has neither.
  //  · The member is already in a 10:00–11:00 class taught by a third coach,
  //    so their own clash is independent of A's and B's diaries.
  const CLASSES = [
    { id: 'c0', name: 'Morning Yoga', trainer_id: 't3', level: 'all_levels', capacity: 12,
      location: 'Studio A', class_type: 'group', scheduled_at: at(10, 0),
      duration_minutes: 60, template_id: null, created_at: ago(24 * 30) },
    { id: 'c1', name: 'Strength Circuit', trainer_id: 't1', level: 'beginner', capacity: 10,
      location: 'Main Floor', class_type: 'group', scheduled_at: at(14, 0),
      duration_minutes: 60, template_id: null, created_at: ago(24 * 30) },
  ];

  const PT_SESSIONS = [
    // Trainer A is taken at 12:00 by somebody else.
    { id: 's1', trainer_id: 't1', member_id: 'm2', starts_at: at(12, 0), duration_minutes: 60,
      status: 'approved', notes: null, requested_at: ago(72), approved_at: ago(70),
      approved_by: 't1', decided_by: 't1', decided_by_role: 'trainer', decided_at: ago(70),
      payment_id: null, created_at: ago(72) },
    // Waiting three days. This is §3.4's scenario, as a person rather than a row.
    { id: 's2', trainer_id: 't1', member_id: 'm1', starts_at: at(16, 0), duration_minutes: 60,
      status: 'pending', notes: 'Would like to work on deadlift form.',
      requested_at: ago(72), approved_at: null, approved_by: null,
      decided_by: null, decided_by_role: null, decided_at: null,
      payment_id: null, created_at: ago(72) },
    // Five hours old — under the overdue line, so the banner must count one.
    { id: 's3', trainer_id: 't1', member_id: 'm2', starts_at: at(17, 0), duration_minutes: 60,
      status: 'pending', notes: null, requested_at: ago(5), approved_at: null,
      approved_by: null, decided_by: null, decided_by_role: null, decided_at: null,
      payment_id: null, created_at: ago(5) },
  ];

  const AVAIL = [
    { id: 'av1', trainer_id: 't1', day_of_week: DOW, start_time: '06:00', end_time: '18:00', slot_minutes: 30 },
    { id: 'av2', trainer_id: 't2', day_of_week: DOW, start_time: '06:00', end_time: '18:00', slot_minutes: 30 },
  ];

  const TABLES = {
    profiles: [M1, M2, T1, T2, T3],
    member_profiles: [M1, M2].map((m) => ({ profile_id: m.id, gym_id: null, address: 'Mamburao',
      emergency_contact_name: null, emergency_contact_phone: null,
      emergency_contact_relationship: null, qr_code: `QR-${m.id}`, experience_level: 'beginner',
      date_of_birth: '1998-04-12', gender: 'female', interests: [],
      onboarding_completed_at: ago(24 * 80), created_at: ago(24 * 90), profiles: m })),
    trainer_profiles: [T1, T2, T3].map((t) => ({ profile_id: t.id,
      specialization: 'Strength & conditioning', bio: 'Coaching in Mamburao.',
      availability: null, certifications: ['NASM-CPT'], profiles: t })),
    public_trainers: [T1, T2, T3].map((t) => ({ id: t.id, first_name: t.first_name,
      last_name: t.last_name, photo_url: null, specialization: 'Strength & conditioning',
      bio: 'Coaching in Mamburao.', certifications: ['NASM-CPT'] })),
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active',
      start_date: null, expiry_date: null, never_expires: true, frozen_at: null,
      created_at: ago(24 * 10), membership_plans: PREMIUM }],
    classes: CLASSES,
    class_availability: CLASSES.map((c) => ({ class_id: c.id, capacity: c.capacity, booked_count: 2 })),
    bookings: [{ id: 'b0', member_id: 'm1', class_id: 'c0', status: 'approved',
      requested_at: ago(48), approved_at: ago(47), rejected_at: null, approved_by: 't3',
      decided_by: 't3', decided_by_role: 'trainer', decided_at: ago(47), classes: CLASSES[0] }],
    pt_sessions: PT_SESSIONS,
    // The view the trainer's diary is read from. Only *taken* time appears here.
    trainer_busy_slots: [
      { trainer_id: 't1', starts_at: at(12, 0), duration_minutes: 60 },
    ],
    trainer_availability: AVAIL,
    notifications: [], events: [], event_registrations: [], attendance: [],
    workout_resources: [], point_ledger: [], rewards: [], reward_redemptions: [],
    challenges: [], challenge_participants: [], workout_logs: [], workout_sets: [],
    body_measurements: [], fitness_goals: [], achievements: [], achievement_unlocks: [],
    features: [], plan_features: [], payments: [], notification_prefs: [],
    member_share_prefs: [], push_subscriptions: [], assistant_chats: [], gym_plans: [],
    trainer_ratings: [], trainer_feedback: [], public_trainer_credentials: [],
    trainer_rating_summary: [], point_rules: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: null,
      email: null, opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, activity_options: [], updated_at: ago(2), updated_by: null }],
  };

  const ALL_FEATURES = ['workout_tracker', 'plan_builder', 'ai_model', 'points_earn',
    'points_redeem', 'challenges'].map((key) => ({ key, label: key, description: key, enabled: true }));

  const RPC = {
    // The member is in Morning Yoga, 10:00–11:00 tomorrow.
    member_commitments: [{ source: 'class', ref_id: 'b0', starts_at: at(10, 0),
      ends_at: at(11, 0), label: 'Morning Yoga' }],
    my_features: ALL_FEATURES,
    plan_allows: true,
    member_points_balance: 0,
    member_progression: [{ level: 1, points: 0, next_level_points: 100 }],
    my_trainer_ratings: [],
    sweep_stale_requests: 0,
    sync_my_achievements: 0,
  };

  // Who is signed in is a variable, because this run switches roles halfway.
  // `addInitScript` serialises its argument at registration, so the route
  // handler cannot read it back out — it reads `SESSION` instead, and both are
  // set together. A mismatch here signs the trainer pages in as the member and
  // the run passes on the wrong data.
  let SESSION = null;
  const plant = async (who) => {
    SESSION = {
      access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: who.id, role: 'authenticated', exp })}.sig`,
      refresh_token: 'r', token_type: 'bearer', expires_at: exp,
      user: { id: who.id, aud: 'authenticated', role: 'authenticated', email: who.email,
              app_metadata: {}, user_metadata: {} },
    };
    await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, SESSION]);
  };

  await plant(M1);

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const afterHost = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = afterHost.indexOf('?');
    const pathname = qi === -1 ? afterHost : afterHost.slice(0, qi);
    const query = qi === -1 ? '' : afterHost.slice(qi + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), '']
        : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*' } });

    if (pathname.startsWith('/auth/v1/')) {
      if (pathname.includes('/user')) return json(SESSION.user);
      return json({ ...SESSION });
    }
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
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
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      let rows = TABLES[table] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(wantsObject ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(wantsObject ? (rows[0] ?? null) : rows);
    }
    if (pathname.startsWith('/storage/')) return json({});
    if (pathname.startsWith('/functions/')) return json({});
    return json([]);
  });

  await page.setViewportSize({ width: 402, height: 880 });

  const results = [];
  const check = (id, name, expected, got) =>
    results.push({ id, name, expected, got, pass: expected === got });

  // ════════════════════════════════════════════════════════════════════════
  //  Part 1 — whose diary is whose (the panel's scenario)
  // ════════════════════════════════════════════════════════════════════════
  await page.goto('http://localhost:5173/member/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const slots = await page.evaluate(async () => {
    const svc = await import('/src/services/bookingService.ts');
    const pick = (list) => list.map((s) => ({
      t: new Date(s.startsAt).toTimeString().slice(0, 5),
      conflict: s.conflict,
    }));
    return {
      a: pick(await svc.listOpenPtSlots('t1', 2, 'm1')),
      b: pick(await svc.listOpenPtSlots('t2', 2, 'm1')),
    };
  });

  const has = (list, t) => list.some((s) => s.t === t);
  // A clean slot's conflict IS null, so `?? '(no such slot)'` would report an
  // offered slot and a missing one identically — the first draft did exactly
  // that and failed 3.1.3 on its own helper rather than on the app.
  const conflictAt = (list, t) => {
    const s = list.find((x) => x.t === t);
    return s ? s.conflict : '(no such slot)';
  };

  check('3.2.1', "Trainer A's 12:00 is gone — someone else has it",
    false, has(slots.a, '12:00'));
  check('3.2.2', "Trainer B's 12:00 is still open — A being full says nothing about B",
    true, has(slots.b, '12:00'));
  check('3.2.3', 'Trainer A teaches at 14:00, so A has no 14:00 PT slot',
    false, has(slots.a, '14:00'));
  check('3.2.4', "Trainer B's 14:00 is unaffected by A's class",
    true, has(slots.b, '14:00'));
  check('3.2.5', "A's own class also blocks the half-hour inside it (14:30)",
    false, has(slots.a, '14:30'));

  // The member's own clash MARKS a slot; it must never remove it.
  check('3.1.4', 'A slot at 10:30, inside the member\'s 10:00–11:00 class, is offered and flagged',
    'You are already booked for Morning Yoga at 10:00 AM', conflictAt(slots.b, '10:30'));
  check('3.1.3', 'The 11:00 slot is clean — the end instant is free, not a clash',
    null, conflictAt(slots.b, '11:00'));
  check('3.1.3b', 'That 11:00 slot is actually offered', true, has(slots.b, '11:00'));

  // ════════════════════════════════════════════════════════════════════════
  //  Part 2 — nobody waits in silence
  // ════════════════════════════════════════════════════════════════════════
  await plant(T1);
  await page.goto('http://localhost:5173/trainer/bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5500);
  const queue = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  check('3.4.a', 'The three-day wait is stated in words, not left to be worked out',
    true, queue.includes('waiting 3 days'));
  check('3.4.b', 'The five-hour-old request shows hours, not days',
    true, queue.includes('waiting 5h'));
  check('3.4.c', 'The banner counts only the one that is actually overdue',
    true, queue.includes('One member has been waiting more than a day'));
  check('3.4.d', 'Both pending requests are still actionable, not just the old one',
    // Not /^Accept$/. The button is `<Check/> Accept`, so its textContent is
    // ' Accept' — an anchored regex matches textContent unnormalised and finds
    // nothing, which reads as 'the buttons are missing' rather than 'the test
    // is wrong'.
    2, await page.locator('button', { hasText: /Accept/ }).count());
  await page.screenshot({ path: 'shots/19-trainer-overdue-queue.png' });

  // ════════════════════════════════════════════════════════════════════════
  //  Part 3 — the coach goes quiet: does the member still see their request?
  // ════════════════════════════════════════════════════════════════════════
  // A trainer who stops working keeps their pending requests. If the member's
  // own history rendered off the trainer's availability, the request would
  // vanish from under them — which is the worst version of "still pending".
  TABLES.trainer_availability = [];
  await plant(M1);
  await page.goto('http://localhost:5173/member/booking-history', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5500);
  const history = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  check('3.4.e', "The member's pending request survives the trainer clearing their hours",
    true, /Tere/.test(history));
  check('3.4.f', 'It is still shown as pending rather than quietly dropped',
    true, /[Pp]ending|[Ww]aiting/.test(history));
  await page.screenshot({ path: 'shots/20-member-pending-survives.png' });

  const failures = results.filter((r) => !r.pass);
  return {
    results,
    slotsA: slots.a.map((s) => s.t),
    slotsB: slots.b.map((s) => s.t),
    summary: failures.length ? `${failures.length} FAILED` : `all ${results.length} pass`,
    failures,
  };
}
