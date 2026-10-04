/**
 * 0153: Settings → House Rules. Version 1 is in force with 23 agreements; the
 * owner edits the words, is told before publishing that every member will be
 * asked to agree and the words cannot be edited afterwards, publishes, and
 * the screen then shows version 2 in force and both versions in the history.
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
  TERMS.answer = null;   // not this check's subject: no gym-documents banner
  const RULES = [{ id: 'hr1', version: 1, body: 'Towels on benches.', published_at: new Date(Date.now() - 864e5 * 9).toISOString(), published_by: 'Ana Lisa', agreed: 23 }];
  const PUBLISHED = [];
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
      if (fn === 'house_rules_history') return json(RULES);
      if (fn === 'publish_house_rules') {
        const a = JSON.parse(req.postData() || '{}'); PUBLISHED.push(a);
        RULES.unshift({ id: 'hr' + (RULES.length + 1), version: RULES.length + 1, body: a.p_body.trim(), published_at: new Date().toISOString(), published_by: 'Ana Lisa', agreed: 0 });
        return json(RULES[0].version);
      }
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /House Rules/ }).first().click({ timeout: 15000 }).catch(() => failures.push('MISSING: no House Rules tab'));
  await page.getByText(/Version 1 is in force/).waitFor({ timeout: 8000 }).catch(() => {});
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const t1 = await text();
  if (!/Version 1 is in force, published .* 23 members agreed to it/.test(t1)) failures.push('MISSING: the version in force and how many agreed');
  const box = page.getByLabel('House rules');
  if ((await box.inputValue()) !== 'Towels on benches.') failures.push('the editor does not start from the words in force');
  await box.fill('Towels on benches.\n90 minutes per visit between 5 and 8 PM.');
  await page.getByRole('button', { name: 'Publish version 2' }).click();
  const warn = await text();
  if (!/cannot be edited after this/.test(warn)) failures.push('MISSING: the warning before publishing');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText(/Version 2 is in force/).waitFor({ timeout: 8000 }).catch(() => {});
  notes.push(`sent: ${JSON.stringify(PUBLISHED[0] ?? null)}`);
  if (!PUBLISHED[0] || !/90 minutes/.test(PUBLISHED[0].p_body)) failures.push('publish_house_rules was not sent the new words');
  const t2 = await text();
  if (!/Version 2 is in force/.test(t2)) failures.push('MISSING: version 2 in force after publishing');
  if (!/Version 1 · .*23 agreed/.test(t2) || !/Version 2 · /.test(t2)) failures.push('MISSING: both versions in the history');
  notes.push(`after: ${(t2.match(/House rules (Version 2 is in force[^.]*\.[^.]*\.)/) ?? [])[1] ?? '?'}`);
  return { failures, notes };
}
