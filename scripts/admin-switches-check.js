/**
 * The owner's side of 0141: the switches nested under the part they live in,
 * the dashboard's own sidebar following them, and a brand colour by code.
 *
 * Your app has said since 0110 that a switched-off part "disappears from your
 * members' app and from this dashboard". The second half was never true — the
 * sidebar listed Shop and Rooms to a gym that had turned them off — so this
 * asserts the sidebar, before and after a switch, without a reload.
 *
 * Setup copied from admin-gym-app-check.js. Admin dev server on :5174.
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
  // Every drawer closed, so the check opens the ones it reads.
  await page.addInitScript(() => localStorage.setItem('admin_sidebar_open_groups', '[]'));

  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  // What the gym switched: classes off (Schedule and Bookings), the shop off,
  // rooms off inside coaching (on), programs off, engagement off (and with it
  // quests, which the gym had left on — parent_off). The assistant is not sold.
  const FEATURES = [
    ['front_desk', null, 'The front desk', 1], ['shop', 'front_desk', 'The shop', 11], ['requests', 'front_desk', 'Freeze and cancel requests', 12],
    ['checkin', null, 'QR check-in and the kiosk', 2], ['classes', null, 'Classes and bookings', 3],
    ['coaching', null, 'Coaches', 4], ['chat', 'coaching', 'Coach chat', 41], ['rooms', 'coaching', 'Coaching rooms', 42],
    ['engagement', null, 'Points, rewards and challenges', 5], ['quests', 'engagement', 'Weekly quests', 53],
    ['progress', null, 'Progress and goals', 6], ['programs', 'progress', 'Programs', 61],
    ['assistant', null, 'The in-app assistant', 7], ['push', null, 'Announcements and push', 8], ['analytics', null, 'Analytics and retention', 9],
  ];
  const OWN = { classes: false, shop: false, rooms: false, programs: false, engagement: false };
  const NOT_SOLD = new Set(['assistant']);
  const effective = (key) => {
    const f = FEATURES.find((x) => x[0] === key);
    if (NOT_SOLD.has(key) || OWN[key] === false) return false;
    return f[1] ? effective(f[1]) : true;
  };
  const modulesList = () => FEATURES.map(([key, parent, label, sort]) => ({
    feature_key: key, label, description: label + ' — what it is.', sort_order: sort, parent_key: parent,
    state: NOT_SOLD.has(key) ? 'not_sold' : OWN[key] === false ? 'off' : parent && !effective(parent) ? 'parent_off' : 'on',
    enabled: effective(key),
  }));
  const gym = {
    gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour-strength',
    short_name: null, logo_url: null, accent: 'violet', accent_action: null,
    points_name: 'Points', points_name_short: 'points', welcome_message: null, tagline: null,
    vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' },
    join_policy: 'code', join_code: 'HARB42',
  };
  const app = () => ({ ...gym, modules: Object.fromEntries(FEATURES.map(([k]) => [k, effective(k)])) });

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
      if (fn === 'my_gym_app') return json([app()]);
      if (fn === 'my_gym_context') return json([{
        gym_id: gym.gym_id, gym_name: gym.gym_name, slug: gym.slug, role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: gym.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open', accent_action: gym.accent_action,
      }]);
      if (fn === 'my_gym_modules') return json(modulesList());
      if (fn === 'set_gym_module') {
        if (NOT_SOLD.has(body.p_feature)) return json({ message: 'not sold' }, 400);
        OWN[body.p_feature] = body.p_enabled;
        return json(null);
      }
      if (fn === 'save_gym_look') {
        gym.accent = body.p_accent; gym.accent_action = body.p_accent_action;
        return json(null);
      }
      if (fn === 'my_support_grant') return json([]);
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
  const openGroups = async () => {
    for (const g of ['Classes', 'Billing', 'Reports', 'Engagement', 'Training']) {
      const b = page.locator('aside nav').getByRole('button', { name: new RegExp('^' + g) });
      if (await b.count() && (await b.first().getAttribute('aria-expanded')) === 'false') await b.first().click();
    }
    await page.waitForTimeout(300);
    return page.evaluate(() => [...document.querySelectorAll('aside nav a, aside nav button')]
      .map((e) => e.innerText.trim()).filter(Boolean));
  };

  await page.setViewportSize({ width: 1700, height: 900 });
  await page.goto('http://localhost:5174/gym-app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // ---- the sidebar follows the switches ----
  let nav = await openGroups();
  const shouldGo = ['Schedule', 'Bookings', 'Classes', 'Shop', 'Rooms', 'Programs', 'Engagement', 'Challenges', 'Rewards', 'Achievements'];
  const shouldStay = ['Payments', 'Plans', 'Revenue', 'Retention', 'Exercises', 'Resources', 'Communications', 'Your app'];
  const leaked = shouldGo.filter((l) => nav.includes(l));
  const lost = shouldStay.filter((l) => !nav.includes(l));
  out.push('sidebar drops switched-off pages: ' + (leaked.length ? 'STILL SHOWN ' + leaked.join(', ') : 'yes'));
  out.push('sidebar keeps the rest: ' + (lost.length ? 'MISSING ' + lost.join(', ') : 'yes'));

  // ---- nested switches ----
  let t = await text();
  const kids = await page.evaluate(() => {
    // A child sits in the indented list under its parent.
    const rows = [...document.querySelectorAll('button[aria-pressed]')];
    const find = (l) => rows.find((b) => b.innerText.split('\n')[0].trim() === l);
    const rooms = find('Coaching rooms'), coaches = find('Coaches'), quests = find('Weekly quests');
    return {
      nested: !!rooms && !!coaches && coaches.parentElement.contains(rooms) && rooms.parentElement !== coaches.parentElement,
      questsDisabled: !!quests && quests.disabled,
    };
  });
  out.push('children nested under their part: ' + (kids.nested ? 'yes' : 'MISSING'));
  out.push('a child held off by its parent says why and cannot flip: '
    + (kids.questsDisabled && /Off because Points, rewards and challenges is off/.test(t) ? 'yes' : 'MISSING'));
  out.push('not sold explained: ' + (/Your Core Fitness plan does not include this/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-switches.png', fullPage: true });

  // ---- switching one on reaches the sidebar without a reload ----
  await page.locator('button[aria-pressed]', { hasText: 'Coaching rooms' }).first().click();
  await page.waitForTimeout(1500);
  out.push('switch sent: ' + (CALLS.set_gym_module?.p_feature === 'rooms' && CALLS.set_gym_module?.p_enabled === true ? 'rooms on' : 'MISSING'));
  nav = await openGroups();
  out.push('Rooms back in the sidebar without a reload: ' + (nav.includes('Rooms') ? 'yes' : 'MISSING'));
  // Engagement back on brings quests back as the gym left it (on).
  await page.locator('button[aria-pressed]', { hasText: 'Points, rewards and challenges' }).first().click();
  await page.waitForTimeout(1500);
  const questsNow = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.innerText.startsWith('Weekly quests'));
    return b ? { on: b.getAttribute('aria-pressed') === 'true', disabled: b.disabled } : null;
  });
  out.push('parent back on restores its child: ' + (questsNow?.on && !questsNow.disabled ? 'yes' : 'MISSING'));
  nav = await openGroups();
  out.push('Challenges back in the sidebar: ' + (nav.includes('Challenges') ? 'yes' : 'MISSING'));

  // ---- a brand colour by code ----
  await page.locator('#look-accent-code').fill('#1F8A70');
  await page.waitForTimeout(300);
  t = await text();
  out.push('preview measures the text shade: ' + (/Text contrast \d+(\.\d)?:1/.test(t) ? t.match(/Text contrast [\d.]+:1/)[0] : 'MISSING'));
  // A pale yellow cannot fill a white-text button; the page says what it will use.
  await page.locator('#look-action-code').fill('#FFEE00');
  await page.waitForTimeout(300);
  t = await text();
  out.push('a too-light code is explained, not refused: ' + (/#FFEE00 is lighter than the colours the app is tested with/.test(t) ? 'yes' : 'MISSING'));
  await page.locator('#look-action-code').fill('#FFEE0');
  await page.waitForTimeout(200);
  t = await text();
  out.push('a half-typed code is flagged: ' + (/A colour code is # and six characters/.test(t) ? 'yes' : 'MISSING'));
  await page.locator('#look-action-code').fill('#FFEE00');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(1200);
  out.push('saved: accent ' + (CALLS.save_gym_look?.p_accent ?? 'MISSING') + ' / action ' + (CALLS.save_gym_look?.p_accent_action ?? 'MISSING'));
  await page.screenshot({ path: 'shots/admin-brand-colour.png', fullPage: true });
  return out.join('\n');
}
