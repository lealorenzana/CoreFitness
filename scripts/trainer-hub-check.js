/**
 * The trainer app, Discord style (2026-10-11): no tab bar. Messages lists the
 * 1-on-1 trainees — last message, when, unread — and a row opens the 1-on-1
 * room; the coach floats at the bottom (status, bell); their profile carries
 * the tools bar (Schedule · Hours · Coaching · Library · Settings); Schedule
 * and Bookings open full screen with a way back to Messages.
 *
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
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 't1', aud: 'authenticated', role: 'authenticated', email: 'ben@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => { localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('trainerMode', 'true'); }, [KEY, session]);
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  const ROOMS = [
    { id: 'pt1', kind: 'pt', name: 'Lea Lorenzana', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 1, post_count: 0,
      last_post_at: null, comments_on: true, archived: false, join_code: null, is_mine: true, full_access: true },
    { id: 'pt2', kind: 'pt', name: 'Ana Reyes', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 1, post_count: 0,
      last_post_at: ago(3000), comments_on: true, archived: false, join_code: null, is_mine: true, full_access: true },
    { id: 'rm1', kind: 'class', name: 'Morning HIIT', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 8, post_count: 2,
      last_post_at: ago(60), comments_on: true, archived: false, join_code: null, is_mine: true, full_access: true },
  ];
  const CONVS = [{ id: 'cv1', other_id: 'm1', other_name: 'Lea Lorenzana', other_photo: null, last_message: 'See you at 6, coach',
    last_from_me: false, last_message_at: ago(12), unread: 2, muted: false, other_read_at: null }];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'trainer', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_rooms') return json(ROOMS);
      if (fn === 'room_badges') return json([]);
      if (fn === 'my_conversations') return json(CONVS);
      if (fn === 'pt_room_with') return json('pt1');
      if (fn === 'review_queue' || fn === 'my_room_photos') return json([]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1600);
  };
  // Today is the first stop (redesign, 2026-10-27); Messages is the next rail button.
  await go('/trainer/home');
  out.push('the hub opens on Today: ' + ((await page.locator('[data-today-panel]').count()) === 1 && (await page.locator('[data-rail-today]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-hub-today.png' });
  await page.locator('[data-rail-home]').click();
  await page.waitForTimeout(800);
  out.push('the Messages button opens Messages: ' + (/view=messages/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  const rows = await page.locator('[data-dm-row]').allInnerTexts();
  out.push('Messages lists each 1-on-1 trainee once: ' + (rows.length === 2 && rows.some((r) => /Lea Lorenzana/.test(r)) && rows.some((r) => /Ana Reyes/.test(r)) ? 'yes' : 'MISSING ' + JSON.stringify(rows)));
  out.push('…with the last message, when, and unread: ' + (rows.some((r) => /See you at 6, coach/.test(r) && /12m/.test(r) && /\b2\b/.test(r)) ? 'yes' : 'MISSING'));
  out.push('the Messages bubble counts the unread: ' + (/2/.test(await page.locator('[data-rail-home]').innerText()) ? 'yes' : 'MISSING'));
  out.push('no tab bar: ' + ((await page.locator('nav[aria-label="Main"]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/trainer-hub-messages.png' });

  // Holding a room on the rail opens its settings — never the browser's menu.
  const room = page.locator('[data-rail-room="rm1"]');
  const box = await room.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await page.waitForTimeout(500);
  const sheet = page.locator('[data-room-settings]');
  out.push('holding a room opens its settings: ' + ((await sheet.count()) === 1 && /Close this room/.test(await sheet.innerText()) && /People/.test(await sheet.innerText()) ? 'yes' : 'MISSING'));
  out.push('…and the hold did not also open the room: ' + (!/room=rm1/.test(page.url()) ? 'yes' : 'OPENED'));
  await page.screenshot({ path: 'shots/trainer-hub-hold.png' });
  const blocked = await page.evaluate(() => {
    const img = document.createElement('img'); document.body.appendChild(img);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); img.dispatchEvent(ev); img.remove();
    return ev.defaultPrevented;
  });
  out.push('no browser menu on a long-pressed picture: ' + (blocked ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');
  await go('/trainer/home?view=messages');

  await page.locator('[data-dm-row]').filter({ hasText: 'Lea Lorenzana' }).click();
  await page.waitForURL(/\/trainer\/rooms\/pt1/, { timeout: 8000 }).catch(() => {});
  out.push('a trainee opens your 1-on-1 room with them: ' + (/\/trainer\/rooms\/pt1/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));

  // The You sheet (redesign, 2026-10-27) holds every coach screen; the profile has no toolbar.
  await go('/trainer/profile');
  out.push('the profile has no toolbar or chip row: ' + ((await page.locator('[data-trainer-toolbar]').count()) === 0 && (await page.locator('nav.rail').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await go('/trainer/home');
  await page.locator('[data-you-button]').click();
  await page.waitForTimeout(700);
  const tools = await page.evaluate(() => document.querySelector('[data-you-sheet]')?.innerText.replace(/\s+/g, ' ') ?? '');
  out.push('your name opens the You sheet with every coach screen: ' + (['Schedule', 'Hours', 'Coaching', 'Library', 'Profile', 'Equipment', 'Gyms', 'Settings'].every((x) => tools.includes(x)) ? 'yes' : 'MISSING ' + tools));
  out.push('…and your status: ' + ((await page.locator('[data-you-sheet] [role="radio"]').count()) === 3 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-hub-you.png' });
  await page.locator('[data-you-sheet]').getByText('Schedule', { exact: true }).click();
  await page.waitForTimeout(1200);
  out.push('Schedule opens full screen with a way back to Messages: ' + (/\/trainer\/schedule$/.test(page.url()) && (await page.locator('[data-hub-back]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('[data-hub-back]').click();
  await page.waitForTimeout(1000);
  out.push('…and Back returns to the hub: ' + (/\/trainer\/home/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  return out.join('\n');
}
