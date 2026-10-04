/**
 * Forgot password (2026-10-04): Login's "Forgot password?" carries the typed
 * email to /forgot-password, which asks Supabase Auth to email a link back to
 * /reset-password and never says whether the account exists; the link signs
 * the tab in for the reset and the page sets the new password; an expired link
 * says so and offers a new one; and an ordinary signed-in session typing the
 * address gets no password form (that is Change password, which checks the old).
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
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
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp, email: 'ana@x.ph' })}.sig`;
  const user = { id: 'm1', aud: 'authenticated', role: 'authenticated', email: 'ana@x.ph', app_metadata: {}, user_metadata: {} };
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': '0-0/0' } });
    if (url.pathname === '/auth/v1/recover') { CALLS.push(['recover', JSON.parse(req.postData() || '{}'), url.searchParams.get('redirect_to')]); return json({}); }
    if (url.pathname === '/auth/v1/user' && req.method() === 'PUT') { CALLS.push(['update', JSON.parse(req.postData() || '{}')]); return json(user); }
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/auth/v1/')) return json({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 390, height: 844 });

  // ---- Login → Forgot password, the email carried over --------------------------------------
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('you@example.com').fill('Ana@X.ph');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('heading', { name: 'Forgot your password?' }).waitFor({ timeout: 10000 });
  out.push('the typed email comes along: ' + ((await page.getByPlaceholder('you@example.com').inputValue()) === 'Ana@X.ph' ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor({ timeout: 5000 });
  const rec = CALLS.find((c) => c[0] === 'recover');
  out.push('asks Supabase to email a link back here: ' + (rec && rec[1].email === 'ana@x.ph' && /\/reset-password$/.test(rec[2] || '') ? 'yes, to ' + rec[2] : 'MISSING ' + JSON.stringify(rec)));
  out.push('never says whether the account exists: ' + (/If ana@x\.ph has an account/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-forgot-sent.png' });

  // ---- The link: signed in for the reset, a new password set ----------------------------------
  await page.goto(`http://localhost:5173/reset-password#access_token=${token}&expires_at=${exp}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor({ timeout: 10000 });
  out.push('the link opens the new-password form: yes');
  await page.getByLabel('New password').fill('short');
  out.push('too short cannot be saved: ' + (await page.getByRole('button', { name: 'Set new password' }).isDisabled() ? 'yes' : 'NO'));
  await page.getByLabel('New password').fill('Lifting-Daily-2026');
  await page.getByLabel('Type it again').fill('Lifting-Daily-2025');
  out.push('a mismatch is said and blocks: ' + (/Not the same yet/.test(await text()) && await page.getByRole('button', { name: 'Set new password' }).isDisabled() ? 'yes' : 'NO'));
  await page.getByLabel('Type it again').fill('Lifting-Daily-2026');
  await page.screenshot({ path: 'shots/member-reset-form.png' });
  await page.getByRole('button', { name: 'Set new password' }).click();
  await page.getByRole('heading', { name: 'Your new password is set' }).waitFor({ timeout: 5000 });
  const up = CALLS.find((c) => c[0] === 'update');
  out.push('the new password is saved: ' + (up && up[1].password === 'Lifting-Daily-2026' ? 'yes' : 'MISSING ' + JSON.stringify(up)));

  // ---- An expired link ----------------------------------------------------------------------------
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  // An email link is a fresh page load; a hash change on the same page is not one.
  await page.goto('about:blank');
  await page.goto('http://localhost:5173/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'This link does not work any more' }).waitFor({ timeout: 10000 });
  out.push('an expired link says so and offers a new one: ' + (/Email link is invalid or has expired/.test(await text()) && (await page.getByRole('button', { name: 'Send a new link' }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-reset-expired.png' });

  // ---- Signed in, but not by a reset link: no password form ------------------------------------------
  await page.evaluate(([k, s]) => { sessionStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); },
    [KEY, { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_at: exp, expires_in: 3600, user }]);
  await page.goto('about:blank');
  await page.goto('http://localhost:5173/reset-password', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  out.push('an ordinary session gets no reset form: ' + ((await page.getByRole('heading', { name: 'Choose a new password' }).count()) === 0 ? 'none' : 'STILL SHOWN'));
  return out.join('\n');
}
