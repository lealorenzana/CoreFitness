/**
 * The gym chat (0246) on the owner's and desk's app, against fixtures:
 *   the sidebar row and the page, the chat inside one box (the page never
 *   scrolls); the owner's message menu has Pin and Remove, and removing someone
 *   else's asks for a reason (one RPC with it); the flag opens members' reports
 *   (Keep the message → dismiss); People lets the owner stop a member posting
 *   with a reason and switch announcements-only; the dashboard's Needs you row
 *   counts reported messages and opens the reports; a front-desk account
 *   moderates but has no announcements switch; light mode; switched off, a note.
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
  await page.addInitScript(([k, s]) => { try { localStorage.setItem(k, JSON.stringify(s)); } catch { /* about:blank has no storage */ } }, [KEY, session]);

  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const TABLES = { profiles: [admin], notifications: [] };
  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  // One message, in gym_chat_sync's own shape (0246).
  const M = (id, sender, name, role, body, mins, extra = {}) => ({ id, sender_id: sender, name, photo: null, role, body, photo_path: null, mentions: [],
    created_at: ago(mins), updated_at: ago(mins), removed: false, removed_by_gym: false, pinned: false, mine: sender === 'u1', reply: null, reactions: [], ...extra });
  const MESSAGES = [
    M('m1', 'u1', 'Gabrielle Facalarin', 'admin', 'Gym closes at 8pm on Friday', 50),
    M('m2', 'mem1', 'Lea Lorenzana', 'member', 'Anyone selling protein?', 20),
    M('m3', 'c1', 'Mia Santos', 'trainer', 'Leg day tomorrow', 10),
  ];
  let ROLE = 'admin';
  let modules = { gym_chat: true };
  let REPORTS = [{ report_id: 'rp1', message_id: 'm2', reported_at: ago(5), reason: 'This is an ad', reporter: 'Mia Santos',
    sender_id: 'mem1', sender: 'Lea Lorenzana', body: 'Anyone selling protein?', has_photo: false, sent_at: ago(20), reports: 1 }];
  const CALLS = [];
  const calls = (f) => CALLS.filter(([x]) => x === f);

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
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: ROLE, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_gym_app') return json([{ modules: { reels: false, ...modules } }]);
      if (fn === 'gym_chat_sync') return json({
        open: true, now: new Date().toISOString(), me: 'u1', role: ROLE, can_post: true, why_not: null, can_moderate: true,
        announce_only: false, muted: false, emojis: ['👍', '❤️', '😂', '😮', '😢', '🔥', '💪'],
        messages: body.p_since ? [] : MESSAGES, pinned: [], typing: [],
        seen: { message_id: 'm3', count: 0, people: [] }, unread: 0 });
      if (fn === 'gym_chat_open_reports') return json(REPORTS);
      if (fn === 'gym_chat_dismiss_report') { REPORTS = []; return json(null); }
      if (fn === 'gym_chat_members') return json([
        { user_id: 'u1', name: 'Gabrielle Facalarin', photo: null, role: 'admin', silenced: false, silenced_reason: null },
        { user_id: 'c1', name: 'Mia Santos', photo: null, role: 'trainer', silenced: false, silenced_reason: null },
        { user_id: 'mem1', name: 'Lea Lorenzana', photo: null, role: 'member', silenced: false, silenced_reason: null }]);
      if (['gym_chat_remove', 'gym_chat_pin', 'gym_chat_silence', 'set_gym_chat_announce_only', 'gym_chat_history'].includes(fn)) return json(fn === 'gym_chat_history' ? [] : null);
      return json([]);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const rows = (TABLES[t] ?? []).map((r) => (t === 'profiles' ? { ...r, role: ROLE } : r));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const go = async (path) => { await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2800); };
  const lum = (s) => { const [r, g, b] = (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const noScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  const closeLayer = async (sel) => { await page.locator(sel).click({ position: { x: 6, y: 6 } }); await page.waitForTimeout(300); };

  // ── The page ──
  await go('/gym-chat');
  say('the sidebar has a Gym chat row', (await page.locator('a[href="/gym-chat"]').count()) >= 1);
  say('the chat opens with its three messages', (await page.locator('[data-gym-chat="open"]').count()) === 1 && (await page.locator('[data-chat-message]').count()) === 3);
  say('the bar names the gym', /G Fitness/.test(await page.locator('.gc-bar-title').innerText()));
  say('the page does not scroll', (await noScroll()) <= 0, `(scrolls ${await noScroll()}px)`);
  const box = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('[data-mid="m2"] .gc-bubble'));
    return { pad: parseFloat(s.paddingLeft), bg: s.backgroundColor, c: s.color };
  });
  say('a bubble is padded, filled, and its words are light in dark mode', box.pad >= 8 && !/rgba\(0, 0, 0, 0\)|transparent/.test(box.bg) && lum(box.c) > 0.7, JSON.stringify(box));
  await page.screenshot({ path: 'shots/admin-gym-chat.png' });

  // ── The owner's menu on a member's message ──
  await page.locator('[data-mid="m2"] .gc-bubble').click();
  await page.waitForTimeout(400);
  const items = (await page.locator('[data-chat-menu] .gc-menu button').allInnerTexts()).map((x) => x.trim());
  say("the owner's menu: Reply, Copy, Pin, Report, Remove", items.join('|') === 'Reply|Copy the words|Pin for everyone|Report to the gym|Remove this message', items.join('|'));
  await page.locator('[data-chat-menu]').getByRole('button', { name: 'Pin for everyone' }).click();
  await page.waitForTimeout(600);
  say('Pin: one call, pinned', calls('gym_chat_pin').length === 1 && calls('gym_chat_pin')[0][1].p_message === 'm2' && calls('gym_chat_pin')[0][1].p_pinned === true);
  await page.locator('[data-mid="m2"] .gc-bubble').click();
  await page.locator('[data-chat-menu]').getByRole('button', { name: 'Remove this message' }).click();
  await page.waitForTimeout(300);
  const removeBtn = page.locator('[data-chat-reason]').getByRole('button', { name: 'Remove it' });
  say("removing someone else's message asks why, and waits for it", (await removeBtn.isDisabled()) === true && calls('gym_chat_remove').length === 0);
  await page.locator('[data-chat-reason]').getByRole('textbox', { name: 'Reason' }).fill('No selling in the chat');
  await removeBtn.click();
  await page.waitForTimeout(700);
  say('…then one call with the reason', calls('gym_chat_remove').length === 1 && calls('gym_chat_remove')[0][1].p_message === 'm2' && calls('gym_chat_remove')[0][1].p_reason === 'No selling in the chat');
  await page.locator('[data-mid="m1"] .gc-bubble').click();
  await page.locator('[data-chat-menu]').getByRole('button', { name: 'Remove my message' }).click();
  await page.waitForTimeout(700);
  say('removing my own needs no reason', calls('gym_chat_remove').length === 2 && calls('gym_chat_remove')[1][1].p_reason === null && (await page.locator('[data-chat-reason]').count()) === 0);

  // ── Reports ──
  await page.locator('[data-chat-reports]').click();
  await page.waitForTimeout(600);
  const rs = page.locator('[data-chat-reports-sheet]');
  say('Reports shows who reported whom, the words and the reason', /Mia Santos reported Lea Lorenzana[\s\S]*Anyone selling protein\?[\s\S]*This is an ad/.test(await rs.innerText()));
  await rs.getByRole('button', { name: 'Keep the message' }).click();
  await page.waitForTimeout(700);
  say('Keep the message closes the report (one call) and the list empties', calls('gym_chat_dismiss_report').length === 1
    && calls('gym_chat_dismiss_report')[0][1].p_report === 'rp1' && /No open reports/.test(await rs.innerText()));
  await closeLayer('[data-chat-reports-sheet]');

  // ── People: stop a member posting; announcements-only ──
  await page.locator('[data-chat-people]').click();
  await page.waitForTimeout(600);
  const ps = page.locator('[data-chat-people-sheet]');
  say('People: Stop posting on the member and the coach, never on the owner', (await ps.locator('[data-chat-silence]').count()) === 2);
  await ps.locator('.gc-person', { hasText: 'Lea Lorenzana' }).locator('[data-chat-silence]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-chat-reason]').getByRole('textbox', { name: 'Reason' }).fill('Repeated ads');
  await page.locator('[data-chat-reason]').getByRole('button', { name: 'Stop them posting' }).click();
  await page.waitForTimeout(700);
  const sil = calls('gym_chat_silence');
  say('Stop posting: one call with the person and the reason', sil.length === 1 && sil[0][1].p_user === 'mem1' && sil[0][1].p_silenced === true && sil[0][1].p_reason === 'Repeated ads', JSON.stringify(sil.map((c) => c[1])));
  say('the owner has the announcements-only switch', (await ps.locator('[data-chat-announce]').count()) === 1);
  await ps.locator('[data-chat-announce]').click();
  await page.waitForTimeout(600);
  say('…one call to switch it on', calls('set_gym_chat_announce_only').length === 1 && calls('set_gym_chat_announce_only')[0][1].p_on === true);
  await closeLayer('[data-chat-people-sheet]');
  say('the page still does not scroll', (await noScroll()) <= 0);

  // ── The dashboard's Needs you ──
  REPORTS = [{ report_id: 'rp2', message_id: 'm3', reported_at: ago(2), reason: 'Rude', reporter: 'Lea Lorenzana',
    sender_id: 'c1', sender: 'Mia Santos', body: 'Leg day tomorrow', has_photo: false, sent_at: ago(10), reports: 1 }];
  await go('/dashboard');
  const row = page.locator('[data-task="chatreports"]');
  say('the dashboard says one chat message is reported', (await row.count()) === 1 && /1 chat message reported/.test(await row.innerText().catch(() => '')), `${await row.count()} rows`);
  await row.getByRole('button', { name: 'Review' }).click();
  await page.waitForTimeout(2500);
  say('…and it opens the chat on the reports', /\/gym-chat\?reports=1/.test(page.url()) && (await page.locator('[data-chat-reports-sheet]').count()) === 1, page.url());

  // ── The front desk ──
  ROLE = 'staff';
  await go('/gym-chat');
  say('a front-desk account sees the row and the chat', (await page.locator('a[href="/gym-chat"]').count()) >= 1 && (await page.locator('[data-chat-message]').count()) === 3);
  await page.locator('[data-chat-people]').click();
  await page.waitForTimeout(600);
  say('…moderates people, but has no announcements switch', (await page.locator('[data-chat-people-sheet] [data-chat-silence]').count()) === 2
    && (await page.locator('[data-chat-people-sheet] [data-chat-announce]').count()) === 0);

  // ── Light ──
  ROLE = 'admin';
  await page.emulateMedia({ colorScheme: 'light' });
  await go('/gym-chat');
  const light = await page.evaluate(() => {
    const cs = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return { c: s.color, b: s.backgroundColor }; };
    return { mode: document.documentElement.dataset.mode, other: cs('[data-mid="m2"] .gc-bubble'), mine: cs('[data-mid="m1"] .gc-bubble'), title: cs('.gc-bar-title b'), input: cs('.gc-input') };
  });
  say('light: the app is light', light.mode === 'light', String(light.mode));
  say("light: another's bubble, the title and the box are dark words", lum(light.other.c) < 0.45 && lum(light.title.c) < 0.45 && lum(light.input.c) < 0.45, JSON.stringify(light));
  say('light: my bubble is white words on a solid, dark-enough fill', lum(light.mine.c) > 0.9 && lum(light.mine.b) < 0.6, JSON.stringify(light.mine));
  say('light: the page does not scroll', (await noScroll()) <= 0);
  await page.screenshot({ path: 'shots/admin-gym-chat-light.png' });

  // ── Off ──
  modules = { gym_chat: false };
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('about:blank');
  const syncsBefore = calls('gym_chat_sync').length;
  await go('/gym-chat');
  say('switched off: the page says so, links to Your app, and does not poll', (await page.locator('[data-gym-chat-off]').count()) === 1
    && (await page.locator('[data-gym-chat-off] a[href="/gym-app?tab=runs"]').count()) === 1 && calls('gym_chat_sync').length === syncsBefore);
  say('…and the sidebar row is gone', (await page.locator('a[href="/gym-chat"]').count()) === 0);
  say('no page errors', errs.length === 0, errs.join(' | '));
  return out.join(String.fromCharCode(10));
}
