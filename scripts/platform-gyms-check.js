/**
 * The platform's Gyms screen in the admin app's layout (2026-09-28): bento
 * tiles that filter, chips with counts, a paged grid of cards (9 a page), and
 * every decision in a popup — the list never grows a form in the middle.
 *
 * 14 gyms, so there are two pages. Playwright runner, platform dev server :5175.
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
  const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

  const base = (i, over = {}) => ({ id: `g${i}`, name: `Gym ${String(i).padStart(2, '0')}`, slug: `gym-${i}`, status: 'active', plan: 'starter',
    paid_until: iso(-60).slice(0, 10), lock_reason: null, members: 10 + i, staff: 1, created_at: iso(100 - i), last_activity: iso(1), owners: 1,
    onboarded: true, plan_name: 'Starter', price_monthly: '999', days_left: 60, max_members: 100, paid_total: '999', logo_url: null, accent: 'violet', ...over });
  const GYMS = [
    base(1, { name: 'Alpha Fitness', members: 142 }),
    base(2, { name: 'Beach Body', owners: 0, onboarded: false, members: 0 }),
    base(3, { name: 'Harbour Strength', lock_reason: 'overdue', days_left: -9, paid_until: iso(9).slice(0, 10) }),
    base(4, { name: 'Iron Temple', days_left: 5, paid_until: iso(-5).slice(0, 10) }),
    ...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => base(i)),
  ];
  const CALLS = [];
  const MAIL = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path === '/functions/v1/reset-gym-password') return json({ email: 'ana@alpha.test', isOwner: true, password: 'Tmp-4821-xyz' });
    if (path === '/functions/v1/send-email') {
      MAIL.push(JSON.parse(req.postData() || '{}'));
      return json({ id: 'e1', configured: false, status: 'not_configured' });
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'is_platform_admin') return json(true);
      if (fn === 'platform_gyms') return json(GYMS);
      if (fn === 'platform_gym_health') return json([{ gym_id: 'g5', name: 'Gym 05', logo_url: null, accent: 'violet', score: 60, level: 'high',
        reasons: ['No check-ins in 14 days'], checkins_14: 0, usual_14: '10', owner_seen: iso(20) }]);
      if (fn === 'platform_plans_list' || fn === 'list_platform_plans') return json([]);
      if (fn === 'set_gym_status') { CALLS.push([fn, b]); return json(null); }
      if (fn === 'create_gym') { CALLS.push([fn, b]); return json('g99'); }
      if (fn === 'platform_gym_people') return json([{ user_id: 'u9', first_name: 'Ana', last_name: 'Reyes', email: 'ana@alpha.test',
        role: 'admin', status: 'active', is_owner: true }]);
      return json([]);
    }
    if (path.endsWith('/platform_plans')) return json([{ key: 'starter', name: 'Starter', is_active: true, sort_order: 1 }]);
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const cards = () => page.locator('.gym-card').count();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://localhost:5175/gyms', { waitUntil: 'domcontentloaded' });
  await page.locator('.gym-card').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  let t = await text();

  out.push('bento tiles: ' + ((await page.locator('.tile').count()) === 5 && /14 Gyms/.test(t) && /Need you/.test(t) ? '5, with figures' : 'MISSING'));
  out.push('page 1 of the grid: ' + ((await cards()) === 9 && /1–9 of 14 gyms/.test(t) ? '9 cards, "1–9 of 14"' : 'MISSING ' + (await cards())));
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.gym-grid')).gridTemplateColumns.split(' ').length);
  out.push('a grid, not a stack: ' + (cols >= 3 ? `${cols} columns` : 'MISSING ' + cols));
  await page.screenshot({ path: 'shots/platform-gyms-grid.png' });
  const rows = await page.evaluate(() => { const b = [...document.querySelectorAll('.toolbar > :not(.spacer)')].map((e) => e.getBoundingClientRect().top); return Math.max(...b) - Math.min(...b) < 20 ? 1 : 2; });
  out.push('the toolbar on one line: ' + (rows === 1 ? 'yes' : 'MISSING, wraps into ' + rows + ' ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.toolbar > *')].map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().top)])))));
  const cut = await page.evaluate(() => [...document.querySelectorAll('.tile-label')].filter((e) => e.scrollWidth > e.clientWidth).length);
  out.push('tile labels whole: ' + (cut === 0 ? 'yes' : cut + ' CUT'));
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.waitForTimeout(300);
  out.push('page 2: ' + ((await cards()) === 5 && /10–14 of 14 gyms/.test(await text()) ? '5 cards' : 'MISSING'));

  await page.getByRole('button', { name: /^Read-only/ }).click();
  await page.waitForTimeout(300);
  out.push('a filter chip: ' + ((await cards()) === 1 && /Harbour Strength/.test(await text()) ? 'Read-only → 1' : 'MISSING'));
  await page.locator('.tile', { hasText: 'Need you' }).click();
  await page.waitForTimeout(300);
  t = await text();
  out.push('the "need you" tile shows what it counts: ' + ((await cards()) === 3 && /3 Need you/.test(t) && /At risk: No check-ins in 14 days/.test(t) && /Harbour Strength/.test(t) && /Iron Temple/.test(t) ? '3 = 3' : 'MISSING ' + (await cards())));
  await page.getByRole('button', { name: /^Due soon/ }).click();
  await page.waitForTimeout(300);
  out.push('due soon: ' + ((await cards()) === 2 ? 'late + 5 days' : 'MISSING ' + (await cards())));
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByPlaceholder('Find a gym').fill('iron');
  await page.waitForTimeout(300);
  out.push('search: ' + ((await cards()) === 1 ? 'Iron Temple' : 'MISSING'));

  // The quick view is a popup; the grid does not move.
  const before = await page.locator('.gym-grid').boundingBox();
  await page.getByRole('button', { name: 'Iron Temple, open' }).click();
  await page.getByRole('button', { name: 'Open its full page' }).waitFor({ timeout: 5000 });
  const after = await page.locator('.gym-grid').boundingBox();
  t = await text();
  out.push('a card opens a popup: ' + ((await page.getByRole('dialog').count()) === 1 && /5 days left/.test(t) && before.height === after.height ? 'quick view, list unmoved' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-gym-quickview.png' });
  await page.getByRole('button', { name: 'Suspend' }).last().click();
  await page.getByLabel('Why').waitFor({ timeout: 5000 });
  out.push('Suspend is a popup too: ' + ((await page.getByRole('dialog').count()) === 1 && /Suspend Iron Temple\?/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByLabel('Why').fill('Three months unpaid');
  await page.getByRole('button', { name: 'Suspend the gym' }).click();
  await page.waitForTimeout(600);
  out.push('suspended from the popup: ' + (CALLS.some(([f, b]) => f === 'set_gym_status' && b.p_status === 'suspended' && b.p_gym === 'g4') && (await page.getByRole('dialog').count()) === 0 ? 'closed after' : 'MISSING'));

  // Archive: for a gym that has closed — a typed name to confirm, then it leaves every list but Archived.
  await page.getByPlaceholder('Find a gym').fill('Alpha');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Alpha Fitness, open' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByLabel('Why').waitFor({ timeout: 5000 });
  await page.getByLabel('Why').fill('The gym closed in October');
  await page.getByLabel('Type Alpha Fitness to confirm').fill('Alpha');
  await page.getByRole('button', { name: 'Archive the gym' }).click();
  await page.waitForTimeout(400);
  const wrongName = /exactly/.test(await text()) && !CALLS.some(([f, b]) => f === 'set_gym_status' && b.p_status === 'archived');
  await page.getByLabel('Type Alpha Fitness to confirm').fill('alpha fitness');
  await page.getByRole('button', { name: 'Archive the gym' }).click();
  await page.waitForTimeout(600);
  out.push('archive needs the name typed, then archives: ' + (wrongName && CALLS.some(([f, b]) => f === 'set_gym_status' && b.p_status === 'archived'
    && b.p_gym === 'g1' && /closed/.test(b.p_reason)) ? 'yes' : 'MISSING wrongName=' + wrongName));
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Find a gym').fill('');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Beach Body, open' }).getByRole('button', { name: 'Invite the owner' }).click();
  await page.waitForTimeout(300);
  out.push('a card button opens its own popup, not the quick view: ' + ((await page.getByRole('dialog').count()) === 1 && !(await page.getByRole('button', { name: 'Open its full page' }).count()) ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  out.push('Esc closes it: ' + ((await page.getByRole('dialog').count()) === 0 ? 'yes' : 'MISSING'));

  await page.getByRole('button', { name: 'Add a gym' }).click();
  await page.getByLabel('Gym name').fill('Sablayan Barbell');
  await page.getByRole('button', { name: 'Create the gym' }).click();
  await page.waitForTimeout(500);
  out.push('Add a gym in a popup: ' + (CALLS.some(([f, b]) => f === 'create_gym' && b.p_name === 'Sablayan Barbell') ? 'created' : 'MISSING'));

  await page.getByRole('button', { name: 'Alpha Fitness, open' }).click();
  await page.getByRole('button', { name: 'Open its full page' }).click();
  await page.waitForTimeout(500);
  out.push('the full page is one more click: ' + (/\/gyms\/g1$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));

  // A new password can be emailed; with no mail provider it says nothing was sent.
  await page.getByRole('button', { name: 'New password' }).first().click();
  await page.getByText('A new password for Ana Reyes').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Email it to ana@alpha.test' }).click();
  await page.waitForTimeout(600);
  t = await text();
  const mail = MAIL[0] ?? {};
  out.push('a new password can be emailed: ' + (mail.kind === 'password_reset' && mail.to === 'ana@alpha.test' && mail.gymId === 'g1'
    && /Tmp-4821-xyz/.test(mail.body ?? '') ? 'sent to send-email' : 'MISSING ' + JSON.stringify(mail).slice(0, 160)));
  out.push('…and says so when email is not set up: ' + (/Email is not set up yet/.test(t) && /Tmp-4821-xyz/.test(t) ? 'yes, the password still shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-reset-email.png' });
  return out.join('\n');
}
