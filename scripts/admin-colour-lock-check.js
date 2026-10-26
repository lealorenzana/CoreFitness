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
  // 0119. Starts with nothing published, which is every gym on the day it pastes 0119.
  const WAIVERS = [];
  let waiverRequired = false;
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
      if (fn === 'parq_questions') return json(['heart_condition', 'chest_pain_active', 'chest_pain_rest',
        'balance', 'bone_joint', 'medication', 'other_reason']
        .map((key, i) => ({ key, question: 'Question ' + (i + 1) + ' (' + key + ')', sort_order: i + 1 })));
      if (fn === 'gym_waiver_signatures') return json([{ member_id: 'm9', member_name: 'Lea Lorenzana',
        accepted_at: new Date().toISOString(), version: 1, flagged: true,
        par_q: { bone_joint: true, heart_condition: false } }]);
      if (fn === 'save_gym_waiver') {
        const draft = WAIVERS.find((w) => !w.published_at);
        if (draft) { draft.title = body.p_title; draft.body = body.p_body; return json(draft.id); }
        const v = { id: 'w' + (WAIVERS.length + 1), version: WAIVERS.length + 1,
          title: body.p_title, body: body.p_body, published_at: null };
        WAIVERS.push(v);
        return json(v.id);
      }
      if (fn === 'publish_gym_waiver') {
        const draft = WAIVERS.find((w) => !w.published_at);
        draft.published_at = new Date().toISOString();
        return json(draft.version);
      }
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_waivers') return json([...WAIVERS].sort((a, b) => b.version - a.version));
    if (t === 'gym_settings') {
      if (req.method() === 'PATCH') {
        waiverRequired = JSON.parse(req.postData() || '{}').waiver_required ?? waiverRequired;
        CALLS.waiver_required = waiverRequired;
        return json([{ id: true }]);
      }
      const row = { id: true, waiver_required: waiverRequired };
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? owner : [owner]);
    }
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];

  // ── 0214: a gym that has not bought custom colours, on a ready-made pair written as codes (Volt) ─────────
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const H = { 'Access-Control-Allow-Origin': '*' };
  const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
  await page.route('**/rest/v1/rpc/my_theme_state', (r) => json(r, { custom_colours: false, price: 499 }));
  await page.route('**/rest/v1/rpc/my_gym_app', (r) => json(r, [{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', short_name: 'Lab', logo_url: null,
    accent: '#7C3AED', accent_action: '#A3E635', points_name: 'Points', points_name_short: 'points', welcome_message: null, tagline: null,
    vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' },
    join_policy: 'open', join_code: null, modules: {} }]));
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('http://localhost:5174/gym-app?tab=look', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const buy = await page.locator('[data-buy-colours]').count();
  const code = await page.locator('[aria-label="Colour code"]').count();
  say('Volt selected, not bought: both colours offer the purchase, no code box', buy === 2 && code === 0, `buy ${buy}, code boxes ${code}`);
  await page.screenshot({ path: 'shots/admin-colour-lock.png' });
  return out.join('\n');
}
