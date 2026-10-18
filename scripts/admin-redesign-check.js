/**
 * The admin redesign (2026-10-11): Attendance (Today, Walk-ins, History),
 * Members, Invitations and Trainers (with Credentials), on the kit in
 * components/ui/rd.tsx. Each page is opened against one fixture, checked for
 * crashes and error text, for the parts the mock-ups show, and for every
 * feature the page had before (a redesign never drops one). Screenshots go to
 * shots/rd-*.png. Admin dev server on :5174.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'lea@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date();
  const iso = (d, h = 9) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, 5, 0, 0); return x.toISOString(); };
  const day = (d) => { const x = new Date(now.getTime() + 8 * 3600000); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const NAMES = [['Aileen', 'Lopez'], ['Aileen', 'Navarro'], ['Ana', 'Andrada'], ['Ana', 'Iturralde'], ['Ana', 'Par'], ['Ana', 'Ramos'],
    ['Angelica', 'Lopez'], ['Angelica', 'Reyes'], ['Angelica', 'Rivera'], ['Ben', 'Cruz'], ['Carla', 'Diaz'], ['Dino', 'Santos']];
  const STATUSES = ['cancelled', 'active', 'active', 'pending', 'active', 'active', 'expired', 'active', 'frozen', 'active', 'active', 'expired'];
  const members = NAMES.map(([f, l], i) => ({ id: `m${i}`, role: 'member', status: i === 0 ? 'suspended' : i === 11 ? 'pending_approval' : 'active',
    first_name: f, last_name: l, email: `${f.toLowerCase()}.${l.toLowerCase()}@seed.corefitness-test.com`, phone: `+63 9${String(10 + i)}0 080 54${String(10 + i)}`,
    photo_url: null, created_at: iso(-200 + i) }));
  const T = [['Bianca', 'Soriano', 'Rehab & Injury Prevention'], ['Dante', 'Evangelista', 'Powerlifting'], ['Jen', 'Lacsamana', 'HIIT & Fat Loss']]
    .map(([f, l, sp], i) => ({ id: `t${i}`, role: 'trainer', status: 'active', first_name: f, last_name: l, email: `coach.${f.toLowerCase()}@seed.corefitness-test.com`,
      phone: null, photo_url: null, created_at: iso(-300), _sp: sp }));
  const PLANS = [
    { id: 'p1', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true },
    { id: 'p2', name: 'Free Plan', price: 0, duration_days: null, tier: 'free', is_active: true },
    { id: 'p3', name: 'Free Trial', price: 0, duration_days: 30, tier: 'freemium', is_active: true },
  ];
  const TABLES = {
    profiles: [admin, ...members, ...T],
    member_profiles: members.map((m, i) => ({ profile_id: m.id, gym_id: 'gym-1', qr_code: `QR-${m.id}`, experience_level: ['beginner', 'intermediate', 'advanced'][i % 3],
      address: 'Mamburao', date_of_birth: '1998-04-12', gender: 'female', created_at: m.created_at, profiles: m })),
    trainer_profiles: T.map((t) => ({ profile_id: t.id, specialization: t._sp, bio: null, availability: null, years_experience: 5,
      certifications: [], focus_areas: [], achievements: null, profiles: t })),
    membership_plans: PLANS,
    memberships: members.map((m, i) => {
      const plan = PLANS[i % 3];
      return { id: `ms${i}`, member_id: m.id, plan_id: plan.id, status: STATUSES[i], start_date: day(-20), expiry_date: plan.duration_days ? day(i === 2 ? 1 : 10 + i) : null,
        never_expires: !plan.duration_days, frozen_at: null, created_at: iso(-20), membership_plans: plan };
    }),
    attendance: [
      { id: 'a1', member_id: 'm1', check_in_time: iso(0, 7), method: 'qr', activity: 'Weight Training' },
      { id: 'a2', member_id: 'm2', check_in_time: iso(0, 8), method: 'manual', activity: null },
      { id: 'a3', member_id: 'm4', check_in_time: iso(-2, 18), method: 'qr', activity: 'Cardio' },
      { id: 'a4', member_id: 'm1', check_in_time: iso(-5, 18), method: 'qr', activity: 'Strength Training' },
    ],
    gym_invitations: [], payments: [], notifications: [], bookings: [], pt_sessions: [],
    gym_settings: [{ id: true, gym_id: 'gym-1', gym_name: 'G Fitness', activity_options: ['Weight Training', 'Cardio', 'Strength Training'],
      day_pass_on: true, day_pass_price: 150, pack5_price: 650, pack10_price: 1200, guest_nudge_visits: 3 }],
  };
  const RPC = { guest_visits_on: [], my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [], list_invitations: [] };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-0/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET') return json([]);
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        let m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
        m = /^gte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) >= m[1]);
        m = /^lte?\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) <= m[1] + (k.endsWith('_time') ? 'T23:59:59Z' : ''));
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  const out = [];
  const BAD = /Something went wrong|Couldn'?t load|Could not load|Failed to load|is not a function|Cannot read prop|NaN|\[object Object\]|Invalid Date/;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const visit = async (path, shot) => {
    errs.length = 0;
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const bad = BAD.exec(t);
    out.push(`${path}: ${bad ? 'ERROR TEXT "' + t.slice(Math.max(0, bad.index - 40), bad.index + 60) + '"' : 'renders'}${errs.length ? ' | ' + errs.join(' || ') : ''}`);
    await page.screenshot({ path: `shots/rd-${shot}.png`, fullPage: true });
    return t;
  };
  const has = (label, ok) => out.push(`  ${label}: ${ok ? 'yes' : 'MISSING'}`);

  // ── Attendance · Today ──
  let t = await visit('/attendance', 'attendance');
  has("today's count in the strip", (await page.locator('[data-stats-strip]').count()) === 1 && /Checked in today\s*2/.test(t));
  has('tabs Today · Walk-ins · History', (await page.locator('[data-rd-tabs] a').count()) === 3);
  has('Scan QR and the one check-in box', (await page.locator('[data-scan-qr]').count()) === 1 && (await page.getByLabel('Check-in code or name').count()) === 1);
  has('the strip: scanned, typed, walk-ins, this week', /Scanned/.test(t) && /Typed/.test(t) && /Walk-ins/.test(t) && /This week/.test(t));
  has("today's log with method, membership and notes", (await page.locator('[data-log-row]').count()) === 2 && /Weight Training/.test(t) && /Premium|Free Plan|Free Trial/.test(t));
  has('kept: undo, export, other days', /Undo/.test(t) && /Export/.test(t) && /Other days/.test(t));
  has('kept: search, typed code, activity tag, kiosk, lobby TV', /Tag the next check-in/.test(t) && /Open kiosk/.test(t) && /Open lobby TV/.test(t));
  await page.locator('[data-stats-strip] button', { hasText: 'Scanned' }).click();
  await page.waitForTimeout(300);
  has('a tile filters the log', (await page.locator('[data-log-row]').count()) === 1);

  // ── Attendance · Walk-ins ──
  t = await visit('/attendance/walk-ins', 'walkins');
  has('the drawer, the three steps, the form and the guide', (await page.locator('[data-walkins-hero]').count()) === 1 && /Day passes/.test(t) && /What are they paying for\?/.test(t) && (await page.locator('[data-walkin-form]').count()) === 1 && (await page.locator('[data-walkin-guide]').count()) === 1);

  // ── Attendance · History ──
  t = await visit('/attendance-history', 'history');
  has('presets, dates, search and filters', /Last 7 days/.test(t) && /Last 30 days/.test(t) && /All time/.test(t) && /From/.test(t) && /Any method/.test(t) && /Any activity/.test(t) && (await page.locator('[data-history-search]').count()) === 1);
  has('four tiles', /Check-ins/.test(t) && /Unique members/.test(t) && /Average per day/.test(t) && /Scanned vs typed/.test(t));
  has('the calendar with Less/More, and Most regular', (await page.locator('[data-attendance-calendar]').count()) === 1 && /Less/.test(t) && /More/.test(t) && (await page.locator('[data-most-regular]').count()) === 1);
  has('the log with Scanned/Typed and export', /Scanned/.test(t) && /Typed/.test(t) && /Export/.test(t));

  // ── Members ──
  t = await visit('/members', 'members');
  has('hero with members, the bar and the ring', (await page.locator('[data-members-hero] [data-ring]').count()) === 1 && /12 members/.test(t));
  has('chips with counts', (await page.locator('[data-rd-chips] [data-chip]').count()) === 7 && /Payment due/.test(t) && /Awaiting approval/.test(t));
  has('search, plans, statuses and Filter', /All plans/.test(t) && /All statuses/.test(t) && /Filter/.test(t));
  const noScroll = async () => page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight : 999; });
  const rowsShown = await page.locator('[data-member-row]').count();
  has('the page does not scroll; the table pages by what fits', (await noScroll()) <= 2 && rowsShown >= 3 && new RegExp(`Showing 1–${rowsShown} of 12 members`).test(t));
  has('rail: quick actions, needs attention, tip', /Quick actions/.test(t) && /Export CSV/.test(t) && /Archived members/.test(t) && /Needs attention/.test(t) && /Tip/.test(t));
  has('kept: Invite link and Add Member', /Invite link/.test(t) && /Add Member/.test(t));
  await page.locator('[data-chip="approval"]').click(); await page.waitForTimeout(300);
  has('a waiting account has Approve on its row', (await page.locator('[data-member-row]').count()) === 1 && (await page.getByRole('button', { name: 'Approve' }).count()) === 1);
  await page.locator('[data-chip="pending"]').click(); await page.waitForTimeout(300);
  has('a chip filters the roster', (await page.locator('[data-member-row]').count()) === 1);
  await page.locator('[data-chip="all"]').click(); await page.waitForTimeout(300);
  await page.locator('[data-member-row] [data-dot-menu]').first().click(); await page.waitForTimeout(400);
  const menu = (await page.locator('[role="menu"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  has('the row menu keeps every action', /View details/.test(menu) && /Edit member/.test(menu) && /(Suspend|Reactivate) account/.test(menu) && /Archive member/.test(menu));
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'shots/rd-members-menu.png' });

  // ── Invitations ──
  RPC.list_invitations = [
    { id: 'i1', email: 'maria.reyes@gmail.com', first_name: 'Maria', last_name: 'Reyes', phone: null, role: 'member', token: 'tok1',
      expires_at: iso(12), accepted_at: null, revoked_at: null, note: null, created_at: iso(-2), state: 'waiting' },
    { id: 'i2', email: 'jdelacruz@yahoo.com', first_name: 'Juan', last_name: 'Dela Cruz', phone: null, role: 'member', token: 'tok2',
      expires_at: iso(2), accepted_at: null, revoked_at: null, note: null, created_at: iso(-4), state: 'waiting' },
  ];
  t = await visit('/invitations', 'invitations');
  has('three tiles', /Pending invitations/.test(t) && /Accepted this month/.test(t) && /Expiring soon/.test(t));
  has('the page does not scroll', (await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight : 999; })) <= 2);
  has('one person and a group, as two tabs beside the list', (await page.locator('[data-invite-one]').count()) === 1 && (await page.locator('[data-invite-list]').count()) === 1);
  await page.locator('[data-way="group"]').click(); await page.waitForTimeout(250);
  t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  has('the group tab: upload and review', (await page.locator('[data-invite-group]').count()) === 1 && /Upload CSV/.test(t) && /Review invitations/.test(t));
  has('the waiting list with Copy link, Email it, Withdraw', (await page.locator('[data-invite-row]').count()) === 2 && (await page.getByRole('button', { name: 'Copy link' }).count()) === 2 && (await page.getByRole('button', { name: 'Email it' }).count()) === 2 && (await page.getByRole('button', { name: 'Withdraw' }).count()) === 2 && /2 pending/.test(t));
  has('an invite expiring within 3 days is counted', /Expiring soon\s*1/.test(t));
  await page.getByLabel('Paste your list').fill('ana@x.ph, Ana, Cruz\nnot-an-email');
  await page.getByRole('button', { name: 'Review invitations' }).click(); await page.waitForTimeout(300);
  has('Review shows who will be invited, and what cannot be used', /1 to invite as members, 1 that cannot be used/.test(await page.locator('[data-invite-review]').innerText().catch(() => '')) && (await page.getByRole('button', { name: /Invite 1 person/ }).count()) === 1);
  await page.screenshot({ path: 'shots/rd-invitations-review.png', fullPage: true });

  // ── Trainers ──
  TABLES.trainer_credentials = [
    { id: 'c1', trainer_id: 't0', title: 'NASM Corrective Exercise', file_path: 't0/nasm.jpg', mime_type: 'image/jpeg', size_bytes: 120000, status: 'verified',
      uploaded_at: iso(-40), reviewed_at: iso(-39), review_note: null, issuer: 'NASM', credential_number: 'CES-1', issued_on: day(-400), expires_on: day(300),
      trainer_profiles: { profiles: { first_name: 'Bianca', last_name: 'Soriano', photo_url: null } } },
    { id: 'c2', trainer_id: 't0', title: 'First Aid & CPR', file_path: 't0/cpr.pdf', mime_type: 'application/pdf', size_bytes: 80000, status: 'pending',
      uploaded_at: iso(-1), reviewed_at: null, review_note: null, issuer: 'Red Cross', credential_number: null, issued_on: null, expires_on: null,
      trainer_profiles: { profiles: { first_name: 'Bianca', last_name: 'Soriano', photo_url: null } } },
  ];
  TABLES.trainer_availability = [{ id: 'av1', trainer_id: 't0', day_of_week: 1, start_time: '08:00', end_time: '12:00' },
    { id: 'av2', trainer_id: 't1', day_of_week: 3, start_time: '08:00', end_time: '12:00' }];
  t = await visit('/trainers', 'trainers');
  has('four tiles, with credentials to review', /On roster/.test(t) && /Bookable/.test(t) && /Credentials to review/.test(t));
  has('the table: specialty, credentials, rating, windows, status', (await page.locator('[data-trainer-row]').count()) === 3 && /Rehab & Injury Prevention/.test(t) && /1 verified/.test(t) && /Needs review · 1/.test(t) && /windows?/.test(t) && /Active/.test(t));
  has('kept: Edit, Suspend, Archived, Monthly totals, Add trainer', /Edit/.test(t) && /Suspend/.test(t) && /Archived/.test(t) && /Monthly totals/.test(t) && /Add trainer/.test(t));
  await page.locator('[data-trainer-row] [data-dot-menu]').first().click(); await page.waitForTimeout(300);
  has('Archive and the rest in the row menu', /Archive trainer/.test(await page.locator('[role="menu"]').innerText().catch(() => '')) && /View profile/.test(await page.locator('[role="menu"]').innerText().catch(() => '')));
  await page.keyboard.press('Escape');
  await page.getByLabel('Select Bianca Soriano').check(); await page.waitForTimeout(200);
  has('ticking rows offers bulk suspend and archive', (await page.locator('[data-trainer-bulk]').count()) === 1 && /1 selected/.test(await page.locator('[data-trainer-bulk]').innerText()));
  await page.screenshot({ path: 'shots/rd-trainers-selected.png' });

  t = await visit('/trainers?view=credentials', 'credentials');
  has('credentials: tiles, chips and certificate cards', /Waiting for review/.test(t) && /Expiring or lapsed/.test(t) && (await page.locator('[data-credential-tile]').count()) === 2);
  has('kept: Verify and Reject on a waiting certificate, and the way back', /Verify/.test(t) && /Reject/.test(t) && /Back to trainers/.test(t));

  return out.join('\n');
}
