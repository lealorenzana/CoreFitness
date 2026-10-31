/**
 * Guides G4 (2026-10-31), the coach app: Today's tour on the first visit and
 * not the second; Skip and the last Next save it on the account; Personal
 * training has its own; the coach Help (/trainer/help) lists the coach tours
 * and Replay runs one again.
 *
 * Fixture from trainer-hub-check.js. Member dev server on :5173.
 */
async (page) => {
  const TOURS_SEEN = [];
  const MARKED = [];
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
  const room = (id, name, archived) => ({ id, kind: 'pt', name, description: null, trainer_id: 't1', trainer_name: 'Ben Cruz', member_count: 1,
    post_count: 0, last_post_at: ago(3000), comments_on: true, archived, join_code: null, is_mine: true, full_access: true });
  const ROOMS = [room('pt2', 'Ana Reyes · 1-on-1', false), room('pt3', 'Cy Lim · 1-on-1', true)];
  const coaching = (id, member, name, status, roomId, months) => ({ id, member_id: member, member_name: name, member_photo: null, trainer_id: 't1',
    trainer_name: 'Ben Cruz', trainer_photo: null, kind: 'pt', room_id: roomId, months, status, fee_mode: 'included', price: null,
    pay_reference: null, pay_sent_at: null, starts_on: day(-20), ends_on: status === 'ended' ? day(-2) : day(70), started_by: 'member',
    created_at: ago(30000), i_am: 'coach' });
  const COACHINGS = [coaching('k2', 'm2', 'Ana Reyes', 'active', 'pt2', 3), coaching('k3', 'm3', 'Cy Lim', 'ended', 'pt3', 1)];
  // Lea books single sessions and wrote; Dan is on the roster with a session ahead and no chat.
  const CONVS = [{ id: 'cv1', other_id: 'm1', other_name: 'Lea Lorenzana', other_photo: null, last_message: 'See you at 6, coach',
    last_from_me: false, last_message_at: ago(12), unread: 2, muted: false, other_read_at: null }];
  const ROSTER = [
    { member_id: 'm1', name: 'Lea Lorenzana', photo_url: null, experience_level: 'beginner', last_visit: ago(60 * 24), visits_last_30: 6, upcoming_with_me: 1 },
    { member_id: 'm4', name: 'Dan Cruz', photo_url: null, experience_level: null, last_visit: ago(60 * 48), visits_last_30: 2, upcoming_with_me: 1 },
  ];
  let MODES = ['pick_pt', 'desk_assigns', 'coach_invites'];

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
      const b = JSON.parse(route.request().postData() || '{}');
      if (fn === 'my_tours_seen') return json(b.p_app === 'coach' ? [...TOURS_SEEN] : []);
      if (fn === 'mark_tour_seen') { MARKED.push(`${b.p_app}:${b.p_tour}`); if (!TOURS_SEEN.includes(b.p_tour)) TOURS_SEEN.push(b.p_tour); return json(null); }
      if (fn === 'my_rooms') return json(ROOMS);
      if (fn === 'my_coachings') return json(COACHINGS);
      if (fn === 'coaching_settings') return json([{ modes: MODES, lengths: [1, 3], fee_mode: 'included' }]);
      if (fn === 'room_badges') return json([{ room_id: 'pt2', to_review: 1, due_soon: 0 }]);
      if (fn === 'my_conversations') return json(CONVS);
      if (fn === 'review_queue' || fn === 'my_room_photos') return json([]);
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'my_trainer_members') return json(ROSTER);
    return json(one ? null : []);
  });

  await page.addInitScript(() => { delete window.__CF_NO_TOURS; });
  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2600);
  };
  const tour = (id) => page.locator(`[data-tour="${id}"]`);

  await go('/trainer/home');
  say("the coach's first visit to Today shows its tour", (await tour('today').count()) === 1);
  const b1 = await page.locator('[data-tour-bubble]').innerText().catch(() => '');
  say('…starting with Today on the rail', /Today/.test(b1) && /start here/.test(b1), b1.replace(/\s+/g, ' '));
  await page.screenshot({ path: 'shots/trainer-tour.png' });
  await page.locator('[data-tour-skip]').click(); await page.waitForTimeout(700);
  say('Skip ends it and saves it on the account', (await tour('today').count()) === 0 && MARKED.includes('coach:today'), JSON.stringify(MARKED));
  await go('/trainer/home');
  say('the second visit shows no tour', (await tour('today').count()) === 0);

  await go('/trainer/home?view=pt');
  say('Personal training has its own tour', (await tour('pt').count()) === 1);
  for (let i = 0; i < 4 && (await tour('pt').count()); i++) { await page.locator('[data-tour-next]').click(); await page.waitForTimeout(450); }
  say('…Next to the end closes it and saves it', (await tour('pt').count()) === 0 && MARKED.includes('coach:pt'), JSON.stringify(MARKED));

  await go('/trainer/help');
  const rows = await page.locator('[data-help-tours]').innerText().catch(() => '');
  say('the coach Help lists the coach tours with Replay', /Today/.test(rows) && /Personal training/.test(rows) && /Schedule/.test(rows) && !/Train\b/.test(rows), rows.replace(/\s+/g, ' '));
  await page.locator('[data-help-tours]').getByRole('button', { name: /^Today/ }).click();
  await page.waitForTimeout(2600);
  say('Replay runs Today again', /\/trainer\/home/.test(page.url()) && (await tour('today').count()) === 1, page.url());
  return out.join('\n');
}
