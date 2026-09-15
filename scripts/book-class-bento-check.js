/**
 * Book a Session, measured rather than admired.
 *
 * The bento is a claim about geometry — one wide cell at the head of each day,
 * square cells under it, and never a half-width hole at the bottom — and none
 * of that is something a build can check. `col-span-2` has emitted no CSS in
 * this app before, and a span that quietly does nothing leaves a grid that is
 * merely ugly rather than broken, so it would ship.
 *
 * So this measures real `getBoundingClientRect()` widths on the real screen,
 * against a routed network and a planted session. It also photographs the
 * three states worth looking at.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });

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
  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana',
      email: 'lea@corefitness-test.com', role: 'member' }));
  }, [KEY, session]);

  // A capped plan, so the weekly ring has a denominator to draw.
  const PLAN = { id: 'p-std', name: 'Free Plan', tier: 'basic', price: 0, duration_days: 30,
    is_active: true, description: 'Three classes a week.', can_book_classes: true,
    can_book_pt: true, class_bookings_per_week: 3, pt_sessions_per_month: 2 };

  // Deliberately uneven days: 4 classes (feature + 2 squares + a widened tail),
  // then 1 (feature alone), then 3 (feature + an even pair).
  const CLASSES = [
    { id: 'c1', name: 'Morning Strength', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Main floor', class_type: 'strength', scheduled_at: iso(1, 7, 0), duration_minutes: 60, created_at: iso(-9, 9, 0) },
    { id: 'c2', name: 'HIIT Express', trainer_id: 't2', level: 'intermediate', capacity: 16,
      location: 'Studio', class_type: 'cardio', scheduled_at: iso(1, 9, 30), duration_minutes: 45, created_at: iso(-9, 9, 0) },
    { id: 'c3', name: 'Mobility and Core', trainer_id: 't1', level: 'beginner', capacity: 10,
      location: 'Studio', class_type: 'mobility', scheduled_at: iso(1, 17, 0), duration_minutes: 40, created_at: iso(-9, 9, 0) },
    { id: 'c4', name: 'Evening Conditioning', trainer_id: 't3', level: 'advanced', capacity: 14,
      location: 'Main floor', class_type: 'conditioning', scheduled_at: iso(1, 19, 0), duration_minutes: 50, created_at: iso(-9, 9, 0) },
    { id: 'c5', name: 'Saturday Circuit', trainer_id: 't2', level: 'all_levels', capacity: 20,
      location: 'Main floor', class_type: 'circuit', scheduled_at: iso(2, 8, 0), duration_minutes: 60, created_at: iso(-9, 9, 0) },
    { id: 'c6', name: 'Beginner Barbell', trainer_id: 't1', level: 'beginner', capacity: 8,
      location: 'Platform', class_type: 'strength', scheduled_at: iso(3, 7, 0), duration_minutes: 60, created_at: iso(-9, 9, 0) },
    { id: 'c7', name: 'Lunchtime Cardio', trainer_id: 't3', level: 'all_levels', capacity: 15,
      location: 'Studio', class_type: 'cardio', scheduled_at: iso(3, 12, 0), duration_minutes: 30, created_at: iso(-9, 9, 0) },
    { id: 'c8', name: 'Stretch and Recover', trainer_id: 't2', level: 'all_levels', capacity: 12,
      location: 'Studio', class_type: 'mobility', scheduled_at: iso(3, 18, 0), duration_minutes: 45, created_at: iso(-9, 9, 0) },
  ];

  // Real column names: the view is class_id / capacity / booked_count. Keyed on
  // `id` the map never matches and every class reads "0 booked", which is the
  // sort of fixture bug that gets reported as an app bug.
  const AVAIL = [
    { class_id: 'c1', capacity: 12, booked_count: 7 },
    { class_id: 'c2', capacity: 16, booked_count: 16 },   // full
    { class_id: 'c3', capacity: 10, booked_count: 8 },    // 2 left, amber
    { class_id: 'c4', capacity: 14, booked_count: 3 },
    { class_id: 'c5', capacity: 20, booked_count: 11 },
    { class_id: 'c6', capacity: 8, booked_count: 1 },
    { class_id: 'c7', capacity: 15, booked_count: 6 },
    { class_id: 'c8', capacity: 12, booked_count: 4 },
  ];

  // Three coaches: an odd count, so the last cell of the PT grid must widen.
  const TRAINERS = [
    { id: 't1', first_name: 'Kenji', last_name: 'Ramos', photo_url: null,
      specialization: 'Strength and conditioning', bio: 'Ten years coaching, mostly barbells.',
      availability: null, years_experience: 10, certifications: ['NASM-CPT'], focus_areas: ['Strength'], achievements: null },
    { id: 't2', first_name: 'Tere', last_name: 'Bautista', photo_url: null,
      specialization: 'Cardio and circuits', bio: null, availability: null,
      years_experience: 6, certifications: null, focus_areas: null, achievements: null },
    { id: 't3', first_name: 'Ariel', last_name: 'Domingo', photo_url: null,
      specialization: 'Mobility', bio: null, availability: null,
      years_experience: 4, certifications: null, focus_areas: null, achievements: null },
  ];

  const TABLES = {
    profiles: [ME],
    member_profiles: [{ profile_id: 'm1', gym_id: null, qr_code: 'm1', experience_level: 'intermediate',
      interests: ['strength'], terms_accepted_at: iso(-120, 9, 2), created_at: iso(-120, 9, 0), profiles: ME }],
    membership_plans: [PLAN],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p-std', status: 'active',
      start_date: dstr(-12), expiry_date: dstr(18), never_expires: false, frozen_at: null,
      created_at: iso(-12, 9, 0), membership_plans: PLAN }],
    classes: CLASSES,
    class_availability: AVAIL,
    public_trainers: TRAINERS,
    // One booking this week, so the ring reads 1/3 rather than an empty gauge.
    bookings: [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved',
      requested_at: iso(-1, 10, 0), approved_at: iso(-1, 11, 0), rejected_at: null,
      decided_by: 't1', decided_by_role: 'trainer', decided_at: iso(-1, 11, 0), classes: CLASSES[0] }],
    pt_sessions: [],
    // Two fixture traps, both already paid for once: the column is
    // `day_of_week` (computeOpenSlots filters on it, and `weekday` silently
    // matches nothing, so the coach reads as having no hours at all), and
    // slot_minutes is NOT NULL with a CHECK in 0015 — omit it and the screen
    // says "NaN".
    trainer_availability: [0, 1, 2, 3, 4, 5, 6].map((d, i) => ({ id: `ta${i}`, trainer_id: 't1',
      day_of_week: d, start_time: '08:00', end_time: '12:00', slot_minutes: 60, is_active: true })),
    trainer_busy_slots: [],
    events: [{ id: 'e1', title: 'Barangay fun run', description: 'Five kilometres along the bay.',
      starts_at: iso(6, 5, 30), location: 'Mamburao plaza', capacity: 50, is_published: true,
      image_url: null, created_at: iso(-20, 9, 0) }],
    notifications: [], attendance: [], payments: [], workout_logs: [], workout_sets: [],
    body_measurements: [], fitness_goals: [], achievements: [], achievement_unlocks: [],
    member_share_prefs: [], push_subscriptions: [], notification_prefs: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 555 0101', email: 'hello@corefitness.ph', opening_time: '06:00',
      closing_time: '21:00', logo_url: null, short_name: 'CF', tagline: null,
      activity_options: ['Strength', 'Cardio', 'Mobility'], updated_at: iso(0, 9, 0), updated_by: null }],
  };

  const RPC = {
    my_features: ['workout_tracker', 'plan_builder', 'points_earn', 'challenges']
      .map((key) => ({ key, label: key, description: '', enabled: true })),
    plan_allows: true, member_commitments: [], member_points_balance: 0,
    member_progression: [{ level: 2, points: 90, next_level_points: 300 }],
    sync_my_achievements: 0,
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
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-7/8', 'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range' } });

    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
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

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 140)}`));

  await page.setViewportSize({ width: 393, height: 852 });

  const settle = async () => {
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };

  /**
   * Every bento on screen, as the widths of its cells.
   *
   * Identified by the inline gap the `Bento` primitive sets, which the tab
   * strip's `grid-cols-2 gap-1` does not have — matching on the class alone
   * would count the tabs as a bento and make the first assertion meaningless.
   */
  const grids = () => page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll('div.grid')) {
      if (!g.style.gap) continue;
      const box = g.getBoundingClientRect();
      out.push({
        width: Math.round(box.width),
        right: Math.round(box.right),
        // How many columns the browser actually resolved. A class name that
        // emitted no CSS reports "none" here rather than two tracks, which is
        // the failure this whole file exists to catch.
        cols: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length,
        cells: [...g.children].map((c) => {
          const b = c.getBoundingClientRect();
          return {
            width: Math.round(b.width),
            right: Math.round(b.right),
            text: (c.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
          };
        }),
      });
    }
    return out;
  });

  const results = [];
  const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

  // ── 1. Group classes ────────────────────────────────────────────────
  await page.goto('http://localhost:5173/member/book-class', { waitUntil: 'domcontentloaded' });
  await settle();
  await page.screenshot({ path: 'shots/bento-01-classes.png', fullPage: true });

  const body1 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const all = await grids();

  // Found by content, not by position — the shortcut grid now sits above it,
  // and an index would quietly assert the wrong grid.
  const head = all.find((g) => g.cells.some((c) => /classes (booked )?this week/i.test(c.text)));
  check('B1 header bento has two cells side by side',
    head != null && head.cells.length >= 2 && head.cells[0].width < head.width * 0.6,
    head ? `cells ${head.cells.map((c) => c.width).join('/')} of ${head.width}` : 'no grid');
  check('B2 weekly allowance reads 1/3 from real bookings', body1.includes('1/3'),
    body1.includes('1/3') ? '' : 'not found');
  check('B3 coaches cell counts the roster', /3\s*coaches/i.test(body1));
  check('B4 next event still surfaced', body1.toLowerCase().includes('barangay fun run'));

  // The six training shortcuts. They were a scrolling rail whose last two chips
  // sat off the right edge; the whole point of the grid is that nothing is cut,
  // so that is what gets measured — every tile's right edge inside the grid's.
  const SHORTCUTS = ['Progress', 'My bookings', 'Training plan', 'Free workouts', 'Challenges', 'Events'];
  const shortcuts = all.find((g) => g.cells.length === 6 && /Progress/.test(g.cells[0].text));
  check('B20 the six shortcuts are one grid of six', shortcuts != null,
    all.map((g) => `${g.cells.length}@${g.cols}col`).join(' '));
  if (shortcuts) {
    check('B21 three across, resolved by the browser', shortcuts.cols === 3, `${shortcuts.cols} columns`);
    check('B22 nothing runs past the right edge',
      shortcuts.cells.every((c) => c.right <= shortcuts.right + 1),
      `grid ends ${shortcuts.right}, widest tile ends ${Math.max(...shortcuts.cells.map((c) => c.right))}`);
    const gone = SHORTCUTS.filter((n) => !shortcuts.cells.some((c) => c.text.includes(n)));
    check('B23 all six destinations survived the rail', gone.length === 0, gone.join(', '));
  }

  // The day grids. Day one has four classes: feature, two squares, widened tail.
  const dayGrids = all.filter((g) => g.cols === 2
    && g.cells.some((c) => /Book|Full|Busy|Confirmed|Pending/.test(c.text)));
  const four = dayGrids.find((g) => g.cells.length === 4);
  check('B5 a four-class day renders four cells', four != null, `${dayGrids.length} day grids`);
  if (four) {
    const [f, a, b, tail] = four.cells;
    check('B6 the day feature spans both columns', f.width > four.width * 0.9, `${f.width} of ${four.width}`);
    check('B7 the middle pair are squares', a.width < four.width * 0.6 && b.width < four.width * 0.6,
      `${a.width} / ${b.width}`);
    check('B8 the odd tail widens rather than leaving a hole', tail.width > four.width * 0.9,
      `${tail.width} of ${four.width}`);
  }
  const one = dayGrids.find((g) => g.cells.length === 1);
  check('B9 a single-class day is one full-width cell',
    one != null && one.cells[0].width > one.width * 0.9,
    one ? `${one.cells[0].width} of ${one.width}` : 'not found');

  // Nothing lost in the move from rows to tiles.
  const names = ['Morning Strength', 'HIIT Express', 'Mobility and Core', 'Evening Conditioning',
    'Saturday Circuit', 'Beginner Barbell', 'Lunchtime Cardio', 'Stretch and Recover'];
  const missing = names.filter((n) => !body1.includes(n));
  check('B10 every class still on screen', missing.length === 0, missing.join(', '));
  check('B11 a full class says so and names the denominator', /Full · 16\/16/.test(body1));
  check('B12 the booked class keeps its own state', /CONFIRMED|Confirmed/.test(body1));
  check('B13 location survives the narrower tile', body1.includes('Platform'));

  // The timetable itself is below the fold, and `fullPage` does not reach it:
  // this shell scrolls inside <main> at 100dvh, so the page never grows.
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) m.scrollTop = 470;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/bento-01b-timetable.png' });
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) m.scrollTop = 1100;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/bento-01c-timetable.png' });

  // ── 2. Personal training: the coach grid ────────────────────────────
  await page.getByRole('tab', { name: /personal training/i }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/bento-02-coaches.png', fullPage: true });
  const ptGrids = await grids();
  const coaches = ptGrids.find((g) => g.cols === 2 && g.cells.length === 3 && /Kenji/.test(g.cells[0].text));
  check('B14 three coaches render as a bento', coaches != null,
    ptGrids.map((g) => g.cells.length).join(','));
  if (coaches) {
    check('B15 the odd coach takes the full width',
      coaches.cells[0].width < coaches.width * 0.6 && coaches.cells[2].width > coaches.width * 0.9,
      `${coaches.cells.map((c) => c.width).join('/')} of ${coaches.width}`);
  }

  // ── 3. A coach's open times ─────────────────────────────────────────
  await page.getByText('Kenji Ramos').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/bento-03-slots.png', fullPage: true });
  const body3 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('B16 open times still load for a coach',
    /\d{1,2}:\d{2}\s?(AM|PM)/i.test(body3) && /min/.test(body3), body3.slice(0, 160));

  // ── 4. Refused: the amber cell, and every Book disabled ─────────────
  // Registered after the catch-all, so it wins — Playwright tries the most
  // recently added route first. A frozen membership is not usable (0017), and
  // the block has to be legible here rather than only at the desk.
  await page.route(`**://${REF}.supabase.co/rest/v1/memberships*`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range' },
    body: JSON.stringify([{ ...TABLES.memberships[0], status: 'frozen', frozen_at: iso(-2, 9, 0) }]),
  }));
  await page.goto('http://localhost:5173/member/book-class', { waitUntil: 'domcontentloaded' });
  await settle();
  await page.screenshot({ path: 'shots/bento-04-blocked.png' });
  const body4 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('B18 a frozen membership says so, here, in words', /frozen/i.test(body4), body4.slice(0, 90));
  const blocked = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => /^(book|locked)$/i.test((b.innerText || '').trim()))
    .map((b) => ({ label: b.innerText.trim(), off: b.disabled })));
  check('B19 every class control is refused, none still says Book',
    blocked.length > 0 && blocked.every((b) => b.off && /locked/i.test(b.label)),
    blocked.map((b) => `${b.label}:${b.off}`).slice(0, 4).join(' '));

  check('B17 no console errors anywhere in the flow', errors.length === 0, errors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  return `${results.join('\n')}\n\n${results.length - failed}/${results.length} passed`;
}
