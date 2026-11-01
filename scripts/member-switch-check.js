/**
 * 0227 in the member app: a member who joins another gym is sent to Switch
 * gym — the old gym's refund quote, what comes with them, what starts over,
 * what ends, and consent before anything is asked; a switch waiting on the new
 * gym can be withdrawn; Your gyms says Switch gym.
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
  let SW = { from_gym: { id: 'gym-1', name: 'G Fitness' }, pending: null };
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
      if (fn === 'my_gyms') return json([{ gym_id: 'gym-1', name: 'G Fitness', slug: 'g-fitness', role: ROLE, status: 'active', short_name: null, logo_url: null, accent: 'violet' }]);
      if (fn === 'gym_finder') return json([{ id: 'gym-2', slug: 'iron-den', name: 'Iron Den', join_policy: 'open', latitude: null, longitude: null, address: 'Mamburao',
        short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null }]);
      if (fn === 'gym_join_rules') return json([{ policy: 'open', approval: 'desk', min_age: 16 }]);
      if (fn === 'my_gym_switch') return json(SW);
      if (fn === 'refund_quote') { CALLS.push(['quote', JSON.parse(req.postData() || '{}')]); return json([{ amount: 450, days_unused: 15, rule_label: null, fee_deducted: 50 }]); }
      if (fn === 'request_gym_switch') { CALLS.push(['switch', JSON.parse(req.postData() || '{}')]);
        SW = { ...SW, pending: { id: 's1', to_gym: 'gym-2', to_name: 'Iron Den', created_at: new Date().toISOString() } }; return json('desk'); }
      if (fn === 'withdraw_gym_switch') { CALLS.push(['withdraw']); SW = { ...SW, pending: null }; return json(null); }
      if (fn === 'request_to_join') { CALLS.push(['join']); return json('desk'); }
      if (fn === 'request_account_deletion') { CALLS.push(['request']); DEL.pending = { requested_at: new Date().toISOString(), erase_after: ERASE }; return json(ERASE); }
      if (fn === 'cancel_account_deletion') { CALLS.push(['cancel']); DEL.pending = null; return json(true); }
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: ROLE, status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'memberships') return json([{ id: 'ms-1' }]);
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
  await go('/choose-gym');
  out.push('Your gyms offers Switch gym, not Join another: ' + ((await page.getByRole('button', { name: 'Switch gym' }).count()) === 1
    && (await page.getByRole('button', { name: 'Join another gym' }).count()) === 0 ? 'yes' : 'MISSING'));
  await go('/join');
  const row = page.locator('[data-finder]').getByText('Iron Den');
  await row.waitFor({ timeout: 8000 });
  out.push('in the finder, another gym says Switch: ' + (/Switch/.test(await page.locator('[data-finder]').innerText()) ? 'yes' : 'MISSING'));
  await row.click();
  await page.waitForURL(/\/switch-gym/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  out.push('joining is a switch, never a second gym: ' + (page.url().endsWith('/switch-gym') && !CALLS.some((c) => c[0] === 'join') ? 'yes' : 'MISSING ' + page.url()));
  const refund = page.locator('[data-switch-refund]');
  await refund.getByText(/pay back/).waitFor({ timeout: 8000 }).catch(() => {});
  out.push('the old gym\'s refund quote comes first: ' + (/pay back ₱450 for 15 unused days, after a ₱50 fee/.test(await refund.innerText()) && CALLS.some((c) => c[0] === 'quote' && c[1].p_membership === 'ms-1') ? 'yes' : 'MISSING ' + (await refund.innerText())));
  out.push('what comes along, what starts over, what ends: ' + (/Progress photos/.test(await page.locator('[data-switch-moves]').innerText())
    && /points start at zero/i.test(await page.locator('body').innerText()) && /payments and visits stay/i.test(await page.locator('body').innerText()) ? 'yes' : 'MISSING'));
  const go2 = page.getByRole('button', { name: 'Switch to Iron Den' });
  out.push('nothing is asked before they agree: ' + (await go2.isDisabled() ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/member-switch.png', fullPage: true });
  await page.locator('[data-switch-consent] input').check();
  await go2.click();
  await page.locator('[data-switch-pending]').waitFor({ timeout: 8000 }).catch(() => {});
  const sw = CALLS.find((c) => c[0] === 'switch');
  out.push('agreed: the switch is asked, with consent: ' + (sw && sw[1].p_to_gym === 'gym-2' && sw[1].p_consent === true ? 'yes' : 'MISSING ' + JSON.stringify(sw)));
  out.push('…and waits for the new gym, saying they stay meanwhile: ' + (/Waiting for Iron Den/.test(await page.locator('[data-switch-pending]').innerText())
    && /you stay at G Fitness/.test(await page.locator('[data-switch-pending]').innerText()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Withdraw the switch' }).click();
  await page.waitForTimeout(1200);
  out.push('it can be withdrawn: ' + (CALLS.some((c) => c[0] === 'withdraw') && (await page.locator('[data-switch-pending]').count()) === 0 ? 'yes' : 'MISSING'));
  return out.join('\n');
}
