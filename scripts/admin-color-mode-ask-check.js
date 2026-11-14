/**
 * The first sign-in question (0254) in the owner's and desk's app: Light, Dark, or Match my device.
 *   - an account that never chose is asked, in the middle of the screen; the sun/moon is named as the way to
 *     change it later;
 *   - tapping Dark shows dark at once without saving; Continue saves 'dark' and closes;
 *   - answering with the top bar's sun/moon instead also answers it (the question closes);
 *   - an account that already chose, or a database before 0254, is never asked;
 *   - readable in both modes.
 * Admin dev server on :5174. Screenshots to output/admin-color-mode-ask-*.png.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  let ASKED = false, HAS_0254 = true;
  const SAVES = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_color_mode') return json('system');
      if (fn === 'my_color_mode_asked') return HAS_0254 ? json(ASKED) : json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      if (fn === 'set_color_mode') { SAVES.push(req.postDataJSON().p_mode); ASKED = true; return json(null); }
      return json([]);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const rows = t === 'profiles' ? [admin] : [];
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const go = async (path) => { await page.goto('about:blank'); await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
  const ask = page.locator('[data-color-mode-ask]');
  const mode = () => page.evaluate(() => document.documentElement.dataset.mode);
  const lum = async (sel) => {
    const rgb = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  await page.emulateMedia({ colorScheme: 'light' });
  await go('/');
  say('an owner who never chose is asked', (await ask.count()) === 1);
  const txt = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
  say('…Match my device, Light, Dark', /Match my device/.test(txt) && /Light/.test(txt) && /Dark/.test(txt), `(${txt.slice(0, 160)})`);
  say('…and names the sun and moon for later', /sun and moon at the top/.test(txt));
  const box = await page.locator('.cma-box').boundingBox();
  say('…in the middle of the screen', !!box && Math.abs((box.y + box.height / 2) - 450) < 30, JSON.stringify(box));
  say('in light the question reads dark on light', (await lum('.cma-title')) < 0.35);
  await page.screenshot({ path: 'output/admin-color-mode-ask-light.png' });

  await page.locator('[data-mode-choice="dark"]').click();
  await page.waitForTimeout(300);
  say('tapping Dark shows dark at once', (await mode()) === 'dark');
  say('…without saving yet', SAVES.length === 0);
  say('in dark the question reads light on dark', (await lum('.cma-title')) > 0.7);
  await page.screenshot({ path: 'output/admin-color-mode-ask-dark.png' });
  await page.locator('[data-color-mode-go]').click();
  await page.waitForTimeout(600);
  say('Continue saves Dark on the account', SAVES.join(',') === 'dark', `(${SAVES.join(',')})`);
  say('…and the question closes', (await ask.count()) === 0);

  await go('/');
  say('an owner who already chose is not asked', (await ask.count()) === 0);

  ASKED = false; HAS_0254 = false;
  await go('/');
  say('before 0254, nobody is asked', (await ask.count()) === 0);
  return out.join(String.fromCharCode(10));
}
