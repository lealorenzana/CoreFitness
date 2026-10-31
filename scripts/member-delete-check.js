/**
 * 0225 in the member app: Settings → Your data → Delete my account (typed
 * confirmation; then signed out, with the 7 days said on the sign-in screen); a
 * coach with a package running is told why not, with no button; signing in
 * while the account waits to be erased opens only "Keep my account", which
 * cancels it and lets the app open.
 *
 * Member dev server on :5173.
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
  // Planted on every load except the sign-in screen after deleting (signed out for real there).
  await page.addInitScript(([k, s]) => { if (!location.search.includes('deleted=1')) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, session]);
  const CALLS = [];
  let ROLE = 'member';
  const DEL = { pending: null, blocked: null };
  const ERASE = new Date(Date.now() + 7 * 86400000).toISOString();

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/logout')) { CALLS.push(['logout']); return route.fulfill({ status: 204, body: '', headers: { 'Access-Control-Allow-Origin': '*' } }); }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_account_deletion') return json({ pending: DEL.pending, blocked: DEL.blocked });
      if (fn === 'request_account_deletion') { CALLS.push(['request']); DEL.pending = { requested_at: new Date().toISOString(), erase_after: ERASE }; return json(ERASE); }
      if (fn === 'cancel_account_deletion') { CALLS.push(['cancel']); DEL.pending = null; return json(true); }
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: ROLE, status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: ROLE, status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
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

  await go('/member/settings?section=data');
  const sec = page.locator('[data-delete-account]');
  await sec.waitFor({ timeout: 8000 }).catch(() => {});
  out.push('Your data has Delete my account, saying what is erased and what stays: ' + ((await sec.count()) === 1
    && /erased after 7 days/.test(await sec.innerText()) && /"Deleted member"/.test(await sec.innerText()) ? 'yes' : 'MISSING'));
  await sec.getByRole('button', { name: 'Delete my account' }).click();
  const confirm = page.locator('#modal-root').getByRole('button', { name: 'Delete my account' });
  await page.locator('[data-delete-type]').waitFor({ timeout: 5000 });
  out.push('it waits for DELETE to be typed: ' + (await confirm.isDisabled() ? 'yes' : 'NO'));
  await page.locator('[data-delete-type]').fill('delete');
  await confirm.click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  out.push('confirmed: asked, signed out, and the sign-in screen says the 7 days: ' + (CALLS.some((c) => c[0] === 'request') && CALLS.some((c) => c[0] === 'logout')
    && (await page.locator('[data-deleted-note]').count()) === 1 ? 'yes' : 'MISSING ' + JSON.stringify(CALLS) + ' ' + page.url()));
  await page.screenshot({ path: 'shots/member-deleted-login.png' });

  // Signing back in within the 7 days: only "Keep my account" opens.
  await go('/member/home');
  const pend = page.locator('[data-deletion-pending]');
  out.push('signed in while it waits, nothing else opens: ' + ((await pend.count()) === 1 && /being deleted/.test(await pend.innerText())
    && (await page.locator('nav, [data-tab-bar]').count()) === 0 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-deletion-pending.png' });
  await pend.getByRole('button', { name: 'Keep my account' }).click();
  await page.waitForTimeout(1500);
  out.push('Keep my account cancels it and the app opens: ' + (CALLS.some((c) => c[0] === 'cancel') && (await pend.count()) === 0 ? 'yes' : 'MISSING'));

  // A coach with a package running is told why not.
  ROLE = 'trainer';
  DEL.blocked = 'Members are on a package with you. End or hand over each package first (Packages), then delete your account.';
  await go('/trainer/settings');
  const csec = page.locator('[data-delete-account]');
  await csec.waitFor({ timeout: 8000 }).catch(() => {});
  out.push('a coach with a package running is told why, with no button: ' + ((await page.locator('[data-delete-blocked]').count()) === 1
    && /End or hand over each package/.test(await csec.innerText()) && (await csec.getByRole('button', { name: 'Delete my account' }).count()) === 0 ? 'yes' : 'MISSING'));
  return out.join('\n');
}
