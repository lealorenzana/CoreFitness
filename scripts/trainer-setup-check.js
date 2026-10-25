/**
 * 0212 against fixtures: a coach who has not finished setup is taken to
 * /trainer/welcome, whose steps tick from my_coach_setup(); "I'm set" finishes it;
 * the hub then shows What's new for coaches once, and "Got it" records it.
 * The fixture is trainer-hub-check.js's.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
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

  // ── 0212: a coach's first steps, and What's new for coaches ─────────────────────────────────────
  const H = { 'Access-Control-Allow-Origin': '*' };
  let setup = { onboarded: false, photo: false, bio: true, hours: 0, pt_approval: 'coach', coach_checkin: true };
  const RPCS = [];
  await page.route('**/rest/v1/rpc/my_coach_setup', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(setup) }));
  await page.route('**/rest/v1/rpc/finish_coach_setup', (r) => { RPCS.push('finish'); setup = { ...setup, onboarded: true }; return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: 'null' }); });
  await page.route('**/rest/v1/rpc/my_whats_new', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H,
    body: JSON.stringify(RPCS.includes('seen') ? null : { id: 'rel1', title: "What's new for coaches", items: ['A short setup walks you through your photo and hours.'], published_at: new Date().toISOString() }) }));
  await page.route('**/rest/v1/rpc/mark_release_seen', (r) => { RPCS.push('seen'); return r.fulfill({ status: 200, contentType: 'application/json', headers: H, body: 'null' }); });
  const say = (label, ok) => out.push(`${label}: ${ok ? 'yes' : 'MISSING'}`);

  await page.goto('http://localhost:5173/trainer/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  let body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  say('a coach who has not finished setup is taken to it', page.url().endsWith('/trainer/welcome'));
  say('…each step ticks from real data (bio set, photo and hours not: 0 of 2)', /0 of 2 set/.test(body));
  say('…1-on-1s are explained by this gym\'s rule (coach approves)', /you accept or decline it on Bookings/.test(body));
  say('…and the check-in code step shows, as coach check-in is on', /violet QR button/.test(body));
  await page.screenshot({ path: 'shots/trainer-setup.png' });
  await page.getByRole('button', { name: /I’m set/ }).click();
  await page.waitForTimeout(2500);
  say('"I\'m set" finishes it in the database and goes to the hub', RPCS.includes('finish') && page.url().endsWith('/trainer/home'));
  say('the hub shows What\'s new for coaches', (await page.locator('[data-whats-new]').count()) === 1);
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(800);
  say('…"Got it" records it as seen, and it is gone', RPCS.includes('seen') && (await page.locator('[data-whats-new]').count()) === 0);
  await page.goto('http://localhost:5173/trainer/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  say('…and it does not come back', (await page.locator('[data-whats-new]').count()) === 0 && page.url().endsWith('/trainer/home'));
  return out.join('\n');
}
