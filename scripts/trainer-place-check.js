/**
 * The coach app after the simplify (2026-10-28), beyond the rail:
 *   a trainee's place — a package trainee has Chat · Classwork · Progress · About,
 *     someone on single sessions Chat · About; About is Progress · Training ·
 *     Notes · Safety, and Safety's emergency contact is a call link;
 *   Schedule — This week groups the approved sessions by day, tagged Package or
 *     Single, and cancels one through cancel_booking() with a reason; Your hours
 *     is a tab; Classes is a tab only where the gym runs classes;
 *   Today — a package asked for shows (to Packages), a class request shows only
 *     with classes on, and See all goes to Schedule.
 *
 * Member dev server on :5173.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 't1', aud: 'authenticated', role: 'authenticated', email: 'ben@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => { localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('trainerMode', 'true'); }, [KEY, session]);
  const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
  const day = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  // A time later this week (Mon–Sun), so the week tab has it whatever today is: tomorrow, unless today is Sunday.
  const ahead = (() => { const x = new Date(); x.setHours(x.getDay() === 0 ? 23 : 18, x.getDay() === 0 ? 30 : 0, 0, 0);
    if (x.getDay() !== 0) x.setDate(x.getDate() + (x.getDay() === 6 ? 0 : 1)); if (x.getTime() <= Date.now()) x.setTime(Date.now() + 20 * 60000); return x.toISOString(); })();
  const ROOMS = [{ id: 'pt2', kind: 'pt', name: 'Ana Reyes · 1-on-1', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 1,
    post_count: 0, last_post_at: null, comments_on: true, archived: false, join_code: null, is_mine: true, full_access: true }];
  const COACHINGS = [
    { id: 'k2', member_id: 'm2', member_name: 'Ana Reyes', member_photo: null, trainer_id: 't1', trainer_name: 'Ben Cruz', trainer_photo: null,
      kind: 'pt', room_id: 'pt2', months: 3, status: 'active', fee_mode: 'included', price: null, pay_reference: null, pay_sent_at: null,
      starts_on: day(-20), ends_on: day(70), started_by: 'member', created_at: ago(30000), i_am: 'coach' },
    { id: 'k5', member_id: 'm5', member_name: 'Eli Santos', member_photo: null, trainer_id: 't1', trainer_name: 'Ben Cruz', trainer_photo: null,
      kind: 'pt', room_id: null, months: 1, status: 'requested', fee_mode: 'included', price: null, pay_reference: null, pay_sent_at: null,
      starts_on: null, ends_on: null, started_by: 'member', created_at: ago(90), i_am: 'coach' },
  ];
  const ROSTER = [
    { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, experience_level: 'beginner', last_visit: ago(60 * 24), visits_last_30: 6, upcoming_with_me: 1 },
    { member_id: 'm2', name: 'Ana Reyes', photo_url: null, experience_level: 'intermediate', last_visit: ago(60 * 24), visits_last_30: 9, upcoming_with_me: 1 },
  ];
  const SESSIONS = [
    { id: 's1', member_id: 'm2', trainer_id: 't1', starts_at: ahead, duration_minutes: 60, status: 'approved', notes: null, requested_at: ago(3000) },
    { id: 's2', member_id: 'm1', trainer_id: 't1', starts_at: ahead, duration_minutes: 60, status: 'approved', notes: null, requested_at: ago(3000) },
  ];
  // A class request, pending for this coach to decide.
  const BOOKINGS = [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'pending', requested_at: ago(120), coach_ok_at: null,
    classes: { id: 'c1', name: 'Morning HIIT', scheduled_at: ahead, trainer_id: 't1' } }];
  let CLASSES_ON = false;
  let cancelCall = null;

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'trainer', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', short_name: null, logo_url: null,
        accent: 'violet', accent_action: null, points_name: 'Points', points_name_short: 'points', welcome_message: null, tagline: null,
        vocabulary: {}, join_policy: 'open', join_code: null, modules: { classes: CLASSES_ON, coaching: true, rooms: true, chat: true } }]);
      if (fn === 'my_rooms') return json(ROOMS);
      if (fn === 'my_coachings') return json(COACHINGS);
      if (fn === 'coaching_settings') return json([{ modes: ['pick_pt', 'coach_invites'], lengths: [1, 3], fee_mode: 'included' }]);
      if (fn === 'my_booking_modes') return json([{ class_mode: 'coach', pt_mode: 'coach' }]);
      if (fn === 'my_conversations' || fn === 'review_queue' || fn === 'my_room_photos' || fn === 'room_badges') return json([]);
      if (fn === 'room_classwork' || fn === 'room_progress' || fn === 'cancellation_reasons') return json([]);
      if (fn === 'cancel_booking') { cancelCall = JSON.parse(req.postData() || '{}'); return json(null); }
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'my_trainer_members') return json(ROSTER);
    if (t === 'pt_sessions') return json(SESSIONS);
    if (t === 'bookings') return json(BOOKINGS);
    if (t === 'cancellation_reasons') return json([{ key: 'conflict', label: 'Schedule conflict', applies_to: 'any', needs_note: false, is_active: true, sort_order: 1 }]);
    if (t === 'member_profiles') {
      const mp = { emergency_contact_name: 'Rosa Reyes', emergency_contact_phone: '+63 917 555 0199', emergency_contact_relationship: 'Mother' };
      return json(one ? mp : [mp]);
    }
    if (t === 'trainer_availability') return json([{ id: 'av1', trainer_id: 't1', day_of_week: 1, start_time: '17:00:00', end_time: '20:00:00', slot_minutes: 60 }]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1600);
  };
  const tabs = async () => (await page.getByRole('tab').allInnerTexts()).map((x) => x.replace(/\s*·.*$/, '').trim());
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  // ---- a trainee's place ----
  await go('/trainer/pt/m2');
  out.push('a package trainee: Chat · Classwork · Progress · About: ' + ((await tabs()).join(' · ') === 'Chat · Classwork · Progress · About' ? 'yes' : 'NO ' + (await tabs()).join(' · ')));
  out.push('…the package and its end date under the name: ' + (/Package · 3 months · until/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-place-package.png' });
  await go('/trainer/pt/m1');
  out.push('single sessions: Chat · About: ' + ((await tabs()).join(' · ') === 'Chat · About' ? 'yes' : 'NO ' + (await tabs()).join(' · ')));
  out.push('…the chat is there without a room: ' + ((await page.locator('[data-timeline]').count()) === 1 && (await page.getByLabel('Message').count()) === 1 ? 'yes' : 'MISSING'));
  await page.getByRole('tab', { name: 'About' }).click();
  await page.waitForTimeout(1200);
  const about = await tabs();
  out.push('About is Progress · Training · Notes · Safety: ' + (['Progress', 'Training', 'Notes', 'Safety'].every((x) => about.includes(x)) ? 'yes' : 'NO ' + about.join(' · ')));
  out.push('…and offers a package to someone on single sessions: ' + (/Offer Lea a package/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('tab', { name: 'Safety' }).click();
  await page.waitForTimeout(500);
  out.push('Safety: the emergency contact, a tap to call: ' + ((await page.locator('a[href="tel:+639175550199"]').count()) === 1 && /Rosa Reyes/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/trainer-place-safety.png' });

  // ---- Schedule ----
  await go('/trainer/schedule');
  out.push('Schedule: This week · Your hours, no Classes with classes off: ' + ((await tabs()).join(' · ') === 'This week · Your hours' ? 'yes' : 'NO ' + (await tabs()).join(' · ')));
  const sessions = await page.locator('[data-week-session]').allInnerTexts();
  out.push('the week: each session tagged Package or Single: ' + (sessions.some((r) => /Ana Reyes/.test(r) && /Package/.test(r)) && sessions.some((r) => /Lea Lorenzana/.test(r) && /Single/.test(r)) ? 'yes' : 'NO ' + JSON.stringify(sessions)));
  out.push('…under the day’s heading: ' + ((await page.locator('[data-week-day] h2').count()) >= 1 ? 'yes' : 'MISSING'));
  out.push('no class request with classes off: ' + (!/Morning HIIT/.test(await text()) ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/trainer-schedule-week.png' });
  await page.locator('[data-week-session]').filter({ hasText: 'Lea Lorenzana' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/trainer-schedule-cancel.png' });
  out.push('cancel asks for a reason first: ' + ((await page.getByText('Why is it being cancelled?').count()) === 1 && (await page.getByText('Schedule conflict').count()) >= 1 ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('tab', { name: 'Your hours' }).click();
  await page.waitForTimeout(1000);
  out.push('Your hours is a tab, with the hours: ' + (/\?tab=hours$/.test(page.url()) && /Monday/.test(await text()) ? 'yes' : 'MISSING ' + page.url()));
  CLASSES_ON = true;
  await go('/trainer/schedule');
  out.push('with classes on, a Classes tab: ' + ((await tabs()).join(' · ') === 'This week · Your hours · Classes' ? 'yes' : 'NO ' + (await tabs()).join(' · ')));
  out.push('…and the class request to decide: ' + (/Morning HIIT/.test(await text()) ? 'yes' : 'MISSING'));
  CLASSES_ON = false;

  // ---- Today ----
  await go('/trainer/home');
  let t = await text();
  out.push('Today shows the package asked for: ' + ((await page.locator('[data-package-asks]').count()) === 1 && /Eli Santos asks for a 1 month package/.test(t) ? 'yes' : 'MISSING'));
  out.push('…and no class request with classes off: ' + (!/Morning HIIT/.test(t) ? 'yes' : 'STILL SHOWN'));
  await page.locator('[data-package-asks]').getByText(/Eli Santos/).click();
  await page.waitForTimeout(1000);
  out.push('the ask opens Packages, on Needs you: ' + (/\/trainer\/packages\?tab=needs$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  CLASSES_ON = true;
  await go('/trainer/home');
  t = await text();
  out.push('with classes on, Today shows the class request: ' + (/Morning HIIT/.test(t) ? 'yes' : 'MISSING'));
  return out.join('\n');
}
