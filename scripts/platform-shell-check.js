/**
 * The platform app's shell (2026-09-27 redesign): signed in as the platform
 * owner, the sidebar with every screen and the applications-waiting badge, the
 * Overview's figures from platform_overview(), the revenue bars, "Needs you",
 * the Gyms rows with their chips — at a full desktop width, edge to edge.
 * Plus the door: signed out, the sign-in screen.
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
  await page.setViewportSize({ width: 1600, height: 950 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Revenue, last 12 months').waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  let t = await text();
  out.push('lands on Overview: ' + (/\/overview$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  out.push('the Core Fitness logo in the sidebar: ' + ((await page.locator('.side img[alt="Core Fitness"]').count()) === 1 ? 'shown' : 'MISSING'));
  out.push('sidebar with every screen: ' + (['Overview', 'Gyms', 'Growth', 'Applications', 'Plans', 'Money', 'Platform'].every((x) => t.includes(x)) ? 'shown' : 'MISSING'));
  out.push('support badge: ' + ((await page.getByLabel('1 support waiting').count()) === 1 ? '1' : 'MISSING'));
  out.push('the bell: ' + ((await page.getByRole('button', { name: '3 things need you' }).count()) === 1 ? '3' : 'MISSING'));
  out.push('applications badge: ' + ((await page.getByLabel('2 waiting').count()) === 1 ? '2' : 'MISSING'));
  out.push('the figures: ' + (/Gyms live 2/i.test(t) && /181/.test(t) && /₱2,998/.test(t) && /1,420/.test(t) ? 'shown' : 'MISSING'));
  out.push('needs you: ' + (/2 gyms asking to join/.test(t) && /Harbour Strength is 9 days overdue/.test(t) && /Ana gymanigga is due in 5 days/.test(t) ? 'shown' : 'MISSING'));
  out.push('an at-risk gym in Needs you: ' + (/Harbour Strength may be leaving/.test(t) ? 'shown' : 'MISSING'));
  out.push('revenue bars: ' + ((await page.locator('.bar').count()) === 12 ? '12 months' : 'MISSING'));
  const fill = await page.evaluate(() => { const m = document.querySelector('.main'); return m ? Math.round(m.getBoundingClientRect().width) : 0; });
  out.push('fills the window: ' + (fill >= 1600 - 260 ? `${fill}px main column` : 'MISSING ' + fill));
  await page.screenshot({ path: 'shots/platform-overview.png' });

  await page.getByRole('link', { name: 'Gyms', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push("a gym's own logo: " + ((await page.getByAltText('G Fitness logo').count()) === 1 ? 'shown' : 'MISSING'));
  out.push('no logo: initials, never the Core Fitness mark: ' + ((await page.getByRole('img', { name: 'Ana gymanigga, no logo yet' }).count()) === 1 ? 'AG' : 'MISSING'));
  out.push('at-risk tag on the row: ' + (/At risk: No check-ins in 14 days/.test(t) && /Watch: Free trial ends in 5 days/.test(t) ? 'shown' : 'MISSING'));
  out.push('gyms with chips: ' + (/142 members/.test(t) && /9 days late/.test(t) && /Overdue — read-only/.test(t) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-gyms.png' });

  await page.getByRole('button', { name: 'G Fitness, open' }).click();
  await page.getByRole('button', { name: 'Open its full page' }).click();
  await page.waitForTimeout(1200);
  t = await text();
  out.push("a gym's own page: " + (/\/gyms\/g1$/.test(page.url()) && /Who runs it/i.test(t) && /What it uses/i.test(t) && /Payments to Core Fitness/i.test(t) ? 'opened' : 'MISSING ' + page.url()));
  out.push('contacts to reach: ' + (/owner@gfitness\.test/.test(t) && /09171234567/.test(t) && /signed in 2 days ago/.test(t) ? 'shown' : 'MISSING'));
  out.push('26 weeks of use: ' + ((await page.locator('.bar').count()) === 26 ? 'charted' : 'MISSING ' + (await page.locator('.bar').count())));
  out.push('features used, and not: ' + (/Coaching room posts/.test(t) && /Not used yet: Shop sales/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel('New note').fill('Owner prefers calls after 6pm');
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.waitForTimeout(800);
  out.push('a private note: ' + (NOTES.length === 1 && /Owner prefers calls after 6pm/.test(await text()) ? 'saved' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-gym-profile.png', fullPage: true });

  await page.getByRole('link', { name: 'Plans' }).first().click();
  await page.locator('.plan-card').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const pl = await page.evaluate(() => {
    const grid = document.querySelector('.plan-grid').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.plan-card')].map((c) => c.getBoundingClientRect());
    const text = document.querySelector('.plan-grid').innerText;
    return { spare: Math.round(grid.right - Math.max(...cards.map((c) => c.right))), n: cards.length,
      twice: /Talk to us[\s\S]*Price not decided/.test(text), foot: [...document.querySelectorAll('.plan-foot')].length };
  });
  out.push('plans fill the row, one price each, actions at the foot: ' + (pl.n === 3 && pl.spare < 4 && !pl.twice && pl.foot === 3 ? 'yes' : 'MISSING ' + JSON.stringify(pl)));
  out.push('a plan without a price says so once: ' + (/Talk to us/.test(await text()) && /Unlocks 8 of 9/i.test(await text()) ? 'yes, and unlocks are counted' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-plans.png' });

  for (const [nav, shot, expect] of [['Growth', 'growth', /MRR/], ['Applications', 'apps', /Iron Temple/], ['Plans', 'plans', /Plans/], ['Money', 'money', /Money/], ['Platform', 'health', /Platform/]]) {
    await page.getByRole('link', { name: nav }).first().click();
    await page.waitForTimeout(900);
    out.push(`${nav} renders in the shell: ` + (expect.test(await text()) && (await page.locator('.side').count()) === 1 ? 'yes' : 'MISSING'));
    await page.screenshot({ path: `shots/platform-${shot}.png` });
  }

  await page.getByRole('button', { name: '3 things need you' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('link', { name: /1 support question waiting/ }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('bell leads to Support: ' + (/\/support$/.test(page.url()) && /Receipts will not print/.test(t) && /waiting for you/.test(t) ? 'yes' : 'MISSING ' + page.url()));
  await page.getByRole('button', { name: /Receipts will not print/ }).click();
  await page.waitForTimeout(700);
  out.push('the thread: ' + (/The print button does nothing/.test(await text()) ? 'shown' : 'MISSING'));
  await page.getByLabel('Reply').fill('Try Chrome — we are fixing Edge.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('a reply: ' + (THREAD.length === 2 && /Try Chrome/.test(t) && /Nothing waiting for you/.test(t) ? 'sent, and it leaves the waiting list' : 'MISSING'));
  out.push('badge clears after the reply: ' + ((await page.getByLabel('1 support waiting').count()) === 0 ? 'yes' : 'STALE'));
  await page.screenshot({ path: 'shots/platform-support.png' });

  await page.getByRole('link', { name: 'Announcements' }).click();
  await page.waitForTimeout(900);
  await page.getByLabel('Title').fill('Maintenance tonight');
  await page.getByLabel('Message').fill('The service pauses 10–11pm.');
  await page.getByLabel('Kind').selectOption('warning');
  await page.getByLabel('Who').selectOption('premium');
  await page.getByRole('button', { name: 'Announce' }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('an announcement: ' + (ANNS.length === 1 && ANNS[0].plan_key === 'premium' && ANNS[0].level === 'warning' && /Maintenance tonight/.test(t) && /Gyms on Premium · 3 reached/.test(t) ? 'sent to Premium gyms' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-announcements.png' });

  // 0138: billing rules, receipts, capacity.
  out.push('the platform sweeps reminders on load: ' + (SWEEPS.n >= 1 ? 'yes' : 'MISSING'));
  await page.getByRole('link', { name: 'Money' }).click();
  await page.getByText('Billing rules and receipts').waitFor({ timeout: 10000 });
  t = await text();
  out.push("Money uses the platform's grace period: " + (/read-only 10 days after its date/.test(t) && /read-only in 2 more/.test(t) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Receipt' }).click();
  await page.getByRole('document', { name: 'Receipt CF-2026-00007' }).waitFor({ timeout: 5000 });
  t = await text();
  out.push('a printable receipt: ' + (/San Jose, Occidental Mindoro/.test(t) && /₱1,999\.00/.test(t) && /Received from G Fitness/.test(t) ? 'CF-2026-00007' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-receipt.png' });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Days before read-only').fill('14');
  await page.getByRole('button', { name: 'Save billing rules' }).click();
  await page.waitForTimeout(600);
  out.push('billing rules save: ' + (BILLING.saved && BILLING.grace_days === 14 ? 'grace 14' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-money.png', fullPage: true });
  await page.getByRole('link', { name: 'Capacity' }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('capacity against the free tier: ' + (/44\.0 MB/.test(t) && /850\.0 MB/.test(t) && /83% used/.test(t) && /Past 80%/.test(t) && /G Fitness/.test(t) ? 'shown, storage flagged' : 'MISSING'));
  // The rows once collapsed into one line of text over fat bars (their CSS was lost): a bar sits under its text, rows stay rows.
  const cap = await page.evaluate(() => [...document.querySelectorAll('.cap-row')].map((r) => {
    const name = r.querySelector('.cap-name').getBoundingClientRect(), bar = r.querySelector('.cap-bar').getBoundingClientRect();
    return { under: bar.top >= name.bottom - 1, h: r.getBoundingClientRect().height, barH: bar.height };
  }));
  out.push('capacity rows laid out: ' + (cap.length === 10 && cap.every((c) => c.under && c.h < 60 && c.barH <= 8) ? '10 rows, bars under their names' : 'MISSING ' + JSON.stringify(cap.slice(0, 3))));
  await page.screenshot({ path: 'shots/platform-capacity.png' });


  // Ctrl+K: find anything.
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search everything').waitFor({ timeout: 5000 });
  await page.getByLabel('Search everything').fill('harb');
  await page.waitForTimeout(400);
  out.push('Ctrl+K finds a gym: ' + ((await page.getByRole('option', { name: /Harbour Strength/ }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  out.push('Enter opens its page: ' + (/\/gyms\/g3$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  await page.getByRole('button', { name: /Find anything/ }).click();
  await page.getByLabel('Search everything').fill('receipts');
  await page.waitForTimeout(400);
  out.push('it finds a support ticket: ' + ((await page.getByRole('option', { name: /Receipts will not print/ }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.getByLabel('Search everything').fill('capac');
  await page.waitForTimeout(200);
  out.push('and a screen: ' + ((await page.getByRole('option', { name: /Capacity/ }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-palette.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  out.push('Esc closes it: ' + ((await page.getByLabel('Search everything').count()) === 0 ? 'yes' : 'MISSING'));

  // CSV: the file a click gives, and the rules that make it safe to open in Excel.
  await page.getByRole('link', { name: 'Gyms', exact: true }).click();
  await page.waitForTimeout(700);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  let csv = '';
  for await (const chunk of await dl.createReadStream()) csv += chunk.toString('utf8');
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r\n/);
  out.push('gyms CSV: ' + (/^core-fitness-gyms-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()) && lines.length === 4
    && lines[0].startsWith('Gym,Address,Status') && csv.charCodeAt(0) === 0xFEFF ? `${lines.length - 1} gyms` : 'MISSING ' + dl.suggestedFilename() + ' ' + lines.length));
  const rules = await page.evaluate(async () => {
    const { toCsv } = await import('/src/lib/csv.ts');
    return toCsv([{ a: '=HYPERLINK("x")', b: 'Say "hi", ok', c: -5, d: null }],
      [['A', (r) => r.a], ['B', (r) => r.b], ['C', (r) => r.c], ['D', (r) => r.d]]);
  });
  out.push('CSV rules: ' + (rules.includes(`"'=HYPERLINK(""x"")"`) && rules.includes('"Say ""hi"", ok"') && rules.includes(',-5,') ? 'formula guarded, quotes escaped, numbers kept' : 'MISSING ' + JSON.stringify(rules)));

  await page.getByRole('link', { name: 'Growth' }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('growth: MRR, ARR, the at-risk list: ' + (/₱2,998/.test(t) && /₱35,976/.test(t) && /9 days past its paid-until date/.test(t) ? 'shown' : 'MISSING'));
  out.push('growth: funnel and adoption: ' + (/Paying/.test(t) && /1 of 3 gyms/.test(t) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-growth.png' });
  // No dead space (2026-09-28): on every screen the lowest box reaches the bottom of the content area.
  const dead = () => page.evaluate(() => {
    const c = document.querySelector('.content');
    const top = c.getBoundingClientRect().top - c.scrollTop;
    const inner = c.scrollHeight - parseFloat(getComputedStyle(c).paddingBottom);
    let max = 0;
    const seen = (e) => {
      if (/^(IMG|SVG|CANVAS|INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(e.tagName)) return true;
      if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
      const s = getComputedStyle(e);
      return (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0;
    };
    for (const e of c.querySelectorAll('.page *')) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.width > 0 && seen(e)) max = Math.max(max, r.bottom - top); }
    return { gap: Math.round(inner - max), scrolls: c.scrollHeight > c.clientHeight + 1, wide: c.scrollWidth > c.clientWidth + 1 };
  });
  const gaps = [];
  for (const [nav, path] of [['Overview', '/overview'], ['Gyms', '/gyms'], ['Growth', '/growth'], ['Applications', '/applications'], ['Support', '/support'],
    ['Announcements', '/announcements'], ['Capacity', '/capacity'], ['Plans', '/plans'], ['Money', '/money'], ['Platform', '/platform'], ["a gym's page", '/gyms/g1']]) {
    await page.goto('http://localhost:5175' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1300);
    const d = await dead();
    if (d.gap > 24 || d.wide || (path === '/overview' && d.scrolls)) {
      gaps.push(nav + ': ' + d.gap + 'px empty' + (d.wide ? ', scrolls sideways' : '') + (path === '/overview' && d.scrolls ? ', does not fit' : ''));
    }
    await page.screenshot({ path: 'shots/fill' + path.replace(/\//g, '-') + '.png' });
  }
  out.push('no dead space on any screen: ' + (gaps.length === 0 ? '11 screens filled' : 'MISSING ' + gaps.join('; ')));

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.evaluate(() => sessionStorage.setItem('out', '1'));
  await page.waitForTimeout(1200);
  out.push('signed out, the door: ' + (/Every gym on the service/.test(await text()) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-door.png' });
  return out.join('\n');
}
