/**
 * The setup wizard (redesigned 2026-10-04): a new owner walks every step —
 * closed days, colours with a live preview, words, only the parts the plan
 * sells, the AI coach, plans edited/added/removed, the door — and ends on a
 * checklist that links to the pages the wizard does not copy.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'ana@anafitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const SETTINGS = { id: true, gym_id: 'gym-a', gym_name: 'Ana Fitness', short_name: null, tagline: null, address: 'Brgy Bunot',
    phone: null, email: null, opening_time: '06:00', closing_time: '21:00', accent: 'violet', logo_url: null, closed_days: [] };
  let PLANS = [
    { id: 'p-free', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true },
    { id: 'p-prem', name: 'Premium', tier: 'premium', price: 999, duration_days: 30, is_active: true },
    { id: 'p-trial', name: 'Free Trial', tier: 'premium', price: 0, duration_days: 30, is_active: true },
  ];
  const MODULES = [
    { feature_key: 'desk', label: 'The front desk', description: 'Payments and check-ins.', state: 'on', enabled: true, sort_order: 1, parent_key: null },
    { feature_key: 'shop', label: 'The shop', description: 'Sell at the desk.', state: 'on', enabled: true, sort_order: 2, parent_key: 'desk' },
    { feature_key: 'assistant', label: 'The AI coach', description: 'A coach in the app.', state: 'on', enabled: true, sort_order: 3, parent_key: null },
    { feature_key: 'squads', label: 'Squads', description: 'Train with friends.', state: 'not_sold', enabled: false, sort_order: 4, parent_key: null },
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
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const next = async () => { await page.getByRole('button', { name: /Save and continue|^Continue$/ }).click(); await page.waitForTimeout(700); };
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('http://localhost:5174/admin/setup', { waitUntil: 'domcontentloaded' });
  await page.getByText('Setting up Ana Fitness').waitFor({ timeout: 15000 });
  let t = await text();
  out.push('the rail lists every step: ' + (['Your gym', 'When you are open', 'How your app looks', 'Your words', 'What you run', 'Who approves bookings', 'How coaching works', 'The AI coach', 'Your plans', 'How members join', 'Ready to open'].every((s) => t.includes(s)) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-setup-1.png' });

  await next();                                    // gym → hours
  await page.getByRole('button', { name: 'Sun', exact: true }).click();
  await next();                                    // hours → look
  out.push('closed days saved: ' + (PATCHES.some((p) => Array.isArray(p.closed_days) && p.closed_days.includes(0)) ? 'Sunday' : 'MISSING ' + JSON.stringify(PATCHES)));
  t = await text();
  out.push('colours with a live preview: ' + (/Your main colour/.test(t) && /Your action colour/.test(t) && (await page.locator('button', { hasText: 'Forest' }).count()) > 0 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-setup-look.png' });
  await next();                                    // look → words
  out.push('the look is saved: ' + (CALLS.some(([f]) => f === 'save_gym_look') ? 'yes' : 'MISSING'));
  await next();                                    // words → runs
  t = await text();
  out.push('only what the plan sells: ' + (/The front desk/.test(t) && /The shop/.test(t) && !/Squads/.test(t) ? 'yes (squads hidden)' : 'MISSING'));
  await page.getByRole('button', { name: /The shop/ }).click();
  await page.waitForTimeout(500);
  out.push('a switch saves at once: ' + (CALLS.some(([f, b]) => f === 'set_gym_module' && b.p_feature === 'shop' && b.p_enabled === false) ? 'yes' : 'MISSING'));
  await next();                                    // runs → bookings (0180)
  t = await text();
  out.push('the bookings step asks who approves: ' + (/Who approves bookings/.test(t) && /Coach, then desk/.test(t) ? 'yes' : 'MISSING'));
  await next();                                    // bookings → coaching (0181)
  t = await text();
  out.push('the coaching step asks how members get a coach: ' + ((await page.locator('[data-coaching-settings]').count()) === 1 ? 'yes' : 'MISSING'));
  await next();                                    // coaching → coach
  t = await text();
  out.push('the AI coach step: ' + (/How much your members may talk to it/.test(t) ? 'shown (the plan sells it)' : 'MISSING'));
  await next();                                    // coach → plans
  page.once('dialog', (d) => d.accept());
  await page.getByLabel('Remove Free Trial').click();
  await page.waitForTimeout(600);
  out.push('a plan can be removed: ' + (CALLS.some(([f, b]) => f === 'retire_plan' && b.p_plan_id === 'p-trial') ? 'yes' : 'MISSING'));
  out.push('the free plan cannot be: ' + ((await page.getByLabel('Remove Free Plan').count()) === 0 ? 'yes' : 'MISSING'));
  await page.locator('#pd-p-prem').fill('90');
  await page.getByRole('button', { name: 'Add a plan' }).click();
  await page.locator('#np-0').fill('Student rate');
  await page.locator('#npp-0').fill('499');
  await page.screenshot({ path: 'shots/admin-setup-plans.png' });
  await next();                                    // plans → door
  out.push('days edited, a plan added: ' + (PATCHES.some((p) => p.duration_days === 90) && PLANS.some((p) => p.name === 'Student rate' && p.price === 499) ? 'yes' : 'MISSING ' + JSON.stringify(PATCHES)));
  await next();                                    // door → ready
  t = await text();
  out.push('the checklist is there: ' + ((await page.getByRole('button', { name: /Refund tiers and fee/ }).count()) === 1 && (await page.getByRole('button', { name: /The shop/ }).count()) === 1 && /Open my gym/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-setup-ready.png' });
  await page.getByRole('button', { name: /3\. How your app looks/ }).click();
  await page.waitForTimeout(300);
  out.push('a done step can be revisited: ' + (/Your main colour/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /11\. Ready to open/ }).click();
  await page.waitForTimeout(300);
  // The bug: a checklist link opened a page while the gym was still "not set up", and the guard sent it back here.
  await page.getByRole('button', { name: /Refund tiers and fee/ }).click();
  await page.waitForURL(/\/settings\?tab=refunds/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  out.push('a checklist item finishes setup and opens its page: ' + (FINISHED && /\/settings\?tab=refunds/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  return out.join(String.fromCharCode(10));
}
