/**
 * Back steps back within the tab you are in (lib/navTrail.ts, 2026-11-14) — the owner's exact path:
 *   Today → Train (Workout) → Your workouts → Back → Train's Workout, not a stale page;
 *   Your workouts → Today (bottom bar) → Train (bottom bar: back where you were) → Back → Train's Workout, not Today;
 *   the same after a reload (an app update reloads the page), and tapping Train while in Train goes to its main screen.
 * Member dev server on :5173.
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
      if (fn === 'my_color_mode_asked') return json(true);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: 'member', status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  await page.setViewportSize({ width: 393, height: 852 });
  const settle = async () => { await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {}); await page.waitForTimeout(1300); };
  const at = () => new URL(page.url()).pathname + new URL(page.url()).search;
  const bar = (name) => page.locator('nav button, [role="navigation"] button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
  const back = () => page.getByRole('button', { name: /^\s*Back\s*$/ }).first();

  await page.goto('http://localhost:5173/member/home', { waitUntil: 'domcontentloaded' });
  await settle();
  await bar('Train').click(); await settle();
  const trainHome = at();
  say('Train opens its Workout screen', /^\/member\/book-class/.test(trainHome), `(${trainHome})`);

  // 1 — Your workouts, then Back.
  await page.getByText('Your workouts', { exact: true }).first().click(); await settle();
  say('Your workouts opens', at().startsWith('/member/track'), `(${at()})`);
  await back().click(); await settle();
  say('Back returns to Train’s Workout', at().startsWith('/member/book-class'), `(${at()})`);

  // 2 — Your workouts, Today, Train, Back: the owner's path.
  await page.getByText('Your workouts', { exact: true }).first().click(); await settle();
  await bar('Today').click(); await settle();
  say('Today opens', at().startsWith('/member/home'), `(${at()})`);
  await bar('Train').click(); await settle();
  say('Train brings back the screen last open there', at().startsWith('/member/track'), `(${at()})`);
  await back().click(); await settle();
  say('Back stays in Train (not Today)', at().startsWith('/member/book-class'), `(${at()})`);

  // 3 — after a reload (an app update reloads the page).
  await page.getByText('Your workouts', { exact: true }).first().click(); await settle();
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle();
  await back().click(); await settle();
  say('after a reload, Back still returns to Train’s Workout', at().startsWith('/member/book-class'), `(${at()})`);

  // 4 — tapping Train while in Train goes to its main screen.
  await page.getByText('Your workouts', { exact: true }).first().click(); await settle();
  await bar('Train').click(); await settle();
  say('tapping Train inside Train goes to its main screen', at().startsWith('/member/book-class'), `(${at()})`);
  return out.join('\n');
}
