/**
 * The attendance redesign and the door (0200, 2026-10-18): Today fits the
 * screen with one check-in box, the tag chips, "At the door" (kiosk, lobby
 * TV, coaches in), and a log saying how each check-in was taken and whose
 * activity tag it carries; a coach's code checks the coach in (desk and
 * kiosk); History has its own search (name or code), This year / All time,
 * and "See all" opens a side panel instead of growing the page; Walk-ins has
 * the three steps and the guests who keep coming; Settings has the switches.
 * Admin dev server on :5174. Screenshots to shots/door-*.png.
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
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const mid = (i) => `a${i}a00000-0000-4000-8000-00000000000${i}`;
  const NAMES = [['Andrea', 'Santos'], ['Andrea', 'Tolentino'], ['Carlo', 'Bautista'], ['Mika', 'Ramos'], ['Rhea', 'Cruz'], ['Leo', 'Navarro'], ['Ivy', 'Aquino'], ['Bea', 'Reyes'], ['Hans', 'Lim']];
  const members = NAMES.map(([f, l], i) => ({ id: mid(i), role: 'member', status: 'active', first_name: f, last_name: l,
    email: `${f.toLowerCase()}.${l.toLowerCase()}@door-test.com`, phone: null, photo_url: null, created_at: iso(-200 + i) }));
  const COACH = 'c1ab0001-0000-4000-8000-000000000001';
  const PLANS = [{ id: 'p1', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true }];
  const TABLES = {
    profiles: [admin, ...members],
    member_profiles: members.map((m) => ({ profile_id: m.id, gym_id: 'gym-1', qr_code: m.id, experience_level: 'beginner', created_at: m.created_at, profiles: m })),
    membership_plans: PLANS,
    // Bea Reyes (7): her plan ended three days ago, so the desk cannot check her in. Hans Lim (8): his ends in two days.
    memberships: members.map((m, i) => ({ id: `ms${i}`, member_id: m.id, plan_id: 'p1', status: i === 7 ? 'expired' : 'active', start_date: day(-20),
      expiry_date: i === 7 ? day(-3) : i === 8 ? day(2) : day(20), never_expires: false, frozen_at: null, created_at: iso(-20),
      // Rhea Cruz (4) is on a second plan, for the list's Plan filter.
      membership_plans: i === 4 ? { id: 'p2', name: 'Monthly', price: 900, duration_days: 30, tier: 'premium', is_active: true } : PLANS[0] })),
    attendance: [
      { id: 'a1', member_id: mid(0), check_in_time: iso(0, 8, 41), method: 'qr', activity: 'Class', activity_by: 'member', source: 'kiosk' },
      { id: 'a2', member_id: mid(2), check_in_time: iso(0, 8, 30), method: 'qr', activity: 'Cardio', activity_by: 'desk', source: 'desk' },
      { id: 'a3', member_id: mid(3), check_in_time: iso(0, 7, 5), method: 'manual', activity: null, activity_by: null, source: 'desk' },
      ...Array.from({ length: 40 }, (_, k) => ({ id: `h${k}`, member_id: mid(k % 9), check_in_time: iso(-1 - (k % 20), 6 + (k % 10)), method: k % 3 ? 'qr' : 'manual', activity: k % 2 ? 'Gym floor' : null })),
    ],
    checkin_picks: [{ member_id: mid(1), today: 'Class', today_on: day(0), usual: 'Class' }],
    gym_settings: [{ id: true, gym_id: 'gym-1', gym_name: 'Core Fitness Lab', // The Lab's real list (2026-10-18): thirty chips in four rows pushed the log off the screen.
      activity_options: ['Gym floor', 'Class', 'Cardio', 'Strength', 'Free Weights', 'Weight Machines', 'Bodyweight', 'Treadmill', 'Stationary Bike', 'Elliptical',
        'Rowing', 'Jump Rope', 'HIIT', 'Circuit Training', 'Functional Training', 'Core & Abs', 'Group Class', 'Zumba', 'Aerobics', 'Yoga', 'Pilates',
        'Spinning', 'Dance', 'Boxing', 'Muay Thai', 'Martial Arts', 'Stretching & Mobility', 'Sports', 'Personal Training', 'Other'], closing_time: '21:00:00',
      member_activity_pick: true, coach_checkin_on: true, day_pass_on: true, day_pass_price: 150, pack5_price: 650, pack10_price: null, guest_nudge_visits: 3, day_pass_classes: false, updated_at: iso(-2), updated_by: null }],
    gyms: [{ id: 'gym-1', created_at: iso(-30) }],
    payments: [], notifications: [], bookings: [], gym_invitations: [], classes: [],
    // One confirmed 1-on-1 an hour from now, with Leo Navarro (not in yet): the rail's Coming up today.
    pt_sessions: [{ id: 's1', starts_at: new Date(Date.now() + 3600000).toISOString(), duration_minutes: 60, member_id: mid(5), trainer_id: COACH, status: 'approved' }],
  };
  const COACHES = [
    { trainer_id: COACH, first_name: 'Gabby', last_name: 'Coach', photo_url: null, checked_in_at: null, checkin_id: null },
    { trainer_id: 'c2ab0002-0000-4000-8000-000000000002', first_name: 'Paolo', last_name: 'Dizon', photo_url: null, checked_in_at: iso(0, 6, 12), checkin_id: 'cc2' },
    { trainer_id: 'c3ab0003-0000-4000-8000-000000000003', first_name: 'Jen', last_name: 'Lacsamana', photo_url: null, checked_in_at: null, checkin_id: null },
  ];
  const CALLS = [];
  const RPC = {
    my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [],
    guest_visits_on: [{ id: 'v1', guest_id: 'g1', name: 'Rico Abad', phone: '09175550111', kind: 'day', amount: 150, method: 'cash', visited_at: iso(0, 10, 21), voided: false, visits_left: 0 }],
    frequent_guests: [{ guest_id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visits: 4, spent: 520, last_visit: day(-3) }],
    find_guest: [{ id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visits_left: 3, visits_this_month: 3, last_visit: day(-3) }],
    guest_visits_between: [
      { id: 'hv1', guest_id: 'g2', name: 'Lyn Soriano', phone: '0917 555 0102', visit_day: day(-1), visited_at: iso(-1, 8, 2), kind: 'day', amount: 150, method: 'online', voided: false, recorded_by_name: 'Gabby Desk' },
      { id: 'hv2', guest_id: 'g3', name: 'Jules Tan', phone: null, visit_day: day(-2), visited_at: iso(-2, 17, 40), kind: 'day', amount: 150, method: 'cash', voided: false, recorded_by_name: 'Gabby Desk' },
      { id: 'hv3', guest_id: 'g1', name: 'Rico Abad', phone: '09175550111', visit_day: day(-3), visited_at: iso(-3, 9, 0), kind: 'pack5', amount: 650, method: 'cash', voided: true, recorded_by_name: 'Lea Lorenzana' },
    ],
    record_guest_visit: [{ guest_id: 'g2', visits_left: 2, amount: 0, visits_this_month: 4, suggest_membership: true }],
  };

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
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* GET */ }
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'door_coaches') return json(COACHES);
      if (fn === 'record_coach_checkin') {
        const c = COACHES.find((x) => x.trainer_id === body.p_trainer);
        if (c) { c.checked_in_at = new Date().toISOString(); c.checkin_id = 'new'; }
        return json([{ id: 'new', check_in_time: new Date().toISOString(), first_name: c?.first_name ?? null }]);
      }
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET') { CALLS.push([`${req.method()} ${t}`, req.postData()]); return json([], 201); }
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        let m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
        m = /^gte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) >= m[1]);
        m = /^lte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) <= m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  const BAD = /Something went wrong|Couldn'?t load|Could not load|Failed to load|is not a function|Cannot read prop|NaN|\[object Object\]|Invalid Date|undefined/;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const has = (label, ok) => out.push(`  ${label}: ${ok ? 'yes' : 'MISSING'}`);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const noScroll = async () => page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight : 999; });
  const visit = async (path, shot) => {
    errs.length = 0;
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    const t = await text();
    const bad = BAD.exec(t);
    out.push(`${path}: ${bad ? 'ERROR TEXT "' + t.slice(Math.max(0, bad.index - 40), bad.index + 60) + '"' : 'renders'}${errs.length ? ' | PAGE ERROR ' + errs.join(' || ') : ''}`);
    if (shot) await page.screenshot({ path: `shots/door-${shot}.png` });
    return t;
  };
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── Check-ins (mock-up D, 2026-11-27): one list of every member, search narrows it, Check in on each row ──
  let t = await visit('/attendance', 'today');
  has('the page fits the screen (no page scroll)', (await noScroll()) <= 2);
  has('one desk box: the search, a Tag menu with every activity, and Scan QR', (await page.locator('[data-att-desk]').count()) === 1 && (await page.locator('[data-scan-qr]').count()) === 1
    && (await page.locator('[data-tag-select] option').count()) === 31 && await page.locator('[data-tag-picker]').evaluate((e) => e.getBoundingClientRect().height < 50));
  has('one amber button on the page (Scan QR); the door buttons are plain', (await page.locator('.a-btn.amber:visible').count()) === 1
    && (await page.getByRole('button', { name: 'Open kiosk' }).count()) === 1 && (await page.getByRole('button', { name: 'Open lobby TV' }).count()) === 1);
  has('the kiosk says what it did today, never a "Running" it cannot know', /1 today · last/.test(await page.locator('[data-kiosk-status]').innerText()) && !/Running/.test(t));
  has('the newest check-in shows, with Undo, before anyone is checked in here', /Andrea Santos is in/.test(await page.locator('[data-last-checkin]').innerText()));
  has('the coaches who are in', /1 of 3 in/.test(t) && /Paolo/.test(t));
  has('the list: who is in today first, then everyone not in yet', (await page.locator('[data-att-list] tr[data-in]').count()) === 3 && (await page.locator('[data-not-in-head]').count()) === 1
    && await page.locator('[data-att-list] tbody tr').first().evaluate((r) => r.hasAttribute('data-in')) && (await page.locator('[data-att-list] [data-check-in]').count()) >= 1);
  has('the tabs count everyone, in today and not in yet', /Everyone\s*9/.test(await page.locator('[data-show="all"]').innerText()) && /In today\s*3/.test(await page.locator('[data-show="in"]').innerText())
    && /Not in yet\s*6/.test(await page.locator('[data-show="out"]').innerText()));
  has('the rows say Kiosk / Desk scan / Typed, and whose tag it is', /Kiosk/.test(t) && /Desk scan/.test(t) && /Typed/.test(t)
    && (await page.locator('[data-tag-by="member"]').count()) === 1 && (await page.locator('[data-tag-by="desk"]').count()) === 1);
  has("a member whose plan ended shows why, with no Check in", /Plan ended/.test(await page.locator('[data-att-list] tr', { hasText: 'Bea Reyes' }).innerText())
    && (await page.locator('[data-att-list] tr', { hasText: 'Bea Reyes' }).locator('[data-check-in]').count()) === 0);
  has('the three figures: today vs last week, walk-ins with the drawer, the week as a share of active members (never past 100%)', /Checked in today/.test(t)
    && (await page.locator('[data-vs-last-week]').count()) === 1 && /Walk-ins today/.test(t) && /₱150 in the drawer/.test(t)
    && /\d+ of \d+ active members came, (\d|[1-9]\d|100)%/.test(await page.locator('[data-fig-week]').innerText()) && /open until 9:00/.test(t));
  has('no gradient behind the figures', await page.locator('[data-fig-today]').evaluate((e) => getComputedStyle(e).backgroundImage === 'none'));
  has('Plans ending soon: the plan ending in two days and the one that ended, each with Renew', (await page.locator('[data-ending-row]').count()) === 2
    && /Hans Lim/.test(await page.locator('[data-plans-ending]').innerText()) && /ends in 2 days/.test(await page.locator('[data-plans-ending]').innerText())
    && /Bea Reyes/.test(await page.locator('[data-plans-ending]').innerText()) && (await page.locator('[data-plans-ending]').getByRole('button', { name: 'Renew' }).count()) === 2);
  has("Coming up today: the 1-on-1 session, and whether the member is in", (await page.locator('[data-up-session]').count()) === 1 && /Leo Navarro/.test(await page.locator('[data-coming-up]').innerText())
    && /Not in yet/.test(await page.locator('[data-up-session]').innerText()));
  const box = page.getByLabel('Check-in code or name');
  // The 2026-10-18 report: one character matched nearly every member (it searched inside each full id).
  await box.fill('1'); await page.waitForTimeout(300);
  has('one digit matches nobody by their id, says so, and the page does not grow', (await page.locator('[data-no-match]').count()) === 1 && (await noScroll()) <= 2);
  await box.fill('a'); await page.waitForTimeout(300);
  has('one letter matches names that start with it, in the list itself; whoever can be checked in comes first', (await page.locator('[data-att-list] tbody tr').count()) === 3
    && await page.locator('[data-att-list] tbody tr').first().evaluate((r) => r.hasAttribute('data-out')) && /3\s*found/.test(await page.locator('[data-found]').innerText()) && (await noScroll()) <= 2);
  await box.fill('Andrea'); await page.waitForTimeout(300);
  t = await text();
  has("typing finds members, with the member's own pick, and who is already in", /Andrea Tolentino/.test(t) && /picked Class/.test(t) && (await page.locator('[data-att-list] tr[data-in]').count()) === 1);
  const before = CALLS.length;
  await box.press('Enter'); await page.waitForTimeout(400);
  has('Enter with two matches checks nobody in', !CALLS.slice(before).some(([f]) => /attendance|check_?in/.test(f)));
  await box.press('Escape'); await page.waitForTimeout(200);
  has('Esc clears the search and the whole list comes back', (await box.inputValue()) === '' && (await page.locator('[data-not-in-head]').count()) === 1);
  await box.fill('Gabby'); await page.waitForTimeout(300);
  has('…coaches show too, marked Coach', (await page.locator('[data-quick-coach]').count()) === 1);
  await box.fill('C1A B00');
  await box.press('Enter'); await page.waitForTimeout(900);
  const cc = CALLS.find(([f]) => f === 'record_coach_checkin');
  has("a coach's typed code checks the coach in, at the desk", !!cc && cc[1].p_trainer === COACH && cc[1].p_source === 'desk' && cc[1].p_method === 'manual');
  has('…and says so with an Undo', (await page.locator('[data-last-checkin]').count()) === 1 && /Gabby Coach is in/.test(await text()));
  await page.locator('[data-tag-select]').selectOption('Yoga'); await page.waitForTimeout(200);
  has('a tag for the next check-in shows while set', await page.locator('[data-tag-picker]').evaluate((e) => e.classList.contains('on')));
  await page.locator('[data-tag-select]').selectOption(''); await page.waitForTimeout(150);
  has('…and None clears it', await page.locator('[data-tag-picker]').evaluate((e) => !e.classList.contains('on')));
  await page.locator('[data-coaches-row]').click(); await page.waitForTimeout(500);
  has('the coaches row opens the coaches, with Check in / Undo', (await page.locator('[data-coaches-sheet] > div').count()) === 3);
  await page.screenshot({ path: 'shots/door-coaches.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  has('the table header is solid, so a scrolled row never shows through', await page.locator('[data-att-list] thead th').first().evaluate((th) => getComputedStyle(th).backgroundImage !== 'none' || getComputedStyle(th).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  has('no View all window any more (the list is the log)', (await page.locator('[data-open-full-log]').count()) === 0);
  await page.locator('[data-plan-select]').selectOption('Monthly'); await page.waitForTimeout(300);
  has('Plan filters the whole list to that plan', (await page.locator('[data-att-list] tbody tr:not([data-not-in-head])').count()) === 1 && /Rhea Cruz/.test(await page.locator('[data-att-list] tbody').innerText()));
  await page.locator('[data-plan-select]').selectOption('all'); await page.waitForTimeout(200);
  await page.locator('[data-way-select]').selectOption('desk'); await page.waitForTimeout(300);
  has('How filters to that way of checking in', (await page.locator('[data-att-list] tbody tr').count()) === 1 && /Carlo Bautista/.test(await page.locator('[data-att-list] tbody').innerText()));
  await page.locator('[data-way-select]').selectOption('all');
  await page.locator('[data-show="out"]').click(); await page.waitForTimeout(300);
  has('Not in yet shows only those not in, A to Z', (await page.locator('[data-att-list] tr[data-in]').count()) === 0 && (await page.locator('[data-att-list] tr[data-out]').count()) === 6);
  await page.locator('[data-show="all"]').click();
  // The export window (owner, 2026-11-27): Export shows the file first; columns and rows can be unticked; CSV or Excel.
  const readDl = async (dl) => { const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c); return Buffer.concat(chunks); };
  await page.locator('[data-att-desk]').getByRole('button', { name: 'Export' }).click(); await page.waitForTimeout(500);
  let xw = page.locator('[data-export-window]');
  has('Export opens the export window: every column ticked, every row previewed', (await xw.count()) === 1 && (await xw.locator('[data-export-col]').count()) === 9
    && (await xw.locator('[data-export-row]').count()) === 3 && /3\s*of\s*3 rows/.test(await xw.locator('[data-export-summary]').innerText()));
  await page.screenshot({ path: 'shots/door-export-window.png' });
  await xw.locator('[data-export-col="By"]').uncheck();
  await xw.locator('[data-export-row] input').first().uncheck(); await page.waitForTimeout(150);
  has('…unticking a column and a row changes what it shows and counts', /2\s*of\s*3 rows/.test(await xw.locator('[data-export-summary]').innerText())
    && /8\s*of\s*9 columns/.test(await xw.locator('[data-export-summary]').innerText()) && !(await xw.locator('thead th').allInnerTexts()).includes('By'));
  let [dl] = await Promise.all([page.waitForEvent('download'), xw.locator('[data-export-download]').click()]);
  const csv = (await readDl(dl)).toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  has('…and the CSV holds exactly that: 2 rows, no By column', /\.csv$/.test(dl.suggestedFilename()) && csv.length === 3 && !csv[0].split(',').includes('By') && csv[0].split(',').includes('Member')
    && !csv.slice(1).some((l) => l.includes('Andrea Santos')) && (await page.locator('[data-export-window]').count()) === 0);
  await page.locator('[data-att-desk]').getByRole('button', { name: 'Export' }).click(); await page.waitForTimeout(500);
  xw = page.locator('[data-export-window]');
  has('…a new export starts with everything ticked again', /3\s*of\s*3 rows/.test(await xw.locator('[data-export-summary]').innerText()));
  await xw.locator('[data-format="xlsx"]').click();
  [dl] = await Promise.all([page.waitForEvent('download'), xw.locator('[data-export-download]').click()]);
  const xl = await readDl(dl);
  has('Excel writes a real .xlsx workbook', /\.xlsx$/.test(dl.suggestedFilename()) && xl[0] === 0x50 && xl[1] === 0x4b);
  await page.locator('[data-plans-ending]').getByRole('button', { name: 'Renew' }).first().click(); await page.waitForTimeout(400);
  has('Renew opens that member on Members', /\/members\?open=/.test(page.url()));

  // ── History ──
  t = await visit('/attendance-history', 'history');
  has('presets include This year and All time', /This year/.test(t) && /All time/.test(t));
  has('the search lives in the Check-ins box', (await page.locator('[data-history-log] [data-history-search]').count()) === 1);
  const beforeH = await page.evaluate(() => document.querySelector('main')?.scrollHeight ?? 0);
  await page.locator('[data-see-all-regulars]').click(); await page.waitForTimeout(500);
  const afterH = await page.evaluate(() => document.querySelector('main')?.scrollHeight ?? 0);
  has('See all opens a side panel and the page does not grow', (await page.locator('[data-regulars-sheet] button').count()) === 9 && Math.abs(afterH - beforeH) < 4);
  await page.screenshot({ path: 'shots/door-regulars.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('[data-history-search] input').fill(mid(5).slice(0, 6).toUpperCase()); await page.waitForTimeout(300);
  const names = await page.locator('[data-history-log] tbody tr').allInnerTexts();
  has("searching by a member's code finds only theirs", names.length > 0 && names.every((r) => r.includes('Leo Navarro')));

  // ── Walk-ins ──
  t = await visit('/attendance/walk-ins', 'walkins');
  has('Walk-ins fits the screen', (await noScroll()) <= 2);
  has('three steps and the drawer', /Who is it\?/.test(t) && /What are they paying for\?/.test(t) && /How did they pay\?/.test(t) && /₱150 cash in the drawer/.test(t));
  has('the rail cards never overlap (they do not shrink; the rail scrolls)', await page.evaluate(() => {
    const kids = [...document.querySelectorAll('[data-walkins-rail] > *')].map((e) => e.getBoundingClientRect());
    return kids.length >= 4 && kids.every((r, i) => i === 0 || r.top >= kids[i - 1].bottom - 1);
  }));
  await page.locator('[data-walkin-guide-open]').click(); await page.waitForTimeout(500);
  has('the guide opens in a side panel, with its table', /Walk-in at the desk/.test(await page.locator('[data-walkin-guide]').innerText().catch(() => '')));
  await page.screenshot({ path: 'shots/door-walkins-guide.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  has('guests who keep coming, with a call link', /Guests who could join/.test(t) && (await page.locator('[data-regular-guests] a[href^="tel:"]').count()) === 1);
  await page.getByLabel('Guest phone').fill('0917 555 0102');
  await page.locator('[data-guest-found]').waitFor({ timeout: 5000 });
  await page.locator('[data-walkin-option]', { hasText: 'Use a pack visit' }).click();
  has('the membership nudge shows before the visit is recorded', (await page.locator('[data-walkin-tip]').count()) === 1);
  await page.locator('[data-record-visit]').click(); await page.waitForTimeout(700);
  const rv = CALLS.filter(([f]) => f === 'record_guest_visit').pop();
  has('recording spends a pack visit for the found guest', !!rv && rv[1].p_guest === 'g2' && rv[1].p_kind === 'pack_visit');
  await page.getByLabel('Guest phone').fill('');
  await page.getByLabel('Guest name').fill('Ben Reyes');
  await page.locator('[data-walkin-option]', { hasText: 'Day pass' }).click();
  await page.locator('button[aria-pressed]', { hasText: 'Online' }).click();
  await page.locator('[data-record-visit]').click(); await page.waitForTimeout(700);
  const rv2 = CALLS.filter(([f]) => f === 'record_guest_visit').pop();
  has('a new guest pays online for a day pass', !!rv2 && rv2[1].p_name === 'Ben Reyes' && rv2[1].p_kind === 'day' && rv2[1].p_method === 'online');
  // "about 20 seconds" (a mock-up's caption, true of nothing) is gone; the name stays required (the owner, 2026-10-18).
  has('no made-up "about 20 seconds"', !/about 20 seconds/.test(await text()));
  await page.getByLabel('Guest name').fill('');
  await page.locator('[data-walkin-option]', { hasText: 'Day pass' }).click();
  has('a new walk-in still needs a name', !(await page.locator('[data-record-visit]').isEnabled()) && /Type their name/.test(await page.locator('[data-record-visit]').innerText()));
  await page.locator('[data-open-walkin-history]').click(); await page.waitForTimeout(700);
  const hw = page.locator('[data-walkin-history]');
  const hc = CALLS.filter(([f]) => f === 'guest_visits_between').pop();
  has('Past walk-ins floats over the page, the last 30 days by default', (await hw.count()) === 1 && !!hc && (await hw.locator('[data-walkin-history-row]').count()) === 3);
  const ht = (await hw.innerText()).replace(/\s+/g, ' ');
  has('…with names, what, how paid and who recorded it', /Lyn Soriano/.test(ht) && /Jules Tan/.test(ht) && /Online/.test(ht) && /Gabby Desk/.test(ht) && /Voided/.test(ht));
  has('…and the totals, voids left out', /2 visits · ₱300 · cash ₱150 · online ₱150 · 1 voided/.test(ht));
  await hw.getByPlaceholder('Name or phone…').fill('0102'); await page.waitForTimeout(250);
  has('…searchable by phone', (await hw.locator('[data-walkin-history-row]').count()) === 1);
  await page.screenshot({ path: 'shots/door-walkin-history.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // ── Kiosk: a coach's QR ──
  await visit('/kiosk', null);
  await page.getByLabel('Check-in code').fill(`CFC1.${Date.now().toString(36)}.${COACHES[2].trainer_id}`.toUpperCase());
  await page.getByLabel('Check-in code').press('Enter'); await page.waitForTimeout(1500);
  const kc = CALLS.filter(([f]) => f === 'record_coach_checkin').pop();
  has("the kiosk checks a coach in from their QR, as the kiosk", !!kc && kc[1].p_trainer === COACHES[2].trainer_id && kc[1].p_source === 'kiosk' && /Welcome, Coach Jen/.test(await text()));
  await page.screenshot({ path: 'shots/door-kiosk.png' });

  // ── Settings: the owner's switches ──
  await visit('/settings?tab=checkin', null);
  await page.locator('[data-door-settings]').scrollIntoViewIfNeeded().catch(() => undefined);
  has('Settings has both switches', (await page.locator('[data-door-switch]').count()) === 2);
  await page.locator('[data-door-switch="coachCheckin"] input').click(); await page.waitForTimeout(500);
  const ds = CALLS.filter(([f]) => f === 'set_door_settings').pop();
  has('turning coach check-in off saves only that switch', !!ds && ds[1].p_coach_checkin === false && ds[1].p_member_pick === null);

  return out.join(String.fromCharCode(10));
}
