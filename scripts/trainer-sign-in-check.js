/**
 * Trainers link Google to the account the gym made for them (Settings →
 * Sign-in methods, Supabase manual identity linking), so "Continue with Google"
 * on the Trainer tab opens THAT account; an unlinked Google account from the
 * Trainer tab is turned back, never made a member. Members get the same section.
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
  const IDS = [{ id: 'i1', identity_id: 'i1', user_id: 't1', provider: 'email', identity_data: { email: 'ben@example.test' } }];
  const user = () => ({ id: 't1', aud: 'authenticated', role: 'authenticated', email: 'ben@example.test', app_metadata: { providers: IDS.map((i) => i.provider) }, user_metadata: {}, identities: IDS });
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: user(),
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const CALLS = [];
  let ROLE = 'trainer';

  await page.route('https://accounts.google.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }));
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/user/identities/authorize')) {
      CALLS.push(['link', url.searchParams.get('provider'), url.searchParams.get('redirect_to')]);
      return json({ url: 'https://accounts.google.test/o/oauth2' });
    }
    if (path.startsWith('/auth/v1/user/identities/') && req.method() === 'DELETE') {
      CALLS.push(['unlink', path.split('/').pop()]);
      const k = IDS.findIndex((i) => i.provider === 'google'); if (k >= 0) IDS.splice(k, 1);
      return json({});
    }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: ROLE, status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: ROLE, status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
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
  await go('/trainer/settings');
  const sec = page.locator('[data-sign-in-methods]');
  await sec.waitFor({ timeout: 8000 }).catch(() => {});
  out.push('Settings has Sign-in methods, Google not linked: ' + ((await sec.count()) === 1 && /Not linked/.test(await sec.innerText()) && /ben@example\.test/.test(await sec.innerText()) ? 'yes' : 'MISSING'));
  await sec.getByText('Link', { exact: true }).click();
  await page.waitForURL('https://accounts.google.test/**', { timeout: 8000 }).catch(() => {});
  const l = CALLS.find((c) => c[0] === 'link');
  out.push('Link goes to Google and comes back to Settings: ' + (l && l[1] === 'google' && /\/trainer\/settings\?linked=google$/.test(l[2] ?? '') ? 'yes' : 'MISSING ' + JSON.stringify(CALLS)));

  // Back from Google, linked.
  IDS.push({ id: 'i2', identity_id: 'i2', user_id: 't1', provider: 'google', identity_data: { email: 'ben.cruz@gmail.test' } });
  await go('/trainer/settings?linked=google');
  out.push('back from Google: linked, with the Google address: ' + (/Linked · ben\.cruz@gmail\.test/.test(await sec.innerText()) ? 'yes' : 'MISSING ' + (await sec.innerText())));
  out.push('…and the address is cleaned: ' + (!page.url().includes('linked=') ? 'yes' : 'MISSING'));
  await sec.getByText('Unlink', { exact: true }).click();
  await page.waitForTimeout(1000);
  out.push('Unlink removes it: ' + (CALLS.some((c) => c[0] === 'unlink') && /Not linked/.test(await sec.innerText()) ? 'yes' : 'MISSING'));

  // Members have the same section.
  ROLE = 'member';
  await page.evaluate(() => localStorage.removeItem('trainerMode'));
  await go('/member/settings');
  out.push('members have Sign-in methods too: ' + ((await page.locator('[data-sign-in-methods]').count()) === 1 ? 'yes' : 'MISSING'));
  return out.join('\n');
}
