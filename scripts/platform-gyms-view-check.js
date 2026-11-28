/**
 * The Gyms View menu (2026-11-27, the owner's File Explorer View menu): Large tiles, Small tiles, List, Details,
 * and a Details pane that shows the chosen gym beside the list instead of a popup. The choice survives a reload.
 *
 * Playwright runner, platform dev server :5175. Fixtures only. Leaves the view on Large tiles, pane off.
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
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const manila = (n) => new Date(Date.now() + 8 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  const base = (i, over = {}) => ({ id: `g${i}`, name: `Gym ${String(i).padStart(2, '0')}`, slug: `gym-${i}`, status: 'active', plan: 'growth',
    paid_until: manila(40 + i), lock_reason: null, members: 20 + i, staff: 2, created_at: new Date().toISOString(), last_activity: new Date().toISOString(),
    owners: 1, onboarded: true, plan_name: 'Growth', price_monthly: '2999', days_left: 40 + i, max_members: 300, paid_total: '2999', logo_url: null, accent: 'violet', ...over });
  const GYMS = [
    base(1, { name: 'Alpha Fitness', members: 142 }),
    base(2, { name: 'Late Gym', plan: 'starter', plan_name: 'Starter', max_members: 75, lock_reason: 'overdue', paid_until: manila(-10), days_left: -10 }),
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => base(i)),
  ];
  // 0285: the account's saved looks, kept here across reloads as the database would.
  const PREFS = {};
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'is_platform_admin') return json(true);
      if (fn === 'my_view_prefs') return json(PREFS);
      if (fn === 'set_view_pref') { const b = req.postDataJSON(); PREFS[b.p_key] = b.p_value; return json(null); }
      if (fn === 'platform_gyms') return json(GYMS);
      return json([]);
    }
    return json([]);
  });

  const out = [];
  const say = (k, ok, v) => out.push(`${k}: ${ok ? v : 'MISSING ' + v}`);
  const pick = async (label) => {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole(label === 'Details pane' ? 'menuitemcheckbox' : 'menuitemradio', { name: label, exact: true }).click();
    await page.waitForTimeout(500);
  };
  const noScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('http://localhost:5175/gyms', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('cf-platform-gyms-view'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.gym-card').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);

  const large = await page.locator('.gym-card').count();
  say('Large tiles by default', large > 0 && (await page.locator('[data-view="large"]').count()) === 1, `${large} cards`);
  await pick('Small tiles');
  const small = await page.locator('.gym-card').count();
  say('Small tiles fit more', small > large, `${small} cards`);
  await page.screenshot({ path: '.tmp-shots/platform-gyms-small.png' });
  await pick('List');
  const list = await page.locator('.gx-row-list').count();
  say('List is one line a gym', list > large && (await page.locator('.gym-card').count()) === 0 && await noScroll(), `${list} rows, no page scroll`);
  await pick('Details');
  const rows = await page.locator('.gym-grid .gx-row').count();
  const late = await page.locator('.gym-grid .gx-row').first().innerText().catch(() => '');
  say('Details is a table', rows > 0 && (await page.locator('.gx-row-head').count()) === 1 && /Alpha Fitness/.test(late) && late.includes('142 / 300') && /left/.test(late), late.replace(/\s+/g, ' '));
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.waitForTimeout(300);
  const first = await page.locator('.gym-grid .gx-row .gx-name').first().innerText();
  say('a column heading sorts', first === 'Alpha Fitness', first);
  await page.screenshot({ path: '.tmp-shots/platform-gyms-details.png' });

  await pick('Details pane');
  say('pane waits for a pick', /Pick a gym to see it here/.test(await page.locator('[data-gym-pane]').innerText()), 'empty state');
  await page.getByRole('button', { name: 'Alpha Fitness, open' }).click();
  await page.waitForTimeout(400);
  const pane = await page.locator('[data-gym-pane]').innerText();
  say('a click fills the pane, no popup', /Alpha Fitness/.test(pane) && /Bill this gym/.test(pane) && (await page.getByRole('dialog').count()) === 0
    && (await page.locator('.gx-row.on').count()) === 1 && await noScroll(), 'side by side');
  await page.screenshot({ path: '.tmp-shots/platform-gyms-pane-1280.png' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.tmp-shots/platform-gyms-pane-1600.png' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-gym-pane]').waitFor({ timeout: 15000 });
  say('the choice survives a reload', (await page.locator('[data-view="details"]').count()) === 1, 'Details with the pane');

  await pick('Large tiles');
  await pick('Details pane');
  await page.locator('.gym-card').first().click();
  await page.waitForTimeout(400);
  say('pane off: a click opens the popup again', (await page.getByRole('dialog').count()) === 1, 'popup');
  await page.keyboard.press('Escape');
  return out.join('\n');
}
