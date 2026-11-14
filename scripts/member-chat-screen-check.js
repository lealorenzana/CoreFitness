/**
 * The package chat, Messenger style (2026-11-14): the name and the Chat · Classwork tabs stay put while the
 * messages scroll; the box to type in is a solid bar docked to the bottom (not a see-through pill over the
 * messages); Chat settings (⋮) hold mute and Manage package — and a package room has no "Leave this room"
 * (leaving it means ending the package). Manage package lands on the Coach tab with its sheet open.
 * Light and dark. Setup copied from member-coach-place-check.js. Member dev server on :5173.
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
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: 'lea@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const CALLS = [];
  const SENT = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_rooms') return json([{ id: 'rm1', kind: 'pt', name: 'Ben · Lea', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz',
        member_count: 1, post_count: 0, last_post_at: null, comments_on: true, archived: false, join_code: null, is_mine: false, full_access: true }]);
      if (fn === 'room_badges') return json([]);
      if (fn === 'coach_timeline') return json([
        ...Array.from({ length: 40 }, (_, i) => ({ kind: 'message', id: 'x' + i, at: ago(10 + i), author_id: i % 2 ? 't1' : 'm1', body: 'Message number ' + i + ' about training this week', ref_id: 'c1', extra: {} })),
        { kind: 'routine', id: 'r9', at: ago(1), author_id: 't1', body: 'Leg day v2', ref_id: 'r9', extra: { edited: false } },
        { kind: 'note', id: 'n1', at: ago(2), author_id: 't1', body: 'Great depth on squats\nAdd 2.5 kg next week', ref_id: null, extra: { seen: false, done: false } },
        { kind: 'message', id: 'msg1', at: ago(3), author_id: 'm1', body: 'See you Friday', ref_id: 'c1', extra: {} },
      ]);
      if (fn === 'my_conversations') return json([{ id: 'c1', other_id: 't1', other_name: 'Ben Cruz', other_photo: null, last_message: 'See you Friday',
        last_from_me: true, last_message_at: ago(3), unread: 1, muted: false, other_read_at: ago(0.5) }]);
      if (fn === 'coaching_settings') return json([{ modes: ['pick_pt'], lengths: [1, 3, 6], fee_mode: 'included' }]);
      if (fn === 'coaching_sweep') return json(0);
      if (fn === 'my_coachings') {
        const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
        return json([{ id: 'k1', member_id: 'm1', member_name: 'Lea', member_photo: null, trainer_id: 't1', trainer_name: 'Ben Cruz', trainer_photo: null,
          kind: 'pt', room_id: 'rm1', months: 3, status: 'active', fee_mode: 'included', price: null, pay_reference: null, pay_sent_at: null,
          starts_on: d(-10), ends_on: d(80), started_by: 'member', created_at: ago(240), standin_id: null, standin_trainer_id: null,
          standin_name: null, standin_from: null, standin_to: null, group_code: null, i_am: 'member' }]);
      }
      if (fn === 'pt_room_with') return json('rm1');
      if (fn === 'open_conversation') return json('c1');
      if (fn === 'send_message') { SENT.push(body); return json('new-msg'); }
      return json(null);
    }
    return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  });

  const out = [];
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1800);
  };
  await page.setViewportSize({ width: 393, height: 852 });

  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    await go('/member/rooms/rm1');
    const tabsBox = async () => (await page.getByRole('tab', { name: 'Classwork' }).boundingBox())?.y ?? -1;
    const before = await tabsBox();
    const scroller = page.locator('.noc-chat-scroll').first();
    await scroller.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(300);
    const top0 = await scroller.evaluate((el) => el.scrollTop);
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
    await page.waitForTimeout(300);
    const after = await tabsBox();
    const moved = await scroller.evaluate((el) => el.scrollTop);
    say(`${mode}: the messages scroll`, moved > top0 + 50, `${top0}→${moved}`);
    say(`${mode}: the tabs stay put while they do`, before > 0 && Math.abs(after - before) < 1, `${before}→${after}`);
    const comp = await page.locator('[data-composer]').evaluate((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      const bar = document.querySelector('nav')?.getBoundingClientRect();
      return { left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, bg: cs.backgroundColor, pos: cs.position, radius: cs.borderTopLeftRadius, barTop: bar ? bar.top : null };
    });
    const solid = (() => {
      // rgb(r g b) / rgba(r, g, b, a) / color(srgb r g b / a): solid when there is no alpha, or it is ~1.
      const m = comp.bg.match(/^(?:rgba?\(([^)]+)\)|color\(srgb ([^)]+)\))$/); if (!m) return false;
      const parts = (m[1] ?? m[2]).split('/');
      if (parts.length > 1) return Number(parts[1]) >= 0.99;
      const p = parts[0].split(/[ ,]+/).filter(Boolean); return p.length < 4 || Number(p[3]) >= 0.99;
    })();
    say(`${mode}: the box is a solid bar`, solid, comp.bg);
    say(`${mode}: …full width, docked under the messages`, comp.left <= 0.5 && Math.abs(comp.right - comp.w) <= 0.5 && comp.radius === '0px', JSON.stringify(comp));
    say(`${mode}: …sitting right on the bottom bar`, comp.barTop === null || Math.abs(comp.bottom - comp.barTop) <= 2, JSON.stringify(comp));
    await page.screenshot({ path: `shots/member-chat-screen-${mode}.png` });

    await page.locator('[data-room-settings]').click();
    await page.waitForTimeout(600);
    const sheet = (await page.locator('[data-room-settings-sheet]').innerText()).replace(/\s+/g, ' ');
    say(`${mode}: Chat settings: mute and Manage package`, /Mute alerts from this chat/.test(sheet) && /Manage package/.test(sheet), sheet);
    say(`${mode}: …and no "Leave this room" on a package`, !/Leave this room/.test(await text()), sheet);
    say(`${mode}: the mute line under the messages is gone`, (await page.locator('[data-mute]').count()) === 0);
    await page.screenshot({ path: `shots/member-chat-settings-${mode}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.locator('[data-room-settings]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-room-settings-sheet]').getByText('Manage package').click();
  await page.waitForTimeout(1500);
  say('Manage package lands on the Coach tab', /\/member\/book-class\?tab=coach&manage=1/.test(page.url()), page.url());
  say('…with Manage package open', (await page.locator('[data-manage-sheet]').count()) === 1 && /Switch coach/.test(await page.locator('[data-manage-sheet]').innerText().catch(() => '')));
  return out.join('\n');
}
