/**
 * 0152: once the platform puts a version of the gym documents in effect, the
 * admin app asks this gym's owner to agree — a banner above every screen with
 * the three documents linked, "I agree for my gym" sending exactly the version
 * in effect, then a thank-you. An owner whose gym already agreed is not asked,
 * and nor is the desk (my_gym_terms() answers null for them).
 *
 * Same planted session and routed network as admin-subscription-check.js.
 * Playwright runner's `filename` argument, admin dev server on :5174.
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
  const STATE = { trial: false };
  // 0152: what my_gym_terms() answers — null for the desk; the owner's view otherwise.
  const TERMS = { answer: { published: '2026-10-03', accepted_version: null, accepted_at: null, accepted_by: null } };
  const ACCEPTED = [];
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
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'due' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      if (fn === 'my_gym_billing') return json([{ plan_key: 'starter', plan_name: 'Starter', blurb: null, price_monthly: '999', price_yearly: null,
        paid_until: STATE.trial ? ymd(-5) : ymd(2), days_left: STATE.trial ? 5 : -2, lock_reason: null, max_members: 100, members: 38, max_staff: 3, staff: 2, last_paid_on: ymd(32), last_amount: '999' }]);
      if (fn === 'my_gym_subscription') return json([{ plan_name: 'Starter', price_monthly: '999', paid_until: STATE.trial ? ymd(-5) : ymd(2), days_left: STATE.trial ? 5 : -2, grace_days: 10,
        read_only_on: STATE.trial ? ymd(-16) : ymd(-9), lock_reason: null, max_members: 100, members: 38, max_staff: 3, staff: 2, on_trial: STATE.trial }]);
      if (fn === 'my_gym_payments') return json(PAYMENTS);
      if (fn === 'my_gym_terms') return json(TERMS.answer);
      if (fn === 'accept_gym_terms_owner') { ACCEPTED.push(JSON.parse(req.postData() || '{}')); return json(true); }
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

  const failures = [];
  const notes = [];
  const banner = page.locator('[aria-label="Terms for gyms"]');
  await page.setViewportSize({ width: 1280, height: 850 });

  // 1. an owner, not yet agreed
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await banner.waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await banner.count())) failures.push('MISSING: no banner for an owner who has not agreed');
  else {
    const said = (await banner.innerText()).replace(/\s+/g, ' ');
    notes.push(`owner: ${said}`);
    if (!/version of October 3, 2026/.test(said)) failures.push('the banner does not name the version in effect');
    const hrefs = await banner.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    for (const h of ['#legal/terms', '#legal/dpa', '#legal/privacy']) {
      if (!hrefs.some((x) => x && x.endsWith(h))) failures.push(`MISSING link to ${h}`);
    }
    await banner.locator('button:has-text("I agree for my gym")').click();
    await page.getByText(/Agreed for your gym/).waitFor({ timeout: 5000 }).catch(() => {});
    notes.push(`sent: ${JSON.stringify(ACCEPTED[0] ?? null)}`);
    if (ACCEPTED[0]?.p_version !== '2026-10-03') failures.push('accept_gym_terms_owner was not sent the version in effect');
    if (!(await page.getByText(/Agreed for your gym/).count())) failures.push('MISSING: no thank-you after agreeing');
  }

  // 2. an owner whose gym already agreed
  TERMS.answer = { published: '2026-10-03', accepted_version: '2026-10-03', accepted_at: new Date().toISOString(), accepted_by: 'Ana Lisa' };
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.getByText(/was due 2 days ago/).waitFor({ timeout: 15000 }).catch(() => {});
  if (await banner.count()) failures.push('an owner whose gym agreed is STILL SHOWN the banner');

  // 3. the desk
  TERMS.answer = null;
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.getByText(/was due 2 days ago/).waitFor({ timeout: 15000 }).catch(() => {});
  if (await banner.count()) failures.push('the desk is STILL SHOWN the banner');
  notes.push(`agreed owner and desk: ${(await banner.count()) ? 'banner' : 'no banner'}`);
  return { failures, notes };
}
