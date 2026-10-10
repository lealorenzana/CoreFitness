/**
 * 0181 on the coach's side: a request answered with the coach's own price
 * (paid to the coach directly), a payment the member says they sent — the
 * coach taps Received — the trainees and until when, and how members pay them.
 *
 * Fixture from trainer-booking-modes-check.js.
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
        status: 'pending', notes: null, payment_id: null, requested_at: iso(-1, 10, 0), created_at: iso(-1, 10, 0),
        coach_ok_by: null, coach_ok_at: null },
    ],
    cancellation_reasons: REASONS,
    trainer_payment_methods: [{ id: 'pm1', trainer_id: 't1', kind: 'gcash', label: 'GCash', account_name: 'Kenji Ramos',
      account_number: '0917 000 1111', qr_url: null, active: true, created_at: iso(-3, 9, 0) }],
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
  const CC = [];
  const row = (o) => ({ member_id: 'm1', member_name: 'Lea Lorenzana', member_photo: null, trainer_id: 't1', trainer_name: 'Kenji Ramos',
    trainer_photo: null, kind: 'pt', room_id: null, months: 3, fee_mode: 'trainer_direct', price: null, pay_reference: null,
    pay_sent_at: null, starts_on: null, ends_on: null, started_by: 'member', created_at: iso(-1, 9, 0), standin_id: null,
    standin_trainer_id: null, standin_name: null, standin_from: null, standin_to: null, group_code: null, i_am: 'coach', ...o });
  const COACHINGS = [
    row({ id: 'k1', status: 'requested' }),
    row({ id: 'k2', member_id: 'm2', member_name: 'Ana Reyes', status: 'payment_sent', price: 1500, pay_reference: 'GC-777' }),
    row({ id: 'k3', member_id: 'm3', member_name: 'Joy Tan', status: 'active', room_id: 'rm3', starts_on: '2026-10-01', ends_on: '2027-01-01' }),
  ];
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
      const cb = JSON.parse(req.postData() || '{}');
      if (fn === 'coaching_settings') return json([{ modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee_mode: 'trainer_direct' }]);
      if (fn === 'my_coachings') return json(COACHINGS);
      if (fn === 'coaching_sweep') return json(0);
      if (['respond_coaching', 'confirm_coaching_payment', 'invite_coaching'].includes(fn)) { CC.push([fn, cb]); return json('ok'); }
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
  await page.goto('http://localhost:5173/trainer/coaching', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.getByText('Lea Lorenzana').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  let t = await text();
  out.push('the request, the payment to check, and the trainee with until when: '
    + (/Asking you/.test(t) && /Paid you/.test(t) && /ref GC-777/.test(t) && /Joy Tan/.test(t) && /Until/.test(t) ? 'yes' : 'MISSING'));
  out.push('Accept waits for the coach to say their price: ' + (await page.getByRole('button', { name: /^Accept$/ }).first().isDisabled() ? 'yes' : 'NO'));
  await page.getByLabel('Price for Lea Lorenzana').fill('1500');
  await page.getByRole('button', { name: /^Accept$/ }).first().click();
  await page.waitForTimeout(900);
  let c = CC.find(([f]) => f === 'respond_coaching');
  out.push('accepting sends the price: ' + (c && c[1].p_id === 'k1' && c[1].p_accept === true && c[1].p_price === 1500 ? 'yes' : 'MISSING ' + JSON.stringify(CC)));
  await page.getByRole('button', { name: /^Received$/ }).click();
  await page.waitForTimeout(900);
  c = CC.find(([f]) => f === 'confirm_coaching_payment');
  out.push('Received confirms that payment: ' + (c && c[1].p_id === 'k2' && c[1].p_received === true ? 'yes' : 'MISSING'));
  t = await text();
  out.push('how members pay this coach, and that the gym never sees it: ' + (/How members pay you/.test(t) && /0917 000 1111/.test(t) && /never sees this money/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-coaching.png', fullPage: true });
  return out.join('\n');
}
