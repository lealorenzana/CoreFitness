/**
 * 0212 on the platform, against platform-shell-check.js's fixture: What's new
 * lists each note with how many have seen it, and publishes a new one for an app.
 *
 * Playwright runner's `filename` argument, platform dev server on :5175.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'pa', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'pa', aud: 'authenticated', role: 'authenticated', email: 'owner@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  let signedIn = true;
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('out')) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, session]);

  const ym = (back) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return d.toISOString().slice(0, 7) + '-01'; };
  const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  const GYMS = [
    { id: 'g1', name: 'G Fitness', slug: 'core-fitness', status: 'active', plan: 'premium', paid_until: null, lock_reason: null, members: 142,
      staff: 1, created_at: iso(200), last_activity: iso(0), owners: 1, onboarded: true, plan_name: 'Premium', price_monthly: '1999',
      days_left: null, max_members: null, paid_total: '12000', logo_url: 'https://logos.example.test/g-fitness.png', accent: 'violet' },
    { id: 'g2', name: 'Ana gymanigga', slug: 'ferrer-gym', status: 'active', plan: 'trial', paid_until: iso(-5).slice(0, 10), lock_reason: null, members: 1,
      staff: 1, created_at: iso(20), last_activity: iso(5), owners: 1, onboarded: true, plan_name: 'Free trial', price_monthly: '0',
      days_left: 5, max_members: 50, paid_total: '0', logo_url: null, accent: 'rose' },
    { id: 'g3', name: 'Harbour Strength', slug: 'harbour', status: 'active', plan: 'starter', paid_until: iso(9).slice(0, 10), lock_reason: 'overdue', members: 38,
      staff: 2, created_at: iso(90), last_activity: iso(2), owners: 1, onboarded: true, plan_name: 'Starter', price_monthly: '999',
      days_left: -9, max_members: 100, paid_total: '2997' },
  ];
  const NOTES = [];
  const TICKETS = [{ id: 't1', gym_id: 'g2', gym_name: 'Ana gymanigga', subject: 'Receipts will not print', status: 'open', opened_by_name: 'Ana R',
    created_at: iso(1), updated_at: iso(1), last_from: 'gym', unread: true, messages: 1 }];
  const THREAD = [{ id: 'm0', author_name: 'Ana R', from_platform: false, body: 'The print button does nothing on the desk PC.', created_at: iso(1) }];
  const ANNS = [];
  const BILLING = { grace_days: 10, reminder_days: [7, 3, 1], business_name: 'Core Fitness', business_address: 'San Jose, Occidental Mindoro',
    business_email: 'billing@corefitness.test', business_phone: null, receipt_note: 'Thank you.' };
  const SWEEPS = { n: 0 };
  const RPC = {
    platform_gym_contacts: () => [
      { user_id: 'o1', name: 'Gabby Owner', email: 'owner@gfitness.test', phone: '09171234567', role: 'admin', is_owner: true, status: 'active', last_sign_in_at: iso(2), joined_at: iso(200) },
      { user_id: 'd1', name: 'Dee Desk', email: 'desk@gfitness.test', phone: null, role: 'staff', is_owner: false, status: 'active', last_sign_in_at: iso(45), joined_at: iso(100) }],
    platform_gym_weeks: () => Array.from({ length: 26 }, (_, i) => ({ week_start: iso((25 - i) * 7).slice(0, 10), checkins: 20 + i * 3, new_members: i % 3, workouts: 10 + i, payments: '1500' })),
    platform_gym_features: () => [
      { feature: 'checkins', label: 'Check-ins', last_30: 320, ever: 4100 }, { feature: 'rooms', label: 'Coaching room posts', last_30: 12, ever: 40 },
      { feature: 'shop', label: 'Shop sales', last_30: 0, ever: 0 }],
    platform_gym_events: () => [{ id: 9, gym_id: 'g1', action: 'gym.plan', summary: 'G Fitness moved to Premium', detail: null, created_at: iso(30) }],
    platform_gym_payments: () => [{ id: 'gp1', gym_id: 'g1', amount: '1999', paid_on: iso(3).slice(0, 10), covers_from: null, covers_until: iso(-27).slice(0, 10), method: 'GCash', reference: 'R1', note: null, plan_key: 'premium', created_at: iso(3), receipt_no: 'CF-2026-00007' }],
    billing_settings: () => [BILLING],
    set_billing_settings: (b) => { BILLING.grace_days = b.p_grace_days; BILLING.saved = true; return null; },
    billing_reminders_sweep: () => { SWEEPS.n++; return 0; },
    gym_payment_receipt: () => [{ receipt_no: 'CF-2026-00007', amount: '1999', paid_on: iso(3).slice(0, 10), covers_from: null,
      covers_until: iso(-27).slice(0, 10), method: 'GCash', reference: 'R1', plan_name: 'Premium', gym_name: 'G Fitness', gym_address: 'Mamburao',
      business_name: 'Core Fitness', business_address: 'San Jose, Occidental Mindoro', business_email: 'billing@corefitness.test', business_phone: null, receipt_note: 'Thank you.' }],
    platform_capacity: () => [
      { kind: 'database', key: 'postgres', label: 'Database', used: 44 * 1048576, cap: 500 * 1048576 },
      ...['attendance', 'notifications', 'point_ledger', 'achievement_unlocks', 'pt_sessions', 'event_registrations', 'payments', 'bookings']
        .map((t, i) => ({ kind: 'table', key: t, label: t, used: Math.round((848 - i * 80) * 1024), cap: null })),
      { kind: 'bucket', key: 'media', label: 'media', used: 120 * 1048576, cap: null },
      { kind: 'storage', key: 'all', label: 'Storage, every bucket', used: 850 * 1048576, cap: 1024 * 1048576 },
      { kind: 'gym', key: 'g1', label: 'G Fitness', used: 80 * 1048576, cap: null },
      { kind: 'users', key: 'mau', label: 'People signed in, last 30 days', used: 164, cap: 50000 }],
    platform_gym_detail: () => [],
    platform_gym_health: () => [
      { gym_id: 'g3', name: 'Harbour Strength', logo_url: null, accent: 'teal', score: 70, level: 'high',
        reasons: ['No check-ins in 14 days', '9 days past its paid-until date'], checkins_14: 0, usual_14: '12', owner_seen: iso(30) },
      { gym_id: 'g2', name: 'Ana gymanigga', logo_url: null, accent: 'rose', score: 25, level: 'medium',
        reasons: ['Free trial ends in 5 days, nothing paid'], checkins_14: 1, usual_14: '0', owner_seen: iso(5) },
      { gym_id: 'g1', name: 'G Fitness', logo_url: null, accent: 'violet', score: 0, level: 'healthy', reasons: [], checkins_14: 80, usual_14: '75', owner_seen: iso(1) }],
    platform_growth: () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reverse().map((b) => ({ month: ym(b), gyms: 3 - Math.min(2, Math.floor(b / 5)),
      new_gyms: b === 0 ? 1 : 0, lost_gyms: 0, members: 181 - b * 6, revenue: String(b < 6 ? 2998 : 999), mrr: String(b < 6 ? 2998 : 1999) })),
    platform_funnel: () => [{ applied: 6, let_in: 3, set_up: 3, active_30d: 2, paying: 2 }],
    platform_feature_adoption: () => [{ feature: 'checkins', label: 'Check-ins', gyms_30d: 3, gyms_total: 3 }, { feature: 'shop', label: 'Shop', gyms_30d: 1, gyms_total: 3 }],
    platform_gym_people: () => [],
    list_platform_admins: () => [{ user_id: 'pa', email: 'owner@corefitness.test', first_name: 'Lea', last_name: 'Lorenzana', is_me: true }],
    platform_bell: () => [{ kind: 'applications', label: '2 gyms asking to join', count: 2, href: '/applications' },
      { kind: 'support', label: '1 support question waiting', count: 1, href: '/support' }],
    platform_support_tickets: () => TICKETS,
    support_thread: () => THREAD,
    reply_support_ticket: (b) => { THREAD.push({ id: 'm' + THREAD.length, author_name: 'Core Fitness', from_platform: true, body: b.p_body, created_at: new Date().toISOString() });
      TICKETS[0].last_from = 'platform'; TICKETS[0].status = b.p_close ? 'closed' : 'answered'; return null; },
    platform_announcements_list: () => ANNS,
    save_announcement: (b) => { ANNS.unshift({ id: 'an' + ANNS.length, title: b.p_title, body: b.p_body, level: b.p_level, plan_key: b.p_plan_key,
      starts_at: new Date().toISOString(), ends_at: b.p_ends_at, live: true, gyms_reached: 3, dismissed: 0 }); return 'an'; },
    is_platform_admin: () => signedIn,
    platform_overview: () => [{ gyms: 3, gyms_live: 2, gyms_suspended: 0, gyms_locked: 1, gyms_unclaimed: 0, gyms_unset_up: 0,
      members: 181, staff: 4, trainers: 12, checkins_30d: 1420, new_gyms_30d: 1, applications_waiting: 2, crashes_open: 1,
      revenue_this_month: '2998', revenue_all_time: '14997', overdue_gyms: 1 }],
    platform_revenue: () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((b) => ({ month: ym(b), gyms: 2, payments: 2, total: String([2998, 2998, 1999, 1999, 999, 1999, 999, 999, 0, 999, 0, 0][b]) })),
    gyms_due: () => [{ id: 'g3', name: 'Harbour Strength', plan: 'starter', paid_until: iso(9).slice(0, 10), days_left: -9, lock_reason: 'overdue', members: 38 },
      { id: 'g2', name: 'Ana gymanigga', plan: 'trial', paid_until: iso(-5).slice(0, 10), days_left: 5, lock_reason: null, members: 1 }],
    platform_gyms: () => GYMS,
    platform_events_recent: () => [{ id: 1, gym_id: 'g2', action: 'gym.created', summary: 'Ana gymanigga was let in', detail: null, created_at: iso(5) },
      { id: 2, gym_id: 'g1', action: 'payment', summary: 'G Fitness paid ₱1,999 (Premium)', detail: null, created_at: iso(1) }],
    platform_applications: () => [{ id: 'a1', gym_name: 'Iron Temple', owner_name: 'Rico D', email: 'r@x.test', phone: '0917', address: 'Sablayan',
      member_estimate: 80, message: null, status: 'pending', reason: null, gym_id: null, created_at: iso(1) },
      { id: 'a2', gym_name: 'Beach Body', owner_name: 'Mae L', email: 'm@x.test', phone: '0918', address: null, member_estimate: 30,
        message: null, status: 'pending', reason: null, gym_id: null, created_at: iso(0) }],
  };

  // A real picture for G Fitness's logo, so <img> loads rather than falling back.
  const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://logos.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: LOGO }));
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/logout')) { signedIn = false; return route.fulfill({ status: 204, body: '' }); }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn](JSON.parse(req.postData() || '{}')) : []);
    }
    if (path.endsWith('/gym_notes')) {
      if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); NOTES.unshift({ id: 'n' + NOTES.length, gym_id: b.gym_id, body: b.body, pinned: false, created_at: new Date().toISOString() }); return json([], 201); }
      return json(NOTES);
    }
    // The three plans a real service has (0108), with every column the screen reads.
    if (path.endsWith('/platform_plans')) return json([
      { key: 'trial', name: 'Free trial', blurb: 'Thirty days, the whole system, no card.', price_monthly: '0', price_yearly: null, trial_days: 30,
        max_members: null, max_staff: null, max_photos: 100, is_public: true, is_active: true, sort_order: 1 },
      { key: 'starter', name: 'Starter', blurb: 'One gym, everything it needs to run a day.', price_monthly: '999', price_yearly: '9990', trial_days: null,
        max_members: 100, max_staff: 3, max_photos: 100, is_public: true, is_active: true, sort_order: 2 },
      { key: 'premium', name: 'Premium', blurb: 'For a gym that wants the coaching side too.', price_monthly: null, price_yearly: null, trial_days: null,
        max_members: null, max_staff: null, max_photos: null, is_public: true, is_active: true, sort_order: 3 }]);
    if (path.endsWith('/platform_features')) return json(['The front desk', 'QR check-in and the kiosk', 'Classes and bookings', 'Coaches',
      'Points, rewards and challenges', 'Progress and goals', 'The in-app assistant', 'Announcements and push', 'Analytics and retention']
      .map((label, i) => ({ key: 'f' + i, label, description: label, sort_order: i })));
    if (path.endsWith('/platform_plan_features')) return json([{ plan_key: 'trial', feature_key: 'f6', enabled: false }]);
    return json([]);
  });

  const out = [];

  // ── 0212: the platform writes What's new for each app ─────────────────────────────────────────────
  const H = { 'Access-Control-Allow-Origin': '*' };
  const REL = [{ id: 'r1', app: 'admin', title: "What's new in your dashboard", items: ['Lobby TV tab', 'Offline check-ins'], published_at: new Date(Date.now() - 86400e3).toISOString(), seen: 3 }];
  const SAVED = [];
  await page.route('**/rest/v1/rpc/platform_releases', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(REL) }));
  await page.route('**/rest/v1/rpc/platform_save_release', (r) => { const b = JSON.parse(r.request().postData() || '{}'); SAVED.push(b);
    REL.unshift({ id: 'r' + (REL.length + 1), app: b.p_app, title: b.p_title, items: b.p_items, published_at: new Date().toISOString(), seen: 0 });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify('r9') }); });
  const say = (label, ok) => out.push(`${label}: ${ok ? 'yes' : 'MISSING'}`);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('http://localhost:5175/whats-new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  say('the platform has What\'s new, listing each note with how many have seen it', /What's new in your dashboard/.test(body) && /3 seen/.test(body) && /Showing now/.test(body));
  await page.getByLabel('For').selectOption('member');
  await page.getByLabel('Title').fill("What's new in the app");
  await page.getByLabel(/What changed/).fill('Alerts reach your phone straight away.\nBadges can earn points.');
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.waitForTimeout(1000);
  const s = SAVED[0];
  say('publishing sends the app, the title and one line per item', !!s && s.p_app === 'member' && s.p_id === null && s.p_items.length === 2);
  body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  say('…and it is listed, showing now for the member app', /What's new in the app/.test(body));
  await page.screenshot({ path: 'shots/platform-whats-new.png' });
  return out.join('\n');
}
