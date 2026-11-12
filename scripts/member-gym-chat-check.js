/**
 * The gym chat (0246) on the phone: the header's chat button and its unread
 * count; the chat full screen (no tab bar): others' messages left and mine
 * right, the pin bar, who is typing, "Seen by", a removed message's
 * placeholder; sending (one RPC, with an id, on screen once); the message
 * menu — react, reply, report with a reason; a member has no Pin and cannot
 * remove someone else's; the server's "cannot post" words in place of the
 * composer; light mode; and with the gym's switch off, no button, no More row,
 * the gate on the URL.
 *
 * Member dev server on :5173. Screenshots to shots/member-gym-chat-*.png.
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
  const OWNER = 'c1000000-0000-4000-8000-000000000001';
  const ME = { id: MEMBER, first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@chat-test.com', role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-90, 9) };
  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30, is_active: true, description: 'All',
    can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null };
  const DB = {
    profiles: [ME],
    member_profiles: [{ profile_id: MEMBER, experience_level: 'beginner', qr_code: MEMBER, created_at: iso(-90, 9), profiles: ME }],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: MEMBER, plan_id: 'p3', status: 'active', start_date: dstr(-5), expiry_date: dstr(25), never_expires: false, frozen_at: null, created_at: iso(-5, 9), membership_plans: PREMIUM }],
    attendance: [],
  };
  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  // One message, in gym_chat_sync's own shape (0246).
  const M = (id, sender, name, role, body, mins, extra = {}) => ({ id, sender_id: sender, name, photo: null, role, body, photo_path: null, mentions: [],
    created_at: ago(mins), updated_at: ago(mins), removed: false, removed_by_gym: false, pinned: false, mine: sender === MEMBER, reply: null, reactions: [], ...extra });
  const QUOTE = { id: 'm2', name: 'Gabby Coach', body: 'Leg day tomorrow, who is in?', photo: false, removed: false };
  let MESSAGES = [
    M('m1', OWNER, 'Reygan Owner', 'admin', 'Gym closes at 8pm on Friday', 50, { pinned: true }),
    M('m2', COACH, 'Gabby Coach', 'trainer', 'Leg day tomorrow, who is in?', 40, { reactions: [{ emoji: '🔥', count: 2, mine: false }] }),
    M('m3', MEMBER, 'Lea Lorenzana', 'member', 'Count me in', 39, { reply: QUOTE }),
    M('m4', COACH, 'Gabby Coach', 'trainer', null, 30, { removed: true, removed_by_gym: true }),
    M('m5', MEMBER, 'Lea Lorenzana', 'member', 'See you all at 6', 5),
  ];
  let chat = { open: true, can_post: true, why_not: null };
  let modules = { gym_chat: true };
  const CALLS = [];
  const syncAnswer = (body) => (!chat.open ? { open: false, why: 'The gym chat is for active members and staff of this gym.' } : {
    open: true, now: new Date().toISOString(), me: MEMBER, role: 'member', can_post: chat.can_post, why_not: chat.why_not, can_moderate: false,
    announce_only: !chat.can_post, muted: false, emojis: ['👍', '❤️', '😂', '😮', '😢', '🔥', '💪'],
    messages: body.p_since ? MESSAGES.filter((m) => m.updated_at > body.p_since) : MESSAGES,
    pinned: MESSAGES.filter((m) => m.pinned), typing: ['Gabby'],
    seen: { message_id: MESSAGES[MESSAGES.length - 1].id, count: 2, people: [{ name: 'Gabby Coach', photo: null }, { name: 'Reygan Owner', photo: null }] },
    unread: body.p_seen ? 0 : 2,
  });
  const match = (rows, params) => rows.filter((r) => params.every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(k) || !(k in r)) return true;
    const m = /^eq\.(.*)$/.exec(v); if (m) return String(r[k]) === m[1];
    return true;
  }));

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
        points_name: null, points_name_short: null, welcome_message: null, tagline: null, vocabulary: null, modules: { reels: false, ...modules } }]);
      if (fn === 'gym_chat_unread') return json(2);
      if (fn === 'gym_chat_sync') return json(syncAnswer(body));
      if (fn === 'gym_chat_history') return json([]);
      if (fn === 'gym_chat_send') {
        const m = M(body.p_id, MEMBER, 'Lea Lorenzana', 'member', body.p_body, 0, body.p_reply_to ? { reply: QUOTE } : {});
        MESSAGES = [...MESSAGES, m];
        return json(m);
      }
      if (fn === 'gym_chat_react') {
        const m = MESSAGES.find((x) => x.id === body.p_message);
        m.reactions = [{ emoji: '🔥', count: 3, mine: true }]; m.updated_at = new Date().toISOString();
        return json(m);
      }
      if (fn === 'gym_chat_report' || fn === 'gym_chat_set_muted') return json(null);
      if (fn === 'gym_chat_members') return json([
        { user_id: OWNER, name: 'Reygan Owner', photo: null, role: 'admin', silenced: false, silenced_reason: null },
        { user_id: COACH, name: 'Gabby Coach', photo: null, role: 'trainer', silenced: false, silenced_reason: null },
        { user_id: MEMBER, name: 'Lea Lorenzana', photo: null, role: 'member', silenced: false, silenced_reason: null }]);
      if (fn === 'my_features') return json(['workout_tracker'].map((key) => ({ key, label: key, description: key, enabled: true })));
      if (fn === 'my_rooms' || fn === 'my_conversations' || fn === 'review_queue' || fn === 'my_room_photos' || fn === 'room_badges' || fn === 'gym_reels_feed') return json([]);
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
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(([k, s]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); window.__CF_NO_TOURS = true; } catch { /* another frame */ } }, [KEY, sessionFor(MEMBER, ME.email)]);
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2200);
  };
  const tabBar = () => page.getByRole('navigation', { name: 'Main' }).count();
  const calls = (f) => CALLS.filter(([x]) => x === f);
  const lum = (s) => { const [r, g, b] = (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const closeLayer = async (sel) => { await page.locator(sel).click({ position: { x: 6, y: 6 } }); await page.waitForTimeout(300); };

  // ── Today: the header's button ──
  await go('/member/home');
  const btn = page.getByRole('button', { name: /^Gym chat/ });
  say("Today's header has a Gym chat button", (await btn.count()) === 1, `${await btn.count()}`);
  say('…with the unread count', (await page.locator('[data-chat-unread]').innerText().catch(() => '')).trim() === '2');
  await page.screenshot({ path: 'shots/member-gym-chat-today.png' });
  await btn.click();
  await page.waitForTimeout(1800);
  say('it opens the chat', /\/member\/gym-chat/.test(page.url()) && (await page.locator('[data-gym-chat="open"]').count()) === 1, page.url());
  say('no tab bar on the chat', (await tabBar()) === 0);

  // ── What is on screen ──
  const rows = page.locator('[data-chat-message]');
  say('the five messages', (await rows.count()) === 5, `${await rows.count()}`);
  say('mine are marked mine, others not', (await page.locator('[data-mid="m3"]').getAttribute('data-mine')) === 'true'
    && (await page.locator('[data-mid="m2"]').getAttribute('data-mine')) === 'false');
  const geo = await page.evaluate(() => {
    const a = document.querySelector('[data-mid="m2"] .gc-bubble').getBoundingClientRect();
    const b = document.querySelector('[data-mid="m5"] .gc-bubble').getBoundingClientRect();
    return { otherLeft: Math.round(a.left), mineRight: Math.round(innerWidth - b.right) };
  });
  say("…and drawn so: another's bubble by the left edge, mine by the right", geo.otherLeft < 80 && geo.mineRight < 40, JSON.stringify(geo));
  const box = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('[data-mid="m2"] .gc-bubble'));
    const p = getComputedStyle(document.querySelector('[data-chat-pin]'));
    return { pad: parseFloat(s.paddingLeft), bg: s.backgroundColor, pinPad: parseFloat(p.paddingLeft) };
  });
  say('a bubble is a bubble: padded, with a fill of its own; the pin bar padded too', box.pad >= 8 && box.pinPad >= 8 && !/rgba\(0, 0, 0, 0\)|transparent/.test(box.bg), JSON.stringify(box));
  say('who wrote it, and their role', /Gabby Coach/.test(await page.locator('[data-mid="m2"]').innerText())
    && /Coach/.test(await page.locator('[data-mid="m2"] .gc-badge').innerText()) && /Owner/.test(await page.locator('[data-mid="m1"] .gc-badge').innerText()));
  say('a reply quotes what it answers', /Gabby Coach[\s\S]*Leg day tomorrow/.test(await page.locator('[data-mid="m3"] .gc-quote').innerText()));
  say('a message the gym removed says so, with no words', /Removed by the gym/.test(await page.locator('[data-mid="m4"]').innerText()));
  say('reactions show with their count', /🔥\s*2/.test(await page.locator('[data-mid="m2"] .gc-react').innerText()));
  say("the pin bar shows the owner's pinned message", /Reygan[\s\S]*Gym closes at 8pm/.test(await page.locator('[data-chat-pin]').innerText()));
  say('who is typing', /Gabby is typing/.test(await page.locator('[data-chat-typing]').innerText()));
  say('"Seen by" under my newest message', /Seen by[\s\S]*2/.test(await page.locator('[data-chat-seen]').innerText().catch(() => '')));
  say('the list is scrolled to the newest message', await page.locator('[data-chat-list]').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4));
  say('the page itself never scrolls', await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
  const small = await page.evaluate(() => [...document.querySelectorAll('.gc *')].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => `${el.className}:${getComputedStyle(el).fontSize}`).slice(0, 4));
  say('no words under 12px', small.length === 0, small.join(', '));
  const dark = await page.evaluate(() => {
    const cs = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return { c: s.color, b: s.backgroundColor }; };
    return { mode: document.documentElement.dataset.mode, other: cs('[data-mid="m2"] .gc-bubble'), mine: cs('[data-mid="m5"] .gc-bubble'), title: cs('.gc-bar-title b') };
  });
  say('dark: the app is dark, and every bubble and the title are light words', dark.mode === 'dark' && lum(dark.other.c) > 0.7 && lum(dark.mine.c) > 0.9 && lum(dark.title.c) > 0.7, JSON.stringify(dark));
  await page.screenshot({ path: 'shots/member-gym-chat-open.png' });

  // ── Sending ──
  await page.getByRole('textbox', { name: 'Message' }).fill('Bringing chalk');
  await page.locator('[data-chat-send]').click();
  await page.waitForTimeout(900);
  const sends = calls('gym_chat_send');
  say('Send: one call, with an id made here and the words', sends.length === 1 && /^[0-9a-f-]{36}$/.test(sends[0][1].p_id) && sends[0][1].p_body === 'Bringing chalk', JSON.stringify(sends.map((c) => c[1])));
  say('…the message is on screen once, the box is empty, nothing left pending', (await page.getByText('Bringing chalk', { exact: true }).count()) === 1
    && (await page.getByRole('textbox', { name: 'Message' }).inputValue()) === '' && (await page.locator('[data-chat-pending]').count()) === 0);
  say('typing told the others (a sync with p_typing)', calls('gym_chat_sync').some((c) => c[1].p_typing === true));
  say('having it on screen marks it seen (a sync with p_seen)', calls('gym_chat_sync').some((c) => c[1].p_seen === true));
  await page.waitForTimeout(3600);
  say('a poll after sending does not draw the message twice', (await page.getByText('Bringing chalk', { exact: true }).count()) === 1);

  // ── Like Messenger: a tap shows the react button and the time; a hold opens the menu ──
  say('nothing opens a menu by itself', (await page.locator('[data-chat-menu]').count()) === 0);
  await page.locator('[data-mid="m1"] .gc-bubble').click();
  await page.waitForTimeout(300);
  say('a quick tap opens no menu, and shows the react button', (await page.locator('[data-chat-menu]').count()) === 0
    && (await page.locator('[data-mid="m1"] [data-chat-react-btn]').evaluate((b) => getComputedStyle(b).opacity)) === '1');
  await page.locator('[data-mid="m1"] [data-chat-react-btn]').click();
  await page.waitForTimeout(300);
  const qb = page.locator('[data-mid="m1"] [data-chat-quick]');
  say('the react button opens a quick row of the seven reactions, and More', (await qb.locator('button').count()) === 8);
  const fits = await qb.evaluate((el) => { const r = el.getBoundingClientRect(); return el.scrollWidth <= el.clientWidth + 1 && r.right <= innerWidth && r.left >= 0; });
  say('…and the whole row fits on the phone, More included', fits);
  await page.screenshot({ path: 'shots/member-gym-chat-quick.png' });
  const reactsBefore = calls('gym_chat_react').length;
  await qb.locator('button', { hasText: '👍' }).click();
  await page.waitForTimeout(600);
  say('…a reaction from it: one call, and the row closes', calls('gym_chat_react').length === reactsBefore + 1
    && calls('gym_chat_react').at(-1)[1].p_message === 'm1' && calls('gym_chat_react').at(-1)[1].p_emoji === '👍' && (await page.locator('[data-chat-quick]').count()) === 0);
  // ── The message menu (a hold): a member on someone else's message ──
  await page.locator('[data-mid="m2"] .gc-bubble').click({ delay: 650 });
  await page.waitForTimeout(400);
  const menu = page.locator('[data-chat-menu]');
  const items = (await menu.locator('.gc-menu button').allInnerTexts()).map((x) => x.trim());
  say("a member's menu on another's message: Reply, Copy, Report — no Pin, no Remove", items.join('|') === 'Reply|Copy the words|Report to the gym', items.join('|'));
  say('…and the seven reactions', (await menu.locator('.gc-emojis button').count()) === 7);
  await menu.locator('.gc-emojis button', { hasText: '🔥' }).click();
  await page.waitForTimeout(700);
  say('a reaction: one call, and the count moves', calls('gym_chat_react').length === 2 && calls('gym_chat_react')[1][1].p_emoji === '🔥'
    && /🔥\s*3/.test(await page.locator('[data-mid="m2"] .gc-react').innerText()));
  await page.locator('[data-mid="m2"] .gc-bubble').click({ delay: 650 });
  await page.locator('[data-chat-menu]').getByRole('button', { name: 'Reply' }).click();
  await page.waitForTimeout(300);
  say('Reply shows what is being answered above the box', /Replying to Gabby/.test(await page.locator('[data-chat-replying]').innerText()));
  await page.getByRole('textbox', { name: 'Message' }).fill('On my way');
  await page.locator('[data-chat-send]').click();
  await page.waitForTimeout(800);
  say('…and the reply is sent with what it answers', calls('gym_chat_send').at(-1)[1].p_reply_to === 'm2');
  await page.locator('[data-mid="m2"] .gc-bubble').click({ delay: 650 });
  await page.locator('[data-chat-menu]').getByRole('button', { name: 'Report to the gym' }).click();
  await page.waitForTimeout(300);
  const sendReport = page.locator('[data-chat-reason]').getByRole('button', { name: 'Send the report' });
  say('a report asks why, and cannot be sent empty', (await sendReport.isDisabled()) === true);
  await page.locator('[data-chat-reason]').getByRole('textbox', { name: 'Reason' }).fill('Not kind');
  await sendReport.click();
  await page.waitForTimeout(700);
  say('…then one call with the message and the reason', calls('gym_chat_report').length === 1
    && calls('gym_chat_report')[0][1].p_message === 'm2' && calls('gym_chat_report')[0][1].p_reason === 'Not kind', JSON.stringify(calls('gym_chat_report')));
  await page.locator('[data-mid="m5"] .gc-bubble').click({ delay: 650 });
  await page.waitForTimeout(300);
  const mine = (await page.locator('[data-chat-menu] .gc-menu button').allInnerTexts()).map((x) => x.trim());
  say('on my own message: Remove my message, no Report', mine.includes('Remove my message') && !mine.includes('Report to the gym'), mine.join('|'));
  await closeLayer('[data-chat-menu]');

  // ── People ──
  await page.locator('[data-chat-people]').click();
  await page.waitForTimeout(600);
  const sheet = page.locator('[data-chat-people-sheet]');
  say('People lists who is in, with roles — and no moderation for a member', /Reygan Owner[\s\S]*Owner/.test(await sheet.innerText())
    && (await sheet.locator('[data-chat-silence]').count()) === 0 && (await sheet.locator('[data-chat-announce]').count()) === 0);
  say('…and a member has no Reports button', (await page.locator('[data-chat-reports]').count()) === 0);
  await closeLayer('[data-chat-people-sheet]');

  // ── Light mode: words stay readable ──
  await page.emulateMedia({ colorScheme: 'light' });
  await go('/member/gym-chat');
  const light = await page.evaluate(() => {
    const cs = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return { c: s.color, b: s.backgroundColor }; };
    return { mode: document.documentElement.dataset.mode, other: cs('[data-mid="m2"] .gc-bubble'), mine: cs('[data-mid="m5"] .gc-bubble'), input: cs('.gc-input'), title: cs('.gc-bar-title b') };
  });
  say('light: the app is light', light.mode === 'light', String(light.mode));
  say("light: another's bubble is dark words", lum(light.other.c) < 0.45, JSON.stringify(light.other));
  say('light: my bubble is white words on a solid, dark-enough fill', lum(light.mine.c) > 0.9 && lum(light.mine.b) < 0.6 && !/rgba\([^)]*,\s*0(\.\d+)?\)/.test(light.mine.b), JSON.stringify(light.mine));
  say('light: the title and the box are dark words', lum(light.title.c) < 0.45 && lum(light.input.c) < 0.45, JSON.stringify([light.title, light.input]));
  await page.screenshot({ path: 'shots/member-gym-chat-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });

  // ── Cannot post: the server's words instead of the composer ──
  chat = { open: true, can_post: false, why_not: 'Only the gym posts here right now. You can still read and react.' };
  await go('/member/gym-chat');
  say('announcements-only: the reason replaces the box', /Only the gym posts here right now/.test(await page.locator('[data-chat-cannot-post]').innerText().catch(() => ''))
    && (await page.getByRole('textbox', { name: 'Message' }).count()) === 0);
  await page.locator('[data-mid="m2"] .gc-bubble').click({ delay: 650 });
  await page.waitForTimeout(300);
  say('…and the menu has no Reply', !(await page.locator('[data-chat-menu] .gc-menu button').allInnerTexts()).some((x) => /Reply/.test(x)));

  // ── Not theirs (an expired member) ──
  chat = { open: false };
  await go('/member/gym-chat');
  say('a member who is out is told why, and sees no messages', /active members and staff/.test(await page.locator('[data-gym-chat="closed"]').innerText().catch(() => ''))
    && (await page.locator('[data-chat-message]').count()) === 0);

  // ── Off ──
  chat = { open: true, can_post: true, why_not: null };
  modules = { gym_chat: false };
  const unreadBefore = calls('gym_chat_unread').length;
  await go('/member/home');
  say('switched off: the app does not ask for the unread count', calls('gym_chat_unread').length === unreadBefore, `${calls('gym_chat_unread').length - unreadBefore} calls`);
  say('switched off: no chat button in the header', (await page.getByRole('button', { name: /^Gym chat/ }).count()) === 0);
  say('…and no unread badge', (await page.locator('[data-chat-unread]').count()) === 0);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' }).click();
  await page.waitForTimeout(700);
  const moreRows = await page.getByRole('dialog', { name: 'More' }).locator('[data-more-row]').allInnerTexts();
  say('…no Gym chat row in More', moreRows.length > 0 && !moreRows.some((r) => /Gym chat/.test(r)), moreRows.join(' | ').slice(0, 200));
  await go('/member/gym-chat');
  say('…and /member/gym-chat shows the "Not at this gym" gate', /Not at this gym/.test(await page.locator('main').innerText()));
  say('no page errors', errs.length === 0, errs.join(' | '));
  return out.join('\n');
}
