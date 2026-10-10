/**
 * One Workouts section (2026-10-10, 0172): Today · Routines · Programs · Browse.
 * The first visit explains program → routines → today's workout until Skip or
 * a first workout (the flag is the database's); then Today shows the program's
 * next day with one Start; routines say where they came from; a member with
 * nothing planned is told what to do next, never shown a blank.
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

  const STATE = { seen: null, program: true, routines: true, tracker: true };
  const CALLS = [];
  const now = new Date().toISOString();
  const ex = (n) => ({ id: 'e' + n, position: n, exercise_id: 'x' + n, custom_name: null, target_sets: 3, target_reps: 10,
    target_weight_kg: null, target_seconds: null, rest_seconds: 60, exercises: { name: 'Squat', is_timed: false, muscle_group: 'legs', equipment: null } });
  const ROUTINES = () => STATE.routines ? [
    { id: 'r1', name: 'Monday chest', notes: null, position: 0, updated_at: now, source: 'member', edited_at: null, author: null, editor: null, workout_routine_exercises: [ex(1)] },
    { id: 'r2', name: 'Home circuit', notes: null, position: 1, updated_at: now, source: 'coach', edited_at: null, author: null, editor: null, workout_routine_exercises: [ex(2)] },
    { id: 'r3', name: 'Leg day v2', notes: null, position: 2, updated_at: now, source: 'trainer', edited_at: now, author: { first_name: 'Ben' }, editor: { first_name: 'Ben' }, workout_routine_exercises: [ex(3)] },
  ] : [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      CALLS.push(fn);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      // The member's plan includes the tracker (routines), unless a step says otherwise.
      if (fn === 'my_features') return json([{ key: 'workout_tracker', label: 'Workout tracker', description: '', enabled: STATE.tracker },
        { key: 'premium_programs', label: 'Premium programs', description: '', enabled: true }]);
      if (fn === 'mark_workouts_intro_seen') { STATE.seen = now; return json(null); }
      if (fn === 'program_progress') return json(STATE.program ? [
        { program_id: 'p1', program_name: 'Strength Base', day_id: 'd1', week: 1, day: 1, workout_id: 'w1', workout_name: 'Push day', done: true },
        { program_id: 'p1', program_name: 'Strength Base', day_id: 'd2', week: 1, day: 2, workout_id: 'w2', workout_name: 'Pull day', done: false },
      ] : []);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'member_profiles') { const row = { workouts_intro_seen_at: STATE.seen }; return json(one ? row : [row]); }
    if (t === 'workout_routines') return json(ROUTINES());
    if (t === 'gym_programs') return json(STATE.program ? [{ id: 'p1', name: 'Strength Base', description: null, cover_url: null, level: 'beginner', weeks: 4, premium: false }] : []);
    return json(one ? null : []);
  });

  const out = [];
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };
  await page.setViewportSize({ width: 393, height: 852 });

  // ---- first visit: the three steps ----
  await go('/member/workouts/today');
  let t = await text();
  out.push('first visit explains program, routines, today in order: '
    + ((await page.locator('[data-intro-step]').count()) === 3 && /A program/.test(t) && /Your routines/.test(t) && /Today's workout/.test(t) ? 'yes' : 'MISSING'));
  out.push('…with the member\'s own program in it: ' + (/You follow Strength Base — 1 of 2 days done/.test(t) ? 'yes' : 'MISSING'));
  await page.locator('[data-intro-skip]').click();
  await page.waitForTimeout(500);
  out.push('Skip is remembered by the database: ' + (CALLS.includes('mark_workouts_intro_seen') ? 'yes' : 'MISSING'));

  // ---- Today ----
  t = await text();
  out.push("today's workout is the program's next day: " + (/Pull day · Week 1, Day 2/.test(t) && (await page.getByRole('button', { name: 'Start workout' }).count()) === 1 ? 'yes' : 'MISSING'));
  out.push('the section reads Today · Routines · Programs · Browse: ' + (/Today/.test(t) && /Routines/.test(t) && /Programs/.test(t) && /Browse/.test(t) ? 'yes' : 'MISSING'));
  out.push('routines say where they came from: ' + (/Yours/.test(t) && /AI coach/.test(t) && /Coach Ben/.test(t) ? 'yes' : 'MISSING'));
  await go('/member/workouts/today');
  out.push('the introduction does not come back: ' + ((await page.locator('[data-intro-step]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.locator('[data-how-it-works]').click();
  await page.waitForTimeout(300);
  out.push('"How this works" reopens it: ' + ((await page.locator('[data-intro-step]').count()) === 3 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-workouts-today.png', fullPage: true });

  // ---- a coach's edit is labelled on Routines ----
  await go('/member/track');
  t = await text();
  out.push("a coach's edit is labelled: " + (/Edited by Coach Ben/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 300)));

  // ---- a plan without the tracker sees routines locked, not offered ----
  STATE.tracker = false;
  await page.evaluate(() => sessionStorage.clear());
  await go('/member/workouts/today');
  t = await text();
  out.push('no tracker in the plan: routines locked and explained, none offered: '
    + (/Routines are part of a paid plan/.test(t) && !/Monday chest/.test(t) ? 'yes' : 'MISSING'));
  STATE.tracker = true;

  // ---- nothing planned ----
  STATE.program = false; STATE.routines = false;
  await go('/member/workouts/today');
  t = await text();
  out.push('nothing planned: "No program? No problem" and the library: ' + (/No program\? No problem/.test(t) && /Browse the free library/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-workouts-empty.png', fullPage: true });
  return out.join('\n');
}
