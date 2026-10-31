/**
 * The coach app, Discord style (2026-10-11; kept through the simplify,
 * 2026-10-28): no tab bar. The rail is Today, Personal training, one round
 * photo per package trainee, then + Start coaching someone — only where the gym
 * lets coaches offer packages — and no class or group rooms. Personal training
 * lists everyone the coach trains, "On a package" then "Single sessions", with
 * the package pill, unread and search; a package photo opens that person's place,
 * a single-session row their chat. The coach floats at the bottom; their name
 * opens the You sheet (Schedule · Hours · Packages · Library, then the rest).
 * Every old link lands on the new home, never a blank page (Review Focus 1).
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
  const day = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const room = (id, name, archived) => ({ id, kind: 'pt', name, description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 1,
    post_count: 0, last_post_at: ago(3000), comments_on: true, archived, join_code: null, is_mine: true, full_access: true });
  const ROOMS = [room('pt2', 'Ana Reyes · 1-on-1', false), room('pt3', 'Cy Lim · 1-on-1', true)];
  const coaching = (id, member, name, status, roomId, months) => ({ id, member_id: member, member_name: name, member_photo: null, trainer_id: 't1',
    trainer_name: 'Ben Cruz', trainer_photo: null, kind: 'pt', room_id: roomId, months, status, fee_mode: 'included', price: null,
    pay_reference: null, pay_sent_at: null, starts_on: day(-20), ends_on: status === 'ended' ? day(-2) : day(70), started_by: 'member',
    created_at: ago(30000), i_am: 'coach' });
  const COACHINGS = [coaching('k2', 'm2', 'Ana Reyes', 'active', 'pt2', 3), coaching('k3', 'm3', 'Cy Lim', 'ended', 'pt3', 1)];
  // Lea books single sessions and wrote; Dan is on the roster with a session ahead and no chat.
  const CONVS = [{ id: 'cv1', other_id: 'm1', other_name: 'Lea Lorenzana', other_photo: null, last_message: 'See you at 6, coach',
    last_from_me: false, last_message_at: ago(12), unread: 2, muted: false, other_read_at: null }];
  const ROSTER = [
    { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, experience_level: 'beginner', last_visit: ago(60 * 24), visits_last_30: 6, upcoming_with_me: 1 },
    { member_id: 'm4', name: 'Dan Cruz', photo_url: null, experience_level: null, last_visit: ago(60 * 48), visits_last_30: 2, upcoming_with_me: 1 },
  ];
  let MODES = ['pick_pt', 'desk_assigns', 'coach_invites'];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'trainer', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_rooms') return json(ROOMS);
      if (fn === 'my_coachings') return json(COACHINGS);
      if (fn === 'coaching_settings') return json([{ modes: MODES, lengths: [1, 3], fee_mode: 'included' }]);
      if (fn === 'room_badges') return json([{ room_id: 'pt2', to_review: 1, due_soon: 0 }]);
      if (fn === 'my_conversations') return json(CONVS);
      if (fn === 'review_queue' || fn === 'my_room_photos') return json([]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'my_trainer_members') return json(ROSTER);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1600);
  };
  const path = () => { const u = new URL(page.url()); return u.pathname + u.search; };

  // ---- the rail ----
  await go('/trainer/home');
  out.push('the hub opens on Today: ' + ((await page.locator('[data-today-panel]').count()) === 1 ? 'yes' : 'MISSING'));
  const labels = await page.locator('[data-rail-label]').allInnerTexts();
  out.push('the rail in order — Today, Personal training, a photo per package trainee, then +: '
    + (JSON.stringify(labels) === JSON.stringify(['Today', 'Personal training', 'Ana', 'Cy', 'Start coaching someone']) ? 'yes' : 'NO ' + JSON.stringify(labels)));
  out.push('no class or group rooms on the rail: ' + ((await page.locator('[data-rail-room], [data-rail-group]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  out.push('a package trainee’s photo counts what waits (classwork + unread): ' + (/1/.test(await page.locator('[data-rail-trainee="m2"]').innerText()) ? 'yes' : 'MISSING'));
  out.push('no tab bar: ' + ((await page.locator('nav[aria-label="Main"]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/trainer-hub-today.png' });

  // ---- Personal training ----
  await page.locator('[data-rail-pt]').click();
  await page.waitForTimeout(800);
  out.push('Personal training opens: ' + (/view=pt/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  const sections = await page.locator('[data-pt-section]').allTextContents(); // the eyebrow draws them in capitals
  out.push('two sections with counts: ' + (sections.join('|') === 'On a package · 2|Single sessions · 2' ? 'yes' : 'NO ' + sections.join('|')));
  const pkgRows = await page.locator('[data-pt-row="package"]').allInnerTexts();
  out.push('the package pill — months while running, Ended after: ' + (pkgRows.some((r) => /Ana Reyes/.test(r) && /3 mo/.test(r)) && pkgRows.some((r) => /Cy Lim/.test(r) && /Ended/.test(r)) ? 'yes' : 'NO ' + JSON.stringify(pkgRows)));
  const singleRows = await page.locator('[data-pt-row="single"]').allInnerTexts();
  out.push('single sessions: the last message, when and unread first; a session ahead otherwise: '
    + (/Lea Lorenzana/.test(singleRows[0] ?? '') && /See you at 6, coach/.test(singleRows[0]) && /12m/.test(singleRows[0]) && /\b2\b/.test(singleRows[0])
      && singleRows.some((r) => /Dan Cruz/.test(r) && /1 session ahead/.test(r)) ? 'yes' : 'NO ' + JSON.stringify(singleRows)));
  out.push('the Personal training button counts the unread: ' + (/3/.test(await page.locator('[data-rail-pt]').innerText()) ? 'yes' : 'MISSING ' + await page.locator('[data-rail-pt]').innerText()));
  await page.getByLabel('Find a trainee').fill('dan');
  await page.waitForTimeout(300);
  out.push('search narrows to the person: ' + ((await page.locator('[data-pt-row]').count()) === 1 && /Dan Cruz/.test(await page.locator('[data-pt-row]').first().innerText()) ? 'yes' : 'MISSING'));
  await page.getByLabel('Find a trainee').fill('');
  await page.screenshot({ path: 'shots/trainer-hub-pt.png' });
  await page.locator('[data-pt-row="single"]').filter({ hasText: 'Lea Lorenzana' }).click();
  await page.waitForTimeout(1000);
  out.push('a single-session row opens their chat: ' + (/^\/trainer\/pt\/m1\?tab=chat$/.test(path()) ? 'yes' : 'MISSING ' + path()));

  await go('/trainer/home');
  await page.locator('[data-rail-trainee="m2"]').click();
  await page.waitForTimeout(1000);
  out.push('a package trainee’s photo opens their place: ' + (/^\/trainer\/pt\/m2$/.test(path()) ? 'yes' : 'MISSING ' + path()));

  // ---- + only where the gym lets coaches offer ----
  MODES = ['pick_pt', 'desk_assigns'];
  await go('/trainer/home');
  out.push('no + when the gym does not let coaches offer packages: ' + ((await page.locator('[data-rail-offer]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  MODES = ['pick_pt', 'desk_assigns', 'coach_invites'];
  await go('/trainer/home');
  await page.locator('[data-rail-offer]').click();
  await page.waitForTimeout(700);
  out.push('+ opens Start coaching someone: ' + ((await page.locator('[data-invite]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');

  // ---- You ----
  await go('/trainer/home');
  await page.locator('[data-you-button]').click();
  await page.waitForTimeout(700);
  const tools = await page.evaluate(() => document.querySelector('[data-you-sheet]')?.innerText.replace(/\s+/g, ' ') ?? '');
  out.push('your name opens the You sheet with every coach screen: ' + (['Schedule', 'Hours', 'Packages', 'Library', 'Profile', 'Equipment', 'Gyms', 'Settings'].every((x) => tools.includes(x)) && !/Coaching\b/.test(tools) ? 'yes' : 'MISSING ' + tools));
  out.push('…and your status: ' + ((await page.locator('[data-you-sheet] [role="radio"]').count()) === 3 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-hub-you.png' });
  await page.locator('[data-you-sheet]').getByText('Hours', { exact: true }).click();
  await page.waitForTimeout(1200);
  out.push('Hours opens Schedule on Your hours, with a way back: ' + (/^\/trainer\/schedule\?tab=hours$/.test(path()) && (await page.locator('[data-hub-back]').count()) === 1 ? 'yes' : 'MISSING ' + path()));
  await page.locator('[data-hub-back]').click();
  await page.waitForTimeout(1000);
  out.push('…and Back returns to the hub: ' + (/\/trainer\/home/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));

  // ---- every old link lands on the new home ----
  const redirects = [
    ['/trainer/bookings', /^\/trainer\/home$/],
    ['/trainer/rooms', /^\/trainer\/home\?view=pt$/],
    ['/trainer/members', /^\/trainer\/home\?view=pt$/],
    ['/trainer/members?open=m1', /^\/trainer\/pt\/m1\?tab=about$/],
    ['/trainer/rooms/pt2', /^\/trainer\/pt\/m2$/],
    ['/trainer/rooms/gone', /^\/trainer\/home\?view=pt$/],
    ['/trainer/messages/cv1', /^\/trainer\/pt\/m1$/],
    ['/trainer/coaching', /^\/trainer\/packages$/],
    ['/trainer/availability', /^\/trainer\/schedule\?tab=hours$/],
  ];
  const wrong = [];
  for (const [from, to] of redirects) {
    await go(from);
    await page.waitForTimeout(600);
    if (!to.test(path())) wrong.push(`${from} → ${path()}`);
  }
  out.push('every old link lands on the new home: ' + (wrong.length === 0 ? 'yes' : 'NO ' + wrong.join(', ')));
  return out.join('\n');
}
