/**
 * Admin parity (2026-09-19): point rules on Rewards (edit + save writes
 * point_rules), goal templates on Challenges, and a challenge's standings
 * (0094). Playwright runner's `filename` argument, admin dev server on :5174.
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
    // A term that started 10 days ago: 3 visit days (two check-ins on one), one
    // class that has happened and one that has not, one finished workout and
    // one still open. Expected: 3 visit days, 1 class, 0 1-on-1, 1 workout.
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: day(-10), expiry_date: day(20),
      never_expires: false, frozen_at: null, created_at: iso(-10),
      membership_plans: { id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium' } }],
    attendance: [-1, -1, -4, -8].map((d, i) => ({ id: 'a' + i, member_id: 'm1', check_in_time: iso(d), method: 'qr' })),
    bookings: [
      { id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved', requested_at: iso(-6), classes: { id: 'c1', name: 'HIIT', scheduled_at: iso(-3), duration_minutes: 45 } },
      { id: 'b2', member_id: 'm1', class_id: 'c2', status: 'approved', requested_at: iso(-1), classes: { id: 'c2', name: 'Yoga', scheduled_at: iso(2), duration_minutes: 60 } },
    ],
    workout_logs: [
      { id: 'l1', member_id: 'm1', performed_on: day(-2), activity: 'Leg day', duration_minutes: 50, notes: null, created_at: iso(-2), completed_at: iso(-2) },
      { id: 'l2', member_id: 'm1', performed_on: day(0), activity: 'Arms', duration_minutes: null, notes: null, created_at: iso(0), completed_at: null },
    ],
    payments: [], pt_sessions: [], body_measurements: [], notifications: [],
    point_rules: [
      { key: 'checkin', label: 'Checked in at the gym', points: 10, is_active: true, sort_order: 1 },
      { key: 'workout_logged', label: 'Logged a workout', points: 15, is_active: true, sort_order: 2 },
      { key: 'challenge_complete', label: 'Finished a challenge', points: 250, is_active: false, sort_order: 3 }],
    goal_templates: [{ key: 'stay_active', label: 'Maintain an active routine', description: 'Keep ticking over.',
      measured_as: 'Days you trained in the last 30 days.', metric: 'training_days', period_days: 30, target_default: 12, is_active: true, sort_order: 1 }],
    fitness_goals: [{ id: 'fg1', member_id: 'm1', template_key: 'stay_active', achieved_on: null }],
    challenges: [{ id: 'c1', title: 'September sprint', description: 'x', metric_key: 'training_days', target: 12,
      starts_on: '2026-09-01', ends_on: '2026-09-30', reward_points: 250, is_active: true, image_url: null }],
    challenge_participants: [{ challenge_id: 'c1', completed_on: null }, { challenge_id: 'c1', completed_on: '2026-09-15' }],
    achievement_metrics: [{ key: 'training_days', label: 'Training days', unit: 'days' }],
  };
  const RPC = {
    challenge_standings: [
      { member_id: 'm2', first_name: 'Jasmine', last_name: 'Cruz', joined_at: '2026-09-01T00:00:00Z', completed_on: '2026-09-15', progress: 13, target: 12 },
      { member_id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', joined_at: '2026-09-02T00:00:00Z', completed_on: null, progress: 7, target: 12 }],
    achievement_rarity: [],
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
      globalThis.__rpcs = [...(globalThis.__rpcs ?? []), fn];
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() === 'PATCH') { const b = JSON.parse(req.postData() || '{}'); rows.forEach((r) => Object.assign(r, b)); }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const grab = (t, from, n = 140) => { const i = t.toLowerCase().indexOf(from.toLowerCase()); return i < 0 ? `MISSING "${from}"` : t.slice(i, i + n); };


  // Rewards: point rules
  await page.goto('http://localhost:5174/rewards', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();
  out.push('rules section: ' + grab(t, 'How members earn points', 120));
  const pts = page.getByLabel('Points').first();
  await pts.fill('20');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.waitForTimeout(900);
  out.push('checkin points now: ' + TABLES.point_rules.find((r) => r.key === 'checkin').points);
  await page.getByRole('switch', { name: /Logged a workout on/ }).click();
  await page.waitForTimeout(800);
  out.push('workout rule active: ' + TABLES.point_rules.find((r) => r.key === 'workout_logged').is_active);
  await page.getByText('How members earn points').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shots/admin-point-rules.png' });

  // Challenges: standings + goal templates
  await page.goto('http://localhost:5174/challenges', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  t = await text();
  out.push('goal templates: ' + grab(t, 'Goal templates', 160));
  await page.getByRole('button', { name: 'Standings' }).first().click();
  await page.waitForTimeout(1200);
  t = await text();
  out.push('standings: ' + grab(t, 'Standings — ', 140));
  await page.screenshot({ path: 'shots/admin-standings.png' });
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Default target').first().fill('15');
  await page.getByText('Goal templates').scrollIntoViewIfNeeded();
  await page.locator('button:has-text("Save")').last().click();
  await page.waitForTimeout(900);
  out.push('template target now: ' + TABLES.goal_templates[0].target_default);
  await page.screenshot({ path: 'shots/admin-goal-templates.png' });
  return out.join('\n');
}
