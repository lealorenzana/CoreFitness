/**
 * The admin Members View menu (2026-11-27, the platform owner's File Explorer ask): Details (the table, as before),
 * List (the same table on one line a member, so more fit), Tiles (a card a member), and a Details pane that docks the
 * member record beside the roster instead of over it. The choice lives in the address (?view=, ?pane=1), never in
 * the browser's storage. Light and dark, 1280 and 1600, no page scroll.
 *
 * Playwright runner, admin dev server :5174. Fixtures only, a made-up gym.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.addInitScript(() => { window.__CF_NO_TOURS = true; });
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
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const day = (d) => iso(d).slice(0, 10);
  const NAMES = ['Ana Cruz', 'Ben Ramos', 'Carla Diaz', 'Dino Santos', 'Ella Reyes', 'Femi Tan', 'Gio Lim', 'Hana Uy', 'Ivan Go', 'Jia Co',
    'Kiko Sy', 'Lea Lorenzana', 'Mara Dee', 'Nico Ong', 'Olive Lao', 'Paolo Yu', 'Quin Ty', 'Rina Chua', 'Sam Lee', 'Tess Ang',
    'Ugo Bautista', 'Vera Mendoza', 'Wes Navarro', 'Xena Ramos', 'Yuri Pascual', 'Zoe Garcia', 'Abel Torres', 'Bea Flores', 'Cid Rivera', 'Dana Castro'];
  const profiles = NAMES.map((n, i) => ({ id: `m${i}`, role: 'member', status: 'active', first_name: n.split(' ')[0], last_name: n.split(' ')[1],
    email: `m${i}@lab.test`, phone: '09171234567', photo_url: null, created_at: iso(-100 - i) }));
  const TABLES = {
    profiles,
    member_profiles: profiles.map((p) => ({ profile_id: p.id, gym_id: 'gym-1', qr_code: 'QR-' + p.id, experience_level: 'beginner', created_at: p.created_at, profiles: p })),
    memberships: profiles.map((p, i) => ({ id: 'ms' + i, member_id: p.id, plan_id: 'p1', status: 'active', start_date: day(-10), expiry_date: day(5 + i),
      never_expires: false, frozen_at: null, freeze_count: 0, created_at: iso(-10), membership_plans: { id: 'p1', name: 'Monthly', price: 800, duration_days: 30, tier: 'premium' } })),
    membership_plans: [{ id: 'p1', name: 'Monthly', price: 800, duration_days: 30, tier: 'premium', is_active: true }],
  };
  const RPC = {
    my_gym_context: [{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'core-fitness-lab', role: 'admin', status: 'active',
      lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }],
  };
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('='); return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) { const fn = pathname.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn] : []); }
    if (pathname.startsWith('/rest/v1/') && req.method() !== 'GET') return json([], 200);
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  const say = (k, ok, v) => out.push(`${k}: ${ok ? v : 'MISSING ' + v}`);
  const pick = async (label) => {
    await page.locator('[data-view-menu]').click();
    await page.getByRole(label === 'Details pane' ? 'menuitemcheckbox' : 'menuitemradio', { name: label, exact: true }).click();
    await page.waitForTimeout(700);
  };
  const rows = () => page.locator('[data-member-row]:visible').count();
  const noScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);

  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-member-row]').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const details = await rows();
    if (mode === 'dark') say('Details by default, the table as before', details > 0 && !page.url().includes('view='), `${details} rows`);
    await pick('List');
    const list = await rows();
    say(`${mode}: List fits more, one line a member`, list > details && /view=list/.test(page.url()) && await noScroll(), `${list} rows vs ${details}`);
    await pick('Tiles');
    say(`${mode}: Tiles are a grid of cards`, (await page.locator('[data-member-tiles] .a-tile').count()) >= 10 && await noScroll(), `${await page.locator('[data-member-tiles] .a-tile').count()} tiles`);
    await page.screenshot({ path: `.tmp-shots/admin-members-tiles-${mode}-1600.png` });
    await pick('Details pane');
    say(`${mode}: the pane waits for a pick, no backdrop`, (await page.locator('[data-member-pane]').count()) === 1 && /Pick a member/.test(await page.locator('[data-member-pane]').innerText()), 'empty pane');
    await page.locator('[data-member-tiles] .a-tile', { hasText: 'Ben Ramos' }).click();
    await page.waitForTimeout(1500);
    const pane = await page.locator('[data-member-pane]').innerText();
    say(`${mode}: a click fills the pane beside the roster`, /Ben/.test(pane) && (await page.locator('[data-member-tiles]').count()) === 1 && await noScroll(), pane.replace(/\s+/g, ' ').slice(0, 60));
    await page.screenshot({ path: `.tmp-shots/admin-members-pane-${mode}-1600.png` });
    await page.setViewportSize({ width: 1280, height: 860 });
    await pick('List');
    await page.waitForTimeout(600);
    say(`${mode}: List with the pane at 1280`, (await rows()) >= 3 && await noScroll(), `${await rows()} rows`);
    // Every filter chip whole and in view with the pane open (the toolbar wraps; before, the chips hid behind the search).
    const clipped = await page.evaluate(() => {
      const box = document.querySelector('[data-rd-chips]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-rd-chips] [data-chip]')].filter((c) => { const r = c.getBoundingClientRect();
        return r.width === 0 || r.right > box.right + 1 || r.bottom > box.bottom + 1; }).map((c) => c.dataset.chip);
    });
    say(`${mode}: every filter chip shows with the pane at 1280`, clipped.length === 0 && (await page.locator('[data-rd-chips] [data-chip]').count()) === 7, clipped.join(', ') || 'all 7');
    await page.screenshot({ path: `.tmp-shots/admin-members-list-pane-${mode}-1280.png` });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-member-row]').first().waitFor({ timeout: 20000 });
    say(`${mode}: the address keeps the choice`, /view=list/.test(page.url()) && /pane=1/.test(page.url()) && (await page.locator('[data-member-pane]').count()) === 1, 'after reload');
    await pick('Details pane');
    await pick('Details');
    say(`${mode}: back to the table, no pane`, !/view=|pane=/.test(page.url()) && (await page.locator('[data-member-pane]').count()) === 0, 'reset');
  }
  return out.join('\n');
}
