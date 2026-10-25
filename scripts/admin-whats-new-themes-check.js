/**
 * 0212 for the owner, against admin-gym-app-check.js's fixture: What's new shows
 * once on the dashboard and only there; saved colour themes need the colour
 * unlock, then save, show and delete; Your app → Payments explains connecting
 * PayMongo in six steps.
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

  // ── 0212 for the owner: What's new on the dashboard, saved colour themes, PayMongo's steps ───────────
  const H = { 'Access-Control-Allow-Origin': '*' };
  const R = [];
  let themes = { unlocked: false, themes: [] };
  await page.route('**/rest/v1/rpc/my_whats_new', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H,
    body: JSON.stringify(R.includes('seen') ? null : { id: 'rel-a', title: "What's new in your dashboard", items: ['Your app has a Lobby TV tab.', 'Check-ins keep working when the internet drops.'], published_at: new Date().toISOString() }) }));
  await page.route('**/rest/v1/rpc/mark_release_seen', (r) => { R.push('seen'); return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: 'null' }); });
  await page.route('**/rest/v1/rpc/my_gym_themes', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(themes) }));
  await page.route('**/rest/v1/rpc/save_gym_themes', (r) => { const b = JSON.parse(r.request().postData() || '{}'); R.push(['save', b.p_themes]); themes = { ...themes, themes: b.p_themes };
    return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: 'null' }); });
  await page.route('**/rest/v1/rpc/my_payment_account', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: 'null' }));
  const say = (label, ok) => out.push(`${label}: ${ok ? 'yes' : 'MISSING'}`);
  await page.setViewportSize({ width: 1500, height: 900 });

  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  say('the dashboard shows What\'s new, once', (await page.locator('[data-whats-new]').count()) === 1 && /Lobby TV tab/.test(await page.locator('[data-whats-new]').innerText()));
  await page.screenshot({ path: 'shots/admin-whats-new.png' });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(800);
  say('…"Got it" records it and it is gone', R.includes('seen') && (await page.locator('[data-whats-new]').count()) === 0);
  await page.goto('http://localhost:5174/gym-app?tab=look', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  say('…and other pages never show it', (await page.locator('[data-whats-new]').count()) === 0);

  // Saved themes: locked without the colour unlock, then save, use and delete.
  say('without the unlock, saving themes says what it needs', /Saving your own themes comes with your own colours/.test(await page.locator('[data-saved-themes]').innerText()));
  themes = { unlocked: true, themes: [] };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Theme name').fill('Christmas');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await page.waitForTimeout(800);
  const saved = R.filter((x) => Array.isArray(x) && x[0] === 'save').pop();
  say('with the unlock, the owner saves the current colours under a name', !!saved && saved[1].length === 1 && saved[1][0].name === 'Christmas' && !!saved[1][0].accent);
  say('…and it shows as a theme to tap', (await page.locator('[data-saved-theme="Christmas"]').count()) === 1);
  await page.locator('[data-saved-themes]').screenshot({ path: 'shots/admin-saved-themes.png' });
  await page.getByRole('button', { name: 'Delete Christmas' }).click();
  await page.waitForTimeout(800);
  say('…and deletes it', (R.filter((x) => Array.isArray(x) && x[0] === 'save').pop() ?? [null, [1]])[1].length === 0);

  // PayMongo: six steps, from the account to going live.
  await page.goto('http://localhost:5174/gym-app?tab=pay', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const steps = (await page.locator('[data-paymongo-steps]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  say('Payments explains connecting PayMongo in six steps', ['Make a PayMongo account', 'Activate it with your business details', 'Copy your secret key', 'Paste it below and press Connect', 'Try it in test mode', 'Go live'].every((x) => steps.includes(x)));
  await page.screenshot({ path: 'shots/admin-paymongo-steps.png' });
  return out.join('\n');
}
