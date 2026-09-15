/**
 * Back goes back.
 *
 * The complaint was concrete: open Progress from the Training grid, press back,
 * land on Home — a screen you were never on. So this walks the route a member
 * walks rather than reading the handler, and does it for all three screens that
 * had the same hardcoded target.
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
  const TABLES = {
    profiles: [ME],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', experience_level: 'intermediate',
      training_focus: 'cutting', created_at: iso(-120, 9, 0), profiles: ME }],
    membership_plans: [PLAN],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p-prem', status: 'active',
      start_date: dstr(-12), expiry_date: dstr(18), never_expires: false, frozen_at: null,
      created_at: iso(-12, 9, 0), membership_plans: PLAN }],
    events: [{ id: 'e1', title: 'Barangay fun run', description: 'Five kilometres.',
      starts_at: iso(6, 5, 30), location: 'Mamburao plaza', capacity: 50, is_published: true,
      image_url: null, created_at: iso(-20, 9, 0) }],
    gym_plans: [], classes: [], class_availability: [], public_trainers: [], bookings: [],
    pt_sessions: [], attendance: [], workout_logs: [], workout_sets: [], body_measurements: [],
    fitness_goals: [], achievements: [], achievement_unlocks: [], member_share_prefs: [],
    notifications: [], payments: [], push_subscriptions: [], workout_resources: [],
    workout_plans: [], challenges: [], challenge_participants: [], trainer_feedback: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: '+63 917 555 0101', email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00',
      logo_url: null, short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 'm1', bookings: true, payments: true, announcements: true }],
  };
  const RPC = {
    my_features: ['workout_tracker', 'plan_builder', 'points_earn', 'challenges']
      .map((key) => ({ key, label: key, description: '', enabled: true })),
    plan_allows: true, member_points_balance: 0, member_commitments: [],
    member_progression: [{ level: 2, points: 90, next_level_points: 300 }],
    goal_progress: [], sync_my_achievements: 0,
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
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn] : null); }
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

  await page.setViewportSize({ width: 393, height: 852 });
  const settle = async () => {
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1300);
  };
  const at = () => page.url().replace('http://localhost:5173', '');

  const out = [];

  // Reached from the Training grid, which is how a member gets to all three.
  for (const tile of ['Progress', 'Events', 'Training plan']) {
    await page.goto('http://localhost:5173/member/book-class', { waitUntil: 'domcontentloaded' });
    await settle();
    const t = page.getByRole('button', { name: tile, exact: true }).first();
    if (!(await t.count())) { out.push(`FAIL  ${tile}: no tile on Book a Session`); continue; }
    await t.click();
    await page.waitForTimeout(1300);
    const landed = at();
    // The round back button at the top left of the screen we just opened.
    await page.locator('button').first().click();
    await page.waitForTimeout(1000);
    const back = at();
    out.push(`${back === '/member/book-class' ? 'PASS' : 'FAIL'}  ${tile.padEnd(14)} ${landed.padEnd(24)} back -> ${back}`);
  }

  // A cold load has nothing behind it, so back must fall to Home rather than
  // leaving the app. This is the case the `history.length` guard exists for.
  await page.goto('http://localhost:5173/member/progress', { waitUntil: 'domcontentloaded' });
  await settle();
  const deep = await page.evaluate(() => window.history.length);
  out.push(`(cold load into /member/progress: history.length ${deep})`);

  const failed = out.filter((l) => l.startsWith('FAIL')).length;
  out.push('');
  out.push(`${out.filter((l) => l.startsWith('PASS')).length} passed, ${failed} failed`);
  return out.join('\n');
}
