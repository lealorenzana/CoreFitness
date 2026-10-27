/**
 * Wave 1 of the lively coach app (0218; mock-up approved): the rail says what
 * each button is; Today opens with the day in three numbers, counting up on the
 * first open of the day; a coach's new milestone plays as a full moment; a
 * trainee's win slides in as a small card and Send congrats goes to their chat;
 * requests are decided on Today (✓ accepts, ✕ asks once more); Find a trainee
 * opens their sheet. Setup copied from trainer-hub-check.js. Member dev server on :5173.
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
  const ahead = (d) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(9, 0, 0, 0); return x.toISOString(); };
  const ROOMS = [
    { id: 'rm1', kind: 'class', name: 'Morning HIIT', description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 8, post_count: 2,
      last_post_at: ago(60), comments_on: true, archived: false, join_code: null, is_mine: true, full_access: true },
  ];
  const ROSTER = [
    { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, experience_level: null, last_visit: ago(60), visits_last_30: 6, upcoming_with_me: 1 },
    { member_id: 'm2', name: 'Ana Reyes', photo_url: null, experience_level: null, last_visit: ago(60 * 24 * 9), visits_last_30: 2, upcoming_with_me: 0 },
  ];
  const BOOKINGS = [{ id: 'b1', member_id: 'm1', class_id: 'c1', status: 'pending', requested_at: ago(60 * 50), coach_ok_at: null,
    classes: { id: 'c1', name: 'HIIT', trainer_id: 't1', scheduled_at: ahead(3), capacity: 12, location: 'Studio', duration_minutes: 45 } }];
  const PT = [{ id: 'p1', trainer_id: 't1', member_id: 'm2', starts_at: ahead(5), duration_minutes: 60, status: 'pending', requested_at: ago(90), coach_ok_at: null }];
  const WINS = [{ id: 'n1', title: 'Ana set a new record', message: 'Barbell Squat · 80 kg — best was 75 kg', created_at: ago(5),
    metadata: { member_id: 'm2', first_name: 'Ana', kind: 'record', ref: 'pr1', dedupe: 'twin:record:pr1' } }];
  const writes = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = req.postDataJSON?.() ?? null;
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'trainer', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_rooms') return json(ROOMS);
      if (fn === 'my_conversations') return json([]);
      if (fn === 'my_booking_modes') return json([{ class_mode: 'coach', pt_mode: 'coach' }]);
      if (fn === 'coach_arrival') return json(true);
      if (fn === 'celebrate_coach_moments') return json([{ kind: 'sessions', value: 50, total: 52, next: 100 }]);
      if (fn === 'open_conversation') { writes.push({ fn, body }); return json('cv9'); }
      if (fn === 'send_message' || fn === 'post_message') { writes.push({ fn, body }); return json(null); }
      if (fn === 'my_coach_setup') return json({ onboarded: true });
      if (fn === 'room_badges' || fn === 'review_queue' || fn === 'my_room_photos') return json([]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    const q = url.search;
    if (req.method() === 'PATCH' || req.method() === 'POST') {
      writes.push({ table: t, method: req.method(), q, body: req.postDataJSON?.() ?? null });
      return json([{ id: 'x' }]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'my_trainer_members') return json(ROSTER);
    if (t === 'bookings') return json(BOOKINGS);
    if (t === 'pt_sessions') return json(PT);
    if (t === 'notifications' && /trainee_win/.test(q)) return json(WINS);
    if (t === 'gym_settings') { const g = { gym_id: 'gym-1', celebrations: true, celebration_sounds: false, coach_checkin_on: false }; return json(one ? g : [g]); }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/trainer/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(900);

  // 1. The rail says what each button is.
  const labels = await page.locator('[data-rail-label]').allInnerTexts();
  out.push('the rail is labelled: ' + (['Today', 'Messages', 'Morning HIIT', 'New group'].every((l) => labels.includes(l)) ? 'yes' : 'MISSING ' + JSON.stringify(labels)));

  // 2. The first open of the day: the three numbers, counting up.
  const arrived = await page.waitForSelector('[data-day-strip].td-arrive', { timeout: 4000 }).then(() => true, () => false);
  out.push('the day strip arrives: ' + (arrived ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/coach-arrive.png' });
  await page.waitForTimeout(1800);
  const strip = (await page.locator('[data-day-strip]').innerText()).replace(/\s+/g, ' ');
  out.push('…with the requests that wait on the coach: ' + (/2 requests/.test(strip) ? 'yes' : 'MISSING ' + strip));

  // 3. The milestone plays after the arrival, as a full moment.
  await page.waitForTimeout(900);
  const moment = page.locator('[data-coach-moment="sessions"]');
  out.push('a new milestone plays as a full moment: ' + ((await moment.count()) === 1 && /50 sessions run/.test(await moment.innerText()) ? 'yes' : 'MISSING'));
  out.push('…with the real count and the next mark: ' + (/52 1-on-1s and classes coached so far\. Your next mark is 100\./.test((await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/coach-milestone.png' });
  await page.locator('[data-moment-done]').click();
  await page.waitForTimeout(1200);

  // 4. A trainee's win: a small card, then congrats to their chat.
  const card = page.locator('[data-win-card="record"]');
  out.push('a trainee’s win slides in as a small card: ' + ((await card.count()) === 1 && /Ana set a new record/.test(await card.innerText()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/coach-win-card.png' });
  await card.getByRole('button', { name: 'Send congrats' }).click();
  await page.waitForTimeout(800);
  const draft = await page.getByLabel('Your message').inputValue();
  out.push('…Send congrats offers a draft in her own numbers: ' + (/You set a new record — Barbell Squat · 80 kg\. Great work, Ana!/.test(draft) ? 'yes' : 'MISSING ' + draft));
  await page.screenshot({ path: 'shots/coach-congrats.png' });
  await page.getByRole('button', { name: 'Send to Ana' }).click();
  await page.waitForTimeout(1200);
  out.push('…which goes to her chat: ' + (writes.some((w) => w.fn === 'open_conversation' && JSON.stringify(w.body).includes('m2')) ? 'yes' : 'MISSING ' + JSON.stringify(writes)));
  out.push('…and the win is marked seen: ' + (writes.some((w) => w.table === 'notifications' && w.method === 'PATCH' && /n1/.test(w.q)) ? 'yes' : 'MISSING'));

  // 5. Requests decided on Today.
  const reqs = page.locator('[data-requests]');
  out.push('requests are listed on Today with who and when: ' + (/Lea Lorenzana/.test(await reqs.innerText()) && /waiting 2 days/.test(await reqs.innerText()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Accept Lea Lorenzana' }).click();
  await page.waitForTimeout(900);
  out.push('✓ accepts the class booking: ' + (writes.some((w) => w.table === 'bookings' && w.method === 'PATCH' && w.body?.status === 'approved') ? 'yes' : 'MISSING'));
  out.push('…and says so: ' + ((await page.locator('[data-decided="approved"]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Decline Ana Reyes' }).click();
  await page.waitForTimeout(400);
  out.push('✕ asks once more before declining: ' + (!writes.some((w) => w.table === 'pt_sessions') && (await reqs.getByRole('button', { name: 'Decline', exact: true }).count()) === 1 ? 'yes' : 'MISSING'));
  await reqs.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.waitForTimeout(900);
  out.push('…then declines the 1-on-1: ' + (writes.some((w) => w.table === 'pt_sessions' && w.body?.status === 'rejected') ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/coach-today.png' });

  // 6. Find a trainee.
  await page.locator('[data-find-trainee]').fill('ana');
  await page.waitForTimeout(400);
  await page.locator('[data-found]').getByText('Ana Reyes').click();
  await page.waitForTimeout(1000);
  out.push('Find a trainee opens their sheet: ' + (/\/trainer\/members\?open=m2/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  return out.join(String.fromCharCode(10));
}
