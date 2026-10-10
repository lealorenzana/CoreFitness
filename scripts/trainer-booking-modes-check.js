/**
 * 0180 on the coach's side: the gym decides who approves each kind of booking.
 * Classes here are decided by the desk alone, so the coach's row says so and
 * offers no buttons; 1-on-1 is "coach, then desk", so a session this coach
 * already accepted says it is waiting for the desk, and one not yet accepted
 * still offers Accept/Decline.
 *
 * Playwright runner's `filename`, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const s = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < s.length; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const now = new Date();
  const iso = (d, h, m) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };

  const ME = { id: 't1', first_name: 'Kenji', last_name: 'Ramos', email: 'kenji@corefitness-test.com',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) };
  const M1 = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-120, 9, 0) };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 't1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 't1', name: 'Kenji Ramos', email: 'kenji@corefitness-test.com', role: 'trainer' }));
  }, [KEY, session]);

  const REASONS = [
    { key: 'schedule_conflict', label: 'Schedule conflict', applies_to: 'any', needs_note: false, sort_order: 10 },
    { key: 'trainer_unavailable', label: 'Trainer unavailable', applies_to: 'trainer', needs_note: false, sort_order: 40 },
    { key: 'changed_plans', label: 'Changed plans', applies_to: 'member', needs_note: false, sort_order: 60 },
    { key: 'other', label: 'Other', applies_to: 'any', needs_note: true, sort_order: 999 },
  ];

  const TABLES = {
    profiles: [ME, M1],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength', bio: null, availability: null,
      years_experience: 10, certifications: null, focus_areas: null, achievements: null, profiles: ME }],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', experience_level: 'intermediate',
      created_at: M1.created_at, profiles: M1 }],
    my_trainer_members: [{ member_id: 'm1', name: 'Lea Lorenzana', photo_url: null,
      experience_level: 'intermediate', last_visit: iso(-1, 7, 0), visits_last_30: 4, upcoming_with_me: 1 }],
    classes: [], class_availability: [],
    // The desk alone decides classes at this gym.
    bookings: [{ id: 'bk1', member_id: 'm1', class_id: 'c1', status: 'pending', requested_at: iso(-1, 8, 0),
      approved_at: null, rejected_at: null, approved_by: null, coach_ok_by: null, coach_ok_at: null,
      classes: { id: 'c1', name: 'HIIT', trainer_id: 't1', scheduled_at: iso(3, 7, 0), capacity: 10 } }],
    pt_sessions: [
      // Coach, then desk, and this coach has already accepted: waiting for the desk.
      { id: 'ptA', member_id: 'm1', trainer_id: 't1', starts_at: iso(4, 9, 0), duration_minutes: 60,
        status: 'pending', notes: null, payment_id: null, requested_at: iso(-1, 9, 0), created_at: iso(-1, 9, 0),
        coach_ok_by: 't1', coach_ok_at: iso(0, 8, 0) },
      // Coach, then desk, not yet accepted: the coach still decides first.
      { id: 'ptB', member_id: 'm1', trainer_id: 't1', starts_at: iso(5, 9, 0), duration_minutes: 60,
        status: 'pending', notes: null, payment_id: null, requested_at: iso(-2, 10, 0), created_at: iso(-2, 10, 0),
        coach_ok_by: null, coach_ok_at: null },
    ],
    cancellation_reasons: REASONS,
    memberships: [], membership_plans: [], notifications: [], attendance: [],
    trainer_availability: [], trainer_credentials: [], trainer_feedback: [],
    trainer_ratings: [], trainer_busy_slots: [], workout_logs: [], body_measurements: [],
    fitness_goals: [], achievements: [], achievement_unlocks: [], member_share_prefs: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: '+63 917 555 0101',
      email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 't1', bookings: true, payments: true, announcements: true }],
    push_subscriptions: [], events: [], workout_resources: [], class_templates: [],
  };
  const RPC = {
    my_trainer_ratings: [], trainer_schedule_conflicts: [], sweep_stale_requests: 0,
    my_features: [], plan_allows: true,
    member_progression: [{ level: 2, points: 90, next_level_points: 300 }],
    sync_my_achievements: 0,
    my_booking_modes: [{ class_mode: 'desk', pt_mode: 'coach_desk' }],
  };

  let cancelCall = null;
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-1/2', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness', role: 'trainer',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true }]);
      if (fn === 'cancel_booking') { cancelCall = req.postData() ?? ''; return json(null); }
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      const rows = TABLES[t] ?? [];
      if (req.method() !== 'GET') return json(one ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  const out = [];
  await page.goto('http://localhost:5173/trainer/bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'shots/trainer-booking-modes.png' });
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  out.push('a class the desk decides says so: ' + (/The front desk decides this one/.test(t) ? 'yes' : 'MISSING'));
  out.push('a session this coach accepted is waiting for the desk: ' + (/You accepted — waiting for the front desk/.test(t) ? 'yes' : 'MISSING'));
  out.push('the waiting nudge counts only what the coach can decide (1, not 3): ' + (/One member has been waiting more than a day/.test(t) ? 'yes' : 'MISSING'));
  out.push('the heading no longer claims the coach decides everything: ' + (!/You decide these/.test(t) ? 'yes' : 'STILL SHOWN'));
  const accepts = await page.getByRole('button', { name: /^Accept$/ }).count();
  out.push('Accept is offered only on the session not yet accepted: ' + (accepts === 1 ? 'yes' : 'NO — ' + accepts + ' Accept buttons'));
  await page.screenshot({ path: 'shots/trainer-booking-modes.png' });
  return out.join('\n');
}
