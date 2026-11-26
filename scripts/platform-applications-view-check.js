/**
 * The Applications View menu (2026-11-27): List (as before), Details (a table), Tiles; the Details pane on (as before)
 * or off, when choosing an application opens it in a popup dressed like the pane. The choice survives a reload.
 *
 * Playwright runner, platform dev server :5175. Fixtures only. Leaves the view on List with the pane on.
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
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const app = (id, name, over = {}) => ({ id, gym_name: name, owner_name: 'Ana Cruz', email: `${id}@x.ph`, phone: '09171234567', address: 'Calapan, Oriental Mindoro',
    member_estimate: 80, message: null, status: 'pending', reason: null, gym_id: null, created_at: iso(2), duplicates: 0, already_a_gym: false,
    plan_key: 'starter', plan_name: 'Starter', billing: 'monthly', heard_from: 'Facebook', contact_pref: 'viber', contact_handle: null,
    status_token: 'f'.repeat(64), messages: 0, unread: 0, last_message_at: null, ...over });
  const APPS = [app('a1', 'Iron Den', { created_at: iso(5), member_estimate: 120 }), app('a2', 'Bulwark Gym'), app('a3', 'Coral Strength', { plan_name: 'Growth' })];
  const RPC = {
    is_platform_admin: () => true,
    platform_applications: () => APPS,
    platform_application_documents_summary: () => APPS.map((a, i) => ({ application_id: a.id, verified: 6 - i, waiting: 0, rejected: 0, missing: Array(i).fill('x') })),
    platform_application_payments: () => [{ application_id: 'a2', plan_name: 'Starter', amount: 1299, months: 1, payment_id: 'p1', status: 'pending', method_label: 'GCash', reference: 'GC-1', created_at: iso(0.2) }],
    platform_application_accounts: () => [],
  };
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn]() : []); }
    return json([]);
  });

  const out = [];
  const say = (k, ok, v) => out.push(`${k}: ${ok ? v : 'MISSING ' + v}`);
  const pick = async (label) => {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole(label === 'Details pane' ? 'menuitemcheckbox' : 'menuitemradio', { name: label, exact: true }).click();
    await page.waitForTimeout(400);
  };
  const noScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://localhost:5175/applications', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('cf-platform-applications-view'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-app-row]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);

  say('List with the pane, as before', (await page.locator('[data-view="list"]').count()) === 1 && (await page.locator('.ap-read [data-app-card]').count()) === 1, 'unchanged');
  await pick('Details');
  const row = (await page.locator('[data-app-row]', { hasText: 'Bulwark Gym' }).innerText()).replace(/\s+/g, ' ');
  say('Details is a table', (await page.locator('.ap-thead').count()) === 1 && /Waiting/.test(row) && /To check/.test(row) && /5 of 6/.test(row) && /Starter/.test(row) && await noScroll(), row);
  await page.screenshot({ path: '.tmp-shots/platform-apps-details-1600.png' });
  await pick('Tiles');
  const tiles = await page.evaluate(() => getComputedStyle(document.querySelector('.ap-list')).gridTemplateColumns.split(' ').length);
  say('Tiles are a grid', tiles >= 2, `${tiles} columns`);
  await page.screenshot({ path: '.tmp-shots/platform-apps-tiles-1600.png' });

  await pick('Details pane');
  say('pane off: no reading pane', (await page.locator('.ap-read').count()) === 0, 'queue takes the room');
  await page.locator('[data-app-row]', { hasText: 'Coral Strength' }).click();
  await page.waitForTimeout(400);
  const dlg = page.getByRole('dialog');
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.ap-pop .app-boxes')).gridTemplateColumns.split(' ').length);
  say('a click opens the application in a popup, dressed like the pane', (await dlg.count()) === 1 && /Coral Strength/.test(await dlg.innerText()) && cols === 2, `${cols} box columns`);
  await page.screenshot({ path: '.tmp-shots/platform-apps-popup-1280.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.setViewportSize({ width: 1280, height: 860 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-app-row]').first().waitFor({ timeout: 15000 });
  say('the choice survives a reload', (await page.locator('[data-view="tiles"]').count()) === 1 && (await page.locator('.ap-read').count()) === 0, 'Tiles, pane off');
  await pick('Details');
  await pick('Details pane');
  say('Details with the pane at 1280', (await page.locator('.ap-read [data-app-card]').count()) === 1 && await noScroll(), 'fits');
  await page.screenshot({ path: '.tmp-shots/platform-apps-details-1280.png' });
  await pick('List');
  return out.join('\n');
}
