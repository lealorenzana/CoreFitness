/**
 * Which gym am I in (SaaS Part B): a member of two gyms picks one at sign-in
 * and from More → Gyms, switching changes the gym the app is in, the gym's
 * accent replaces violet, and a read-only gym says so. Writes shots/gym-NN-*.png.
 *
 * The failure this exists to catch is silent: a gym picked here and ignored
 * everywhere else looks perfect on this screen while every list still shows
 * the other gym's data.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
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
  const ME = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp, expires_in: 3600,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  // Deliberately no planted session: the picker belongs to *signing in*. An app
  // relaunched by someone who already chose goes straight to that gym, which is
  // asserted at the end.
  let signedIn = false;

  const A = { gym_id: 'gym-a', name: 'Core Fitness', slug: 'core-fitness', role: 'member', status: 'active' };
  const B = { gym_id: 'gym-b', name: 'Harbour Strength', slug: 'harbour-strength', role: 'trainer', status: 'active' };
  const C3 = { gym_id: 'gym-c', name: 'Northside Barbell', slug: 'northside', role: 'member', status: 'pending_approval' };
  const state = { current: 'gym-a', accent: 'violet', lock: null };
  const ctx = () => {
    const mine = [A, B, C3].find((g) => g.gym_id === state.current);
    return [{ gym_id: mine.gym_id, gym_name: mine.name, slug: mine.slug, role: mine.role, status: mine.status,
      lock_reason: state.lock, short_name: null, logo_url: null,
      accent: state.current === 'gym-b' ? 'teal' : state.accent, gym_count: 3 }];
  };
  const CALLS = {};
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/token')) signedIn = true;
      if (!signedIn && path.includes('/user')) return json({ message: 'no session' }, 401);
      return json(path.includes('/user') ? session.user : { ...session });
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      CALLS[fn] = body;
      if (fn === 'my_gym_context') return json(ctx());
      if (fn === 'my_gyms') return json([A, B, C3]);
      if (fn === 'set_active_gym') { state.current = body.p_gym; return json(null); }
      if (fn === 'list_gyms') return json([
        { id: 'gym-a', slug: 'core-fitness', name: 'Core Fitness', short_name: null, logo_url: null, accent: 'violet' },
        { id: 'gym-d', slug: 'seaside-fit', name: 'Seaside Fit', short_name: null, logo_url: null, accent: 'blue' },
      ]);
      if (fn === 'request_to_join') return json(null);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? ME : [ME]);
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1200);
  };
  const main = async () => (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');

  // Signing in with three gyms: the app asks which, rather than guessing.
  await go('/login');
  await page.locator('input[type="email"]').first().fill('lea@corefitness-test.com');
  await page.locator('input[type="password"]').first().fill('whatever');
  await page.getByRole('button', { name: /^Sign in as/ }).first().click();
  await page.waitForTimeout(2200);
  out.push('sign-in with three gyms → ' + page.url().replace('http://localhost:5173', ''));
  const list = await main();
  out.push('picker lists: ' + ['Core Fitness', 'Harbour Strength', 'Northside Barbell']
    .map((n) => (list.includes(n) ? n : 'MISSING ' + n)).join(' · '));
  out.push('pending gym says so: ' + (/Waiting for the gym/.test(list) ? 'yes' : 'NO'));
  out.push('current gym marked: ' + (/Current/.test(list) ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/gym-01-picker.png' });

  // Switching goes to the gym's own landing (a coach there, not a member).
  await page.getByText('Harbour Strength').click();
  await page.waitForTimeout(1500);
  out.push('after switch: set_active_gym=' + (CALLS.set_active_gym?.p_gym ?? 'MISSING')
    + ' · at ' + page.url().replace('http://localhost:5173', ''));

  // The gym's colour is the app's colour.
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim());
  out.push('accent after switch: ' + accent + (accent.toLowerCase() === '#0d9488' ? ' (teal)' : ' MISSING teal'));
  await page.screenshot({ path: 'shots/gym-02-teal-trainer.png' });

  // A read-only gym says so, in the shell, on every screen.
  state.lock = 'overdue';
  await go('/trainer/home');
  const locked = await page.locator('body').innerText();
  out.push('read-only notice: ' + (/read-only right now/.test(locked) ? 'shown' : 'MISSING')
    + ' · reason worded: ' + (/subscription/.test(locked) ? 'overdue' : 'NO'));
  await page.screenshot({ path: 'shots/gym-03-locked.png' });
  state.lock = null;

  // Join another gym: the list, and the ask.
  await go('/join');
  const joinText = await main();
  out.push('join list: ' + (/Seaside Fit/.test(joinText) ? 'other gyms shown' : 'MISSING gyms')
    + ' · already-joined marked: ' + (/already here/.test(joinText) ? 'yes' : 'NO'));
  await page.getByText('Seaside Fit').click();
  await page.waitForTimeout(1200);
  out.push('asked to join: ' + (CALLS.request_to_join ? CALLS.request_to_join.p_gym : 'MISSING'));
  await page.screenshot({ path: 'shots/gym-04-join.png' });

  // Relaunch: the gym they chose is remembered, so no picker on the way in.
  await go('/login');
  out.push('relaunch after choosing → ' + page.url().replace('http://localhost:5173', '')
    + (page.url().includes('/choose-gym') ? ' FAILED: asked again' : ''));

  return out.join('\n');
}
