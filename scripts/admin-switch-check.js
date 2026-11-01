/**
 * 0227 in the admin app: a member who switched to another gym is marked
 * "Switched to another gym" on the Members list and in their drawer (never
 * which gym); one asking to switch in is marked "Switching in from another
 * gym". Fixture from admin-renew-check.js.
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
 */
async (page) => {
  let OUT = ['m1'];
  let IN = [];
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
    membership_plans: [{ id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true }],
    renewal_requests: [{ id: 'rr1', member_id: 'm1', plan_id: 'p3', note: 'Coming tomorrow', status: 'open', created_at: iso(-0.2),
      membership_plans: { name: 'Premium', price: 1500, duration_days: 30 } }],
  };
  const CALLED = [];
  const RPC = {
    gym_traffic: [{ dow: 1, band: '6pm', visits: 12, weeks: 4 }, { dow: 3, band: '9am', visits: 4, weeks: 4 }],
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
      CALLED.push(fn);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-a', gym_name: 'Ana Fitness', slug: 'ana-gym', role: 'admin',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_platform_suspension' || fn === 'my_account_deletion') return json(null);
      if (fn === 'gym_switched_out') return json(OUT);
      if (fn === 'gym_switching_in') return json(IN);
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
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  out.push('the Members list marks who switched out: ' + ((await page.locator('[data-switched-out]').count()) >= 1
    && /Switched to another gym/.test(await page.locator('body').innerText()) ? 'yes' : 'MISSING'));
  await page.getByText('Lea Lorenzana').first().click();
  await page.waitForTimeout(1500);
  out.push('…and so does their drawer, without naming the gym: ' + ((await page.locator('aside [data-switched-out]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');
  OUT = []; IN = ['m1'];
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  out.push('one asking to switch in is marked: ' + ((await page.locator('[data-switching-in]').count()) >= 1
    && /Switching in from another gym/.test(await page.locator('body').innerText()) ? 'yes' : 'MISSING'));
  return out.join('\n');
}
