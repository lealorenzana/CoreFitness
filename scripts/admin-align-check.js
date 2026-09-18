/**
 * The admin side of the member features added 2026-09-18/19, against fixtures:
 *
 *   Trainers   each card says which "Find your coach" goals it matches
 *   Resources  saved / done counts per link (0090)
 *   Exercises  "in N routines" per exercise (0090)
 *   Members    the drawer's Progress tab shows the training plan (0089) and
 *              routines (0086); Notes reads trainer_feedback records (0072) with
 *              the member's Seen / Done (0088)
 *
 * Playwright runner's `filename` argument, admin dev server on :5174. Reads
 * only; every Supabase call is answered here.
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
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };
  const day = (d) => iso(d).slice(0, 10);

  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const T1 = { id: 't1', role: 'trainer', status: 'active', first_name: 'Bianca', last_name: 'Soriano',
    email: 'bianca@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-300) };
  const M1 = { id: 'm1', role: 'member', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-120) };

  const MEMBER_ROW = { profile_id: 'm1', gym_id: null, qr_code: 'QR-m1', experience_level: 'beginner',
    address: 'Mamburao', date_of_birth: '1998-04-12', gender: 'female', created_at: iso(-120), profiles: M1 };

  const TABLES = {
    profiles: [admin, T1, M1],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Rehab & Injury Prevention',
      bio: 'Physical therapist. Helps members return to training after an injury.', availability: null,
      years_experience: 11, certifications: ['NASM Corrective Exercise Specialist'], focus_areas: ['rehab', 'mobility'],
      achievements: null, profiles: T1 }],
    member_profiles: [MEMBER_ROW],
    workout_resources: [
      { id: 'w1', title: 'Yoga With Adriene', provider: 'YouTube', url: 'https://youtube.com/x', image_url: null,
        description: 'Yoga', category: 'Follow-along', level: 'all_levels', is_active: true, sort_order: 1, created_at: iso(-50), created_by: null },
      { id: 'w2', title: 'Bodyweight workouts', provider: 'Darebee', url: 'https://darebee.com', image_url: null,
        description: 'No equipment', category: 'Bodyweight', level: 'beginner', is_active: true, sort_order: 2, created_at: iso(-50), created_by: null },
    ],
    exercises: [
      { id: 'e1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 20 },
      { id: 'e2', name: 'Plank', muscle_group: 'core', equipment: 'bodyweight', is_timed: true, is_active: true, sort_order: 50 },
    ],
    gym_plans: [1, 3, 5].map((d) => ({ id: `gp${d}`, member_id: 'm1', day_of_week: d, remind_at: '18:00:00',
      active: true, last_reminded_on: null, routine_id: d === 1 ? 'r1' : null, created_at: iso(-9) })),
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-2),
      workout_routine_exercises: [{ id: 'x1' }, { id: 'x2' }] }],
    trainer_feedback: [{ id: 'f1', trainer_id: 't1', member_id: 'm1', created_at: iso(-2),
      note: 'Knee tracks well now.', recommendation: 'Add one mobility session a week.',
      seen_at: iso(-1), done_at: null }],
    fitness_goals: [{ id: 'g1', member_id: 'm1', title: 'Squat 80 kg', metric: 'lift_kg', start_value: 50,
      target_value: 80, target_date: null, achieved_on: null, created_at: iso(-20), template_key: null, exercise_id: 'e1' }],
    memberships: [], payments: [], attendance: [], bookings: [], pt_sessions: [], body_measurements: [],
    workout_logs: [], notifications: [],
  };
  const RPC = {
    resource_save_counts: [{ resource_id: 'w1', saved: 12, done: 5 }],
    exercise_routine_counts: [{ exercise_id: 'e1', routines: 3, members: 2 }],
    goal_current_value: 65,
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1];
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const grab = (t, from, n = 140) => { const i = t.toLowerCase().indexOf(from.toLowerCase()); return i < 0 ? `MISSING "${from}"` : t.slice(i, i + n); };

  await page.goto('http://localhost:5174/trainers', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  out.push('trainers: ' + grab(await text(), 'Found under', 80));
  await page.screenshot({ path: 'shots/admin-align-trainers.png' });

  await page.goto('http://localhost:5174/resources', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  let t = await text();
  out.push('resources: ' + grab(t, 'Saved by', 30) + ' / ' + grab(t, 'Not saved', 30));
  await page.screenshot({ path: 'shots/admin-align-resources.png' });

  await page.goto('http://localhost:5174/exercises', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  out.push('exercises: ' + grab(await text(), 'barbell', 40));

  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText('Lea Lorenzana').first().click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Progress/ }).first().click();
  await page.waitForTimeout(800);
  t = await text();
  out.push('drawer plan: ' + grab(t, 'Training plan', 110));
  out.push('drawer routines: ' + grab(t, 'Saved routines', 70));
  out.push('drawer goal: ' + grab(t, 'Squat 80 kg', 40));
  await page.screenshot({ path: 'shots/admin-align-drawer-progress.png' });
  await page.getByRole('button', { name: /Trainer notes/ }).first().click();
  await page.waitForTimeout(700);
  out.push('drawer notes: ' + grab(await text(), 'Bianca Soriano', 140));
  await page.screenshot({ path: 'shots/admin-align-drawer-notes.png' });
  return out.join('\n');
}
