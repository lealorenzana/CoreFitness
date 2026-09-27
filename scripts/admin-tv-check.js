/**
 * The lobby TV (/tv): what a room full of people sees.
 *
 *   - the gym's own name, logo slot, and join QR code, always on screen;
 *   - today's check-ins as a count (never names);
 *   - every panel in the rotation: gym goal, records, season, squads, classes
 *     with spots, and the latest announcement;
 *   - never a personal notification: a newer "New personal record" sent to one
 *     member must not appear as the gym's announcement.
 *
 * The rotation is 12 s a panel; the page clock is fast-forwarded, not waited on.
 * Playwright runner's `filename` argument, admin dev server on :5174.
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
  const exp = Math.floor(Date.now() / 1000) + 36000;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'desk@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const desk = { id: 'u1', role: 'staff', status: 'active', first_name: 'Dee', last_name: 'Desk',
    email: 'desk@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const later = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const minute = new Date(Date.now() - 3600_000).toISOString();

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, range = '0-9/10') => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': range, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: 'staff', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour-strength',
        short_name: 'Harbour', logo_url: null, accent: 'teal', accent_action: null, tagline: 'Strength, daily',
        points_name: 'Points', points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open',
        join_code: null, modules: {} }]);
      if (fn === 'current_gym_goal') return json([{ id: 'g1', title: '1,000 training days in October', metric: 'training_days',
        target: 1000, starts_on: '2026-10-01', ends_on: '2026-10-31', reward_points: 50, reached: false, progress: 412,
        contributors: 88, mine: 0 }]);
      if (fn === 'pr_wall') return json([{ first_name: 'Ana', last_initial: 'R', exercise_name: 'Deadlift', kind: 'weight', value: 140, achieved_at: minute }]);
      if (fn === 'season_board') return json([{ first_name: 'Lea', last_initial: 'L', score: 900, is_me: false }]);
      if (fn === 'squad_board') return json([{ squad_name: 'Iron Barkada', members: 4, days: 12, weekly_target: 10, reached: true, is_mine: false }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'attendance') return json([], '*/17');
    if (t === 'classes') return json([{ id: 'c1', name: 'HIIT Circuit', scheduled_at: later(2), capacity: 12 }]);
    if (t === 'class_availability') return json([{ class_id: 'c1', booked_count: 9 }]);
    if (t === 'notifications') return json([
      // Newer, personal: one member's record. Must never reach the TV.
      { id: 'n9', title: 'New personal record', message: 'Back Squat: 100 kg (+15 points)', type: 'personal_record',
        created_at: new Date().toISOString(), read: false, image_url: null },
      // Older, a real announcement to many.
      { id: 'n1', title: 'Closed on Monday', message: 'We are closed for the holiday. See you Tuesday!', type: 'info',
        created_at: minute, read: false, image_url: null },
      { id: 'n2', title: 'Closed on Monday', message: 'We are closed for the holiday. See you Tuesday!', type: 'info',
        created_at: minute, read: true, image_url: null },
    ]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  await page.clock.install();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5174/tv', { waitUntil: 'domcontentloaded' });
  await page.clock.runFor(3000);
  await page.waitForTimeout(2500);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  let seen = await text();

  out.push("the gym's name: " + (/Harbour Strength/.test(seen) && /Strength, daily/.test(seen) ? 'shown' : 'MISSING'));
  out.push('check-ins today as a count: ' + (/17 trained here today/.test(seen) ? '17' : 'MISSING'));
  out.push('join QR code: ' + ((await page.locator('aside svg').count()) > 0 ? 'shown' : 'MISSING'));
  out.push('no shell around it: ' + ((await page.locator('aside nav, nav a[href="/dashboard"]').count()) === 0 ? 'full screen' : 'MISSING (sidebar shown)'));
  await page.screenshot({ path: 'shots/tv-1.png' });

  // Walk the rotation: collect every panel's text.
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(12_000);
    await page.waitForTimeout(400);
    seen += ' ' + await text();
    if (i === 1) await page.screenshot({ path: 'shots/tv-2.png' });
  }
  out.push('gym goal panel: ' + (/1,000 training days in October/.test(seen) && /412 of 1,000 training days/.test(seen) ? 'shown' : 'MISSING'));
  out.push('record wall: ' + (/Ana R\./.test(seen) && /140 kg/.test(seen) ? 'shown' : 'MISSING'));
  out.push('season board: ' + (/Lea L\./.test(seen) && /900 pts/.test(seen) ? 'shown' : 'MISSING'));
  out.push('squad board: ' + (/Iron Barkada/.test(seen) && /12 \/ 10 days/.test(seen) ? 'shown' : 'MISSING'));
  out.push('classes with spots: ' + (/HIIT Circuit/.test(seen) && /3 spots left/.test(seen) ? 'shown' : 'MISSING'));
  out.push('the announcement: ' + (/Closed on Monday/.test(seen) ? 'shown' : 'MISSING'));
  out.push('never a personal notification: ' + (/New personal record|Back Squat: 100 kg/.test(seen) ? 'MISSING (a member’s private message was on the TV)' : 'never'));

  return out.join('\n');
}
