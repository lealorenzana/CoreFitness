/**
 * An invitation is a login (0202), on the dashboard. A front-desk login the
 * owner invited signs in on the real login form and is sent to its first-sign-in
 * screen — its own password and its name — before any page; finishing it calls
 * complete_invitation and lands on the dashboard. And the front desk can sign
 * in at all: the login screen used to send anyone but an owner away ("This
 * account does not have admin access") although the route guard lets staff in.
 *
 * Admin dev server on :5174. Screenshots shots/admin-invite-*.png.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const TOKEN = 'b'.repeat(64);
  const U = { id: 'd2020000-0000-4000-8000-000000000001', email: 'lea.desk@invite-test.com' };
  let meta = {};
  let finished = false;
  let ctx = [];
  const sessionNow = () => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: U.id, aud: 'authenticated', role: 'authenticated', email: U.email, app_metadata: {}, user_metadata: meta },
  });
  const CALLS = [];
  const staffCtx = [{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'staff', status: 'active', lock_reason: null, short_name: null,
    logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
    if (path.startsWith('/auth/v1/user') && req.method() === 'PUT') { CALLS.push(['updateUser', body]); meta = { ...meta, ...(body.data ?? {}) }; return json(sessionNow().user); }
    if (path.startsWith('/auth/v1/token')) {
      if (req.url().includes('grant_type=password')) CALLS.push(['signIn', body]);
      if (finished) meta = { must_change_password: false };
      return json(sessionNow());
    }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? sessionNow().user : sessionNow());
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      CALLS.push([fn, body]);
      if (fn === 'my_invitation') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', logo_url: null, role: 'staff', state: 'waiting',
        first_name: 'Lea', last_name: 'Cruz', phone: null, email: U.email }]);
      if (fn === 'complete_invitation') { finished = true; ctx = staffCtx; return json([{ gym_id: 'gym-1', role: 'staff' }]); }
      if (fn === 'my_gym_context') return json(ctx);
      if (fn === 'my_gyms') return json(ctx.map((c) => ({ ...c, gym_status: 'active' })));
      return json(['my_gym_modules', 'my_announcements', 'my_gym_features', 'my_applications'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: U.id, first_name: 'Lea', last_name: 'Cruz', email: U.email, role: 'staff', status: 'active', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const has = (label, ok, detail = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + detail}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 1400, height: 900 });
  const signIn = async () => {
    await page.goto('http://localhost:5174/admin/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('http://localhost:5174/admin/login', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Email address').fill(U.email);
    await page.getByPlaceholder('Password').fill('one-time-pass');
    await page.locator('button[type="submit"]').click();
  };

  // ── The invited front desk ──
  meta = { invite_pending: true, invite_token: TOKEN, must_change_password: true };
  ctx = [];
  await signIn();
  await page.locator('[data-finish-invite]').waitFor({ timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
  has('signing in with the emailed login goes to the first-sign-in screen', page.url().endsWith(`/admin/invite/${TOKEN}`), page.url());
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  has('…which asks for their own password and their name, for the front desk', /Welcome to Core Fitness Lab/.test(t) && /Front desk/.test(t)
    && (await page.getByLabel('New password').count()) === 1 && (await page.locator('input[autocomplete="given-name"]').inputValue()) === 'Lea');
  await page.screenshot({ path: 'shots/admin-invite-staff.png' });
  await page.goto('http://localhost:5174/attendance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  has('a dashboard page cannot be reached around it', page.url().endsWith(`/admin/invite/${TOKEN}`), page.url());
  await page.getByLabel('New password').fill('desk-pass-2026');
  await page.getByLabel('Confirm password').fill('desk-pass-2026');
  await page.getByRole('button', { name: /Join Core Fitness Lab/ }).click();
  await page.waitForURL(/\/admin\/dashboard|\/dashboard/, { timeout: 10000 }).catch(() => {});
  const pw = CALLS.find(([f]) => f === 'updateUser');
  const done = CALLS.find(([f]) => f === 'complete_invitation');
  has('their password first, then complete_invitation with their name', !!pw && pw[1].password === 'desk-pass-2026' && !!done && done[1].p_token === TOKEN
    && done[1].p_first === 'Lea' && CALLS.indexOf(pw) < CALLS.indexOf(done), JSON.stringify(done?.[1]));
  has('…and the dashboard', /dashboard/.test(page.url()), page.url());

  // ── An ordinary front-desk account ──
  meta = {}; finished = false; ctx = staffCtx; CALLS.length = 0;
  await signIn();
  await page.waitForURL(/dashboard/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  has('the front desk can sign in (the login screen used to turn staff away)', /dashboard/.test(page.url())
    && !/does not have admin access/.test(await page.locator('body').innerText()), page.url());

  has('no page errors', errs.length === 0, errs.join(' | '));
  return out.join('\n');
}
