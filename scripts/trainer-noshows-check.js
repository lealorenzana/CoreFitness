/**
 * 0260 on the coach's side: This week sweeps first; a session that has started offers "they came" / "they did not
 * come" (mark_attendance) when the gym tracks no-shows, and a no-show can be undone the same way; where the owner
 * lets coaches set repeats, an upcoming session offers Repeat (the gym's maximum weeks); the trainee's About shows
 * their no-shows, late cancels and a booking pause. Setup copied from trainer-booking-modes-check.js. :5173, 393px.
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
    bookings: [],
    pt_sessions: [
      { id: 'ptPast', member_id: 'm1', trainer_id: 't1', starts_at: new Date(Date.now() - 5 * 60_000).toISOString(), duration_minutes: 60,
        status: 'approved', notes: null, payment_id: null, requested_at: iso(-2, 9, 0), created_at: iso(-2, 9, 0), attended: null },
      { id: 'ptNext', member_id: 'm1', trainer_id: 't1', starts_at: new Date(Date.now() + 60 * 60_000).toISOString(), duration_minutes: 60,
        status: 'approved', notes: null, payment_id: null, requested_at: iso(-2, 10, 0), created_at: iso(-2, 10, 0), attended: null },
    ],
    cancellation_reasons: REASONS,
    memberships: [], membership_plans: [], notifications: [], attendance: [],
    trainer_availability: [], trainer_credentials: [], trainer_feedback: [],
    trainer_ratings: [], trainer_busy_slots: [], workout_logs: [], body_measurements: [],
    achievements: [], achievement_unlocks: [], member_share_prefs: [],
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
    my_booking_modes: [{ class_mode: 'instant', pt_mode: 'instant' }],
    gym_booking_rules: { repeats_on: true, noshows_on: true, repeat_who: ['member', 'coach'], repeat_kind: 'weeks', repeat_max_weeks: 3,
      repeat_ahead_days: 7, class_cancel_minutes: 0, pt_cancel_minutes: 0, slot_cancel_minutes: 0, late_cancel_mode: 'mark',
      noshow_mode: 'auto_coach', noshow_window_minutes: 60, noshow_tell: true, noshow_counts_used: true, noshow_pause: true,
      noshow_pause_count: 3, noshow_pause_within_days: 30, noshow_pause_days: 7, my_pause: null },
    booking_record: [{ kind: 'pt', id: 'old1', what: '1-on-1 on Nov 3', starts_at: iso(-12, 18, 0), mark: 'no_show', marked_by_role: 'system', marked_at: iso(-12, 19, 0) },
      { kind: 'pt', id: 'old2', what: '1-on-1 on Nov 10', starts_at: iso(-5, 18, 0), mark: 'late_cancel', marked_by_role: 'member', marked_at: iso(-5, 17, 0) }],
    booking_pause_of: [{ id: 'bp1', until: iso(4, 18, 0), reason: '3 no-shows or late cancels in 30 days', auto: true }],
  };

  const CALLS = [];
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
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness', role: 'trainer',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true }]);
      if (['mark_attendance', 'repeat_booking', 'settle_no_shows', 'extend_repeats'].includes(fn)) {
        CALLS.push([fn, body]);
        if (fn === 'mark_attendance') TABLES.pt_sessions.find((s) => s.id === body.p_id).attended = body.p_came ? 'came' : 'no_show';
        return json(fn === 'repeat_booking' ? 'r1' : 0);
      }
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      const rows = TABLES[t] ?? [];
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 393, height: 852 });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const go = async (p) => {
    await page.goto('about:blank');
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(3500);
  };
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/trainer/schedule');
  say('This week sweeps first', CALLS.some(([f]) => f === 'settle_no_shows') && CALLS.some(([f]) => f === 'extend_repeats'));
  say('a session that has started asks whether they came', (await page.locator('[data-coach-mark="none"]').count()) === 1);
  await page.getByRole('button', { name: 'They did not come' }).click(); await page.waitForTimeout(1500);
  let c = CALLS.filter(([f]) => f === 'mark_attendance').pop();
  say('…"did not come" sends mark_attendance(pt, came = false)', c && c[1].p_id === 'ptPast' && c[1].p_came === false, JSON.stringify(c));
  say('…the row then says No-show and offers "they were here"', (await page.locator('[data-coach-mark="no_show"]').count()) === 1
    && (await page.getByRole('button', { name: 'They were here' }).count()) === 1);
  await page.screenshot({ path: 'shots/trainer-noshow-dark.png' });
  await page.getByRole('button', { name: 'They were here' }).click(); await page.waitForTimeout(1500);
  c = CALLS.filter(([f]) => f === 'mark_attendance').pop();
  say('…and undoing it sends came = true', c && c[1].p_came === true, JSON.stringify(c));
  await page.locator('[data-coach-repeat]').first().click(); await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Repeat for 3 weeks' }).click(); await page.waitForTimeout(900);
  c = CALLS.filter(([f]) => f === 'repeat_booking').pop();
  say('the coach repeats an upcoming session (the gym allows 3 weeks)', c && c[1].p_id === 'ptNext' && c[1].p_weeks === 3, JSON.stringify(c));
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/trainer-noshow-light.png' });

  await go('/trainer/pt/m1');
  const about = page.getByRole('tab', { name: 'About' });
  if (await about.count()) { await about.first().click(); await page.waitForTimeout(1500); }
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  say('the trainee’s About shows their no-shows and late cancels', /Showing up.*1 no-show · 1 late cancel in 90 days/.test(txt));
  say('…and that their booking in the app is paused', /can’t book in the app until .*3 no-shows or late cancels in 30 days/.test(txt));
  return out.join(String.fromCharCode(10));
}
