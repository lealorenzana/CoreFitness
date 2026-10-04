/**
 * 0145, the desk's side: in the member drawer's Progress tab, a routine the
 * member applied from the AI coach's proposal says "Built with the coach", and a
 * training day the coach set says "Set by the coach"; the member's own do not.
 * On a database without 0145 both still list and nothing is marked.
 *
 * Setup copied from admin-rewards-check.js. Admin dev server on :5174.
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
    member_profiles: [{ ...MEMBER_ROW, saving_for_reward: 'rw2', rewards: { name: 'Gym towel' } }],
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
    // Monday is the member's own; Wednesday (a routine) and Friday (any workout) the coach set (0145).
    gym_plans: [1, 3, 5].map((d) => ({ id: `gp${d}`, member_id: 'm1', day_of_week: d, remind_at: '18:00:00',
      active: true, last_reminded_on: null, routine_id: d === 1 ? 'r1' : d === 3 ? 'r2' : null, created_at: iso(-9),
      source: d === 1 ? 'member' : 'coach' })),
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-2),
      workout_routine_exercises: [{ id: 'x1' }, { id: 'x2' }], source: 'member' },
      { id: 'r2', member_id: 'm1', name: 'Coach push day', notes: null, position: 1, updated_at: iso(-1),
      workout_routine_exercises: [{ id: 'x3' }], source: 'coach' }],
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
    rewards: [{ id: 'rw1', name: 'Shaker bottle', description: null, cost_points: 200, stock: 12, is_active: true },
      { id: 'rw2', name: 'Gym towel', description: null, cost_points: 500, stock: 3, is_active: true }],
    reward_redemptions: [
      { id: 'rd1', member_id: 'm1', reward_id: 'rw1', cost_points: 200, status: 'approved', requested_at: iso(-2), decision_note: null,
        fulfilled_at: null, rewards: { name: 'Shaker bottle' }, member_profiles: { profiles: { first_name: 'Lea', last_name: 'Lorenzana' } } },
      { id: 'rd2', member_id: 'm1', reward_id: 'rw2', cost_points: 500, status: 'pending', requested_at: iso(-1), decision_note: null,
        fulfilled_at: null, rewards: { name: 'Gym towel' }, member_profiles: { profiles: { first_name: 'Lea', last_name: 'Lorenzana' } } }],
  };
  const CALLS = {};
  let BEFORE_0145 = false;
  let refusedSource = 0;
  const RPC = {
    reward_wishlist_counts: [{ reward_id: 'rw2', members: 4 }],
    decide_redemption: null, mark_redemption_collected: null,
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
      // One gym (docs/TENANCY.md): my_gym_context answers from this fixture's
      // own profiles, so the sign-in gates see the role they always did.
      if (fn === 'my_gym_context') {
        // Each fixture keeps its rows differently (DB, TABLES, tables()); take
        // whichever exists rather than naming one and crashing the run in the others.
        const rows = (() => {
          try { return DB.profiles; } catch { /* not this fixture */ }
          try { return TABLES.profiles; } catch { /* nor this */ }
          try { return tables().profiles; } catch { /* nor this */ }
          return [];
        })() || [];
        // Who is asking: the `sub` of the bearer token the app just sent. Read
        // from the request rather than a fixture variable, because the fixtures
        // name their session differently and some mint one per role.
        const sub = (() => {
          try {
            const raw = (route.request().headers()['authorization'] || '').split(' ')[1].split('.')[1];
            return JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).sub;
          } catch { return null; }
        })();
        const me = rows.find((p) => p.id === sub) || rows[0];
        return json(me ? [{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness',
          role: me.role, status: me.status, lock_reason: null, short_name: null, logo_url: null,
          accent: 'violet', gym_count: 1 }] : []);
      }
      // The member's gym streak (0151), for the drawer's Progress tab.
      if (fn === 'member_streak') return json({ target: 3, current: 6, best: 9, days_this_week: 3, needed: 0,
        days_left: 2, week: [], today_index: 5, frozen: false, at_risk: false, out_of_reach: false, next_milestone: 12, nudges: true });
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      // A database without 0145: naming `source` is a 400, and the column never comes back.
      if (BEFORE_0145 && t === 'workout_routines' && params.some(([k, v]) => k === 'select' && /(^|,)\s*source\b/.test(v))) {
        refusedSource++;
        return json({ code: '42703', message: 'column workout_routines.source does not exist' }, 400);
      }
      let rows = (TABLES[t] ?? []).map((r) => (BEFORE_0145 && 'source' in r ? (({ source: _s, ...rest }) => rest)(r) : r));
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


  const openProgress = async () => {
    await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByText('Lea Lorenzana').first().click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Progress/ }).first().click();
    await page.waitForTimeout(1000);
  };
  const rowWith = (a, b) => page.locator('aside div.rounded-xl', { hasText: a }).filter({ hasText: b });

  await openProgress();
  let t = await text();
  out.push('drawer routines: ' + grab(t, 'Saved routines', 140));
  out.push('the gym streak in the drawer: ' + (/Gym streak/i.test(t) && /6 weeks/.test(t) && /9 weeks/.test(t) && /3 days/.test(t) && /Reached/.test(t) ? 'yes' : 'MISSING'));
  out.push('drawer plan: ' + grab(t, 'Training plan', 160));
  out.push('the coach routine is tagged: ' + (await rowWith('Coach push day', 'Built with the coach').count() > 0 ? 'yes' : 'MISSING'));
  out.push('the member routine is not: ' + (await rowWith('Leg day', 'Built with the coach').count() === 0 ? 'yes' : 'NO, tagged'));
  out.push('one routine tag: ' + ((t.match(/Built with the coach/g) || []).length === 1 ? 'yes' : 'NO ' + (t.match(/Built with the coach/g) || []).length));
  out.push('Wednesday is tagged as the coach\'s: ' + (await rowWith('Wed — Coach push day', 'Set by the coach').count() > 0 ? 'yes' : 'MISSING'));
  out.push('Friday (any workout) is tagged too: ' + (await rowWith('Fri — Any workout', 'Set by the coach').count() > 0 ? 'yes' : 'MISSING'));
  out.push('Monday is not: ' + (await rowWith('Mon — Leg day', 'Set by the coach').count() === 0 ? 'yes' : 'NO, tagged'));
  await page.getByText('Saved routines').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: 'shots/admin-coach-mark.png' });

  BEFORE_0145 = true;
  await openProgress();
  t = await text();
  out.push('before 0145 the routines still list: ' + (/Coach push day/.test(t) && /Leg day/.test(t) ? 'yes' : 'MISSING'));
  out.push('before 0145 the column was asked for and refused: ' + (refusedSource > 0 ? 'yes' : 'MISSING'));
  out.push('before 0145 nothing is tagged: ' + (!/Built with the coach|Set by the coach/.test(t) ? 'yes' : 'STILL SHOWN'));
  return out.join('\n');
}
