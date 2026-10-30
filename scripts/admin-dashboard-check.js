/**
 * The owner's dashboard, option A1 (2026-10-18): "Needs you" lists what is
 * waiting, each with its action; today shows check-ins, walk-ins, the cash and
 * the classes; this month is compared with the same days of last month; it all
 * fits one screen with no page scroll, on a big laptop and a small one.
 *
 * Playwright runner's `filename` argument, admin dev server on :5174. The data is
 * an in-memory table set that honours eq/gte/gt/lte/lt/in/is filters and exact
 * counts, so every figure on screen is computed by the app from these rows.
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
  const OWNER = 'u-owner';
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWNER, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'owner@lab.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  // ── Manila dates, as the app computes them ──
  const manila = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const today = manila();
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const at = (key, hhmm) => new Date(`${key}T${hhmm}:00+08:00`).toISOString();
  const thisFirst = `${today.slice(0, 8)}01`;
  const [ty, tm] = thisFirst.split('-').map(Number);
  const prevFirst = `${tm === 1 ? ty - 1 : ty}-${String(tm === 1 ? 12 : tm - 1).padStart(2, '0')}-01`;
  const prevMid = addDays(prevFirst, Math.min(Number(today.slice(8, 10)) - 1, 25));   // inside last month's same-days window
  // Anchored to the current minute, so the check reads the same at 00:05 and at 23:55.
  // "Waiting N days" is elapsed time floored (todayService's daysAgo), not calendar days;
  // a class is done once its end has passed, and today's classes must start inside today.
  const NOW = Date.now(), MIN = 60000;
  const dayStart = Date.parse(`${today}T00:00:00+08:00`);
  const ago = (ms) => new Date(NOW - ms).toISOString();
  const doneStart = Math.max(dayStart, NOW - 60 * MIN);
  const doneMinutes = Math.max(0, Math.min(45, Math.floor((NOW - doneStart) / MIN) - 2));   // ends before now, even at 00:01
  const soon = (back) => new Date(Math.max(dayStart, NOW - back * MIN)).toISOString();    // under way, not over

  const people = [
    { id: OWNER, first_name: 'Gabby', last_name: 'Owner', role: 'admin', status: 'active', email: 'owner@lab.test', created_at: at(addDays(today, -400), '09:00') },
    { id: 't1', first_name: 'Paolo', last_name: 'Dimaculangan', role: 'trainer', status: 'active', email: 't1@lab.test', created_at: at(addDays(today, -300), '09:00') },
    { id: 't2', first_name: 'Gabby', last_name: 'Coach', role: 'trainer', status: 'active', email: 't2@lab.test', created_at: at(addDays(today, -300), '09:00') },
  ];
  // Four members joined this month, six in the same days of last month.
  for (let i = 0; i < 4; i++) people.push({ id: `mn${i}`, first_name: `New${i}`, last_name: 'Member', role: 'member', status: 'active', email: `n${i}@lab.test`, created_at: at(thisFirst, '10:00') });
  for (let i = 0; i < 6; i++) people.push({ id: `mp${i}`, first_name: `Prev${i}`, last_name: 'Member', role: 'member', status: 'active', email: `p${i}@lab.test`, created_at: at(prevFirst, '10:00') });
  people.push({ id: 'ivy', first_name: 'Ivy', last_name: 'Aquino', role: 'member', status: 'active', email: 'ivy@lab.test', created_at: at(addDays(today, -200), '10:00') });
  people.push({ id: 'rhea', first_name: 'Rhea', last_name: 'Santos', role: 'member', status: 'active', email: 'rhea@lab.test', created_at: at(addDays(today, -200), '10:00') });

  const DB = {
    profiles: people, gym_people: people,
    gym_settings: [{ id: true, gym_id: 'gym-a', gym_name: 'Core Fitness Lab', short_name: 'Lab', logo_url: null, address: 'Mamburao', opening_time: '06:00', closing_time: '21:00' }],
    pending_registrations: [
      { id: 'pr1', first_name: 'Andrea', last_name: 'Santos', created_at: at(addDays(today, -1), '09:00') },
      { id: 'pr2', first_name: 'Carlo', last_name: 'Bautista', created_at: at(addDays(today, -1), '10:00') },
      { id: 'pr3', first_name: 'Dan', last_name: 'Ocampo', created_at: at(today, '07:00') },
    ],
    classes: [
      { id: 'c1', name: 'Morning HIIT', scheduled_at: new Date(doneStart).toISOString(), duration_minutes: doneMinutes, capacity: 16, location: 'Studio', trainer_id: 't2', created_at: at(today, '00:00') },
      { id: 'c2', name: 'Spin 45', scheduled_at: soon(10), duration_minutes: 45, capacity: 12, location: 'Studio', trainer_id: 't1', created_at: at(today, '00:00') },
      { id: 'c3', name: 'Strength Basics', scheduled_at: soon(5), duration_minutes: 60, capacity: 10, location: 'Gym floor', trainer_id: 't2', created_at: at(today, '00:00') },
    ],
    class_availability: [{ class_id: 'c1', booked_count: 14 }, { class_id: 'c2', booked_count: 9 }, { class_id: 'c3', booked_count: 10 }],
    bookings: [
      { id: 'b1', member_id: 'ivy', class_id: 'c2', status: 'pending', requested_at: ago((2 * 24 + 3) * 60 * MIN) },
      { id: 'b2', member_id: 'rhea', class_id: 'c3', status: 'pending', requested_at: ago((1 * 24 + 3) * 60 * MIN) },
    ],
    pt_sessions: [],
    renewal_requests: [
      { id: 'rr1', member_id: 'ivy', plan_id: 'p1', note: null, status: 'open', created_at: at(today, '08:00'), pay_method_label: 'GCash', pay_kind: 'gcash', pay_reference: 'GC1', pay_amount: 1500, paid_on: today, pay_proof: null, membership_plans: { name: 'Premium', price: 1500, duration_days: 30 } },
      { id: 'rr2', member_id: 'rhea', plan_id: 'p2', note: null, status: 'open', created_at: at(today, '08:30'), pay_method_label: 'GCash', pay_kind: 'gcash', pay_reference: 'GC2', pay_amount: 800, paid_on: today, pay_proof: null, membership_plans: { name: 'Monthly', price: 800, duration_days: 30 } },
    ],
    memberships: [
      { id: 'ms-ivy', member_id: 'ivy', plan_id: 'p1', status: 'active', start_date: addDays(today, -27), expiry_date: addDays(today, 3), never_expires: false, created_at: at(addDays(today, -27), '09:00'), membership_plans: { name: 'Premium', can_book_classes: true, can_book_pt: true } },
      { id: 'ms-rhea', member_id: 'rhea', plan_id: 'p2', status: 'active', start_date: addDays(today, -26), expiry_date: addDays(today, 4), never_expires: false, created_at: at(addDays(today, -26), '09:00'), membership_plans: { name: 'Monthly', can_book_classes: true, can_book_pt: false } },
      ...Array.from({ length: 33 }, (_, i) => ({ id: `ms${i}`, member_id: `x${i}`, plan_id: 'p1', status: 'active', start_date: addDays(today, -5), expiry_date: addDays(today, 25), never_expires: false, created_at: at(addDays(today, -5), '09:00') })),
    ],
    attendance: [
      ...Array.from({ length: 18 }, (_, i) => ({ id: `at${i}`, member_id: 'ivy', check_in_time: at(today, '00:0' + (i % 10)), method: 'qr' })),
      ...Array.from({ length: 300 }, (_, i) => ({ id: `ar${i}`, member_id: 'rhea', check_in_time: at(addDays(today, -1 - (i % 28)), '09:00'), method: 'qr' })),
      ...Array.from({ length: 250 }, (_, i) => ({ id: `ap${i}`, member_id: 'rhea', check_in_time: at(addDays(today, -31 - (i % 28)), '09:00'), method: 'qr' })),
    ],
    guest_visits: [
      { id: 'g1', visit_day: today, voided_at: null }, { id: 'g2', visit_day: today, voided_at: null },
      { id: 'g3', visit_day: today, voided_at: at(today, '05:00') },
    ],
    payments: [
      { id: 'pa1', amount: 12800, status: 'completed', paid_on: thisFirst, member_id: 'ivy' },
      { id: 'pa2', amount: 10000, status: 'completed', paid_on: today, member_id: 'rhea' },
      { id: 'pa3', amount: 20000, status: 'completed', paid_on: prevMid, member_id: 'ivy' },
      { id: 'pa4', amount: 999, status: 'pending', paid_on: today, member_id: 'ivy' },
    ],
    membership_plans: [{ id: 'p1', name: 'Premium' }, { id: 'p2', name: 'Monthly' }],
  };
  const RPC = {
    my_gym_context: [{ gym_id: 'gym-a', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active', lock_reason: null, short_name: 'Lab', logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'active' }],
    my_gym_app: [{ gym_id: 'gym-a', gym_name: 'Core Fitness Lab', slug: 'lab', short_name: 'Lab', logo_url: null, accent: 'violet', accent_action: null, tagline: null, points_name: 'Points', points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'closed', join_code: null, modules: {} }],
    open_membership_requests: [
      { id: 'mr1', member_id: 'ivy', member_name: 'Ivy Aquino', kind: 'freeze', reason: 'Travel', requested_days: 14, created_at: at(today, '07:00'), plan_name: 'Premium', expiry_date: addDays(today, 3), membership_id: 'ms-ivy' },
      { id: 'mr2', member_id: 'rhea', member_name: 'Rhea Santos', kind: 'cancel', reason: 'Moving', requested_days: null, created_at: at(today, '07:30'), plan_name: 'Monthly', expiry_date: addDays(today, 4), membership_id: 'ms-rhea' },
    ],
    cash_day_summary: [{ day: today, cash_in: 4350, refunds_out: 0, expected: 4350, payment_count: 6, closed: false, counted: null, difference: null, note: null, closed_by_name: null, closed_at: null }],
    retention_radar: [
      { member_id: 'rhea', name: 'Rhea Santos', phone: null, photo_url: null, score: 50, level: 'high', reasons: ['membership ends in 4 days'], last_visit: null, visits_14: 2, usual_14: 6, expires_on: addDays(today, 4), last_contact: null },
      { member_id: 'ivy', name: 'Ivy Aquino', phone: null, photo_url: null, score: 35, level: 'medium', reasons: ['membership ends in 3 days'], last_visit: null, visits_14: 4, usual_14: 6, expires_on: addDays(today, 3), last_contact: null },
    ],
    gym_traffic: [1, 2, 3, 4, 5, 6, 0].flatMap((dow) => ['6am', '9am', '12pm', '3pm', '6pm', '9pm'].map((band, k) => ({ dow, band, visits: [8, 5, 2, 4, 14, 0][k] * (dow === 6 ? 2 : 1), weeks: 4 }))),
    sweep_stale_requests: 0, my_gym_modules: [], my_support_grant: [], my_gyms: [], my_announcements: [], billing_reminders_sweep: 0,
  };

  // Filters: eq / neq / gte / gt / lte / lt / in / is, compared as dates when both sides are dates.
  const cmp = (a, b) => {
    const da = Date.parse(a), db = Date.parse(b);
    if (!Number.isNaN(da) && !Number.isNaN(db) && /\d{4}-\d{2}-\d{2}/.test(String(a)) && /\d{4}-\d{2}-\d{2}/.test(String(b))) return da - db;
    return String(a).localeCompare(String(b));
  };
  const keep = (row, k, v) => {
    if (!(k in row)) return true;
    const x = row[k];
    let m;
    if (v === 'is.null') return x == null;
    if (v === 'not.is.null') return x != null;
    if ((m = /^eq\.(.*)$/.exec(v))) return String(x) === m[1];
    if ((m = /^neq\.(.*)$/.exec(v))) return String(x) !== m[1];
    if ((m = /^gte\.(.*)$/.exec(v))) return x != null && cmp(x, m[1]) >= 0;
    if ((m = /^gt\.(.*)$/.exec(v))) return x != null && cmp(x, m[1]) > 0;
    if ((m = /^lte\.(.*)$/.exec(v))) return x != null && cmp(x, m[1]) <= 0;
    if ((m = /^lt\.(.*)$/.exec(v))) return x != null && cmp(x, m[1]) < 0;
    if ((m = /^in\.\((.*)\)$/.exec(v))) return m[1].split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(x));
    return true;
  };
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const head = req.method() === 'HEAD' || /count=exact/.test(req.headers()['prefer'] || '');
    const json = (b, total) => route.fulfill({ status: 200, contentType: 'application/json', body: req.method() === 'HEAD' ? '' : JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${total ?? (Array.isArray(b) ? b.length : 1)}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      CALLS.push(fn);
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const rows = (DB[t] ?? []).filter((r) => [...url.searchParams.entries()].every(([k, v]) =>
      ['select', 'order', 'limit', 'offset', 'or'].includes(k) ? true : keep(r, k, v)));
    if (one) return json(rows[0] ?? null);
    return json(head ? [] : rows, rows.length);
  });

  const out = [];
  const go = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-dashboard="a1"]').waitFor({ timeout: 15000 });
    await page.locator('[data-task="expiring"]').waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };
  await go(1440, 900);
  const text = async (sel) => (await page.locator(sel).innerText()).replace(/\s+/g, ' ');
  const needs = await text('[data-needs-you]');
  out.push('greets the owner by name, with the gym’s hours: ' + (/Good (morning|afternoon|evening), Gabby/.test(await page.locator('h1').innerText()) && /open 6:00 am – 9:00 pm/.test(await text('[data-dashboard="a1"]')) ? 'yes' : 'MISSING'));
  out.push('needs you: bookings, oldest age: ' + (/2 bookings to decide oldest waiting 2 days Review/.test(needs) ? 'yes' : 'MISSING ' + needs.slice(0, 120)));
  out.push('…sign-ups with names: ' + (/3 sign-ups waiting Andrea S\., Carlo B\., \+1 Approve/.test(needs) ? 'yes' : 'MISSING'));
  out.push('…online payments with the total: ' + (/2 online payments to confirm GCash · ₱2,300(\.00)? Confirm/.test(needs) ? 'yes' : 'MISSING'));
  out.push('…freeze and cancel asks: ' + (/2 freeze \/ cancel requests/.test(needs) ? 'yes' : 'MISSING'));
  out.push('…memberships ending, soonest first: ' + (/2 memberships end this week Ivy Aquino in 3 days View/.test(needs) ? 'yes' : 'MISSING'));
  out.push('…and the count of things to do: ' + (/11 to do/.test(await text('[data-dashboard="a1"]')) ? 'yes' : 'MISSING'));
  const dash = await text('[data-dashboard="a1"]');
  out.push('checked in today (not "in the gym now"), walk-ins apart, voided ones left out: ' + (/Checked in today 18 \+ 2 walk-ins/.test(dash) && !/in the gym now/i.test(dash) ? 'yes' : 'MISSING'));
  out.push('cash today from the drawer’s figure: ' + (/Cash today ₱4,350(\.00)? 6 payments · drawer open/.test(dash) ? 'yes' : 'MISSING'));
  const classes = await text('[data-today-classes]');
  out.push('today’s classes: done, filling, full: ' + (/Morning HIIT/.test(classes) && /done/.test(classes) && /9\/12/.test(classes) && /Full/.test(classes) ? 'yes' : 'MISSING ' + classes.slice(0, 160)));
  const nums = await text('[data-month-numbers]');
  out.push('revenue compared with the same days of last month: ' + (/₱22,800(\.00)? ▲ 14% vs/.test(nums) ? 'yes' : 'MISSING ' + nums.slice(0, 160)));
  out.push('new members compared, a fall shown in amber words: ' + (/New members · \w+ 4 ▼ 2 vs/.test(nums) ? 'yes' : 'MISSING'));
  out.push('visits over 30 days against the 30 before: ' + (/Visits · last 30 days \d+ ▲ \d+% vs the 30 before/.test(nums) ? 'yes' : 'MISSING'));
  out.push('members to watch, riskiest first: ' + (/Rhea Santos membership ends in 4 days.*Ivy Aquino/.test(await text('[data-members-to-watch]')) ? 'yes' : 'MISSING'));
  const fits = async () => page.evaluate(() => ({ page: document.scrollingElement.scrollHeight <= innerHeight + 1, wide: document.scrollingElement.scrollWidth <= innerWidth + 1 }));
  let f = await fits();
  out.push('1440×900: no page scroll, nothing sideways: ' + (f.page && f.wide ? 'yes' : 'MISSING ' + JSON.stringify(f)));
  await page.screenshot({ path: 'shots/admin-dashboard-a1.png' });
  await go(1280, 720);
  f = await fits();
  out.push('1280×720: still fits: ' + (f.page && f.wide ? 'yes' : 'MISSING ' + JSON.stringify(f)));
  await page.screenshot({ path: 'shots/admin-dashboard-a1-small.png' });

  await page.locator('[data-task="expiring"] button').click();
  await page.getByText('Memberships ending this week').waitFor({ timeout: 5000 }).catch(() => {});
  out.push('"View" opens the expiring list: ' + ((await page.getByText('Memberships ending this week').count()) > 0 ? 'yes' : 'MISSING'));
  return out.join(String.fromCharCode(10));
}
