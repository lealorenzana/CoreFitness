/**
 * 0190 in the member app: "Sign up with Google" on the sign-up form and
 * "Continue with Google" on sign-in hand the account to Google with the way
 * back (/auth/callback, keeping the gym and link); back from Google with no
 * gym, the callback sends it to the sign-up form, which is filled from Google —
 * name in, no email or password to choose — and asks the rest step by step.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const GYM = { id: 'gym-o', slug: 'g-fitness', name: 'G Fitness', short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null };
  const CALLS = [];
  let signedIn = false;
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: 'g-new', aud: 'authenticated', role: 'authenticated', email: 'ana.reyes@gmail.com',
    app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ana Reyes', given_name: 'Ana', family_name: 'Reyes' } };
  const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.endsWith('/auth/v1/authorize')) {
      CALLS.push(['authorize', url.searchParams.get('provider'), url.searchParams.get('redirect_to')]);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
    }
    if (path.startsWith('/auth/v1/')) return signedIn ? json(path.includes('/user') ? user : session) : json({ error: 'no session' }, 401);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, b]);
      if (fn === 'my_signup_state') return json({ has_profile: false, gyms: 0, applications: 0, email: user.email, first_name: 'Ana', last_name: 'Reyes', avatar_url: null });
      if (fn === 'list_gyms') return json([GYM]);
      if (fn === 'gym_by_slug') return json([GYM]);
      if (fn === 'gym_join_rules') return json([{ policy: 'open', approval: 'auto', min_age: 16 }]);
      return json([]);
    }
    if (path.startsWith('/rest/v1/membership_plans')) return json([]);
    return json([]);
  });

  const out = [];
  await page.setViewportSize({ width: 412, height: 900 });

  // ---- signed out: the buttons hand off to Google with the way back ----
  await page.goto('http://localhost:5173/register?gym=gym-o&join=g-fitness', { waitUntil: 'domcontentloaded' });
  await page.getByText('What should we call you?').waitFor({ timeout: 15000 });
  await page.locator('[data-google-button]').click();
  await page.waitForTimeout(1500);
  let a = CALLS.find((c) => c[0] === 'authorize');
  out.push('Sign up with Google goes to Google, coming back to finish this sign-up: ' + (a && a[1] === 'google'
    && decodeURIComponent(a[2] ?? '').includes('/auth/callback?next=/register?gym=gym-o&join=g-fitness') ? 'yes' : 'MISSING ' + JSON.stringify(a)));
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-login-google] [data-google-button]').waitFor({ timeout: 15000 });
  out.push('sign-in offers Google too: yes');

  // ---- back from Google, a new account ----
  signedIn = true;
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  await page.goto('http://localhost:5173/auth/callback?next=' + encodeURIComponent('/register?gym=gym-o&join=g-fitness'), { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/register?gym=gym-o&join=g-fitness', { timeout: 15000 }).catch(() => {});
  out.push('a new Google account is sent on to finish signing up: ' + (page.url().includes('/register?gym=gym-o') ? 'yes' : 'NO ' + page.url()));
  await page.locator('[data-google-filled]').waitFor({ timeout: 10000 }).catch(() => {});
  const inputs = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
  out.push('the form is filled from Google, and says so: ' + ((await page.locator('[data-google-filled]').count()) === 1
    && inputs.includes('Ana') && inputs.includes('Reyes') ? 'yes' : 'MISSING ' + inputs.slice(0, 4).join('|')));
  out.push('no second Google button once signed in: ' + ((await page.locator('[data-google-button]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/member-google-register.png' });
  return out.join('\n');
}
