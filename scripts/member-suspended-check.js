/**
 * 0226 in the member and coach app: an account Core Fitness suspended opens
 * only "Your account is suspended", with the reason, and Sign out — no tabs, no
 * gym; lifted, the app opens again.
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
  let SUS = { reason: 'Payments reported as fraudulent by two gyms.', suspended_at: new Date(Date.now() - 86400000).toISOString() };
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
      if (fn === 'my_platform_suspension') return json(SUS);
      if (fn === 'appeal_my_suspension') { CALLS.push(['appeal', JSON.parse(req.postData() || '{}')]); return json('ap-1'); }
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
  await go('/member/home');
  const scr = page.locator('[data-platform-suspended]');
  out.push('a suspended member sees only the suspension, with the reason: ' + ((await scr.count()) === 1
    && /Payments reported as fraudulent by two gyms\./.test(await scr.innerText()) && (await page.locator('nav').count()) === 0 ? 'yes' : 'MISSING'));
  out.push('…and that their gym cannot lift it: ' + (/Your gym cannot lift it/.test(await scr.innerText()) ? 'yes' : 'MISSING'));
  // 0265: they can appeal once, from here.
  out.push('they can appeal from here: ' + ((await page.locator('[data-appeal-form]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('#appeal-text').fill('Too short');
  await page.locator('[data-appeal-send]').click();
  out.push('…a few words are refused before sending: ' + (/at least 20 characters/.test(await page.locator('[data-appeal-error]').innerText().catch(() => '')) && !CALLS.some(([c]) => c === 'appeal') ? 'yes' : 'MISSING'));
  await page.locator('#appeal-text').fill('I paid in cash at the desk and have the receipt; it was another member.');
  await page.screenshot({ path: 'shots/member-suspended.png' });
  await page.locator('[data-appeal-send]').click();
  await page.locator('[data-appeal-pending]').waitFor({ timeout: 5000 }).catch(() => {});
  const sent = CALLS.find(([c]) => c === 'appeal')?.[1];
  out.push('…sent with their words, and shown as with Core Fitness: ' + (sent && /paid in cash/.test(sent.p_statement) && sent.p_attachment === null
    && (await page.locator('[data-appeal-pending]').count()) === 1 ? 'yes' : 'MISSING ' + JSON.stringify(sent)));
  await page.screenshot({ path: 'shots/member-suspended-appealed.png' });
  SUS = { ...SUS, appeal: { status: 'upheld', sent_at: new Date().toISOString(), decision_note: 'Two gyms sent the same report; the suspension stays.', decided_at: new Date().toISOString() } };
  await go('/member/home');
  out.push('turned down: they read why, and cannot appeal again: ' + (/the suspension stays/.test(await page.locator('[data-appeal-upheld]').innerText().catch(() => ''))
    && (await page.locator('[data-appeal-form]').count()) === 0 ? 'yes' : 'MISSING'));
  SUS = { reason: SUS.reason, suspended_at: SUS.suspended_at };
  ROLE = 'trainer';
  await go('/trainer');
  out.push('a suspended coach too: ' + ((await page.locator('[data-platform-suspended]').count()) === 1 ? 'yes' : 'MISSING'));
  SUS = null; ROLE = 'member';
  await go('/member/home');
  out.push('lifted: the app opens again: ' + ((await page.locator('[data-platform-suspended]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  return out.join('\n');
}
