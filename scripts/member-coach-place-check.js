/**
 * One place per coach (0174). The 1-on-1 room opens on Together: the chat, the
 * coach's notes (with "Mark as done") and the routines the coach wrote, in one
 * timeline with a message box. Coaching no longer has separate Messages and
 * Notes tabs, and an old chat link (/member/messages/<id>) lands in the room.
 *
 * Setup copied from member-paging-check.js. Member dev server on :5173.
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
        { kind: 'routine', id: 'r9', at: ago(1), author_id: 't1', body: 'Leg day v2', ref_id: 'r9', extra: { edited: false } },
        { kind: 'note', id: 'n1', at: ago(2), author_id: 't1', body: 'Great depth on squats\nAdd 2.5 kg next week', ref_id: null, extra: { seen: false, done: false } },
        { kind: 'message', id: 'msg1', at: ago(3), author_id: 'm1', body: 'See you Friday', ref_id: 'c1', extra: {} },
      ]);
      if (fn === 'my_conversations') return json([{ id: 'c1', other_id: 't1', other_name: 'Ben Cruz', other_photo: null, last_message: 'See you Friday',
        last_from_me: true, last_message_at: ago(3), unread: 1, muted: false, other_read_at: ago(0.5) }]);
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

  // ---- the room opens on Together ----
  await go('/member/rooms/rm1');
  let t = await text();
  out.push('the 1-on-1 room opens on Together: ' + ((await page.locator('[data-timeline]').count()) === 1 && /Together/.test(t) ? 'yes' : 'MISSING'));
  out.push('chat, the note and the routine are in one list: '
    + (/See you Friday/.test(t) && /Great depth on squats/.test(t) && /Ben wrote a routine/.test(t) && /Leg day v2/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 300)));
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-timeline-kind]')].map((e) => e.getAttribute('data-timeline-kind')));
  out.push('oldest to newest, like a chat: ' + (JSON.stringify(order) === '["message","note","routine"]' ? 'yes' : 'MISSING ' + JSON.stringify(order)));
  out.push("the coach's note is marked seen: " + (CALLS.some(([f, b]) => f === 'mark_feedback' && b.p_id === 'n1' && b.p_done === null) ? 'yes' : 'MISSING'));
  out.push('"Seen" under my last message once the coach opened the chat: ' + ((await page.locator('[data-seen]').count()) === 1 ? 'yes' : 'MISSING'));
  out.push('the chat is marked read when the room is looked at: ' + (CALLS.some(([f]) => /mark.*read|read/.test(f) && f !== 'my_conversations') ? 'yes' : 'MISSING ' + CALLS.map(([f]) => f).join(',')));
  await page.locator('[data-mute]').click();
  await page.waitForTimeout(400);
  out.push('alerts from the chat can be muted: ' + (CALLS.some(([f, b]) => /mute/.test(f) && b.p_muted === true) ? 'yes' : 'MISSING ' + CALLS.map(([f]) => f).join(',')));
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await page.waitForTimeout(500);
  out.push('the member ticks the next step done: ' + (CALLS.some(([f, b]) => f === 'mark_feedback' && b.p_id === 'n1' && b.p_done === true) ? 'yes' : 'MISSING'));
  await page.getByLabel('Message').fill('Thanks coach!');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(600);
  out.push('a message goes through the chat it always did: ' + (SENT.some((b) => b.p_conversation === 'c1' && b.p_body === 'Thanks coach!') ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-coach-place.png', fullPage: true });

  // ---- Coaching has no separate Messages / Notes ----
  await go('/member/rooms');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-hub="coaching"] [role="tab"]')].map((e) => e.textContent.trim()));
  out.push('Coaching: no Messages or Notes tab: ' + (tabs.length > 0 && !tabs.some((x) => /Messages|Notes/.test(x)) ? tabs.join(' · ') : 'MISSING ' + JSON.stringify(tabs)));

  // ---- an old chat link lands in the room ----
  await go('/member/messages/c1');
  await page.waitForTimeout(800);
  out.push('an old chat link opens the room: ' + (/\/member\/rooms\/rm1/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  await go('/member/coach-notes');
  await page.waitForTimeout(800);
  out.push('Coach notes opens the room: ' + (/\/member\/rooms\/rm1/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  return out.join('\n');
}
