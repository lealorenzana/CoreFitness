/**
 * Bill this gym (2026-11-27): one window for everything money does to a gym's access, opened from a gym's card,
 * its quick view, its own page and Money. The state is said in words; each choice calls the platform's own function,
 * and a plan change goes in BEFORE the payment (a payment is filed under the gym's plan at that moment).
 *
 * Playwright runner, platform dev server :5175. Fixtures only.
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
  // Manila calendar dates, as the app computes them.
  const manila = (n) => new Date(Date.now() + 8 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  const plus = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const label = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const base = (i, over = {}) => ({ id: `g${i}`, name: `Gym ${i}`, slug: `gym-${i}`, status: 'active', plan: 'growth',
    paid_until: manila(6), lock_reason: null, members: 120, staff: 2, created_at: new Date().toISOString(), last_activity: new Date().toISOString(),
    owners: 1, onboarded: true, plan_name: 'Growth', price_monthly: '2999', days_left: 6, max_members: 300, paid_total: '5998', logo_url: null, accent: 'violet', ...over });
  const GYMS = [
    base(1, { name: 'Lab Growth Gym' }),
    base(2, { name: 'Trial Gym', plan: 'trial', plan_name: 'Free trial', price_monthly: null, max_members: null, paid_total: '0', paid_until: manila(3), days_left: 3, members: 12 }),
    base(3, { name: 'Late Gym', plan: 'starter', plan_name: 'Starter', price_monthly: '1299', max_members: 75, lock_reason: 'overdue', paid_until: manila(-10), days_left: -10, members: 40 }),
  ];
  const PLANS = [
    { key: 'trial', name: 'Free trial', is_active: true, sort_order: 0, price_monthly: '0', price_yearly: null, max_members: null },
    { key: 'starter', name: 'Starter', is_active: true, sort_order: 1, price_monthly: '1299', price_yearly: '12990', max_members: 75 },
    { key: 'growth', name: 'Growth', is_active: true, sort_order: 2, price_monthly: '2999', price_yearly: '29990', max_members: 300 },
    { key: 'pro', name: 'Pro', is_active: true, sort_order: 3, price_monthly: '5999', price_yearly: '59990', max_members: null },
  ];
  const CALLS = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'is_platform_admin') return json(true);
      if (fn === 'platform_gyms') return json(GYMS);
      if (fn === 'billing_settings') return json([{ grace_days: 7, reminder_days: [7, 3, 1], business_name: 'Core Fitness' }]);
      if (['record_gym_payment', 'set_gym_plan', 'platform_set_billing'].includes(fn)) { CALLS.push([fn, b]); return json(fn === 'record_gym_payment' ? 'p1' : null); }
      return json([]);
    }
    if (path.endsWith('/platform_plans')) return json(PLANS);
    return json([]);
  });

  const out = [];
  const say = (k, ok, v) => out.push(`${k}: ${ok ? v : 'MISSING ' + v}`);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const win = page.locator('[data-bill-gym]');
  // A card's buttons rise in under the pointer (a reveal tile): hover, let it settle, then click.
  const cardButton = async (gym, name) => { const c = page.getByRole('button', { name: `${gym}, open` }); await c.hover(); await page.waitForTimeout(700); await c.getByRole('button', { name, exact: true }).click(); };
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('http://localhost:5175/gyms', { waitUntil: 'domcontentloaded' });
  await page.locator('.gym-card').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);

  // 1. A paid gym, from its card: state in words, a year at the yearly price, continuing from its date.
  await cardButton('Lab Growth Gym', 'Bill');
  await win.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  let st = (await page.locator('[data-bill-state]').innerText()).replace(/\s+/g, ' ');
  say('the state in words', /Covered until/.test(st) && /6 days left/.test(st) && st.includes(`read only from ${label(plus(manila(6), 8))}`) && /120 of 300 active members/.test(st), st.slice(0, 200));
  say('amount from the plan price', (await page.getByLabel('Amount (₱)').inputValue()) === '2999', await page.getByLabel('Amount (₱)').inputValue());
  await page.screenshot({ path: '.tmp-shots/platform-bill-1280.png' });
  await page.getByRole('radio', { name: '1 year' }).click();
  say('a year is the yearly price', (await page.getByLabel('Amount (₱)').inputValue()) === '29990', await page.getByLabel('Amount (₱)').inputValue());
  const yearEnd = (() => { const f = plus(manila(6), 1); const [y, m, d] = f.split('-').map(Number); return plus(new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10), -1); })();
  say('the review sentence', (await page.locator('[data-bill-review]').innerText()).includes(`covers it until ${label(yearEnd)}`), await page.locator('[data-bill-review]').innerText());
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.waitForTimeout(600);
  const pay1 = CALLS.find(([f]) => f === 'record_gym_payment')?.[1] ?? {};
  say('recorded, continuing from its date', pay1.p_gym === 'g1' && pay1.p_amount === 29990 && pay1.p_covers_from === plus(manila(6), 1) && pay1.p_covers_until === yearEnd
    && !CALLS.some(([f]) => f === 'set_gym_plan') && (await win.count()) === 0, JSON.stringify(pay1));

  // 2. A trial gym, from its quick view: it pays for a real plan, and the plan goes in first.
  CALLS.length = 0;
  await page.getByRole('button', { name: 'Trial Gym, open' }).click();
  await page.getByRole('button', { name: 'Bill this gym' }).click();
  await win.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  st = (await page.locator('[data-bill-state]').innerText()).replace(/\s+/g, ' ');
  say('a trial says it stops with no grace', /Free trial until/.test(st) && /no grace days/.test(st), st.slice(0, 160));
  say('a trial pays for Starter by default', (await page.getByLabel('Plan').inputValue()) === 'starter' && (await page.getByLabel('Amount (₱)').inputValue()) === '1299',
    `${await page.getByLabel('Plan').inputValue()} ${await page.getByLabel('Amount (₱)').inputValue()}`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.waitForTimeout(600);
  say('plan first, then the payment', CALLS.map(([f]) => f).join(',') === 'set_gym_plan,record_gym_payment' && CALLS[0][1].p_plan === 'starter', CALLS.map(([f]) => f).join(','));

  // 3. A read only gym: move the date, no money.
  CALLS.length = 0;
  await page.keyboard.press('Escape');
  await cardButton('Late Gym', 'Bill');
  await win.waitFor({ timeout: 5000 });
  st = (await page.locator('[data-bill-state]').innerText()).replace(/\s+/g, ' ');
  say('read only in words', /Read only since/.test(st) && /opens again/.test(st), st.slice(0, 160));
  await page.getByRole('radio', { name: 'Give free days or move the date' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.waitForTimeout(600);
  say('moved the date, nothing recorded', CALLS.length === 1 && CALLS[0][0] === 'platform_set_billing' && CALLS[0][1].p_gym === 'g3' && CALLS[0][1].p_paid_until === manila(30), JSON.stringify(CALLS));

  // 4. The Plan window no longer moves the date.
  await cardButton('Lab Growth Gym', 'Plan');
  await page.waitForTimeout(300);
  say('Plan window has no Paid until box', (await page.getByLabel('Paid until').count()) === 0 && /use Bill this gym/.test(await text()), 'checked');
  await page.keyboard.press('Escape');

  // 5. The gym's own page: the header button, the Billing tab in words, and Stop billing.
  CALLS.length = 0;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://localhost:5175/gyms/g1', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-gym-tab="money"]').click();
  await page.waitForTimeout(500);
  say('Billing tab says it in words', /Covered until/.test(await text()) && (await page.locator('.bill-state').count()) === 1, 'checked');
  await page.getByRole('button', { name: 'Bill this gym' }).first().click();
  await win.waitFor({ timeout: 5000 });
  await page.getByRole('radio', { name: 'Stop billing this gym' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '.tmp-shots/platform-bill-1600-stop.png' });
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.waitForTimeout(600);
  say('stop billing clears the date', CALLS.length === 1 && CALLS[0][0] === 'platform_set_billing' && CALLS[0][1].p_paid_until === null, JSON.stringify(CALLS));
  return out.join('\n');
}
