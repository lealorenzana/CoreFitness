/**
 * 0198: a gym whose free trial has ended. The owner gets the plan page and
 * nothing else — no sidebar, no dashboard — and can pay from it; the front
 * desk is told the owner can open it again, and is never shown the bill.
 *
 * Fixture from admin-subscription-check.js.
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
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const g = { gym_id: 'gym-a', gym_name: 'Ana Gymanigga', slug: 'ana-gym', short_name: 'anafitness', accent: 'violet' };
  const ymd = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const SWEEPS = { n: 0 };
  // Flipped halfway: the same gym, never paid, five days before its free trial ends (0139).
  const STATE = { trial: true, role: 'admin' };
  const PAYMENTS = [{ id: 'gp1', receipt_no: 'CF-2026-00012', amount: '999', paid_on: ymd(32), covers_from: ymd(32), covers_until: ymd(2), method: 'GCash', plan_name: 'Starter' }];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: STATE.role,
        status: 'active', lock_reason: 'trial_ended', short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'due' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      if (fn === 'my_gym_billing') return json([{ plan_key: 'starter', plan_name: 'Starter', blurb: null, price_monthly: '999', price_yearly: null,
        paid_until: STATE.trial ? ymd(-5) : ymd(2), days_left: STATE.trial ? 5 : -2, lock_reason: null, max_members: 100, members: 38, max_staff: 3, staff: 2, last_paid_on: ymd(32), last_amount: '999' }]);
      if (fn === 'my_gym_subscription') return json(STATE.role !== 'admin' ? [] : [{ plan_name: 'Starter', price_monthly: '999', paid_until: STATE.trial ? ymd(-5) : ymd(2), days_left: -1, grace_days: 0,
        read_only_on: ymd(0), lock_reason: 'trial_ended', max_members: 100, members: 38, max_staff: 3, staff: 2, on_trial: true }]);
      if (fn === 'my_gym_payments') return json(PAYMENTS);
      if (fn === 'billing_reminders_sweep') { SWEEPS.n++; return json(0); }
      if (fn === 'gym_payment_receipt') return json([{ ...PAYMENTS[0], reference: 'GC-8812', gym_name: g.gym_name, gym_address: 'Brgy Bunot',
        business_name: 'Core Fitness', business_address: 'San Jose, Occidental Mindoro', business_email: 'billing@corefitness.test',
        business_phone: null, receipt_note: null }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' || fn === 'my_announcements' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Brgy Bunot' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
        email: 'ana@anafitness.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1280, height: 850 });
  const shell = page.locator('[data-trial-ended]');
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await shell.waitFor({ timeout: 15000 });
  await page.getByText('Payments to Core Fitness').waitFor({ timeout: 10000 }).catch(() => {});
  let t = await text();
  out.push('the owner sees only "Your free trial has ended": ' + (/Your free trial has ended/.test(t) && (await page.locator('aside').count()) === 0 ? 'yes' : 'MISSING'));
  out.push('…the app is paused for everyone, and nothing is lost: ' + (/paused for you, your front desk, your coaches and your members/.test(t) && /kept exactly as it was/.test(t) ? 'yes' : 'MISSING'));
  out.push('…with their plan page right there to pay: ' + (/The free trial has ended/.test(t) && /Payments to Core Fitness/.test(t) ? 'yes' : 'MISSING'));
  out.push('…and a way out: ' + ((await shell.getByRole('button', { name: 'Sign out' }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-trial-ended.png' });
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await shell.waitFor({ timeout: 15000 });
  out.push('every page is the same stop, Members too: ' + ((await page.locator('aside').count()) === 0 ? 'yes' : 'MISSING'));

  STATE.role = 'staff';
  await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* none */ } });
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await shell.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  t = await text();
  out.push('the desk is told the owner can open it again, and sees no bill: ' + (/until its owner chooses a Core Fitness plan/.test(t) && !/Payments to Core Fitness/.test(t) && !/₱/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 160)));
  return out.join(String.fromCharCode(10));
}
