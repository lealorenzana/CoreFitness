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
  const RPC = {
    platform_gym_contacts: () => [
      { user_id: 'o1', name: 'Gabby Owner', email: 'owner@gfitness.test', phone: '09171234567', role: 'admin', is_owner: true, status: 'active', last_sign_in_at: iso(2), joined_at: iso(200) },
      { user_id: 'd1', name: 'Dee Desk', email: 'desk@gfitness.test', phone: null, role: 'staff', is_owner: false, status: 'active', last_sign_in_at: iso(45), joined_at: iso(100) }],
    platform_gym_weeks: () => Array.from({ length: 26 }, (_, i) => ({ week_start: iso((25 - i) * 7).slice(0, 10), checkins: 20 + i * 3, new_members: i % 3, workouts: 10 + i, payments: '1500' })),
    platform_gym_features: () => [
      { feature: 'checkins', label: 'Check-ins', last_30: 320, ever: 4100 }, { feature: 'rooms', label: 'Coaching room posts', last_30: 12, ever: 40 },
      { feature: 'shop', label: 'Shop sales', last_30: 0, ever: 0 }],
    platform_gym_events: () => [{ id: 9, gym_id: 'g1', action: 'gym.plan', summary: 'G Fitness moved to Premium', detail: null, created_at: iso(30) }],
    platform_gym_payments: () => [{ id: 'gp1', gym_id: 'g1', amount: '1999', paid_on: iso(3).slice(0, 10), covers_from: null, covers_until: iso(-27).slice(0, 10), method: 'GCash', reference: 'R1', note: null, plan_key: 'premium', created_at: iso(3) }],
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
      return json(fn in RPC ? RPC[fn]() : []);
    }
    if (path.endsWith('/gym_notes')) {
      if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); NOTES.unshift({ id: 'n' + NOTES.length, gym_id: b.gym_id, body: b.body, pinned: false, created_at: new Date().toISOString() }); return json([], 201); }
      return json(NOTES);
    }
    if (path.endsWith('/platform_plans')) return json([{ key: 'premium', name: 'Premium', is_active: true, sort_order: 1 }]);
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

  await page.getByRole('button', { name: 'G Fitness' }).click();
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

  for (const [nav, shot, expect] of [['Growth', 'growth', /MRR/], ['Applications', 'apps', /Iron Temple/], ['Plans', 'plans', /Plans/], ['Money', 'money', /Money/], ['Platform', 'health', /Platform/]]) {
    await page.getByRole('link', { name: nav }).first().click();
    await page.waitForTimeout(900);
    out.push(`${nav} renders in the shell: ` + (expect.test(await text()) && (await page.locator('.side').count()) === 1 ? 'yes' : 'MISSING'));
    await page.screenshot({ path: `shots/platform-${shot}.png` });
  }

  await page.getByRole('link', { name: 'Growth' }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('growth: MRR, ARR, the at-risk list: ' + (/₱2,998/.test(t) && /₱35,976/.test(t) && /9 days past its paid-until date/.test(t) ? 'shown' : 'MISSING'));
  out.push('growth: funnel and adoption: ' + (/Paying/.test(t) && /1 of 3 gyms/.test(t) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-growth.png' });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.evaluate(() => sessionStorage.setItem('out', '1'));
  await page.waitForTimeout(1200);
  out.push('signed out, the door: ' + (/Every gym on the service/.test(await text()) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-door.png' });
  return out.join('\n');
}
