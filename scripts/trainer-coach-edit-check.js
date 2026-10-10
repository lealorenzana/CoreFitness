/**
 * A coach edits their trainee's routine (0174): the same editor as the
 * member's, titled for the coach, saved through coach_save_routine (the
 * database checks the coach may, keeps the earlier version and tells the
 * member), and with no Delete — removing a routine stays the member's.
 *
 * Member dev server on :5173 (the trainer side lives in the member app).
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
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date().toISOString();
  const SAVED = [];
  const EX = [{ id: 'e1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 1 }];
  const ROUTINE = { id: 'r2', member_id: 'mb1', name: 'Home circuit', notes: null, position: 0, updated_at: now, source: 'coach',
    edited_at: null, author: null, editor: null,
    workout_routine_exercises: [{ id: 'x1', position: 0, exercise_id: 'e1', custom_name: null, target_sets: 3, target_reps: 10,
      target_weight_kg: null, target_seconds: null, rest_seconds: 60, exercises: EX[0] }] };

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
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
        role: 'trainer', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'coach_save_routine') { SAVED.push(JSON.parse(req.postData() || '{}')); return json('r2'); }
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'workout_routines') return json(one ? ROUTINE : [ROUTINE]);
    if (t === 'exercises') return json(EX);
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 't1', role: 'trainer', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'ben@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/trainer/members/mb1/routine/r2', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  out.push('the editor opens for the coach: ' + (/Edit their routine/.test(t) && /Back Squat/.test(t) ? 'yes' : 'MISSING ' + t.slice(0, 200)));
  out.push('…saying the member will be told: ' + (/They are told when you save/.test(t) ? 'yes' : 'MISSING'));
  out.push('no Delete for the coach: ' + ((await page.getByRole('button', { name: 'Delete routine' }).count()) === 0 ? 'yes' : 'STILL SHOWN'));
  if (!(await page.getByRole('button', { name: 'Save routine' }).count())) return out.join(' / ') + ' / PAGE: MISSING ' + t.slice(0, 400);
  await page.getByRole('button', { name: 'Save routine' }).click();
  await page.waitForTimeout(1200);
  const s = SAVED[0] || {};
  out.push('saved through coach_save_routine for that member and routine: '
    + (s.p_member === 'mb1' && s.p_routine === 'r2' && s.p_name === 'Home circuit' && Array.isArray(s.p_exercises) && s.p_exercises[0]?.exercise_id === 'e1' ? 'yes' : 'MISSING ' + JSON.stringify(s)));
  out.push('back to the trainee list: ' + (/\/trainer\/members$/.test(new URL(page.url()).pathname) ? 'yes' : 'MISSING ' + page.url()));
  return out.join('\n');
}
