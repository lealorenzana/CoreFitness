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
      // Per gym, and deliberately different in every field a screen shows: a
      // cache that survived a switch then reads as the other gym's app rather
      // than as a subtle difference nobody would notice.
      if (fn === 'my_gym_app') {
        const g = [A, B, C3].find((x) => x.gym_id === state.current) ?? A;
        return json([{
          gym_id: g.gym_id, gym_name: g.name, slug: g.slug,
          short_name: g.name.split(' ')[0], logo_url: null,
          accent: g.gym_id === 'gym-b' ? 'teal' : 'violet', accent_action: null,
          points_name: g.gym_id === 'gym-b' ? 'Harbour Points' : 'CORE points',
          points_name_short: 'points', welcome_message: null, tagline: null,
          vocabulary: { member: 'member', members: 'members', trainer: 'coach',
            trainers: 'coaches', class: 'class', classes: 'classes' },
          join_policy: 'open', join_code: null, modules: {},
        }]);
      }
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
    await page.waitForSelector('#boot', { state: 'detached', timeout: 15000 }).catch(() => {});
    // The gates read my_gym_context before they decide; wait for the app to
    // settle on a route rather than for a fixed number of milliseconds.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  };
  const main = async () => (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');

  // Signing in with three gyms: the app asks which, rather than guessing.
  await go('/login');
  await page.locator('input[type="email"]').first().fill('lea@corefitness-test.com');
  await page.locator('input[type="password"]').first().fill('whatever');
  await page.getByRole('button', { name: /^Sign in as/ }).first().click();
  await page.waitForURL(/\/choose-gym/, { timeout: 20000 }).catch(() => {});
  await page.getByText('Harbour Strength').waitFor({ timeout: 20000 }).catch(() => {});
  out.push('sign-in with three gyms → ' + page.url().replace('http://localhost:5173', ''));
  const list = await main();
  out.push('picker lists: ' + ['Core Fitness', 'Harbour Strength', 'Northside Barbell']
    .map((n) => (list.includes(n) ? n : 'MISSING ' + n)).join(' · '));
  out.push('pending gym says so: ' + (/Waiting for the gym/.test(list) ? 'yes' : 'NO'));
  out.push('current gym marked: ' + (/Current/.test(list) ? 'yes' : 'NO'));
  await page.screenshot({ path: 'shots/gym-01-picker.png' });

  // Switching goes to the gym's own landing (a coach there, not a member).
  await page.getByText('Harbour Strength').click();
  await page.waitForURL(/\/trainer\/home/, { timeout: 20000 }).catch(() => {});
  // The accent is applied once the context comes back, a frame after the route.
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase() === '#0d9488',
    null, { timeout: 15000 }).catch(() => {});
  out.push('after switch: set_active_gym=' + (CALLS.set_active_gym?.p_gym ?? 'MISSING')
    + ' · at ' + page.url().replace('http://localhost:5173', ''));

  // The gym's colour is the app's colour.
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim());
  out.push('accent after switch: ' + accent + (accent.toLowerCase() === '#0d9488' ? ' (teal)' : ' MISSING teal'));
  await page.screenshot({ path: 'shots/gym-02-teal-trainer.png' });

  // ---- the caches a switch has to empty --------------------------------
  //
  // `switchGym()` used to clear the gym CONTEXT and nothing else, so a member
  // of two gyms carried the previous gym's cached Today, plan entitlements,
  // achievement catalogue and — since 0114 and 0116 — its words, colours and
  // logo into the next gym. The reload does not save it: these are module
  // state, and assigning a URL this SPA already owns does not always tear the
  // module down.
  //
  // Exercised through the dev server by importing the modules directly
  // (CLAUDE.md's recipe), because the bug lives below the screens.
  // ---- the catalogue that was never cleared ----------------------------
  //
  // `achievements` is a per-gym table (0098 tags it) and its module cache had
  // no clearer anywhere — not in `logout()`, not in `switchGym()`. Logout is
  // followed by `navigate('/login')`, a client-side route change with no
  // reload, so module state survives it: the next person to sign in on that
  // phone read the previous account's gym's achievement rules.
  //
  // Imported by ONE specifier and cleared through the same module object.
  // Vite's dev server keys modules by request URL, so `/src/lib/api/achievements`
  // and `/…/achievements.ts` are two instances with two copies of this cache D
  // two earlier versions of this check cleared one and read the other, and
  // called working code broken.
  const cat = await page.evaluate(async () => {
    const mod = await import('/src/lib/api/achievements');
    if (typeof mod.clearAchievementCache !== 'function') return { missing: true };
    const first = await mod.loadCatalogue();
    const second = await mod.loadCatalogue();
    mod.clearAchievementCache();
    const third = await mod.loadCatalogue();
    return {
      cached: first === second,
      cleared: first !== third,
    };
  });
  out.push('achievement catalogue is cached: '
    + (cat.missing ? 'MISSING a clearer' : cat.cached ? 'yes' : 'not cached'));
  out.push('and a sign-out empties it: ' + (cat.cleared ? 'yes' : 'MISSING a clear'));

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
  await page.waitForURL(/\/choose-gym/, { timeout: 20000 }).catch(() => {});
  out.push('asked to join: ' + (CALLS.request_to_join ? CALLS.request_to_join.p_gym : 'MISSING'));
  await page.screenshot({ path: 'shots/gym-04-join.png' });

  // Relaunch: the gym they chose is remembered, so no picker on the way in.
  await go('/login');
  out.push('relaunch after choosing → ' + page.url().replace('http://localhost:5173', '')
    + (page.url().includes('/choose-gym') ? ' FAILED: asked again' : ''));

  return out.join('\n');
}
