/**
 * How your gym works (0256) on Settings → Bookings: the gym's saved styles are ticked; changing them lists
 * exactly which settings would change (now → next) and nothing is sent until Apply these; Apply sends the
 * styles; Who approves bookings then shows the new choice; Keep my settings puts the ticks back; light and dark.
 * Setup copied from admin-referrals-check.js. Admin dev server on :5174.
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

  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const SETTINGS = { gym_styles: ['classes', 'pt_appointments'], class_booking_approval: 'instant', pt_booking_approval: 'coach' };
  const TABLES = { profiles: [admin], notifications: [], gym_settings: [SETTINGS] };

  let ROLE = 'admin';
  const CALLS = [];
  const CHANGES = {
    'coaching_packages': [
      { setting: 'classes', label: 'Classes', now_value: 'On', next_value: 'Off' },
      { setting: 'class_booking', label: 'Booking a class in the app', now_value: 'Instant', next_value: 'Off — the desk books' },
      { setting: 'pt_booking', label: 'Booking a 1-on-1 session in the app', now_value: 'Coach approves', next_value: 'Off — the desk books' },
    ],
  };
  const RPC = {
    my_gym_app: [{ modules: { points: true } }],
    gym_style_changes: null, apply_gym_styles: null, set_booking_approval: null,
  };
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
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: ROLE, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'gym_style_changes') { const b = req.postDataJSON(); CALLS.push({ fn, body: b }); return json(CHANGES[[...b.p_styles].sort().join('+')] ?? []); }
      if (fn === 'apply_gym_styles') { CALLS.push({ fn, body: req.postDataJSON() }); SETTINGS.gym_styles = req.postDataJSON().p_styles; SETTINGS.class_booking_approval = 'off'; SETTINGS.pt_booking_approval = 'off'; }
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const rows = (TABLES[t] ?? []).map((r) => (t === 'profiles' ? { ...r, role: ROLE } : r));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const go = async (path) => { await page.goto('about:blank'); await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
  const checked = async () => (await page.locator('[data-gym-styles] [role="checkbox"][aria-checked="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-style')))).sort();

  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    SETTINGS.gym_styles = ['classes', 'pt_appointments']; SETTINGS.class_booking_approval = 'instant'; SETTINGS.pt_booking_approval = 'coach';
    CALLS.length = 0;
    await go('/settings?tab=bookings');
    say(`${mode}: the panel shows on Settings → Bookings`, (await page.locator('[data-gym-styles]').count()) === 1);
    say(`${mode}: the saved styles are ticked`, JSON.stringify(await checked()) === JSON.stringify(['classes', 'pt_appointments']), JSON.stringify(await checked()));
    say(`${mode}: as saved, it says the settings match`, (await page.locator('[data-style-nochange]').count()) === 1);
    // To the G Fitness way: coaching packages only.
    await page.locator('[data-style="classes"]').click();
    await page.locator('[data-style="pt_appointments"]').click();
    await page.locator('[data-style="coaching_packages"]').click();
    await page.waitForTimeout(700);
    const rows = await page.locator('[data-style-change]').evaluateAll((els) => els.map((e) => e.getAttribute('data-style-change')));
    say(`${mode}: the three changes are listed, now → next`, JSON.stringify(rows) === JSON.stringify(['classes', 'class_booking', 'pt_booking'])
      && /Classes:\s*On\s*Off/.test((await page.locator('[data-style-changes]').innerText()).replace(/\s+/g, ' ')), JSON.stringify(rows));
    say(`${mode}: …and nothing is applied yet`, !CALLS.some((c) => c.fn === 'apply_gym_styles'));
    await page.screenshot({ path: `shots/admin-gym-styles-${mode}.png` });
    if (mode === 'dark') {
      await page.getByRole('button', { name: 'Keep my settings' }).click();
      await page.waitForTimeout(500);
      say('Keep my settings puts the ticks back', JSON.stringify(await checked()) === JSON.stringify(['classes', 'pt_appointments']), JSON.stringify(await checked()));
    } else {
      await page.getByRole('button', { name: 'Apply these' }).click();
      await page.waitForTimeout(1200);
      const ap = CALLS.find((c) => c.fn === 'apply_gym_styles');
      say('Apply these sends the styles', JSON.stringify(ap?.body?.p_styles ?? null) === JSON.stringify(['coaching_packages']), JSON.stringify(ap?.body));
      say('…and Who approves bookings shows the new choice', await page.locator('[data-mode="pt:off"][aria-checked="true"]').count() === 1
        && await page.locator('[data-mode="class:off"][aria-checked="true"]').count() === 1);
    }
  }
  const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('the page itself does not scroll', scroll <= 0, `(${scroll}px)`);
  return out.join(String.fromCharCode(10));
}
