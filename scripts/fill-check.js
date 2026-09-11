async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // Same fixtures as admin-shots.js; only the interactions differ. Kept as a
  // second file rather than parameterised, because the first run is the "load
  // the page" pass and this is the "click something" pass, and mixing them
  // makes a failure ambiguous about which half broke.
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', outStr = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) outStr += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return outStr;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`;
  const session = {
    access_token: token, refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test',
            app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const A = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle',
    last_name: 'Facalarin', email: 'admin@corefitness.test', phone: null, photo_url: null,
    created_at: iso(-400, 9, 0) };
  const MEMBERS = [
    { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test',
      role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) },
    { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness.test',
      role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-80, 9, 0) },
    { id: 'm3', first_name: 'Ana', last_name: 'Reyes', email: 'ana@corefitness.test',
      role: 'member', status: 'suspended', phone: null, photo_url: null, created_at: iso(-60, 9, 0) },
  ];
  const TRAINERS = [
    { id: 't1', first_name: 'Tere', last_name: 'Bautista', email: 'tere@corefitness.test',
      role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) },
    { id: 't2', first_name: 'Marco', last_name: 'Dela Cruz', email: 'marco@corefitness.test',
      role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-200, 9, 0) },
  ];
  const PLANS = [
    { id: 'p1', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true,
      description: 'Gym access', can_book_classes: true, can_book_pt: false,
      class_bookings_per_week: 2, pt_sessions_per_month: null },
    { id: 'p3', name: 'Premium', tier: 'premium', price: 1200, duration_days: 30, is_active: true,
      description: 'Everything', can_book_classes: true, can_book_pt: true,
      class_bookings_per_week: null, pt_sessions_per_month: 4 },
  ];
  const CLASSES = [
    { id: 'c1', name: 'Morning Yoga', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Studio A', class_type: 'group', scheduled_at: iso(1, 6, 0),
      duration_minutes: 60, template_id: 'ct1', created_at: iso(-30, 9, 0) },
    { id: 'c2', name: 'Strength Basics', trainer_id: 't2', level: 'beginner', capacity: 8,
      location: 'Main Floor', class_type: 'group', scheduled_at: iso(2, 6, 30),
      duration_minutes: 45, template_id: 'ct2', created_at: iso(-30, 9, 0) },
    { id: 'c3', name: 'Evening HIIT', trainer_id: 't1', level: 'intermediate', capacity: 20,
      location: 'Studio B', class_type: 'group', scheduled_at: iso(-4, 18, 0),
      duration_minutes: 90, template_id: 'ct3', created_at: iso(-30, 9, 0) },
  ];
  const BOOKINGS = [
    { id: 'b2', member_id: 'm2', class_id: 'c2', status: 'approved', requested_at: iso(-2, 9, 0),
      approved_at: iso(-2, 10, 0), rejected_at: null, approved_by: 't2',
      decided_by: 't2', decided_by_role: 'trainer', decided_at: iso(-2, 10, 0), classes: CLASSES[1] },
    { id: 'b3', member_id: 'm1', class_id: 'c3', status: 'rejected', requested_at: iso(-6, 9, 0),
      approved_at: null, rejected_at: iso(-4, 9, 0), approved_by: null,
      decided_by: null, decided_by_role: 'system', decided_at: iso(-4, 9, 0), classes: CLASSES[2] },
  ];
  const MEMBERSHIPS = MEMBERS.map((m, i) => ({
    id: `ms${i + 1}`, member_id: m.id, plan_id: PLANS[i % 2].id, status: 'active',
    start_date: dstr(-30), expiry_date: dstr(5 + i), never_expires: false, frozen_at: null,
    created_at: iso(-30, 9, 0), membership_plans: PLANS[i % 2],
  }));

  const TABLES = {
    profiles: [A, ...MEMBERS, ...TRAINERS],
    member_profiles: MEMBERS.map((m) => ({
      profile_id: m.id, gym_id: null, address: 'Mamburao, Occidental Mindoro',
      emergency_contact_name: 'Maria Lorenzana', emergency_contact_phone: '+639170000000',
      emergency_contact_relationship: 'Mother', qr_code: `QR-${m.id}`,
      experience_level: 'beginner', date_of_birth: '1998-04-12', gender: 'female',
      onboarding_completed_at: iso(-100, 9, 0), created_at: iso(-120, 9, 0), profiles: m,
    })),
    trainer_profiles: TRAINERS.map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning',
      bio: 'Ten years coaching.', availability: null, certifications: ['NASM-CPT'], profiles: t,
    })),
    membership_plans: PLANS,
    memberships: MEMBERSHIPS,
    payments: [{ id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1200, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0001', notes: null,
      recorded_by: 'u1', paid_on: dstr(0), created_at: iso(0, 9, 0) }],
    classes: CLASSES, class_templates: [], bookings: BOOKINGS, pt_sessions: [],
    attendance: [{ id: 'a1', member_id: 'm1', gym_id: null, check_in_time: iso(0, 6, 12),
      method: 'qr', recorded_by: 'u1' }],
    events: [], event_registrations: [], notifications: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: null, email: null, opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: 'ADMIN PANEL', max_freeze_days_per_year: 60,
      max_freeze_days_at_once: 30, updated_at: iso(0, 9, 0), updated_by: 'u1' }],
    trainer_availability: [],
    account_status_events: [
      { id: 'ase1', profile_id: 'm1', status: 'active', previous_status: 'suspended',
        reason: 'Dues settled on 2 September.', recorded_by: 'u1', created_at: iso(-5, 14, 0) },
      { id: 'ase2', profile_id: 'm1', status: 'suspended', previous_status: 'active',
        reason: 'Unpaid dues since August. Spoke to them on the 3rd.',
        recorded_by: 'u1', created_at: iso(-20, 11, 0) },
    ],
    membership_events: [], refund_rules: [],
    point_ledger: [
      { id: 'pl1', member_id: 'm1', points: 10, rule_key: 'checkin', source_table: 'attendance',
        source_id: 'a1', created_at: iso(0, 6, 12) },
      { id: 'pl2', member_id: 'm1', points: 15, rule_key: 'workout_logged',
        source_table: 'workout_logs', source_id: 'w1', created_at: iso(-1, 19, 0) },
      { id: 'pl3', member_id: 'm1', points: 25, rule_key: 'class_attended',
        source_table: 'bookings', source_id: 'b2', created_at: iso(-3, 7, 0) },
    ],
    rewards: [], reward_redemptions: [], trainer_ratings: [], trainer_credentials: [],
    trainer_feedback: [], workout_resources: [], achievements: [], achievement_unlocks: [],
    challenges: [], challenge_participants: [], activity_log: [], features: [],
    plan_features: [], point_rules: [], goal_templates: [], body_measurements: [],
    fitness_goals: [], workout_logs: [], workout_sets: [], pending_registrations: [],
    exercises: [],
  };

  const RPC = {
    member_points_balance: 340, sweep_stale_requests: 0, generate_class_instances: 0,
    plan_member_counts: [], member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    trainer_schedule_conflicts: [], admin_trainer_evaluations: [], refund_quote: [],
    frozen_days_last_year: 38, freezes_this_month: 1, set_account_status: null,
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const raw = req.url();
    const afterHost = raw.replace(/^https?:\/\/[^/]+/, '');
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
      if (pathname.includes('/user')) return json(session.user);
      return json({ ...session });
    }
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
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


  // ── More of everything, so every page has more than one screen of it ─────
  const FIRST = ['Maria','Juan','Ana','Jose','Kristine','Mark','Angelica','Paolo','Jasmine','Carlo','Rhea','Dennis','Mae'];
  const LAST  = ['Santos','Reyes','Cruz','Bautista','Garcia','Mendoza','Torres','Ramos','Flores','Castillo','Andrada','Manalo','Gonzales'];

  // Thirteen trainers, like the live roster.
  for (let i = 0; i < 11; i++) {
    const t = { id: `tx${i}`, first_name: FIRST[i], last_name: LAST[(i * 5) % 13], email: `t${i}@corefitness.test`,
      role: 'trainer', status: i === 4 ? 'suspended' : 'active', phone: null, photo_url: null, created_at: iso(-100 - i, 9, 0) };
    TABLES.profiles.push(t);
    TABLES.trainer_profiles.push({ profile_id: t.id, specialization: ['Yoga','Strength','Boxing','HIIT','Pilates'][i % 5],
      bio: null, availability: i % 3 === 0 ? 'Monday, Wednesday, Friday' : null, certifications: [], profiles: t });
  }

  // Forty members, each with a payment or two — five pages of payment tiles.
  for (let i = 0; i < 40; i++) {
    const id = `mx${i}`;
    const prof = { id, first_name: FIRST[i % 13], last_name: LAST[(i * 3) % 13],
      email: `m${i}@corefitness.test`, role: 'member', status: 'active', phone: null,
      photo_url: null, created_at: iso(-i * 3, 9, 0) };
    TABLES.profiles.push(prof);
    TABLES.member_profiles.push({ profile_id: id, gym_id: null, address: 'Mamburao', emergency_contact_name: null,
      emergency_contact_phone: null, emergency_contact_relationship: null, qr_code: `QR-${id}`,
      experience_level: 'beginner', date_of_birth: '1998-04-12', gender: 'female',
      onboarding_completed_at: iso(-50, 9, 0), created_at: iso(-60, 9, 0), profiles: prof });
    const ms = { id: `msx${i}`, member_id: id, plan_id: 'p3', status: 'active', start_date: dstr(-10),
      expiry_date: dstr(20), never_expires: false, frozen_at: null, created_at: iso(-10, 9, 0), membership_plans: PLANS[1] };
    TABLES.memberships.push(ms);
    for (let k = 0; k < 1 + (i % 2); k++) {
      TABLES.payments.push({ id: `px${i}-${k}`, member_id: id, membership_id: ms.id, amount: 1500,
        method: 'cash', status: i % 9 === 0 && k === 0 ? 'pending' : 'completed', due_date: null,
        invoice_number: `INV-2026-${1000 + i * 2 + k}`, notes: null, recorded_by: 'u1',
        paid_on: dstr(-(i * 4 + k * 30)), created_at: iso(-(i * 4 + k * 30), 9, 0),
        member_profiles: { profiles: { first_name: prof.first_name, last_name: prof.last_name } } });
    }
  }

  // A week of timetable: every band, a clash, a retired class.
  const T = (id, name, trainer, dow, time, dur, level, loc, active = true) => ({ id, name, trainer_id: trainer,
    level, capacity: 12 + (dow * 3) % 10, location: loc, day_of_week: dow, start_time: `${time}:00`,
    duration_minutes: dur, active, created_at: iso(-40, 9, 0) });
  TABLES.class_templates = [
    T('ct1', 'Sunrise Yoga', 't1', 1, '06:00', 60, 'all_levels', 'Studio A'),
    T('ct2', 'Senior Strength & Balance', 't2', 3, '08:00', 45, 'beginner', 'Main Floor'),
    T('ct3', 'test123', 'tx0', 3, '06:00', 90, 'all_levels', null),
    T('ct4', 'Saturday Functional', 'tx1', 6, '07:30', 60, 'intermediate', 'Main Floor'),
    T('ct5', 'Deadlift Clinic', 'tx2', 6, '09:00', 60, 'advanced', 'Platform'),
    T('ct6', 'Lunch Break HIIT', 'tx3', 4, '12:15', 45, 'intermediate', 'Studio B'),
    T('ct7', 'test2', 'tx3', 4, '13:00', 30, 'all_levels', null),
    T('ct8', 'Bar Skills Workshop', 'tx5', 0, '16:00', 60, 'beginner', 'Rig'),
    T('ct9', 'Barbell Basics', 't2', 2, '17:30', 60, 'beginner', 'Main Floor'),
    T('ct10', 'Mat Pilates', 'tx6', 2, '18:30', 60, 'all_levels', 'Studio A'),
    T('ct11', 'Zumba Night', 'tx7', 5, '18:00', 60, 'all_levels', 'Studio B'),
    T('ct12', 'Boxing Pad Work', 'tx8', 3, '19:00', 60, 'intermediate', 'Ring'),
    T('ct13', 'Late Mobility', 't1', 1, '22:00', 45, 'all_levels', 'Studio A'),
    // Same trainer, overlapping times: the clash the banner lists.
    T('ct14', 'Evening Circuit', 'tx8', 3, '19:30', 45, 'all_levels', 'Main Floor'),
    T('ct15', 'Old Spin Class', 'tx9', 4, '18:00', 45, 'all_levels', 'Studio C', false),
  ];

  // Credentials: waiting, verified, rejected, one PDF, one with no file behind it.
  const CRED = (id, trainer, title, path, mime, status, day, note = null) => ({ id, trainer_id: trainer, title,
    file_path: path, mime_type: mime, size_bytes: 180000 + id.length * 9000, status, uploaded_at: iso(-day, 10, 0),
    reviewed_at: status === 'pending' ? null : iso(-day + 1, 10, 0), review_note: note,
    trainer_profiles: { profiles: (() => { const p = TABLES.profiles.find((x) => x.id === trainer);
      return { first_name: p.first_name, last_name: p.last_name, photo_url: null }; })() } });
  TABLES.trainer_credentials = [
    CRED('cr1', 't1', 'NASM Certified Personal Trainer', 'cred/t1/nasm.png', 'image/png', 'pending', 1),
    CRED('cr2', 't2', 'First Aid & CPR', 'cred/t2/cpr.jpg', 'image/jpeg', 'pending', 2),
    CRED('cr3', 'tx0', 'RYT-200 Yoga Alliance', 'cred/tx0/ryt.pdf', 'application/pdf', 'pending', 3),
    CRED('cr4', 'tx1', 'Kettlebell Level 1', 'seed-demo/tx1/1.pdf', 'application/pdf', 'pending', 4),
    CRED('cr5', 'tx2', 'Powerlifting Coach', 'cred/tx2/pl.png', 'image/png', 'verified', 20),
    CRED('cr6', 'tx3', 'HIIT Specialist', 'cred/tx3/hiit.png', 'image/png', 'verified', 25),
    CRED('cr7', 'tx5', 'Gymnastics Rings', 'cred/tx5/rings.jpg', 'image/jpeg', 'rejected', 30,
      'The photo is blurred — the licence number cannot be read.'),
    CRED('cr8', 'tx6', 'Pilates Mat Instructor', 'cred/tx6/pilates.png', 'image/png', 'verified', 40),
  ];

  // Ninety-five log entries over six days.
  const VERBS = [['booking.requested', 'requested a spot in Sunrise Yoga'], ['attendance.recorded', 'checked in by QR'],
    ['payment.recorded', 'paid ₱1,500 in cash'], ['booking.rejected', "booking for test2 was rejected"],
    ['attendance.undone', 'check-in was undone']];
  const FEED = Array.from({ length: 95 }, (_, i) => {
    const [action, what] = VERBS[i % VERBS.length];
    return { id: 1000 - i, occurred_at: new Date(Date.now() - i * 83 * 60 * 1000).toISOString(), action,
      subject_type: action.split('.')[0], subject_id: null,
      summary: `${FIRST[i % 13]} ${LAST[(i * 3) % 13]} ${what}`, detail: null, reconstructed: false,
      actor_id: 'u1', actor_role: 'admin', actor_name: 'Admin User', actor_photo_url: null, member_id: null };
  });

  // ── Routes that need more than the generic handler ───────────────────────
  // Registered after it, so Playwright tries these first.
  const signCalls = [];
  await page.route(`**://${REF}.supabase.co/rest/v1/activity_feed**`, async (route) => {
    // No URL global in the runner's sandbox, so the two numbers by hand.
    const raw = route.request().url();
    const offset = Number((/[?&]offset=(\d+)/.exec(raw) || [])[1] || 0);
    const limit = Number((/[?&]limit=(\d+)/.exec(raw) || [])[1] || 50);
    const rows = FEED.slice(offset, offset + limit);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows),
      // Exposed, as Supabase does: without it the browser hides the header
      // from supabase-js, which then reads the count as unknown.
      headers: { 'Content-Range': `${offset}-${offset + rows.length - 1}/${FEED.length}`,
        'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
  });

  // Signing: one path has no object behind it, as the demo seed's rows do.
  await page.route(`**://${REF}.supabase.co/storage/v1/object/sign/**`, async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const paths = body.paths || [];
      const out = paths.map((p) => p.startsWith('seed-demo/')
        ? { path: p, signedURL: null, error: 'Either the object does not exist or you do not have access to it' }
        : { path: p, signedURL: `/object/sign/credentials/${p}?token=t`, error: null });
      signCalls.push(paths.length);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out), headers: cors });
    }
    const path = (req.url().split('?')[0].split('/object/sign/credentials/')[1]) || '';
    if (path.endsWith('.pdf')) {
      const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 36 Tf 150 600 Td (CERTIFICATE) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf, headers: cors });
    }
    const name = decodeURIComponent(path.split('/').pop() || '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
      <rect width="800" height="560" fill="#fbf7ee"/><rect x="24" y="24" width="752" height="512" fill="none" stroke="#b8923a" stroke-width="10"/>
      <text x="400" y="170" font-family="Georgia" font-size="54" text-anchor="middle" fill="#3b2f1a">CERTIFICATE</text>
      <text x="400" y="235" font-family="Georgia" font-size="24" text-anchor="middle" fill="#6b5a3a">of completion</text>
      <text x="400" y="330" font-family="Georgia" font-size="34" text-anchor="middle" fill="#1f2937">${name}</text>
      <circle cx="660" cy="440" r="48" fill="#b8923a"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg, headers: cors });
  });

  const out = {};
  const settle = async (ms = 3000) => page.waitForTimeout(ms);

  // Shared measurements: how far the page's last thing sits from the window's
  // bottom edge, and whether <main> itself overflows (it must not).
  const frame = () => page.evaluate(() => {
    const main = document.querySelector('main');
    return { mainOverflowPx: main ? main.scrollHeight - main.clientHeight : null };
  });
  const tiles = (selector) => page.evaluate((sel) => {
    const t = [...document.querySelectorAll(sel)];
    if (!t.length) return { error: `no tiles for ${sel}` };
    const grid = t[0].parentElement;
    const area = grid.parentElement;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const hs = t.map((x) => x.getBoundingClientRect().height).sort((a, b) => a - b);
    const tile = hs[Math.floor(hs.length / 2)];
    const leftover = area.getBoundingClientRect().bottom - grid.getBoundingClientRect().bottom;
    const pager = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '1' && b.closest('div'));
    return { tiles: t.length, cols, rows: Math.ceil(t.length / cols), fullRows: t.length % cols === 0,
      medianTile: Math.round(tile), leftoverBelowGridPx: Math.round(leftover), fillsArea: leftover < tile,
      areaScrolls: area.scrollHeight > area.clientHeight + 1,
      pagerBottomFromWindow: pager ? Math.round(window.innerHeight - pager.getBoundingClientRect().bottom) : null };
  }, selector);

  for (const h of [909, 720]) {
    await page.setViewportSize({ width: 1918, height: h });
    const at = out[h] = {};

    await page.goto('http://localhost:5174/trainers', { waitUntil: 'domcontentloaded' });
    await settle();
    at.trainers = { ...(await tiles('[title^="Open "][title$="profile"]')), ...(await frame()) };
    if (h === 909) await page.screenshot({ path: 'shots/30-trainers-fill.png' });

    await page.goto('http://localhost:5174/payments', { waitUntil: 'domcontentloaded' });
    await settle();
    at.payments = { ...(await tiles('[title^="Open "][title$="payments"]')), ...(await frame()) };
    if (h === 909) await page.screenshot({ path: 'shots/31-payments-fill.png' });

    await page.goto('http://localhost:5174/revenue', { waitUntil: 'domcontentloaded' });
    await settle();
    at.revenue = { ...(await page.evaluate(() => {
      const heads = [...document.querySelectorAll('h3')];
      const box = (t) => { const h = heads.find((x) => x.textContent.trim() === t);
        const card = h && h.closest('[style*="border-radius"]'); return card ? card.getBoundingClientRect() : null; };
      const monthly = box('Monthly breakdown'), latest = box('Latest payments'), plan = box('Revenue by plan');
      const latestRows = latest ? [...document.querySelectorAll('button')].filter((b) => /INV-2026/.test(b.textContent)).length : 0;
      return { planChartPx: plan && Math.round(plan.height), monthlyBottomFromWindow: monthly && Math.round(window.innerHeight - monthly.bottom),
        latestBottomFromWindow: latest && Math.round(window.innerHeight - latest.bottom), latestRows };
    })), ...(await frame()) };
    if (h === 909) await page.screenshot({ path: 'shots/32-revenue-fill.png' });

    await page.goto('http://localhost:5174/activity', { waitUntil: 'domcontentloaded' });
    await settle(3500);
    const activity = async () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-activity-row]')];
      const list = rows[0] && rows[0].closest('.overflow-y-auto');
      const card = list && list.parentElement;
      const summary = [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /of 95 entries$/.test(t)) || null;
      // Only the log card's own pager — the header's bell badge is a number too.
      const pagerBtns = card ? [...card.querySelectorAll('button')].filter((b) => /^\d+$/.test(b.textContent.trim())) : [];
      const last = pagerBtns[pagerBtns.length - 1];
      return { rowsOnPage: rows.length, summary, pages: last ? Number(last.textContent.trim()) : null,
        listScrolls: list ? list.scrollHeight > list.clientHeight + 1 : null,
        listOverflowPx: list ? list.scrollHeight - list.clientHeight : null,
        pagerOnScreen: last ? last.getBoundingClientRect().bottom <= window.innerHeight : false,
        pagerBottomFromWindow: last ? Math.round(window.innerHeight - last.getBoundingClientRect().bottom) : null };
    });
    at.activity = { ...(await activity()), ...(await frame()) };
    if (h === 909) {
      await page.screenshot({ path: 'shots/33-activity-pager.png' });
      // Page 2 must continue where page 1 stopped, not repeat it.
      const first1 = await page.locator('[data-activity-row]').first().innerText();
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '2');
        if (b) b.click();
        return !!b;
      });
      await settle(1500);
      const first2 = await page.locator('[data-activity-row]').first().innerText();
      at.activity.page2 = clicked ? { ...(await activity()), differsFromPage1: first1 !== first2 } : 'no page-2 button';
    }

    await page.goto('http://localhost:5174/credentials', { waitUntil: 'domcontentloaded' });
    await settle(3500);
    at.credentials = { ...(await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[title^="View "]')];
      const imgs = [...document.querySelectorAll('img[alt]')].filter((i) => cards.some((c) => c.contains(i)));
      return { cards: cards.length, imagesShown: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        imagesTotal: imgs.length, pdfFrames: document.querySelectorAll('iframe[title$="(PDF)"]').length,
        missingNotice: document.body.innerText.includes('File not in storage'),
        clickToOpenLeft: document.body.innerText.includes('click to open') };
    })), ...(await frame()) };
    if (h === 909) {
      await page.screenshot({ path: 'shots/34-credentials-grid.png' });
      await page.locator('[title^="View NASM"]').first().click();
      await settle(1200);
      await page.screenshot({ path: 'shots/35-credentials-viewer.png' });
      await page.keyboard.press('ArrowRight');
      await settle(800);
      at.credentials.viewerAfterArrow = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') || null);
      await page.keyboard.press('Escape');
      await settle(500);
      at.credentials.viewerClosed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
      // Reject from the card opens the reason box; Reject stays disabled empty.
      // Exact name: the filter chip "Rejected 1" also contains "Reject".
      await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
      await settle(800);
      at.credentials.rejectNeedsReason = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Reject');
        return { reasonBox: !!(d && d.querySelector('textarea')), rejectDisabled: b ? b.disabled : null };
      });
      await page.screenshot({ path: 'shots/36-credentials-reject.png' });
      await page.keyboard.press('Escape');
    }

    await page.goto('http://localhost:5174/schedule', { waitUntil: 'domcontentloaded' });
    await settle(3500);
    at.schedule = { ...(await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-tip^="Edit "][role="button"]')];
      const heights = cards.map((c) => c.getBoundingClientRect().height);
      const text = document.body.innerText;
      const board = cards[0] && cards[0].closest('.overflow-auto');
      return { classCards: cards.length, smallestCardPx: heights.length ? Math.round(Math.min(...heights)) : null,
        clashChips: [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Clash').length,
        retiredChips: [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Retired').length,
        bands: ['Morning', 'Afternoon', 'Evening'].every((b) => text.includes(b)),
        freeCells: [...document.querySelectorAll('div')].filter((d) => d.childElementCount === 0 && d.textContent.trim() === 'Free').length,
        todayMarked: /· today/i.test(text),
        boardBottomFromWindow: board ? Math.round(window.innerHeight - board.getBoundingClientRect().bottom) : null,
        boardScrolls: board ? board.scrollHeight > board.clientHeight + 1 : null };
    })), ...(await frame()) };
    if (h === 909) await page.screenshot({ path: 'shots/37-schedule-board.png' });
  }
  out.signRequests = signCalls;
  return JSON.stringify(out, null, 1);
}
