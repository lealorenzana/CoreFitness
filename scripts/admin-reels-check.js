/**
 * Reels (0245) on the owner's and desk's app, against fixtures:
 *   three reels from gym_reels_feed (real column names): a YouTube Short with 2 likes,
 *   a TikTok short link that cannot play inside the app, and a hidden upload;
 *   the gym's storage reads "62 MB of 2 GB" from my_gym_storage (0247) and Uploads counts 1;
 *   how each site's link plays (reelEmbed.ts): YouTube and TikTok at once and looping, TikTok in its
 *   video player, Instagram cropped to its video; a bad link in Add a reel
 *   shows the hint; a cover that will not load becomes the plain tile, never a broken image;
 *   only rows with can_manage carry Edit/Hide/Remove; the page does not scroll;
 *   in light mode a tile's title is not near-white; a front-desk account sees the sidebar row.
 * Setup copied from admin-fixes-check.js. Admin dev server on :5174.
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
  const TABLES = { profiles: [admin], notifications: [] };

  // gym_reels_feed's own columns (0245).
  const FEED = [
    { id: 'r1', title: 'Three stretches before you lift', caption: 'Do these before every leg day.', source: 'youtube',
      url: 'https://www.youtube.com/shorts/abcDEF12345', video_path: null, cover_path: null, hidden: false,
      created_at: iso(-1), created_by: 'u1', author: 'Gabrielle Facalarin', likes: 2, liked: false, mine: true, can_manage: true },
    { id: 'r2', title: 'Coach Mia says hello', caption: null, source: 'tiktok',
      url: 'https://vm.tiktok.com/ZSabc/', video_path: null, cover_path: null, hidden: false,
      created_at: iso(-2), created_by: 'c1', author: 'Mia Santos', likes: 0, liked: false, mine: false, can_manage: false },
    { id: 'r3', title: 'Saturday bootcamp highlights', caption: 'The whole class, in thirty seconds.', source: 'upload',
      url: `https://${REF}.supabase.co/storage/v1/object/public/reels/gyms/gym-1/reels/v1.mp4`,
      video_path: 'gyms/gym-1/reels/v1.mp4', cover_path: null, hidden: true,
      created_at: iso(-3), created_by: 'u1', author: 'Gabrielle Facalarin', likes: 0, liked: false, mine: true, can_manage: true },
  ];
  let ROLE = 'admin';
  const RPC = {
    gym_reels_feed: FEED,
    reel_upload_limit: 10,
    my_gym_storage: [{ plan_name: 'Starter', limit_bytes: 2048 * 1048576, used_bytes: 62 * 1048576 }],
    my_gym_app: [{ modules: { reels: true } }],
  };

  await page.route('**://i.ytimg.com/**', (route) => route.abort());   // the cover fails: the tile must stay whole
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
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: ROLE, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
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
  const go = async (path) => { await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };

  await go('/reels');
  const tiles = page.locator('[data-reel]');
  say('three reel tiles', (await tiles.count()) === 3, `(${await tiles.count()})`);
  say('the hidden upload wears the hidden pill', (await page.locator('[data-reel="Saturday bootcamp highlights"] [data-reel-hidden]').count()) === 1);
  say('the TikTok short link says it opens in TikTok',
    /Opens in TikTok/.test(await page.locator('[data-reel="Coach Mia says hello"]').innerText())
    && (await page.locator('[data-reel="Three stretches before you lift"] [data-reel-opens]').count()) === 0);
  const up = (await page.locator('[data-chip="uploads"]').innerText()).replace(/\s+/g, ' ');
  say('the Uploads chip counts the one upload', /Uploads 1$/.test(up), `(${up})`);
  const store = await page.locator('[data-reel-storage]').innerText().catch(() => '');
  say("the gym's storage is shown against its plan", /Storage 62 MB of 2 GB/.test(store), `(${store})`);
  // How each site's link plays — the module itself, through the dev server.
  const emb = await page.evaluate(async () => {
    const m = await import('/src/lib/reelEmbed.ts');
    return {
      yt: m.reelEmbedUrl('https://youtube.com/shorts/_GziHDdJY10?si=abc'),
      tt: m.reelEmbedUrl('https://www.tiktok.com/@chadnerf/video/7539171941316381959?is_from_webapp=1'),
      ttShort: m.reelEmbedUrl('https://vm.tiktok.com/ZSabc/'),
      ig: m.reelEmbedUrl('https://www.instagram.com/reel/DeRcEBZsdbT/?utm_source=ig_web_copy_link'),
      fbShare: m.reelEmbedUrl('https://www.facebook.com/share/p/1DYmJhPcf3/'),
      fbReel: m.reelEmbedUrl('https://www.facebook.com/reel/1234567890'),
      crop: m.INSTAGRAM_CROP,
      photoWhy: m.reelOutsideWhy('https://www.tiktok.com/@a/photo/7681426118015995157?q=gym'),
      photoWords: m.reelOutsideWords('https://www.tiktok.com/@a/photo/7681426118015995157', 'TikTok'),
      fbWhy: m.reelOutsideWhy('https://www.facebook.com/share/p/1DYmJhPcf3/'),
      videoWhy: m.reelOutsideWhy('https://www.tiktok.com/@a/video/7539171941316381959'),
    };
  });
  say('YouTube plays at once and loops', /youtube-nocookie\.com\/embed\/_GziHDdJY10\?.*autoplay=1.*loop=1.*playlist=_GziHDdJY10/.test(emb.yt ?? ''), String(emb.yt));
  say("TikTok uses its video player (not the post card), playing at once and looping", /^https:\/\/www\.tiktok\.com\/player\/v1\/7539171941316381959\?autoplay=1&loop=1/.test(emb.tt ?? '') && !/embed\/v2/.test(emb.tt ?? ''), String(emb.tt));
  say('a TikTok short link and a Facebook share link still open in their own app', emb.ttShort === null && emb.fbShare === null);
  say('a Facebook reel link plays in the video plugin', /facebook\.com\/plugins\/video\.php\?href=.*autoplay=true/.test(emb.fbReel ?? ''), String(emb.fbReel));
  say('a TikTok photo post is told apart, and says to swipe through it in TikTok', emb.photoWhy === 'photo' && /photo post/.test(emb.photoWords), JSON.stringify([emb.photoWhy, emb.photoWords]));
  say('a Facebook share link is a share; a TikTok video plays here', emb.fbWhy === 'share' && emb.videoWhy === null);
  say("Instagram's embed is cropped to its video (header pushed out, likes below the box)", /instagram\.com\/reel\/DeRcEBZsdbT\/embed$/.test(emb.ig ?? '') && emb.crop.header === 54 && emb.crop.ratio > 1 && emb.crop.below >= 300, JSON.stringify(emb.crop));
  say('the YouTube reel shows its 2 likes', /2/.test(await page.locator('[data-reel="Three stretches before you lift"] [data-reel-likes]').innerText()));
  await page.waitForTimeout(800);
  say('a cover that will not load becomes the plain tile', (await page.locator('[data-reel="Three stretches before you lift"] [data-reel-cover="plain"]').count()) === 1
    && (await page.locator('[data-reel] img').count()) === 0);
  say('only a reel the account may change carries Edit and Remove',
    (await page.getByRole('button', { name: 'Edit Coach Mia says hello' }).count()) === 0
    && (await page.getByRole('button', { name: 'Edit Three stretches before you lift' }).count()) === 1
    && (await page.getByRole('button', { name: 'Remove Saturday bootcamp highlights' }).count()) === 1);
  say('the sidebar has a Reels row', (await page.locator('a[href="/reels"]').count()) >= 1);
  const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('the page does not scroll', scroll <= 0, `(scrolls ${scroll}px)`);
  await page.screenshot({ path: 'shots/admin-reels.png' });

  // Add a reel with a link no site we take.
  await page.locator('[data-add-reel]').click();
  await page.waitForTimeout(400);
  await page.getByRole('dialog').getByLabel('Link').fill('https://example.com/video/1');
  await page.getByRole('dialog').getByLabel('Title').fill('A bad link');
  await page.locator('[data-post-reel]').click();
  await page.waitForTimeout(400);
  const err = await page.locator('[data-reel-link-error]').count() ? await page.locator('[data-reel-link-error]').innerText() : '';
  say('a bad link shows the hint', /A link from YouTube, TikTok, Facebook or Instagram/.test(err), `(${err})`);
  await page.screenshot({ path: 'shots/admin-reels-bad-link.png' });

  // Preview of the YouTube Short is the embed, 9:16.
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('[data-post-reel]').waitFor({ state: 'detached', timeout: 5000 });
  await page.getByRole('button', { name: 'Preview Three stretches before you lift' }).click();
  await page.waitForTimeout(500);
  const src = await page.locator('[data-reel-preview] iframe').getAttribute('src').catch(() => null);
  say('the YouTube preview plays inside, from youtube', !!src && /youtube/.test(src), `(${src})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Light mode: a tile's title is not near-white.
  await page.emulateMedia({ colorScheme: 'light' });
  await go('/reels');
  const mode = await page.evaluate(() => document.documentElement.dataset.mode);
  const rgb = await page.locator('[data-reel-title]').first().evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).map(Number);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  say('in light mode the app is light', mode === 'light', `(${mode})`);
  say('in light mode a tile title is dark enough to read', lum < 0.6, `(${rgb})`);
  const lightScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('…and the page does not scroll in light either', lightScroll <= 0, `(scrolls ${lightScroll}px)`);
  await page.screenshot({ path: 'shots/admin-reels-light.png' });

  // A front-desk account sees the row and the page.
  ROLE = 'staff';
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/reels');
  say('a front-desk account sees the Reels row', (await page.locator('a[href="/reels"]').count()) >= 1);
  say('…and the page with its reels', (await page.locator('[data-reel]').count()) === 3);

  // Switched off: a note, no list.
  ROLE = 'admin';
  RPC.my_gym_app = [{ modules: { reels: false } }];
  await page.goto('about:blank');
  await go('/reels');
  say('switched off, the page says so and shows no list',
    (await page.locator('[data-reels-off]').count()) === 1 && (await page.locator('[data-reel]').count()) === 0
    && (await page.locator('[data-reels-off] a[href="/gym-app?tab=runs"]').count()) === 1);
  return out.join(String.fromCharCode(10));
}
