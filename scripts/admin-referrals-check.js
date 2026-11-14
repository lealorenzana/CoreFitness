/**
 * People → Referrals (0253) on the owner's and desk's app, against fixtures:
 *   with the gym's Points OFF the page explains the desk reward, the owner's form shows the gym's two rewards
 *   and saves through set_referral_rewards; a paid referral owing a reward carries a Give button that calls
 *   give_referral_reward with the right side; a reward already handed over is a "given" pill; the third tile
 *   counts rewards still to hand over; the sidebar has Referrals and no Rewards row;
 *   with Points ON there is no desk form, the tile is "Points paid out" and a paid row shows its points;
 *   a front-desk account sees the form read-only ("Only the owner changes these") and can still Give;
 *   the Challenges form says it pays no points while points are off, and says nothing while they are on;
 *   light mode: the page is light and a row's words are dark enough to read; the page never scrolls.
 * Setup copied from admin-reels-check.js. Admin dev server on :5174.
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
  const SETTINGS = { referral_reward_referrer: '1 free day pass', referral_reward_friend: '₱100 off the first renewal' };
  const TABLES = { profiles: [admin], notifications: [], gym_settings: [SETTINGS] };

  // gym_referrals' own columns (0125 + 0253's desk columns).
  const OFF_ROWS = [
    { id: 'f1', referrer_name: 'Ana Reyes', friend_name: 'Ben Cruz', status: 'rewarded', created_at: iso(-6), rewarded_at: iso(-2),
      referrer_points: 0, friend_points: 0, desk_reward_referrer: '1 free day pass', desk_reward_friend: '₱100 off the first renewal',
      desk_given_referrer_at: null, desk_given_friend_at: iso(-1) },
    { id: 'f2', referrer_name: 'Ana Reyes', friend_name: 'Carla Diaz', status: 'pending', created_at: iso(-3), rewarded_at: null,
      referrer_points: 0, friend_points: 0, desk_reward_referrer: null, desk_reward_friend: null, desk_given_referrer_at: null, desk_given_friend_at: null },
  ];
  const ON_ROWS = [
    { id: 'p1', referrer_name: 'Ana Reyes', friend_name: 'Ben Cruz', status: 'rewarded', created_at: iso(-6), rewarded_at: iso(-2),
      referrer_points: 50, friend_points: 25, desk_reward_referrer: null, desk_reward_friend: null, desk_given_referrer_at: null, desk_given_friend_at: null },
  ];
  let ROLE = 'admin';
  const CALLS = [];
  const RPC = {
    gym_referrals: OFF_ROWS,
    my_gym_app: [{ modules: { points: false } }],
    set_referral_rewards: null,
    give_referral_reward: null,
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
      if (fn === 'set_referral_rewards' || fn === 'give_referral_reward') CALLS.push({ fn, body: req.postDataJSON() });
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
  // The sidebar remembers which groups are open, so open Engagement only when it is closed.
  const openEngagement = async () => {
    const g = page.getByRole('button', { name: /Engagement/ }).first();
    if ((await g.getAttribute('aria-expanded')) !== 'true') { await g.click(); await page.waitForTimeout(400); }
  };
  const noScroll = async () => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);

  // ── Points OFF, the owner ──
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/referrals');
  const card = page.locator('[data-referrals]');
  say('the Referrals page renders', (await page.locator('[data-referrals-page]').count()) === 1 && (await card.count()) === 1);
  const head = await card.innerText().catch(() => '');
  say('points off: it says a first payment earns the desk rewards', /runs no points, so a friend’s first payment earns the desk rewards/.test(head));
  say('the owner sees the two rewards filled in',
    (await page.locator('[data-reward-referrer]').inputValue()) === '1 free day pass'
    && (await page.locator('[data-reward-friend]').inputValue()) === '₱100 off the first renewal');
  say('…and can edit them', !(await page.locator('[data-reward-referrer]').isDisabled()));
  say('the third tile counts rewards still to hand over', /Rewards to hand over\s*1\s*at the desk/.test(head), `(${head.replace(/\s+/g, ' ').slice(0, 200)})`);
  say('no points tile with points off', !/Points paid out/.test(head));
  say('a reward owed carries a Give button for that side', (await page.locator('[data-give-reward="f1:referrer"]').count()) === 1);
  say('a reward handed over is a given pill, not a button',
    (await page.locator('[data-give-reward="f1:friend"]').count()) === 0 && /Ben: ₱100 off the first renewal · given/.test(head));
  say('a pending referral waits for its first payment', /Waiting for their first payment/.test(head));
  say('the sidebar has Referrals', (await page.locator('a[href="/referrals"]').count()) >= 1);
  await openEngagement();
  say('…and no Rewards row in the open Engagement group while points are off', (await page.locator('a[href="/rewards"]').count()) === 0);
  const darkScroll = await noScroll();
  say('the page does not scroll', darkScroll <= 0, `(scrolls ${darkScroll}px)`);
  await page.screenshot({ path: 'shots/admin-referrals-off-dark.png' });

  await page.locator('[data-reward-referrer]').fill('2 free day passes');
  await page.getByRole('button', { name: 'Save rewards' }).click();
  await page.waitForTimeout(800);
  const save = CALLS.find((c) => c.fn === 'set_referral_rewards');
  say('Save rewards sends both rewards', !!save && save.body.p_referrer === '2 free day passes' && save.body.p_friend === '₱100 off the first renewal', JSON.stringify(save?.body));
  await page.locator('[data-give-reward="f1:referrer"]').click();
  await page.waitForTimeout(800);
  const give = CALLS.find((c) => c.fn === 'give_referral_reward');
  say('Give sends the referral and the side', !!give && give.body.p_referral === 'f1' && give.body.p_who === 'referrer', JSON.stringify(give?.body));

  // Where an owner still types point amounts, points off says nothing is paid.
  await go('/challenges');
  say('points off: the challenge form says it pays no points', (await page.locator('[data-points-off]').count()) >= 1
    && /finishing a challenge earns no points/.test(await page.locator('[data-points-off]').first().innerText()));

  // Light mode, points off.
  await page.emulateMedia({ colorScheme: 'light' });
  await go('/referrals');
  const mode = await page.evaluate(() => document.documentElement.dataset.mode);
  const rgb = await page.locator('[data-referrals] strong').first().evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).map(Number);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  say('in light mode the app is light', mode === 'light', `(${mode})`);
  say('in light mode a name is dark enough to read', lum < 0.6, `(${rgb})`);
  const lightScroll = await noScroll();
  say('…and the page does not scroll in light either', lightScroll <= 0, `(scrolls ${lightScroll}px)`);
  await page.screenshot({ path: 'shots/admin-referrals-off-light.png' });

  // ── The front desk, points off ──
  ROLE = 'staff';
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/referrals');
  say('the desk sees the Referrals row', (await page.locator('a[href="/referrals"]').count()) >= 1);
  say('the desk sees the rewards read-only', (await page.locator('[data-reward-referrer]').isDisabled())
    && (await page.getByRole('button', { name: 'Save rewards' }).count()) === 0
    && /Only the owner changes these/.test(await page.locator('[data-desk-rewards]').innerText()));
  say('…and can still hand one over', (await page.locator('[data-give-reward="f1:referrer"]').count()) === 1);

  // ── Points ON, the owner ──
  ROLE = 'admin';
  RPC.my_gym_app = [{ modules: { points: true } }];
  RPC.gym_referrals = ON_ROWS;
  await go('/referrals');
  const onText = await page.locator('[data-referrals]').innerText().catch(() => '');
  say('points on: no desk form', (await page.locator('[data-desk-rewards]').count()) === 0);
  say('points on: the tile is points paid out', /Points paid out\s*75/.test(onText), `(${onText.replace(/\s+/g, ' ').slice(0, 200)})`);
  say('points on: a paid row shows its points', /Paid · 50 \+ 25 pts/.test(onText));
  await openEngagement();
  say('points on: the open Engagement group has Rewards back', (await page.locator('a[href="/rewards"]').count()) >= 1);
  await page.screenshot({ path: 'shots/admin-referrals-on-dark.png' });
  await go('/challenges');
  say('points on: no points-off note on the challenge form', (await page.locator('[data-points-off]').count()) === 0);
  return out.join(String.fromCharCode(10));
}
