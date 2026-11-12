/**
 * Reels (0245) on the phone: Today's strip of tiles, the full-screen player
 * (one player mounted at a time; a TikTok short link opens in TikTok, never an
 * iframe at a guess), the heart (optimistic, one RPC), no tab bar on the player;
 * and with the gym's switch off, no strip, no More row, and the gate on the URL.
 *
 * Member dev server on :5173. Hermetic: YouTube, TikTok and ytimg are aborted.
 * Screenshots to shots/member-reels-*.png.
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
  const sessionFor = (id, email) => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} },
  });
  const now = new Date();
  const dstr = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const iso = (d, h, m = 0) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const MEMBER = 'a3f92b00-0000-4000-8000-000000000011';
  const COACH = 'b7c2d100-0000-4000-8000-000000000012';
  const ME = { id: MEMBER, first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@reels-test.com', role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9) };
  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30, is_active: true, description: 'All',
    can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };
  const DB = {
    profiles: [ME],
    member_profiles: [{ profile_id: MEMBER, experience_level: 'beginner', qr_code: MEMBER, created_at: iso(-90, 9), profiles: ME }],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: MEMBER, plan_id: 'p3', status: 'active', start_date: dstr(-5), expiry_date: dstr(25), never_expires: false, frozen_at: null, created_at: iso(-5, 9), membership_plans: PREMIUM }],
    attendance: [],
  };
  const UPLOAD = `https://${REF}.supabase.co/storage/v1/object/public/reels/gyms/gym-1/reels/v1.mp4`;
  // gym_reels_feed's own columns (0245).
  const FEED = [
    { id: 'r1', title: 'Squat depth in 30 seconds', caption: 'Hips below the knee, chest up, knees over toes. Three cues, one rep at a time.', source: 'youtube',
      url: 'https://www.youtube.com/shorts/abcDEF12345', video_path: null, cover_path: null, hidden: false, created_at: iso(-1, 9),
      created_by: COACH, author: 'Gabby Coach', likes: 2, liked: false, mine: false, can_manage: false },
    { id: 'r2', title: 'Deadlift warm-up', caption: null, source: 'tiktok', url: 'https://vm.tiktok.com/ZSabc/', video_path: null, cover_path: null,
      hidden: false, created_at: iso(-2, 9), created_by: COACH, author: 'Gabby Coach', likes: 0, liked: false, mine: false, can_manage: false },
    { id: 'r3', title: 'New rack, first lift', caption: 'The new squat rack is in.', source: 'upload', url: UPLOAD, video_path: 'gyms/gym-1/reels/v1.mp4',
      cover_path: null, hidden: false, created_at: iso(-3, 9), created_by: COACH, author: 'Gabby Coach', likes: 5, liked: true, mine: false, can_manage: false },
  ];
  let modules = { reels: true };
  const CALLS = [];
  const match = (rows, params) => rows.filter((r) => params.every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k) || !(k in r)) return true;
    const m = /^eq\.(.*)$/.exec(v); if (m) return String(r[k]) === m[1];
    return true;
  }));

  // Hermetic: no real third-party player or thumbnail is fetched.
  await page.route(/youtube|ytimg|tiktok|googlevideo/, (r) => r.abort());
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => {
      const n = Array.isArray(b) ? b.length : 1;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
        headers: { 'Content-Range': `0-${Math.max(n - 1, 0)}/${n}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    };
    if (path.startsWith('/storage/')) return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? sessionFor(ME.id, ME.email).user : sessionFor(ME.id, ME.email));
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'member', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', short_name: null, logo_url: null, accent: 'violet',
        points_name: null, points_name_short: null, welcome_message: null, tagline: null, vocabulary: null, modules }]);
      // The real feed is empty while the switch is off (0245); here it answers anyway, so the screens' own switch is what is tested.
      if (fn === 'gym_reels_feed') return json(FEED);
      if (fn === 'toggle_reel_like') return json(true);
      if (fn === 'my_features') return json(['workout_tracker'].map((key) => ({ key, label: key, description: key, enabled: true })));
      if (fn === 'my_rooms' || fn === 'my_conversations' || fn === 'review_queue' || fn === 'my_room_photos' || fn === 'room_badges') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
    if (req.method() !== 'GET') return json([], 201);
    const rows = match(DB[t] ?? [], params);
    return json(one ? (rows[0] ?? null) : rows);
  });

  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 393, height: 852 });
  // Runs in every frame — the aborted player iframes' error pages refuse localStorage, so only the app's own frame plants it.
  await page.addInitScript(([k, s]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); } catch { /* a player's frame */ } }, [KEY, sessionFor(MEMBER, ME.email)]);
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2200);
  };
  const players = () => page.locator('[data-reel-player] iframe, [data-reel-player] video').count();
  const activeTitle = async () => (await page.locator('[data-reel-active] [data-reel-title]').first().innerText().catch(() => '')).trim();
  const tabBar = () => page.getByRole('navigation', { name: 'Main' }).count();

  // ── On: Today's strip ──
  await go('/member/home');
  const tiles = await page.locator('[data-today-reels] [data-reel-tile-id]').count();
  say('Today shows a Reels strip with the gym\'s 3 reels', tiles === 3, `${tiles} tiles`);
  say('…with See all into the player', (await page.locator('[data-today-reels]').getByRole('button', { name: /See all reels/ }).count()) === 1);
  await page.screenshot({ path: 'shots/member-reels-today.png' });
  await page.locator('[data-today-reels] [data-reel-tile-id="r3"]').click();
  await page.waitForTimeout(1500);
  say('a tile opens the player at that reel', /\/member\/reels\?reel=r3/.test(page.url()) && (await activeTitle()) === 'New rack, first lift', `${page.url()} | ${await activeTitle()}`);

  // ── The player ──
  await go('/member/reels');
  say('the player opens on the first reel', (await activeTitle()) === 'Squat depth in 30 seconds', await activeTitle());
  say('no tab bar on the player', (await tabBar()) === 0);
  say('one player mounted: the YouTube reel\'s iframe, nothing else', (await players()) === 1
    && (await page.locator('[data-reel-active] iframe[src*="youtube-nocookie.com/embed/abcDEF12345"]').count()) === 1, `${await players()} players`);
  const cover = await page.evaluate(() => {
    const f = document.querySelector('[data-reel-active] iframe'); if (!f) return 'no iframe';
    const b = f.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit === f ? '' : `${hit?.tagName}.${String(hit?.className).slice(0, 60)} ${hit?.textContent?.slice(0, 60)}`;
  });
  say('nothing of ours covers the iframe', cover === '', cover);
  await page.screenshot({ path: 'shots/member-reels-player.png' });

  const likesBefore = (await page.locator('[data-reel-active] [data-reel-likes]').innerText()).trim();
  const callsBefore = CALLS.filter(([f]) => f === 'toggle_reel_like').length;
  await page.locator('[data-reel-active] [data-reel-like]').click();
  await page.waitForTimeout(900);
  const likesAfter = (await page.locator('[data-reel-active] [data-reel-likes]').innerText()).trim();
  const likeCalls = CALLS.filter(([f]) => f === 'toggle_reel_like');
  say('the heart: 2 → 3, pressed, one call to toggle_reel_like for this reel', likesBefore === '2' && likesAfter === '3'
    && (await page.locator('[data-reel-active] [data-reel-like]').getAttribute('aria-pressed')) === 'true'
    && likeCalls.length - callsBefore === 1 && likeCalls.at(-1)[1].p_reel === 'r1', `${likesBefore}→${likesAfter}, ${likeCalls.length - callsBefore} calls`);

  await page.locator('[data-reel-active]').getByRole('button', { name: 'Next reel' }).click();
  await page.waitForTimeout(1500);
  say('Next moves to the TikTok reel', (await activeTitle()) === 'Deadlift warm-up', await activeTitle());
  const open = page.locator('[data-reel-active] [data-reel-open]');
  say('a TikTok short link: "Open in TikTok", opening the link outside, and no iframe', (await open.count()) === 1
    && /Open in TikTok/.test(await open.innerText()) && (await open.getAttribute('target')) === '_blank'
    && (await open.getAttribute('href')) === 'https://vm.tiktok.com/ZSabc/' && (await page.locator('[data-reel-player] iframe').count()) === 0,
    `${await open.count()} buttons, ${await page.locator('[data-reel-player] iframe').count()} iframes`);
  say('…and no player at all is left mounted from the reel before', (await players()) === 0, `${await players()}`);
  await page.screenshot({ path: 'shots/member-reels-tiktok.png' });

  await page.locator('[data-reel-active]').getByRole('button', { name: 'Next reel' }).click();
  await page.waitForTimeout(1500);
  say('the upload plays in a muted <video>, the only player mounted', (await activeTitle()) === 'New rack, first lift'
    && (await page.locator('[data-reel-active] video').count()) === 1 && (await players()) === 1
    && (await page.locator('[data-reel-active] video').evaluate((v) => v.muted && v.loop && v.playsInline)), `${await activeTitle()} | ${await players()}`);
  say('…with a sound button', (await page.locator('[data-reel-active]').getByRole('button', { name: 'Turn the sound on' }).count()) === 1);
  say('the page itself never scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // ── Off: no strip, no More row, the gate on a typed address ──
  modules = { reels: false };
  await go('/member/home');
  say('switched off: no Reels strip on Today', (await page.locator('[data-today-reels]').count()) === 0);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.waitForTimeout(700);
  const moreRows = await page.getByRole('dialog', { name: 'More' }).locator('[data-more-row]').allInnerTexts();
  say('…and no Reels row in More', moreRows.length > 0 && !moreRows.some((r) => /Reels/.test(r)), moreRows.join(' | ').slice(0, 200));
  await go('/member/reels');
  say('…and /member/reels shows the "Not at this gym" gate', /Not at this gym/.test(await page.locator('main').innerText()));
  say('no page errors', errs.length === 0, errs.join(' | '));
  return out.join('\n');
}
