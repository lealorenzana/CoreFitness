/**
 * The owner's photo in the header (top right) follows Settings → My Profile.
 *
 * Reported 2026-09-27: Ana set a photo in Settings and the header chip kept
 * showing "AL". The header drew initials only, and read the profile once.
 *
 *   1. a profile with a photo: the header shows it on load;
 *   2. the photo changes while the page is open (here: saving My Profile, the
 *      fixture hands back a new photo): the header shows the new one at once,
 *      with no reload.
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

  // A 1x1 PNG, served for any photo URL so <img> really loads.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://photos.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

  let photo = 'https://photos.example.test/first.png';
  const me = () => ({ id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
    email: 'ana@anafitness.test', phone: '09093498899', photo_url: photo, created_at: new Date().toISOString() });

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
    if (t === 'profiles' || t === 'gym_people') {
      if (req.method() === 'PATCH') photo = 'https://photos.example.test/second.png';
      return json(one ? me() : [me()]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const headerPhoto = () => page.evaluate(() =>
    document.querySelector('header img')?.getAttribute('src') ?? null);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Save Profile' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  let src = await headerPhoto();
  out.push('header shows the photo on load: ' + (src?.includes('first.png') ? 'yes' : 'MISSING (' + src + ')'));
  await page.screenshot({ path: 'shots/header-photo.png', clip: { x: 880, y: 0, width: 400, height: 64 } });

  await page.getByRole('button', { name: 'Save Profile' }).click();
  await page.waitForTimeout(1200);
  src = await headerPhoto();
  out.push('header follows a change, no reload: ' + (src?.includes('second.png') ? 'yes' : 'MISSING (' + src + ')'));

  return out.join('\n');
}
