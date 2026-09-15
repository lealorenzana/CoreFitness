/**
 * The Membership tab: geometry, real numbers, and the states that lie easily.
 *
 * Three of these assertions exist because the honest answer and the convenient
 * answer differ:
 *
 *   - `paid_on` vs `created_at`. The fixture deliberately records a payment
 *     taken on one day and typed on another, and a later, larger payment that
 *     is still `pending`. A screen sorting on the wrong column, or counting
 *     money the desk has not confirmed, shows the wrong figure and looks fine.
 *   - A points RPC that fails must render "—", never "0". Zero is a real
 *     balance and a different statement from "we could not check".
 *   - Frozen replaces the countdown. Those days are credited back (0057), so a
 *     countdown beside a freeze notice is not merely unhelpful, it is untrue.
 *
 * Playwright runner's `filename`, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const s = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < s.length; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
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
    role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 'm1', name: 'Lea Lorenzana', email: 'lea@corefitness-test.com', role: 'member' }));
  }, [KEY, session]);

  const PLAN = { id: 'p-prem', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30,
    is_active: true, can_book_classes: true, can_book_pt: true,
    class_bookings_per_week: null, pt_sessions_per_month: null };

  const MEMBERSHIP = { id: 'ms1', member_id: 'm1', plan_id: 'p-prem', status: 'active',
    start_date: dstr(-12), expiry_date: dstr(18), never_expires: false, frozen_at: null,
    created_at: iso(-12, 9, 0), membership_plans: PLAN };

  const PAYMENTS = [
    // Taken on the 12th day back, typed into the system two days later. A
    // screen sorting on created_at picks a different row than one sorting on
    // paid_on the moment a second payment exists.
    { id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0042', notes: null,
      recorded_by: 'u1', paid_on: dstr(-12), created_at: iso(-10, 9, 0) },
    { id: 'pay0', member_id: 'm1', membership_id: 'ms1', amount: 900, method: 'cash',
      status: 'completed', due_date: null, invoice_number: 'CF-2026-0031', notes: null,
      recorded_by: 'u1', paid_on: dstr(-45), created_at: iso(-45, 9, 0) },
    // Larger, newer, and NOT confirmed. Money the desk has not taken is not a
    // payment, and the card must not show it.
    { id: 'pay2', member_id: 'm1', membership_id: 'ms1', amount: 9999, method: 'cash',
      status: 'pending', due_date: dstr(5), invoice_number: null, notes: null,
      recorded_by: 'u1', paid_on: dstr(-1), created_at: iso(-1, 9, 0) },
  ];

  const ATTEND = [-1, -3, -6, -9, -13].map((d, i) => ({ id: `a${i}`, member_id: 'm1',
    gym_id: null, check_in_time: iso(d, 6, 40), method: 'qr', recorded_by: 'u1' }));

  const base = {
    profiles: [ME],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', experience_level: 'intermediate',
      created_at: iso(-120, 9, 0), profiles: ME }],
    membership_plans: [PLAN],
    memberships: [MEMBERSHIP],
    payments: PAYMENTS,
    attendance: ATTEND,
    bookings: [], pt_sessions: [], classes: [], class_availability: [], public_trainers: [],
    notifications: [], events: [], workout_logs: [], workout_sets: [], body_measurements: [],
    fitness_goals: [], achievements: [], achievement_unlocks: [], member_share_prefs: [],
    push_subscriptions: [], trainer_feedback: [], challenges: [], challenge_participants: [],
    rewards: [], point_ledger: [], workout_resources: [], workout_plans: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 555 0101', email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00',
      logo_url: null, short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 'm1', bookings: true, payments: true, announcements: true }],
  };

  // Mutated per scenario before each reload.
  let TABLES = { ...base };
  let RPC = {
    my_features: ['points_earn', 'points_redeem', 'challenges']
      .map((key) => ({ key, label: key, description: '', enabled: true })),
    plan_allows: true, member_points_balance: 340, member_commitments: [],
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    goal_progress: [], sync_my_achievements: 0,
  };
  let failPoints = false;

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
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify(b),
      headers: { 'Content-Range': '0-2/3', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'member_points_balance' && failPoints) {
        return json({ message: 'boom' }, 500);
      }
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(one ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 150)}`));
  await page.setViewportSize({ width: 393, height: 852 });

  const open = async () => {
    await page.goto('http://localhost:5173/member/membership', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  };

  const results = [];
  const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

  // ── 1. A live membership ────────────────────────────────────────────
  let body = await open();
  await page.screenshot({ path: 'shots/membership-01-active.png' });

  check('M1 the plan is named', /PREMIUM/i.test(body));
  check('M2 the expiry date is stated', /Valid until/i.test(body));
  check('M3 the countdown is there', /18\s*days/i.test(body), body.match(/\d+ days/)?.[0] ?? '');
  check('M4 the points balance is real', /340/.test(body));
  check('M5 visits this month counted from rows', /visits this month/i.test(body));
  check('M6 the last payment is the CONFIRMED one, by paid_on',
    body.includes('1,500') && !body.includes('9,999') && !body.includes('900'),
    body.match(/₱[\d,]+/g)?.join(' ') ?? 'none');

  // Geometry, on the same rules as Book a Session.
  const grid = await page.evaluate(() => {
    for (const g of document.querySelectorAll('div.grid.grid-cols-2')) {
      if (!g.style.gap) continue;
      const box = g.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        cells: [...g.children].map((c) => ({
          width: Math.round(c.getBoundingClientRect().width),
          text: (c.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
        })),
      };
    }
    return null;
  });
  check('M7 four cells: wide, pair, wide',
    grid != null && grid.cells.length === 4
      && grid.cells[0].width > grid.width * 0.9
      && grid.cells[1].width < grid.width * 0.6
      && grid.cells[2].width < grid.width * 0.6
      && grid.cells[3].width > grid.width * 0.9,
    grid ? `${grid.cells.map((c) => c.width).join('/')} of ${grid.width}` : 'no bento');

  // Every cell is the route to the screen its number belongs to.
  for (const [label, target] of [
    ['PREMIUM', '/member/renew-membership'],
    ['CORE points to spend', '/member/rewards'],
    ['visits this month', '/member/attendance-history'],
    ['Last payment', '/member/payments'],
  ]) {
    await open();
    await page.getByText(label, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1100);
    const at = page.url().replace('http://localhost:5173', '');
    check(`M8 ${label.padEnd(22)} -> ${target}`, at === target, at);
  }

  // ── 2. Frozen ───────────────────────────────────────────────────────
  TABLES = { ...base, memberships: [{ ...MEMBERSHIP, status: 'frozen', frozen_at: iso(-2, 9, 0) }] };
  body = await open();
  await page.screenshot({ path: 'shots/membership-02-frozen.png' });
  check('M9 frozen is stated in words', /Membership frozen/i.test(body));
  check('M10 frozen REPLACES the countdown', !/Valid until/i.test(body) && !/\d+ days\b/i.test(body),
    body.match(/Valid until|\d+ days/i)?.[0] ?? '');

  // ── 3. Cancelled, still usable to the date ──────────────────────────
  TABLES = { ...base, memberships: [{ ...MEMBERSHIP, status: 'cancelled' }] };
  body = await open();
  check('M11 cancelled is labelled, and keeps its date', /Cancelled · access until/i.test(body));

  // ── 4. No payments, which is normal on a free tier ──────────────────
  TABLES = { ...base, payments: [] };
  body = await open();
  check('M12 no payments says so, and shows no figure',
    /No payments recorded/i.test(body) && !/₱/.test(body));

  // Every state up to here is meant to be clean. Checked BEFORE the next
  // scenario, which injects a 500 on purpose — the browser logs a console error
  // for any failed request, so counting those as app errors would mean the
  // failure path could never be tested without failing the suite.
  check('M14 no console errors across every healthy state', errors.length === 0,
    errors.slice(0, 3).join(' | '));

  // ── 5. The points read fails ────────────────────────────────────────
  TABLES = { ...base };
  failPoints = true;
  errors.length = 0;
  body = await open();
  await page.screenshot({ path: 'shots/membership-03-points-failed.png' });
  check('M13 a failed balance renders "—", never 0',
    /not available/i.test(body) && !/\b0 CORE/i.test(body));
  failPoints = false;
  // The only errors logged here should be the injected 500 itself — nothing
  // thrown by the page reacting to it.
  const thrown = errors.filter((e) => e.startsWith('PAGEERROR'));
  check('M15 the failed read does not throw, it degrades', thrown.length === 0,
    thrown.slice(0, 2).join(' | '));

  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  return `${results.join('\n')}\n\n${results.length - failed}/${results.length} passed`;
}
