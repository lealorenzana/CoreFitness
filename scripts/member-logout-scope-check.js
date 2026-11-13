/**
 * Log out ends THIS device only (2026-11-14). supabase-js signs out 'global' by default, which revoked
 * every session of the account: logging out on the computer sent the phone to the sign-in page at its
 * next token refresh ("Refresh Token Not Found" in the auth logs) — the owner's "random" logouts.
 * Settings → Log out must call /auth/v1/logout?scope=local; "Log out on all devices" scope=global.
 * Both buttons and both confirmations are checked in light and dark.
 *
 * Member dev server on :5173. Screenshots to output/logout-scope-<mode>.png.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = () => ({ id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'mia@example.test', app_metadata: { providers: ['email'] }, user_metadata: {}, identities: [] });
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: user(),
  };
  await page.addInitScript(([k, s]) => { if (!location.pathname.startsWith('/login') && location.pathname !== '/') localStorage.setItem(k, JSON.stringify(s)); }, [KEY, session]);
  const LOGOUTS = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const path = u.pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/logout')) { LOGOUTS.push(u.searchParams.get('scope') ?? '(none)'); return route.fulfill({ status: 204, body: '', headers: { 'Access-Control-Allow-Origin': '*' } }); }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: 'member', status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };

  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    // Log out → this phone only
    await go('/member/settings');
    const here = page.getByRole('button', { name: /^\s*Log out\s*$/ }).first();
    const all = page.locator('[data-logout-everywhere]').first();
    out.push(`${mode}: both buttons shown: ` + ((await here.count()) === 1 && (await all.count()) === 1 ? 'yes' : 'MISSING'));
    await page.screenshot({ path: `output/logout-scope-${mode}.png`, fullPage: false });
    const before = LOGOUTS.length;
    await here.click();
    const dlg = page.locator('#modal-root');
    out.push(`${mode}: Log out says only this phone: ` + (/Only this phone/.test(await dlg.innerText().catch(() => '')) ? 'yes' : 'MISSING'));
    await dlg.getByRole('button', { name: /^Log out$/ }).click();
    await page.waitForTimeout(1500);
    out.push(`${mode}: Log out sent scope: ${LOGOUTS.slice(before).join(',') || 'NOTHING'} ` + (LOGOUTS.slice(before)[0] === 'local' ? '(ok)' : 'WRONG'));
    // Log out on all devices → every device
    await go('/member/settings');
    const b2 = LOGOUTS.length;
    await page.locator('[data-logout-everywhere]').first().click();
    out.push(`${mode}: everywhere says every device: ` + (/Every phone and computer/.test(await page.locator('#modal-root').innerText().catch(() => '')) ? 'yes' : 'MISSING'));
    await page.waitForTimeout(900);   // the dialog fades in
    await page.screenshot({ path: `output/logout-scope-${mode}-all.png`, fullPage: false });
    await page.locator('#modal-root').getByRole('button', { name: /Log out everywhere/ }).click();
    await page.waitForTimeout(1500);
    out.push(`${mode}: Log out everywhere sent scope: ${LOGOUTS.slice(b2).join(',') || 'NOTHING'} ` + (LOGOUTS.slice(b2)[0] === 'global' ? '(ok)' : 'WRONG'));
  }
  return out.join('\n');
}
