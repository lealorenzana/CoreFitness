/**
 * The coach's own cancel control, and when it is NOT offered.
 *
 * 0071 said cancelling was the desk's job; 0081 reverses that at the gym's
 * request. The interesting half is the asymmetry: `cancel_booking()` refuses a
 * session that has already started, so the button must not appear on one —
 * offering it there would be offering a refusal.
 *
 * Two approved sessions, identical but for their start time. Exactly one should
 * carry the control.
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
    classes: [], class_availability: [], bookings: [],
    pt_sessions: [
      // Ahead: the control belongs here.
      { id: 'ptA', member_id: 'm1', trainer_id: 't1', starts_at: iso(4, 9, 0), duration_minutes: 60,
        status: 'approved', notes: null, payment_id: null, requested_at: iso(-1, 9, 0), created_at: iso(-1, 9, 0) },
      // Already started: it must not.
      { id: 'ptB', member_id: 'm1', trainer_id: 't1', starts_at: iso(-3, 8, 0), duration_minutes: 60,
        status: 'approved', notes: null, payment_id: null, requested_at: iso(-6, 9, 0), created_at: iso(-6, 9, 0) },
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
  const results = [];
  const check = (n, ok, d) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);

  await page.goto('http://localhost:5173/trainer/bookings', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1600);
  // No silent catch on the filter click. The first version swallowed it, the
  // chip never switched, and the run reported "0 cancel buttons" about the
  // Pending tab — a green-looking failure about the wrong screen.
  //
  // And the regex is case-INSENSITIVE on purpose: the chip carries Tailwind's
  // `capitalize`, so it reads "Approved" on screen while the DOM text — which
  // is what the accessible name is computed from — is still `approved`. The
  // same mismatch as the `uppercase` trap in DESIGN_SYSTEM, in reverse.
  const approvedChip = page.getByRole('button', { name: /^approved/i }).first();
  await approvedChip.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/trainer-cancel-list.png' });

  const onApproved = (await page.locator('body').innerText()).includes('Nothing pending') === false;
  check('T0 the Approved filter actually switched', onApproved,
    onApproved ? '' : 'still showing the pending tab — the rest would be about the wrong list');

  const buttons = await page.getByRole('button', { name: /Cancel this session/ }).count();
  check('T1 exactly one of two approved sessions offers the control', buttons === 1,
    `${buttons} button(s) — the future one only, never the one that has started`);

  if (buttons > 0) {
    await page.getByRole('button', { name: /Cancel this session/ }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'shots/trainer-cancel-dialog.png' });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

    check('T2 the dialog asks for a reason', /Why is it being cancelled/i.test(body));
    check('T3 the member is told the reason will be shown to them',
      /shown to them/i.test(body), body.slice(0, 80));
    check('T4 a member-only reason is NOT offered to the coach',
      !/Changed plans/i.test(body) && /Trainer unavailable/i.test(body));

    const confirm = page.getByRole('button', { name: /Confirm cancellation/ }).first();
    check('T5 confirm is disabled until a reason is chosen', await confirm.isDisabled());

    // `radio`, not `button`: the reason list is a radiogroup, so each option
    // announces itself as a radio however it is built underneath.
    await page.getByRole('radio', { name: /^Trainer unavailable$/i }).first().click();
    await page.waitForTimeout(300);
    check('T6 picking a reason enables confirm', !(await confirm.isDisabled()));

    await confirm.click();
    await page.waitForTimeout(1200);
    check('T7 it calls cancel_booking with the kind, id and reason',
      cancelCall != null && /"p_kind":"pt"/.test(cancelCall) && /"p_id":"ptA"/.test(cancelCall)
        && /"p_reason":"trainer_unavailable"/.test(cancelCall),
      cancelCall ?? 'NOTHING SENT');
  }

  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  return `${results.join('\n')}\n\n${results.length - failed}/${results.length} passed`;
}
