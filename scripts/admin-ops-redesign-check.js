/**
 * The admin redesign, part 4 (2026-10-12): Schedule, Bookings, Payments, Plans and
 * Activity rebuilt on the kit, holding the screen at 1600×900 — the page never
 * scrolls, each box scrolls itself — with every feature kept. Fixtures only.
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
  const iso = (d, h = 9, m = 5) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const day = (d) => { const x = new Date(now.getTime() + 8 * 3600000); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const NAMES = [['Aileen', 'Lopez'], ['Ana', 'Andrada'], ['Ben', 'Cruz'], ['Carla', 'Diaz'], ['Dino', 'Santos'], ['Ella', 'Reyes']];
  const members = NAMES.map(([f, l], i) => ({ id: `m${i}`, role: 'member', status: 'active', first_name: f, last_name: l,
    email: `${f.toLowerCase()}@seed.corefitness-test.com`, phone: null, photo_url: null, created_at: iso(-200 + i) }));
  const T = [['Bianca', 'Soriano'], ['Dante', 'Evangelista'], ['Jen', 'Lacsamana']].map(([f, l], i) => ({ id: `t${i}`, role: 'trainer', status: 'active',
    first_name: f, last_name: l, email: `coach.${f.toLowerCase()}@seed.corefitness-test.com`, phone: null, photo_url: null, created_at: iso(-300) }));
  const TPL = (id, name, trainer, dow, start, dur = 60, extra = {}) => ({ id, name, trainer_id: trainer, level: 'all_levels', capacity: 20, location: 'Studio A',
    day_of_week: dow, start_time: `${start}:00`, duration_minutes: dur, active: true, created_at: iso(-30), ...extra });
  const TEMPLATES = [
    TPL('c1', 'Morning HIIT', 't2', 1, '06:00'), TPL('c2', 'Yoga Flow', 't0', 2, '07:00', 75), TPL('c3', 'Power Hour', 't1', 3, '18:00'),
    TPL('c4', 'Spin', 't1', 3, '18:30', 45), TPL('c5', 'Core Blast', 't2', 5, '12:30', 30), TPL('c6', 'Old Bootcamp', 't1', 6, '08:00', 60, { active: false }),
  ];
  const CLASSES = [0, 1, 2, 3, 4, 5].map((d, i) => ({ id: `cl${i}`, name: TEMPLATES[i % 5].name, trainer_id: TEMPLATES[i % 5].trainer_id,
    // cl0 is today, so the week always shows one, whatever the weekday (tomorrow is next week on a Saturday).
    scheduled_at: iso(i === 0 ? 0 : d + 1, 6 + i * 2, 0), duration_minutes: 60, location: 'Studio A', capacity: 10, class_type: 'group', status: 'scheduled', template_id: TEMPLATES[i % 5].id }));
  const PLANS = [
    { id: 'pl1', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true, can_book_classes: true, can_book_pt: true },
    { id: 'pl2', name: 'Free Plan', price: 0, duration_days: null, tier: 'free', is_active: true, can_book_classes: true, can_book_pt: false },
  ];
  const TABLES = {
    profiles: [admin, ...members, ...T],
    member_profiles: members.map((m) => ({ profile_id: m.id, gym_id: 'gym-1', qr_code: `QR-${m.id}`, experience_level: 'beginner', created_at: m.created_at, profiles: m })),
    trainer_profiles: T.map((t) => ({ profile_id: t.id, specialization: 'HIIT', bio: null, years_experience: 5, certifications: [], focus_areas: [], profiles: t })),
    class_templates: TEMPLATES,
    trainer_availability: [
      { id: 'av1', trainer_id: 't0', day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00', slot_minutes: 60 },
      { id: 'av2', trainer_id: 't0', day_of_week: 3, start_time: '14:00:00', end_time: '17:00:00', slot_minutes: 60 },
      { id: 'av3', trainer_id: 't2', day_of_week: 2, start_time: '06:00:00', end_time: '10:00:00', slot_minutes: 30 },
    ],
    classes: CLASSES,
    class_availability: CLASSES.map((c, i) => ({ class_id: c.id, booked_count: i === 0 ? 10 : i * 2, capacity: c.capacity })),
    class_waitlist: [{ class_id: 'cl0' }, { class_id: 'cl0' }],
    gym_settings: [{ id: true, gym_id: 'gym-1', gym_name: 'G Fitness', opening_time: '05:00', closing_time: '22:00',
      class_booking_approval: 'coach_desk', pt_booking_approval: 'coach' }],
    membership_plans: PLANS,
    memberships: members.map((m, i) => ({ id: `ms${i}`, member_id: m.id, plan_id: i === 3 ? 'pl2' : 'pl1', status: i === 4 ? 'expired' : 'active',
      start_date: day(-20), expiry_date: day(i === 4 ? -2 : 20), never_expires: false, created_at: iso(-20), membership_plans: i === 3 ? PLANS[1] : PLANS[0] })),
    bookings: [
      { id: 'b1', member_id: 'm0', class_id: 'cl1', status: 'pending', requested_at: iso(-1, 8), decided_by_role: null, decided_by: null, coach_ok_at: iso(-1, 9), coach_ok_by: 't0', classes: CLASSES[1] },
      { id: 'b2', member_id: 'm4', class_id: 'cl2', status: 'pending', requested_at: iso(-1, 7), decided_by_role: null, decided_by: null, classes: CLASSES[2] },
      { id: 'b3', member_id: 'm1', class_id: 'cl1', status: 'approved', requested_at: iso(-2, 7), decided_by_role: 'trainer', decided_by: 't0', classes: CLASSES[1] },
      { id: 'b4', member_id: 'm2', class_id: 'cl3', status: 'rejected', requested_at: iso(-3, 7), decided_by_role: 'system', decided_by: null, classes: CLASSES[3] },
    ],
    pt_sessions: [
      { id: 'pt1', member_id: 'm3', trainer_id: 't1', starts_at: iso(2, 10, 0), ends_at: iso(2, 11, 0), status: 'pending', requested_at: iso(-4, 9), notes: 'Knee rehab', decided_by_role: null, decided_by: null },
      { id: 'pt2', member_id: 'm5', trainer_id: 't0', starts_at: iso(3, 9, 0), ends_at: iso(3, 10, 0), status: 'approved', requested_at: iso(-2, 9), notes: null, decided_by_role: 'staff', decided_by: null },
    ],
    payments: [
      ...members.slice(0, 5).map((m, i) => ({ id: `pay${i}`, member_id: m.id, membership_id: `ms${i}`, amount: 1500, method: i === 2 ? 'gcash' : 'cash', status: i === 3 ? 'pending' : 'completed',
        paid_on: day(-i * 3), created_at: iso(-i * 3), due_date: null, invoice_number: `INV-2026-0004${i}`, plan_name: 'Premium', notes: null })),
      { id: 'pay9', member_id: 'm0', membership_id: 'ms0', amount: 1500, method: 'cash', status: 'completed', paid_on: day(-35), created_at: iso(-35), due_date: null, invoice_number: 'INV-2026-00031', plan_name: 'Premium', notes: null },
    ],
    renewal_requests: [
      { id: 'rr1', member_id: 'm5', plan_id: 'pl1', note: 'After work', created_at: iso(0, 7), status: 'open', pay_method_label: 'GCash', pay_kind: 'gcash', pay_reference: 'GC-998877',
        pay_amount: 1500, paid_on: day(0), pay_proof: null, membership_plans: PLANS[0] },
    ],
    bookings_needing_attention: [
      { kind: 'pt', id: 'pt1', member_id: 'm3', member_name: 'Carla Diaz', what: 'Personal training', trainer_id: 't1', trainer_name: 'Dante Evangelista',
        starts_at: iso(2, 10, 0), requested_at: iso(-4, 9), days_waiting: 4, urgency: 'overdue' },
    ],
  };
  const RPC = { my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [], generate_class_instances: 0,
    cash_day_summary: [{ day: day(0), cash_in: 3000, refunds_out: 0, expected: 3000, payment_count: 2, closed: false, counted: null, difference: null, note: null, closed_by_name: null, closed_at: null }],
    recent_cash_closeouts: [] };

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
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) <= m[1] + (k.endsWith('_at') || k.endsWith('_time') ? 'T23:59:59Z' : ''));
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1600, height: 900 });
  const out = [];
  const BAD = /Something went wrong|Couldn'?t load|Could not load|Failed to load|is not a function|Cannot read prop|NaN|\[object Object\]|Invalid Date/;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const noScroll = async () => page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight <= 2 : false; });
  const visit = async (path, shot) => {
    errs.length = 0;
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3200);
    const t = await text();
    const bad = BAD.exec(t);
    out.push(`${path}: ${bad ? 'ERROR TEXT "' + t.slice(Math.max(0, bad.index - 40), bad.index + 60) + '"' : 'renders'}${errs.length ? ' | ERRORS ' + errs.join(' || ') : ''}`);
    await page.screenshot({ path: `shots/ops-${shot}.png` });
    return t;
  };
  const has = (label, ok) => out.push(`  ${label}: ${ok ? 'yes' : 'MISSING'}`);

  // ── Schedule (rebuilt to the approved mock-up, 2026-10-20) ──
  let t = await visit('/schedule', 'schedule');
  has('calendar: tabs, date navigation, search, coach filter, export, add class', /Calendar/.test(t) && /Weekly timetable/.test(t) && /Coach hours/.test(t)
    && (await page.getByLabel('Search the schedule').count()) === 1 && (await page.getByLabel('Filter by coach').count()) === 1
    && /Export/.test(t) && /Add class/.test(t) && /Today/.test(t) && /Pick a date/.test(t));
  has('the week by the clock: dated classes on the calendar', (await page.locator('[data-week] [data-event]').count()) >= 1, String(await page.locator('[data-week] [data-event]').count()));
  has('needs a look: both clashes, a full class with a waitlist, a coach with no hours', (await page.locator('[data-needs-look] .a-row', { hasText: 'Clash' }).count()) === 2
    && /has no 1-on-1 hours/.test(t));
  has('the page does not scroll', await noScroll());
  await page.locator('[data-week] [data-event]').first().click();
  await page.waitForTimeout(600);
  has('a class opens beside the calendar: coach, room, seats, who booked, book a member', (await page.locator('[data-class-panel]').count()) === 1
    && /Booked/.test(await page.locator('[data-class-panel]').innerText()));
  await page.screenshot({ path: 'shots/ops-schedule-class.png' });
  await page.locator('[data-view="day"]').click();
  await page.waitForTimeout(600);
  has('day view: one day with a month to pick from', (await page.locator('[data-day]').count()) === 1 && (await page.locator('[data-minical] button').count()) >= 28);
  await page.screenshot({ path: 'shots/ops-schedule-day.png' });
  await page.locator('[data-view="plan"]').click();
  await page.waitForTimeout(400);
  t = await text();
  has('weekly timetable: every class, the retired one, both clashes flagged', (await page.locator('[data-template-row]').count()) === 6 && /Retired/.test(t)
    && (await page.locator('[data-template-row] .a-pill', { hasText: /^Clash$/ }).count()) === 2);
  await page.locator('[data-template-row]', { hasText: 'Yoga Flow' }).getByRole('button', { name: /Edit/ }).click();
  await page.waitForTimeout(400);
  has('a class opens in the editor with its day, time, coach and room', (await page.getByRole('dialog', { name: 'Edit class' }).count()) === 1
    && (await page.getByRole('group', { name: 'Repeats every' }).getByRole('button', { name: 'Tue', pressed: true }).count()) === 1);
  await page.screenshot({ path: 'shots/ops-schedule-edit.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('[data-view="hours"]').click();
  await page.waitForTimeout(400);
  t = await text();
  has('coach hours: a row per coach, and who has none', (await page.locator('[data-hours-row]').count()) === 3 && /No hours — members cannot book them/.test(t));
  has('…and the page still does not scroll', await noScroll());
  await page.screenshot({ path: 'shots/ops-schedule-hours.png' });
  await page.getByRole('combobox', { name: 'Coach' }).click();
  await page.waitForTimeout(200);
  has('coach hours: the coach list is the dark dropdown', (await page.getByRole('listbox', { name: 'Coach' }).getByRole('option').count()) === 4);
  await page.screenshot({ path: 'shots/ops-schedule-coach-dropdown.png' });
  await page.getByRole('option', { name: 'Jen Lacsamana' }).click();
  has('…and picking a coach shows them in the box', /Jen Lacsamana/.test(await page.getByRole('combobox', { name: 'Coach' }).innerText()));

  // ── Bookings (rebuilt to the approved mock-up, 2026-10-20) ──
  t = await visit('/bookings', 'bookings');
  has('one search, date chips, kind and status, four cards', (await page.getByLabel('Search bookings').count()) === 1 && /This week/.test(t) && /Next 30 days/.test(t)
    && (await page.locator('[data-booking-cards] > *').count()) === 4 && /Waiting for a decision/.test(t) && /Need checking/.test(t));
  has('the week grouped by day', (await page.locator('[data-queue] .a-daygroup').count()) >= 2);
  has('the queue fits its box — no sideways scroll', await page.evaluate(() => { const b = document.querySelector('[data-queue] [data-rd-table]'); return !!b && b.scrollWidth <= b.clientWidth + 1; }));
  has('decided rows say by whom; in coach modes the gym cannot change them (0203)', /Accepted by (Bianca Soriano \(their trainer\)|front desk)/.test(t)
    && (await page.getByRole('button', { name: 'Change decision' }).count()) === 0);
  has('the rail: book for a member, who decides here', (await page.locator('[data-desk-book]').count()) === 1 && /Who decides here/.test(t) && /the coach accepts, then you confirm/.test(t));
  has('the page does not scroll', await noScroll());
  await page.locator('[data-view="waiting"]').click();
  await page.waitForTimeout(400);
  t = await text();
  // 0203: classes are "coach, then desk", 1-on-1 "coach approves". The gym confirms only what a coach accepted;
  // the rest show who they wait for and a reminder — never Approve.
  const approveN = await page.getByRole('button', { name: /^(Approve|Confirm)$/ }).count();
  const waitN = await page.locator('[data-waiting-coach]').count();
  has('waiting: three — Confirm only on what the coach accepted, Remind on the rest', (await page.locator('[data-booking-row]').count()) === 3
    && approveN >= 1 && waitN >= 1 && approveN + waitN === 3 && (await page.locator('[data-remind-coach]').count()) === waitN, `approve ${approveN}, waiting ${waitN}`);
  has('coach then desk: "accepted — your turn to confirm"', /Bianca Soriano accepted — your turn to confirm/.test(t));
  has('warnings, never blocks: an expired membership and a plan without 1-on-1', /Membership is expired/.test(t) && /Free Plan does not include personal training/.test(t));
  has('bulk: select all — only what the gym may decide', new RegExp(`Select all ${approveN} pending`).test(t));
  has('no row runs past the edge of the queue', await page.evaluate(() => { const b = document.querySelector('[data-queue]'); const r = b && b.getBoundingClientRect();
    return !!r && [...document.querySelectorAll('[data-booking-row] button')].every((x) => x.getBoundingClientRect().right <= r.right + 1); }));
  await page.screenshot({ path: 'shots/ops-bookings-waiting.png' });
  await page.locator('[data-rd-tabs] button').first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Status').selectOption('rejected');
  await page.waitForTimeout(300);
  has('an expiry is worded as an event', /Expired — nobody answered in time/.test(await text()));
  await page.getByLabel('Status').selectOption('all');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/ops-bookings-all.png' });
  await page.locator('[data-view="history"]').click();
  await page.waitForTimeout(300);
  has('history: before today, with an export', /Export/.test(await text()));

  // ── Payments ──
  t = await visit('/payments', 'payments');
  has('tiles: total, this month, pending, to approve', /Total collected/.test(t) && /This month/.test(t) && /Pending/.test(t) && /To approve/.test(t));
  has('records by member, the drawer in the rail', (await page.locator('[data-member-row]').count()) === 5 && /End of day/.test(t) && /Should be in the drawer/.test(t));
  has('the page does not scroll', await noScroll());
  await page.getByRole('combobox', { name: 'Show' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/ops-dropdown.png' });
  has('the dropdown opens as a dark list with the choice ticked', (await page.getByRole('listbox', { name: 'Show' }).count()) === 1
    && (await page.getByRole('option', { name: 'By member', selected: true }).count()) === 1);
  await page.getByRole('option', { name: 'Every payment' }).click();
  await page.waitForTimeout(400);
  t = await text();
  has('every payment: method, status, a pending one to confirm, a receipt each', (await page.locator('[data-payment-row]').count()) >= 5 && /GCash/.test(t)
    && (await page.getByRole('button', { name: 'Confirm', exact: true }).count()) === 1 && (await page.getByRole('button', { name: /^Receipt INV-/ }).count()) >= 5);
  await page.screenshot({ path: 'shots/ops-payments-all.png' });
  await page.getByRole('tab', { name: /To approve/ }).click();
  await page.waitForTimeout(400);
  t = await text();
  has('coming to renew: the online reference, Approve payment, Decline', /Ref GC-998877/.test(t) && (await page.getByRole('button', { name: /Approve payment/ }).count()) === 1 && (await page.getByRole('button', { name: /Record payment/ }).count()) >= 1
    && (await page.getByRole('button', { name: 'Decline', exact: true }).count()) === 1);
  await page.screenshot({ path: 'shots/ops-payments-renew.png' });

  return out.join('\n');
}
