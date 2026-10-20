/**
 * An invitation is a login (0202), on the phone. An invited account's first
 * sign-in goes to its form before anything — typing /member/home or opening
 * /login sends it there — and the form is the one for what they were invited
 * as: a member's is the sign-up's (birth date, gender, emergency contact, the
 * Terms), a coach's is what they coach, and a front-desk login is sent to the
 * dashboard. The one-time password is replaced first; then complete_invitation
 * saves the form. Member dev server on :5173. Screenshots shots/invite-*.png.
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
  const TOKEN = 'a'.repeat(64);
  const U = { id: 'c2020000-0000-4000-8000-000000000001', email: 'ana@invite-test.com' };
  let meta = {};
  let role = 'member';
  const sessionNow = () => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: U.id, aud: 'authenticated', role: 'authenticated', email: U.email, app_metadata: {}, user_metadata: meta },
  });
  const CALLS = [];
  let finished = false;

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = after.split('?')[0];
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
    if (path.startsWith('/auth/v1/user') && req.method() === 'PUT') {
      CALLS.push(['updateUser', body]);
      meta = { ...meta, ...(body.data ?? {}) };
      return json(sessionNow().user);
    }
    if (path.startsWith('/auth/v1/token')) {
      // A refresh after the form: the server cleared the invite flags.
      if (finished) meta = { must_change_password: false };
      return json(sessionNow());
    }
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? sessionNow().user : sessionNow());
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      CALLS.push([fn, body]);
      const inv = { gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', logo_url: null, accent: 'violet', role, first_name: 'Ana', state: 'waiting' };
      if (fn === 'peek_invitation') return json([inv]);
      if (fn === 'my_invitation') return json([{ ...inv, last_name: 'Reyes', phone: '0917 555 0101', email: U.email }]);
      if (fn === 'complete_invitation') { finished = true; return json([{ gym_id: 'gym-1', role }]); }
      if (fn === 'my_gym_context') return json(finished ? [{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role, status: 'active', gym_count: 1 }] : []);
      return json(['my_gyms', 'my_gym_modules', 'my_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles') {
      const p = { id: U.id, first_name: 'Ana', last_name: 'Reyes', email: U.email, role: 'member', status: 'active', phone: null, photo_url: null, active_gym_id: null };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const has = (label, ok, detail = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + detail}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 393, height: 852 });
  const start = async (path, asRole) => {
    role = asRole; finished = false; CALLS.length = 0;
    meta = { invite_pending: true, invite_token: TOKEN, must_change_password: true };
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(([k, s]) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, sessionNow()]);
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-finish-invite], [data-finish-invite-staff]').first().waitFor({ timeout: 12000 }).catch(() => {});
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(700);
  };

  // ── A member: typing the home URL still lands on the form ──
  await start('/member/home', 'member');
  has('an invited account cannot skip its form: /member/home sends it to the invitation', page.url().endsWith(`/invite/${TOKEN}`), page.url());
  let t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  has('the member form is the sign-up\'s: birth date, gender, emergency contact, the Terms', /Welcome to Core Fitness Lab/.test(t) && /Date of birth/.test(t)
    && /Gender/.test(t) && /Emergency contact name/.test(t) && /I agree to the gym/.test(t));
  has('…with the names the gym typed already filled', (await page.getByLabel('First name').inputValue()) === 'Ana' && (await page.getByLabel('Last name').inputValue()) === 'Reyes');
  has('…and their own password, since the one in the email worked once', /your password/i.test(t) && (await page.getByLabel('New password').count()) === 1);
  await page.screenshot({ path: 'shots/invite-member.png', fullPage: true });
  await page.getByRole('button', { name: /Join Core Fitness Lab/ }).click(); await page.waitForTimeout(300);
  has('nothing is sent until the form is complete', !CALLS.some(([f]) => f === 'complete_invitation') && /date of birth/i.test(await page.locator('[role="alert"]').innerText().catch(() => '')));
  await page.getByLabel('Month').selectOption({ index: 5 });
  await page.getByLabel('Day').selectOption({ index: 12 });
  await page.getByLabel('Year').selectOption({ index: 25 });
  await page.getByRole('button', { name: 'Female' }).click();
  await page.getByLabel('Emergency contact name').fill('Maria Reyes');
  await page.getByLabel('New password').fill('my-own-pass-2026');
  await page.getByLabel('Confirm password').fill('my-own-pass-2026');
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /Join Core Fitness Lab/ }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 8000 }).catch(() => {});
  const pw = CALLS.find(([f]) => f === 'updateUser');
  const done = CALLS.find(([f]) => f === 'complete_invitation');
  has('the password is replaced first, and the one-time flag cleared', !!pw && pw[1].password === 'my-own-pass-2026' && pw[1].data?.must_change_password === false
    && CALLS.indexOf(pw) < CALLS.indexOf(done));
  has('complete_invitation gets the member form', !!done && done[1].p_token === TOKEN && done[1].p_first === 'Ana' && !!done[1].p_dob && done[1].p_gender === 'female'
    && done[1].p_emergency_name === 'Maria Reyes' && !!done[1].p_terms_version && !!done[1].p_privacy_version, JSON.stringify(done?.[1]));
  has('then onboarding', /\/onboarding/.test(page.url()), page.url());

  // ── A coach: opening /login lands on the coach form ──
  await start('/login', 'trainer');
  has('a signed-in invited coach opening /login goes to the invitation', page.url().endsWith(`/invite/${TOKEN}`), page.url());
  t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  has('the coach form asks what they coach and years, not a birth date', /What you coach/.test(t) && /Years coaching/.test(t) && !/Date of birth/.test(t) && !/I agree to the gym/.test(t));
  await page.screenshot({ path: 'shots/invite-coach.png', fullPage: true });
  await page.getByLabel('What you coach', { exact: false }).first().fill('Strength and conditioning').catch(async () => {
    await page.locator('input[placeholder="Strength and conditioning"]').fill('Strength and conditioning');
  });
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByLabel('New password').fill('coach-pass-2026');
  await page.getByLabel('Confirm password').fill('coach-pass-2026');
  await page.getByRole('button', { name: /Join Core Fitness Lab/ }).click();
  await page.waitForURL(/\/trainer/, { timeout: 8000 }).catch(() => {});
  const cdone = CALLS.find(([f]) => f === 'complete_invitation');
  has('complete_invitation gets the coach form, and they land on the trainer side', !!cdone && cdone[1].p_specialization === 'Strength and conditioning' && cdone[1].p_years === 5
    && !('p_dob' in cdone[1]) && /\/trainer/.test(page.url()), JSON.stringify(cdone?.[1]) + ' ' + page.url());

  // ── Front desk: sent to the dashboard ──
  await start(`/invite/${TOKEN}`, 'staff');
  t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  has('a front-desk login is sent to the dashboard, not filled in here', /This is a front-desk login/.test(t) && (await page.getByRole('button', { name: 'Open the dashboard' }).count()) === 1
    && !CALLS.some(([f]) => f === 'complete_invitation'));

  has('no page errors', errs.length === 0, errs.join(' | '));
  return out.join('\n');
}
