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

  // ── Global search finds everything: pages, tabs, jobs and records; What's new floats ─────────────
  const H = { 'Access-Control-Allow-Origin': '*' };
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
  await page.route('**/rest/v1/rpc/my_whats_new', (r) => json(r, { id: 'rel-a', title: "What's new in your dashboard", items: ['Search finds pages and settings too.'], published_at: new Date().toISOString() }));
  await page.route('**/rest/v1/rpc/mark_release_seen', (r) => json(r, null));
  // Records: a product and an exercise answer "pro"; nothing else does.
  await page.route('**/rest/v1/shop_products?**', (r) => json(r, /ilike\.\*pro\*/i.test(decodeURIComponent(r.request().url())) ? [{ id: 'p1', name: 'Protein shake', category: 'Drinks', price: 120, active: true }] : []));
  await page.route('**/rest/v1/exercises?**', (r) => json(r, /ilike\.\*pro\*/i.test(decodeURIComponent(r.request().url())) ? [{ id: 'e1', name: 'Prone row', muscle_group: 'Back', equipment: 'Dumbbell', is_active: true }] : []));
  // The fixture answers any people query with the owner; a search for nonsense must find no one.
  await page.route(/\/rest\/v1\/(gym_people|member_profiles|trainer_profiles)\?.*zzzqx/, (r) => json(r, []));
  await page.setViewportSize({ width: 1500, height: 900 });

  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const wn = page.locator('[data-whats-new]');
  const pos = await wn.evaluate((el) => getComputedStyle(el).position).catch(() => '');
  const mainTop = await page.locator('main').evaluate((el) => el.getBoundingClientRect().top).catch(() => -1);
  say('What\'s new floats over the page (fixed), not in its flow', pos === 'fixed', pos);
  await page.screenshot({ path: 'shots/admin-whats-new-floating.png' });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(500);
  const mainTop2 = await page.locator('main').evaluate((el) => el.getBoundingClientRect().top).catch(() => -2);
  say('…closing it moves nothing on the page', mainTop === mainTop2, `${mainTop} → ${mainTop2}`);

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  const dlg = page.getByRole('dialog', { name: 'Search' });
  let txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('before typing, it lists the pages to jump to', /Go to/i.test(txt) && /Payments/.test(txt) && /Settings/.test(txt), txt.slice(0, 200));

  await page.getByLabel('Search everything').fill('reports');
  await page.waitForTimeout(900);
  txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('"reports" finds the Reports pages (Revenue, Retention, Activity log)', /Revenue/.test(txt) && /Retention/.test(txt) && /Activity log/.test(txt), txt.slice(0, 300));
  await page.screenshot({ path: 'shots/admin-search-reports.png' });

  await page.getByLabel('Search everything').fill('paymongo');
  await page.waitForTimeout(900);
  txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('a setting inside a tab is found ("paymongo" → Online payments)', /Online payments \(PayMongo\)/.test(txt), txt.slice(0, 200));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  say('…and Enter opens that tab', /\/gym-app\?tab=pay/.test(page.url()), page.url());

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.getByLabel('Search everything').fill('pro');
  await page.waitForTimeout(1200);
  txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('records outside the old list are searched (a shop product, an exercise)', /Protein shake/.test(txt) && /Prone row/.test(txt), txt.slice(0, 300));
  say('…with pages too ("pro" → Programs)', /Programs/.test(txt));
  await page.screenshot({ path: 'shots/admin-search-pro.png' });
  await page.locator('[data-scope="money"]').click();
  await page.waitForTimeout(300);
  txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('the Money chip narrows to money things only', /Protein shake/.test(txt) && !/Prone row/.test(txt) && !/Programs/.test(txt), txt.slice(0, 200));

  await page.locator('[data-scope="all"]').click();
  await page.getByLabel('Search everything').fill('zzzqx');
  await page.waitForTimeout(1200);
  txt = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('nothing found says what was searched', /Nothing matches/.test(txt) && /every page and setting/.test(txt), txt.slice(0, 200));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  say('Escape closes it and leaves nothing blocking the page', (await page.getByRole('dialog', { name: 'Search' }).count()) === 0);
  return out.join('\n');
}
