/**
 * Training pages (2026-10-20, the approved mock-ups): Resources fills what a
 * pasted link honestly can (YouTube's thumbnail, the provider) and every tile
 * can be edited; Equipment closes a member's report as "Not a problem" with a
 * reason (dismiss_equipment_report, 0207). Both pages fit the screen.
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
  const exp = Math.floor(Date.now() / 1000) + 36000;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Olive', last_name: 'Owner', email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const RES = [
    { id: 'r1', title: 'Yoga Day 1', provider: 'YouTube', url: 'https://www.youtube.com/watch?v=v7AYKMP6rOE', image_url: null, description: null, category: 'Yoga', level: 'all_levels', is_active: true, sort_order: 10, created_at: new Date().toISOString() },
    { id: 'r2', title: 'Bodyweight workouts', provider: 'Darebee', url: 'https://darebee.com/workouts.html', image_url: null, description: null, category: 'Bodyweight', level: 'beginner', is_active: false, sort_order: 20, created_at: new Date().toISOString() },
  ];
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    const body = () => { const b = JSON.parse(req.postData() || '{}'); return Array.isArray(b) ? b[0] : b; };
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour', role: 'admin', status: 'active', lock_reason: null,
        short_name: null, logo_url: null, accent: 'teal', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'resource_save_counts') return json([{ resource_id: 'r1', saved: 12, done: 5 }]);
      if (fn === 'open_equipment_reports') return json([{ id: 'rep1', equipment_id: 'q1', equipment_name: 'Leg press', location_note: '2nd floor', status: 'available',
        note: 'The seat pin is stuck', member_name: 'Lea Lorenzana', created_at: new Date().toISOString() }]);
      if (fn === 'dismiss_equipment_report' || fn === 'set_equipment_status') { CALLS.push([fn, body()]); return json(null); }
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'workout_resources' && req.method() === 'POST') { CALLS.push(['post', body()]); return json(one ? { id: 'rn' } : [{ id: 'rn' }]); }
    if (t === 'workout_resources' && req.method() === 'PATCH') { CALLS.push(['patch', body()]); return json([{ id: 'r1' }]); }
    if (t === 'workout_resources') return json(RES);
    if (t === 'gym_equipment') return json([
      { id: 'q1', name: 'Leg press', category: 'machines', photo_url: null, quantity: 2, location_note: '2nd floor', status: 'available', notes: null, sort_order: 0, equipment_exercises: [] },
      { id: 'q2', name: 'Treadmill', category: 'cardio', photo_url: null, quantity: 4, location_note: 'Cardio deck', status: 'repair', notes: null, sort_order: 0, equipment_exercises: [] }]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const has = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (extra ? ' ' + extra : '')}`);
  const noScroll = () => page.evaluate(() => { const m = document.querySelector('main'); return !m || m.scrollHeight <= m.clientHeight + 1; });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('http://localhost:5174/resources', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-resource-grid]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  has('tiles with who saved them, the hidden one marked', /saved by 12 · done by 5/.test(await page.locator('[data-resource="Yoga Day 1"]').innerText())
    && /hidden/.test(await page.locator('[data-resource="Bodyweight workouts"]').innerText()));
  has('categories and Hidden filter the tiles', (await page.getByRole('button', { name: /^Hidden/ }).count()) === 1 && (await page.getByRole('button', { name: 'Yoga', exact: true }).count()) === 1);
  await page.getByLabel('Paste a link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByLabel('Paste a link').press('Enter');
  await page.waitForTimeout(500);
  has('a pasted YouTube link fills the provider and the thumbnail', (await page.getByLabel('Provider').inputValue()) === 'YouTube'
    && (await page.locator('img[src*="img.youtube.com/vi/dQw4w9WgXcQ"]').count()) >= 1);
  await page.getByLabel('Title').fill('Five-minute warm-up');
  await page.locator('[data-save-resource]').click();
  await page.waitForTimeout(600);
  const post = CALLS.find(([k]) => k === 'post');
  has('…and saves it with that picture', !!post && post[1].title === 'Five-minute warm-up' && /img\.youtube\.com/.test(post[1].image_url ?? ''), JSON.stringify(post && post[1]));
  await page.getByRole('button', { name: 'Edit Yoga Day 1' }).click();
  await page.getByLabel('Title').fill('Yoga — Day 1');
  await page.locator('[data-save-resource]').click();
  await page.waitForTimeout(600);
  has('a tile can be edited', CALLS.some(([k, b]) => k === 'patch' && b.title === 'Yoga — Day 1'));
  has('Resources does not scroll the page', await noScroll());
  await page.screenshot({ path: 'shots/admin-resources.png' });

  await page.goto('http://localhost:5174/equipment', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-equipment-reports]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  has('tiles: items, working, reported, under repair', /Items\s+2/i.test(await page.locator('[data-equipment-tiles]').innerText()) && /Under repair\s+1/i.test(await page.locator('[data-equipment-tiles]').innerText()));
  has('areas filter the list', (await page.locator('[data-area="Cardio deck"]').count()) === 1);
  await page.getByRole('button', { name: 'Not a problem' }).click();
  await page.getByLabel('What you found').fill('The pin locks on purpose — pull, then slide.');
  await page.locator('[data-report="Leg press"]').getByRole('button').first().click();
  await page.waitForTimeout(600);
  const dis = CALLS.find(([k]) => k === 'dismiss_equipment_report');
  has('Not a problem closes the report with what you found (0207)', !!dis && dis[1].p_report === 'rep1' && /pin locks/.test(dis[1].p_reason), JSON.stringify(dis));
  has('Equipment does not scroll the page', await noScroll());
  await page.screenshot({ path: 'shots/admin-equipment.png' });
  return out.join('\n');
}
