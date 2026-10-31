/**
 * 0225 in the admin app: Settings → My profile → Delete my account. The only
 * owner of an open gym is told to ask Core Fitness to close it or hand it over,
 * with no button; a second owner can (typed confirmation, then signed out with
 * the 7 days said); signing in while it waits opens only "Keep my account".
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'ana@anafitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => { if (!location.search.includes('deleted=1')) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, session]);

  let ROLE = 'admin';
  const DEL = { pending: null, blocked: 'You own Ana Fitness. Ask Core Fitness to close the gym or hand it to another owner first — then its members are told and can switch.' };
  const ERASE = new Date(Date.now() + 7 * 86400000).toISOString();
  const CALLS = [];
  let SUS = null;
  const me = () => ({ id: 'u2', role: ROLE, status: 'active', first_name: 'Ana', last_name: 'Lisa',
    email: 'ana@anafitness.test', phone: '09093498899', photo_url: null, created_at: new Date().toISOString() });

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/logout')) { CALLS.push(['logout']); return route.fulfill({ status: 204, body: '', headers: { 'Access-Control-Allow-Origin': '*' } }); }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_platform_suspension') return json(SUS);
      if (fn === 'my_account_deletion') return json({ pending: DEL.pending, blocked: DEL.blocked });
      if (fn === 'request_account_deletion') { CALLS.push(['request']); DEL.pending = { requested_at: new Date().toISOString(), erase_after: ERASE }; return json(ERASE); }
      if (fn === 'cancel_account_deletion') { CALLS.push(['cancel']); DEL.pending = null; return json(true); }
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-a', gym_name: 'Ana Fitness', slug: 'ana-gym', role: ROLE,
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') return json(one ? me() : [me()]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1280, height: 800 });
  const open = async (p) => {
    await page.goto(`http://localhost:5174${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  };

  await open('/settings?tab=profile');
  const sec = page.locator('[data-delete-account]');
  await sec.waitFor({ timeout: 15000 }).catch(() => {});
  out.push('the only owner of an open gym is told to ask Core Fitness first, with no button: ' + ((await page.locator('[data-delete-blocked]').count()) === 1
    && /close the gym or hand it to another owner/.test(await sec.innerText()) && (await sec.getByRole('button', { name: /Delete my account/ }).count()) === 0 ? 'yes' : 'MISSING'));

  // A second owner can (the gym still has an owner).
  DEL.blocked = null;
  await open('/settings?tab=profile');
  await sec.waitFor({ timeout: 15000 }).catch(() => {});
  await sec.getByRole('button', { name: /Delete my account/ }).click();
  const confirm = page.locator('[data-delete-confirm]');
  out.push('a second owner can; it waits for DELETE to be typed: ' + (await confirm.isDisabled() ? 'yes' : 'NO'));
  await page.locator('[data-delete-type]').fill('DELETE');
  await confirm.click();
  await page.waitForURL(/\/admin\/login\?deleted=1/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  out.push('confirmed: asked, signed out, and the sign-in screen says the 7 days: ' + (CALLS.some((c) => c[0] === 'request') && CALLS.some((c) => c[0] === 'logout')
    && (await page.locator('[data-deleted-note]').count()) === 1 ? 'yes' : 'MISSING ' + JSON.stringify(CALLS) + ' ' + page.url()));

  await open('/dashboard');
  const pend = page.locator('[data-deletion-pending]');
  out.push('signed in while it waits, only Keep my account opens: ' + ((await pend.count()) === 1 && (await page.locator('aside nav').count()) === 0 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-deletion-pending.png' });
  await page.locator('[data-keep-account]').click();
  await page.waitForTimeout(1500);
  out.push('Keep my account cancels it and the app opens: ' + (CALLS.some((c) => c[0] === 'cancel') && (await pend.count()) === 0 ? 'yes' : 'MISSING'));
  // 0226: suspended by Core Fitness — only the suspension opens, with the reason.
  SUS = { reason: 'Payments reported as fraudulent by two gyms.', suspended_at: new Date().toISOString() };
  await open('/dashboard');
  const sus = page.locator('[data-platform-suspended]');
  out.push('suspended by Core Fitness: only that opens, with the reason: ' + ((await sus.count()) === 1 && /fraudulent/.test(await sus.innerText())
    && (await page.locator('aside nav').count()) === 0 ? 'yes' : 'MISSING'));
  return out.join('\n');
}
