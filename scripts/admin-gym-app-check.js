/**
 * The gym owner's "Your app" page (0110–0114).
 *
 * The failure this exists to catch already happened once. 0112 added a second
 * colour role, `save_gym_look()` wrote it, and the only screen that ever passed
 * it was the setup wizard — which an owner sees once. The column, the function
 * and the migration's verify report were all green while the setting was
 * unreachable, so nothing in the repository could tell the difference between
 * "the gym chose amber" and "the gym could not choose anything".
 *
 * So this asserts the *route to the setting*, not the setting: both colour rows
 * are on screen, editing the second one sends `p_accent_action`, the six nouns
 * are editable and sent, and the link can be moved. Writes shots/admin-gym-app*.png.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  // A gym that renamed nothing and set no action colour — the state every gym
  // is in the day after onboarding, and the one the old screen could not leave.
  const gym = {
    gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour-strength',
    short_name: null, logo_url: null, accent: 'rose', accent_action: null,
    points_name: 'Points', points_name_short: 'points', welcome_message: null,
    tagline: null,
    vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' },
    join_policy: 'code', join_code: 'HARB42',
    modules: { classes: true, coaching: true, engagement: true, progress: true, push: true, assistant: false },
  };

  const CALLS = {};
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      CALLS[fn] = body;
      if (fn === 'my_gym_app') return json([gym]);
      if (fn === 'my_gym_context') return json([{
        gym_id: gym.gym_id, gym_name: gym.gym_name, slug: gym.slug, role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: gym.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open', accent_action: gym.accent_action,
      }]);
      if (fn === 'my_gym_modules') return json([
        { feature_key: 'classes', label: 'Classes and bookings', description: 'A timetable members book into.', state: 'on', enabled: true, sort_order: 10 },
        { feature_key: 'assistant', label: 'The assistant', description: 'Answers members’ questions.', state: 'not_sold', enabled: false, sort_order: 90 },
      ]);
      if (fn === 'my_support_grant') return json([]);
      // The writes this check exists for. Echoed back into `gym` so the page
      // reloads into what it just saved, as it would against a real database.
      if (fn === 'save_gym_look') {
        gym.accent = body.p_accent;
        gym.accent_action = body.p_accent_action;
        return json(null);
      }
      if (fn === 'save_gym_vocabulary') {
        gym.vocabulary = { ...gym.vocabulary, ...body.p_words };
        return json(gym.vocabulary);
      }
      if (fn === 'set_gym_slug') { gym.slug = body.p_slug; return json(body.p_slug); }
      if (fn === 'save_gym_words') return json(null);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? owner : [owner]);
    }
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const has = (t, phrase) => (t.includes(phrase) ? 'shown' : 'MISSING');

  await page.goto('http://localhost:5174/gym-app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();

  out.push('look card: ' + has(t, 'What it looks like'));
  // Two rows, named for what they mean rather than "colour 1" and "colour 2" —
  // the roles are what keep the screen readable, and an owner picking blind is
  // how the first one ended up rose with amber buttons.
  out.push('role 1: ' + has(t, 'Where you are, and what you have'));
  out.push('role 2: ' + has(t, 'What you can do next'));
  // A gym that never set the second one is told what it currently is, rather
  // than shown fourteen unselected swatches and left to guess.
  out.push('unset says amber: ' + (/Not set, so your buttons are amber/.test(t) ? 'shown' : 'MISSING'));
  out.push('nouns: ' + has(t, 'What you call your people'));
  await page.screenshot({ path: 'shots/admin-gym-app.png', fullPage: true });

  // Pick an action colour and a noun, then save. The assertion is on what was
  // sent: a swatch that highlights and sends nothing is the exact failure.
  await page.getByRole('button', { name: 'Red' }).nth(1).click();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(1200);
  out.push('action colour sent: ' + (CALLS.save_gym_look?.p_accent_action ?? 'MISSING')
    + ' (kept accent ' + (CALLS.save_gym_look?.p_accent ?? 'MISSING') + ')');

  await page.getByLabel('All of them', { exact: true }).first().fill('PTs');
  await page.getByRole('button', { name: 'Save' }).nth(1).click();
  await page.waitForTimeout(1200);
  out.push('noun sent: ' + (CALLS.save_gym_vocabulary?.p_words?.trainers ?? 'MISSING'));

  // Moving the front door. The warning has to be on screen *before* the button,
  // because "every printed link stops working" is not a thing to learn after.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.waitForTimeout(400);
  t = await text();
  out.push('link warning: ' + (/stops working the moment you save/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel(/join\/$/).fill('harbour-strength-mamburao');
  await page.getByRole('button', { name: 'Move my link' }).click();
  await page.waitForTimeout(1200);
  out.push('slug sent: ' + (CALLS.set_gym_slug?.p_slug ?? 'MISSING'));
  await page.screenshot({ path: 'shots/admin-gym-app-link.png', fullPage: true });

  return out.join('\n');
}
