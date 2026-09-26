/**
 * Admin → Training → Programs (0122): the owner builds the gym's programs.
 *
 * Pins down, each a way the page could look right and do nothing:
 *   - a starter pack button sends copy_starter_program with its key, and the
 *     copy arrives as a Draft;
 *   - a grid cell sends the day to gym_program_days (week, day, workout);
 *   - Premium and Publish send the flags;
 *   - a new workout sends the workout and its exercises.
 *
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
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  const EXERCISES = [
    { id: 'ex-bench', name: 'Barbell Bench Press', muscle_group: 'chest', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 1 },
    { id: 'ex-plank', name: 'Plank', muscle_group: 'core', equipment: 'bodyweight', is_timed: true, is_active: true, sort_order: 2 },
  ];
  const WORKOUTS = [];
  const PROGRAMS = [];
  const SENT = { rpc: {}, programPatches: [], days: [], workouts: [], items: [] };
  let n = 0;

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const query = after.indexOf('?') === -1 ? '' : decodeURIComponent(after.slice(after.indexOf('?') + 1));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    const body = () => { const b = JSON.parse(req.postData() || '{}'); return Array.isArray(b) ? b : [b]; };
    const idOf = () => (/id=eq\.([^&]+)/.exec(query) || [])[1];

    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      SENT.rpc[fn] = b;
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'copy_starter_program') {
        const wIds = ['Push', 'Pull', 'Legs'].map((name) => {
          const w = { id: 'w' + (++n), name, notes: null, level: 'intermediate', published: false, created_by: 'u1',
            gym_workout_items: [{ exercise_id: 'ex-bench', position: 0, target_sets: 4, target_reps: 8, target_seconds: null, rest_seconds: 120 }] };
          WORKOUTS.push(w); return w.id;
        });
        const p = { id: 'p' + (++n), name: 'Push / Pull / Legs', description: 'The classic split.', cover_url: null,
          level: 'intermediate', weeks: 4, premium: false, published: false, gym_program_days: [] };
        for (let wk = 1; wk <= 4; wk++) [1, 3, 5].forEach((d, i) => p.gym_program_days.push({ id: 'd' + (++n), week: wk, day: d, workout_id: wIds[i] }));
        PROGRAMS.push(p);
        return json(p.id);
      }
      if (fn === 'gym_photo_usage') return json([{ used: 3, cap: 100 }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    const m = req.method();
    if (t === 'exercises') return json(EXERCISES);
    if (t === 'gym_programs') {
      if (m === 'PATCH') {
        const patch = body()[0]; SENT.programPatches.push(patch);
        const p = PROGRAMS.find((x) => x.id === idOf()); if (p) Object.assign(p, patch);
        return json([{ id: idOf() }]);
      }
      if (m === 'POST') {
        const r = { id: 'p' + (++n), cover_url: null, premium: false, published: false, gym_program_days: [], ...body()[0] };
        PROGRAMS.push(r); return json(one ? { id: r.id } : [{ id: r.id }], 201);
      }
      return json(PROGRAMS);
    }
    if (t === 'gym_program_days') {
      if (m === 'POST') {
        const r = body()[0]; SENT.days.push(r);
        const p = PROGRAMS.find((x) => x.id === r.program_id);
        if (p) {
          p.gym_program_days = p.gym_program_days.filter((d) => !(d.week === r.week && d.day === r.day));
          p.gym_program_days.push({ id: 'd' + (++n), week: r.week, day: r.day, workout_id: r.workout_id });
        }
        return json([{ id: 'd' + n }], 201);
      }
      return json([]);
    }
    if (t === 'gym_workouts') {
      if (m === 'POST') {
        const r = { id: 'w' + (++n), published: false, created_by: 'u1', gym_workout_items: [], ...body()[0] };
        SENT.workouts.push(body()[0]); WORKOUTS.push(r);
        return json(one ? { id: r.id } : [{ id: r.id }], 201);
      }
      return json(WORKOUTS);
    }
    if (t === 'gym_workout_items') {
      if (m === 'POST') {
        SENT.items.push(...body());
        // Attach to the workout, as the real embed would on the next read.
        body().forEach((it) => { const w = WORKOUTS.find((x) => x.id === it.workout_id); if (w) w.gym_workout_items.push(it); });
        return json([], 201);
      }
      return json([]);
    }
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5174/programs', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();
  out.push('programs page: ' + (/Programs/.test(t) && /No programs yet/.test(t) ? 'shown' : 'MISSING'));
  const nav = await page.evaluate(() => document.querySelector('aside')?.innerText ?? '');
  out.push('linked from the sidebar: ' + (/Programs/.test(nav) ? 'yes' : 'MISSING'));

  await page.getByRole('button', { name: 'Add Push / Pull / Legs' }).click();
  await page.waitForTimeout(1200);
  out.push('starter pack sent: ' + (SENT.rpc.copy_starter_program?.p_key === 'push_pull_legs' ? 'push_pull_legs' : 'MISSING'));
  t = await text();
  out.push('arrives as a draft: ' + (/Push \/ Pull \/ Legs/.test(t) && /Draft/.test(t) ? 'shown' : 'MISSING'));

  await page.getByRole('button', { name: 'Edit Push / Pull / Legs' }).click();
  await page.waitForTimeout(800);
  t = await text();
  out.push('week grid: ' + (/Week 1/.test(t) && /Week 4/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel('Week 1, Tue').selectOption({ label: 'Push' });
  await page.waitForTimeout(800);
  const day = SENT.days[SENT.days.length - 1] || {};
  out.push('a grid cell sends the day: ' + (day.week === 1 && day.day === 2 && day.workout_id === WORKOUTS[0].id ? 'week 1, Tue, Push' : 'MISSING ' + JSON.stringify(day)));

  await page.getByLabel('Premium members only').check();
  await page.getByRole('button', { name: 'Save program' }).click();
  await page.waitForTimeout(900);
  out.push('premium sent: ' + (SENT.programPatches.some((p) => p.premium === true) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.waitForTimeout(900);
  out.push('publish sent: ' + (SENT.programPatches.some((p) => p.published === true) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-programs.png', fullPage: true });

  // A workout from scratch.
  await page.getByRole('button', { name: 'Workouts', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'New workout' }).click();
  await page.waitForTimeout(500);
  await page.getByLabel('Workout name').fill('Core Finisher');
  await page.getByRole('button', { name: 'Add an exercise' }).click();
  await page.getByLabel('Exercise 1').selectOption({ label: 'Plank' });
  await page.getByLabel('Seconds 1').fill('45');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await page.waitForTimeout(1200);
  const w = SENT.workouts[SENT.workouts.length - 1] || {};
  out.push('workout sent: ' + (w.name === 'Core Finisher' ? 'Core Finisher' : 'MISSING'));
  const it = SENT.items[SENT.items.length - 1] || {};
  out.push('its exercise sent: ' + (it.exercise_id === 'ex-plank' && it.target_seconds === 45 ? 'Plank 45 s' : 'MISSING ' + JSON.stringify(it)));
  t = await text();
  out.push('the saved workout lists its exercise: ' + (/Core Finisher 1 exercise/.test(t) ? '1 exercise' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-workouts.png', fullPage: true });

  return out.join('\n');
}
