/**
 * Days the gym is closed (0153), on Settings → Gym Information: a day picker
 * beside the hours, saved with them, so members' streaks never count a closed
 * day as a day left. Before 0153 there is no picker and the save never names the
 * column (it would fail the whole save).
 *
 * Setup copied from admin-header-photo-check.js. Admin dev server on :5174.
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

  // A 1x1 PNG, served for any photo URL so <img> really loads.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://photos.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

  let photo = 'https://photos.example.test/first.png';
  const me = () => ({ id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
    email: 'ana@anafitness.test', phone: '09093498899', photo_url: photo, created_at: new Date().toISOString() });

  // The gym's settings row (0013), closed on Sundays (0153). PATCH bodies are kept.
  let GYM = { id: true, gym_id: 'gym-a', gym_name: 'Ana Gymanigga', address: 'Mamburao', phone: null, email: null,
    opening_time: '06:00', closing_time: '21:00', activity_options: ['Weights'], logo_url: null, short_name: null,
    tagline: null, accent: 'violet', closed_days: [0], updated_at: new Date().toISOString(), updated_by: null };
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
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-a', gym_name: 'Ana Gymanigga', slug: 'ana-gym', role: 'admin',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      if (req.method() === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); PATCHES.push(body); GYM = { ...GYM, ...body }; }
      return json(one ? GYM : [GYM]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      if (req.method() === 'PATCH') photo = 'https://photos.example.test/second.png';
      return json(one ? me() : [me()]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Gym Information/ }).first().click();
  await page.getByRole('group', { name: 'Days the gym is closed' }).waitFor({ timeout: 10000 });
  const pressed = async (d) => page.getByRole('group', { name: 'Days the gym is closed' }).getByRole('button', { name: d }).getAttribute('aria-pressed');
  out.push('Closed on, beside the hours: ' + ((await pressed('Sun')) === 'true' && (await pressed('Sat')) === 'false' ? 'Sunday closed' : 'MISSING'));
  out.push('…and why it matters, said plainly: ' + (/never count a closed day as a day left to train/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('group', { name: 'Days the gym is closed' }).getByRole('button', { name: 'Sat' }).click();
  await page.getByRole('button', { name: /Save Gym Information/ }).click();
  await page.waitForTimeout(1200);
  const last = PATCHES[PATCHES.length - 1] ?? {};
  out.push('saved with the hours: ' + (Array.isArray(last.closed_days) && [...last.closed_days].sort().join(',') === '0,6' ? 'Sat and Sun' : 'MISSING ' + JSON.stringify(last.closed_days)));
  await page.screenshot({ path: 'shots/admin-closed-days.png' });

  // Before 0153 the column is not there: no picker, and the save never names it.
  GYM = { ...GYM }; delete GYM.closed_days; PATCHES.length = 0;
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Gym Information/ }).first().click();
  await page.getByRole('button', { name: /Save Gym Information/ }).waitFor({ timeout: 10000 });
  out.push('before 0153: no picker: ' + ((await page.getByRole('group', { name: 'Days the gym is closed' }).count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.getByRole('button', { name: /Save Gym Information/ }).click();
  await page.waitForTimeout(1000);
  out.push('…and the save never names the missing column: ' + (PATCHES.length > 0 && !('closed_days' in PATCHES[PATCHES.length - 1]) ? 'yes' : 'MISSING ' + JSON.stringify(PATCHES)));
  return out.join('\n');
}
