/**
 * Guides G2 (2026-10-31): the owner's setup asks what the gym runs as plain
 * Yes/No questions — group classes, points, teams, a season, events, online
 * payments, a lobby TV, celebrations — only for parts its Core Fitness plan
 * includes; each answer writes that switch at once (celebrations: the gym's
 * moments and sounds), an unanswered question writes nothing, and the full
 * switch list stays under "Show every switch".
 *
 * Fixture from admin-setup-check.js. Admin dev server on :5174.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'ana@anafitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const SETTINGS = { celebrations: true, celebration_sounds: true, id: true, gym_id: 'gym-a', gym_name: 'Ana Fitness', short_name: null, tagline: null, address: 'Brgy Bunot',
    phone: null, email: null, opening_time: '06:00', closing_time: '21:00', accent: 'violet', logo_url: null, closed_days: [] };
  let PLANS = [
    { id: 'p-free', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true },
    { id: 'p-prem', name: 'Premium', tier: 'premium', price: 999, duration_days: 30, is_active: true },
    { id: 'p-trial', name: 'Free Trial', tier: 'premium', price: 0, duration_days: 30, is_active: true },
  ];
  // The defaults since 0220: classes, seasons and events off; the lobby TV and teams not on this gym's plan.
  const mod = (feature_key, label, state, enabled, sort_order, parent_key = null) => ({ feature_key, label, description: label, state, enabled, sort_order, parent_key });
  const MODULES = [
    mod('classes', 'Classes', 'off', false, 1),
    mod('engagement', 'Engagement', 'on', true, 2),
    mod('points', 'Points', 'on', true, 3, 'engagement'),
    mod('squads', 'Squads', 'not_sold', false, 4, 'engagement'),
    mod('seasons', 'Seasons', 'off', false, 5, 'points'),
    mod('push', 'Announcements', 'on', true, 6),
    mod('events', 'Events', 'off', false, 7, 'push'),
    mod('online_pay', 'Online payments', 'off', false, 8),
    mod('lobby_tv', 'Lobby TV', 'not_sold', false, 9),
  ];
  const CALLS = [];
  let FINISHED = false;
  const PATCHES = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, b]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-a', gym_name: 'Ana Fitness', slug: 'ana-fitness', role: 'admin',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1,
        onboarded: FINISHED, onboarding_step: null, gym_state: FINISHED ? 'open' : 'setting_up' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-a', gym_name: 'Ana Fitness', slug: 'ana-fitness', short_name: null,
        logo_url: null, accent: 'violet', accent_action: null, tagline: null, points_name: 'Points', points_name_short: 'points',
        welcome_message: null, vocabulary: { members: 'members', member: 'member', trainers: 'coaches', trainer: 'coach', classes: 'classes', class: 'class' },
        join_policy: 'open', join_code: null, modules: {} }]);
      if (fn === 'my_gym_modules') return json(MODULES);
      if (fn === 'coaching_settings') return json([{ modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee_mode: 'included' }]);
      if (fn === 'set_gym_module') { const m = MODULES.find((x) => x.feature_key === b.p_feature); if (m) m.enabled = b.p_enabled; return json(null); }
      if (fn === 'retire_plan') { PLANS = PLANS.filter((p) => p.id !== b.p_plan_id); return json([{ moved: 0, plan_name: 'Free Trial', moved_to: 'Free Plan' }]); }
      if (fn === 'set_join_policy') return json(null);
      if (fn === 'finish_gym_setup') { FINISHED = true; return json(new Date().toISOString()); }
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    const method = req.method();
    if (t === 'gym_settings') {
      if (method === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); PATCHES.push(body); Object.assign(SETTINGS, body); }
      return json(one ? SETTINGS : [SETTINGS]);
    }
    if (t === 'membership_plans') {
      if (method === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); PATCHES.push(body); return json([{ id: 'x' }]); }
      if (method === 'POST') { const body = JSON.parse(req.postData() || '{}'); PLANS.push({ id: 'p-new', ...body }); return json(one ? PLANS.at(-1) : [PLANS.at(-1)]); }
      return json(PLANS);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa', email: 'ana@anafitness.test' };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const next = async () => { await page.getByRole('button', { name: /Save and continue|^Continue$/ }).click(); await page.waitForTimeout(700); };
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('http://localhost:5174/admin/setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Save and continue/ }).waitFor({ timeout: 15000 });
  for (let i = 0; i < 4; i++) await next();          // gym → hours → look → words → runs
  const asked = await page.locator('[data-run-question]').evaluateAll((els) => els.map((e) => e.getAttribute('data-run-question')));
  say('What you run asks questions, only for what the plan includes', JSON.stringify(asked) === JSON.stringify(['classes', 'points', 'seasons', 'events', 'online_pay', 'moments']), JSON.stringify(asked));
  let t = await text();
  say('…each with one line on what it does, and where to change it later', /Do you run group classes\?/.test(t) && /personal training only/.test(t) && /Your app → What you run/.test(t));
  const pressed = async (key) => page.locator(`[data-run-question="${key}"] [aria-checked="true"]`).innerText();
  say("…showing today's answers (classes, seasons and events off)", (await pressed('classes')) === 'No' && (await pressed('points')) === 'Yes' && (await pressed('events')) === 'No');
  say('…a part whose section is on can be answered (seasons, inside points)', (await page.locator('[data-run-question="seasons"] [data-answer="yes"]').isEnabled()));
  await page.screenshot({ path: 'shots/admin-onboarding-questions.png' });

  const before = CALLS.length;
  await page.locator('[data-run-question="classes"] [data-answer="yes"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-run-question="points"] [data-answer="no"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-run-question="events"] [data-answer="yes"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-run-question="moments"] [data-answer="no"]').click();
  await page.waitForTimeout(600);
  const sets = CALLS.slice(before).filter(([f]) => f === 'set_gym_module').map(([, b]) => `${b.p_feature}=${b.p_enabled}`);
  say('Yes to classes, No to points, Yes to events each write that switch', JSON.stringify(sets) === JSON.stringify(['classes=true', 'points=false', 'events=true']), JSON.stringify(sets));
  say('No to celebrations turns the moments and their sounds off', PATCHES.some((p) => p.celebrations === false && p.celebration_sounds === false), JSON.stringify(PATCHES));
  say('…and the answer shows at once', (await pressed('classes')) === 'Yes' && (await pressed('moments')) === 'No');
  say('a question not answered writes nothing (seasons, online payments)', !CALLS.some(([f, b]) => f === 'set_gym_module' && (b.p_feature === 'seasons' || b.p_feature === 'online_pay')));
  await page.locator('[data-every-switch] summary').click();
  await page.waitForTimeout(300);
  say('every switch is still there, under Show every switch', /Online payments/.test(await page.locator('[data-every-switch]').innerText()));
  await next();
  say('Continue moves on to who approves bookings', /Who approves bookings/.test(await text()));
  return out.join('\n');
}
