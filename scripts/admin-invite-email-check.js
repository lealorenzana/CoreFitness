/**
 * Sending an invitation's login (0202, 2026-10-20; was "Email it", 2026-10-04):
 * the form and "Send a new login" call invite-account, which makes the login
 * and emails it. When the email went, the screen says so and shows no password;
 * when email is not set up it says nothing was sent and shows the one-time
 * password once, to hand over — nothing claims a send that did not happen.
 *
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
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

  const INVITES = [{ id: 'i1', email: 'lea@example.test', first_name: 'Lea', last_name: 'Cruz', phone: null, role: 'member',
    token: 'tok123abc', expires_at: new Date(Date.now() + 20 * 86400000).toISOString(), accepted_at: null, revoked_at: null,
    note: null, created_at: iso(1), state: 'waiting' }];
  const SENT = [];
  let MAIL_MODE = 'off';

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path === '/functions/v1/invite-account') {
      SENT.push(JSON.parse(req.postData() || '{}'));
      return json(MAIL_MODE === 'off'
        ? { id: 'i' + SENT.length, token: 't' + SENT.length, existing: false, emailed: 'not_configured', password: 'Hk7mPq2RtW9x' }
        : { id: 'i' + SENT.length, token: 't' + SENT.length, existing: false, emailed: 'sent', password: null });
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      if (fn === 'list_invitations') return json(INVITES);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Brgy Bunot' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
        email: 'ana@anafitness.test', phone: null, photo_url: null, created_at: iso(30) };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('http://localhost:5174/invitations', { waitUntil: 'domcontentloaded' });
  await page.getByText('lea@example.test').first().waitFor({ timeout: 15000 });
  out.push('each waiting invitation offers a new login, not a link to copy: ' + ((await page.getByRole('button', { name: 'Send a new login' }).count()) === 1
    && (await page.getByRole('button', { name: /Copy link/ }).count()) === 0 ? 'yes' : 'MISSING'));

  // The form: email not set up.
  await page.getByLabel('Email').fill('mara@example.test');
  await page.getByLabel(/First name/).fill('Mara');
  await page.getByRole('button', { name: /Send member login/ }).click();
  await page.waitForTimeout(800);
  let t = await text();
  const m = SENT[0] ?? {};
  out.push('the form sends a member login through invite-account: ' + (m.email === 'mara@example.test' && m.role === 'member' && m.firstName === 'Mara' && m.sendEmail === true ? 'yes' : 'MISSING ' + JSON.stringify(m)));
  out.push('not set up: says nothing was sent, and shows the one-time password once: ' + (/the email did not go out/.test(t) && /Email is not set up on Core Fitness yet/.test(t)
    && (await page.locator('[data-invite-password]').innerText()) === 'Hk7mPq2RtW9x' ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-invite-handover.png' });

  // A row: email set up.
  MAIL_MODE = 'on';
  await page.getByRole('button', { name: 'Send a new login' }).click();
  await page.waitForTimeout(800);
  t = await text();
  out.push('set up: says it went, and shows no password: ' + (SENT.length === 2 && SENT[1].email === 'lea@example.test' && /Login emailed to lea@example.test/.test(t)
    && (await page.locator('[data-invite-password]').count()) === 0 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-invite-email.png' });
  return out.join('\n');
}
