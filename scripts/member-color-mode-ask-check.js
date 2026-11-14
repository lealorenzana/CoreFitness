/**
 * The first sign-in question (0254) in the member app: Light, Dark, or Match my phone.
 *   - an account that never chose (my_color_mode_asked → false) is asked, at the bottom of the phone screen;
 *   - tapping Light shows light at once WITHOUT saving; Continue saves it (set_color_mode 'light') and closes;
 *   - an account that already chose is not asked; before 0254 (the function is missing) nobody is asked;
 *   - Match my phone is the default choice and saves 'system';
 *   - a Filipino member reads it in Filipino;
 *   - readable in both modes: the title is dark on light and light on dark.
 * Member dev server on :5173. Screenshots to output/color-mode-ask-*.png.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = () => ({ id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'mia@example.test', app_metadata: { providers: ['email'] }, user_metadata: {}, identities: [] });
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: user(),
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  let ASKED = false;            // my_color_mode_asked()
  let HAS_0254 = true;          // false: the function is missing (404)
  let LANG = 'en';
  const SAVES = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_color_mode') return json('system');
      if (fn === 'my_color_mode_asked') return HAS_0254 ? json(ASKED) : json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      if (fn === 'set_color_mode') { SAVES.push(req.postDataJSON().p_mode); ASKED = true; return json(null); }
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: 'member', status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'member_profiles') { const r = { profile_id: 'u1', preferred_language: LANG }; return json(one ? r : [r]); }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto('about:blank');
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1800);
  };
  const ask = page.locator('[data-color-mode-ask]');
  const mode = () => page.evaluate(() => document.documentElement.dataset.mode);
  const lum = async (sel) => {
    const rgb = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  // 1 — never chose, phone in dark: asked, and the sheet sits at the bottom.
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/member/home');
  say('a member who never chose is asked', (await ask.count()) === 1);
  const txt = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
  say('…with the three choices', /Match my phone/.test(txt) && /Light/.test(txt) && /Dark/.test(txt) && /Continue/.test(txt), `(${txt.slice(0, 160)})`);
  say('…Match my phone is chosen to start', (await page.locator('[data-mode-choice="system"]').getAttribute('aria-checked')) === 'true');
  const box = await page.locator('.cma-box').boundingBox();
  say('…at the bottom of the phone screen', !!box && Math.abs(box.y + box.height - 852) < 2, JSON.stringify(box));
  say('in dark the question reads light on dark', (await lum('.cma-title')) > 0.7);
  await page.screenshot({ path: 'output/color-mode-ask-dark.png' });

  // 2 — tap Light: shown at once, nothing saved; Continue saves and closes.
  await page.locator('[data-mode-choice="light"]').click();
  await page.waitForTimeout(300);
  say('tapping Light shows light at once', (await mode()) === 'light');
  say('…without saving yet', SAVES.length === 0);
  say('in light the question reads dark on light', (await lum('.cma-title')) < 0.35);
  await page.screenshot({ path: 'output/color-mode-ask-light.png' });
  await page.locator('[data-color-mode-go]').click();
  await page.waitForTimeout(600);
  say('Continue saves Light on the account', SAVES.join(',') === 'light', `(${SAVES.join(',')})`);
  say('…and the question closes', (await ask.count()) === 0);

  // 3 — already chose: not asked again.
  await go('/member/home');
  say('a member who already chose is not asked', (await ask.count()) === 0);

  // 4 — before 0254 is pasted: nobody is asked.
  ASKED = false; HAS_0254 = false;
  await go('/member/home');
  say('before 0254, nobody is asked', (await ask.count()) === 0);
  HAS_0254 = true;

  // 5 — the default saves "system".
  SAVES.length = 0;
  await go('/member/home');
  await page.locator('[data-color-mode-go]').click();
  await page.waitForTimeout(600);
  say('Continue with Match my phone saves system', SAVES.join(',') === 'system', `(${SAVES.join(',')})`);

  // 6 — Filipino.
  ASKED = false; LANG = 'fil';
  await go('/member/home');
  const fil = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
  say('a Filipino member reads it in Filipino', /Paano mo gustong makita ang app\?/.test(fil) && /Kapareho ng phone ko/.test(fil) && /Ituloy/.test(fil), `(${fil.slice(0, 120)})`);
  await page.screenshot({ path: 'output/color-mode-ask-fil.png' });
  return out.join('\n');
}
