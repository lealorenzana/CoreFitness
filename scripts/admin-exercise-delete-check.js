/**
 * Exercises page (0126): search, a muscle-group filter, and deleting the gym's
 * own exercise — never a shared library one, and a logged one is refused with
 * a reason (the database's foreign key), not silently.
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };

  const EXERCISES = [
    { id: 'ex-squat', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false,
      is_active: true, sort_order: 10, gym_id: null, cues: ['Chest up'], steps: ['Squat.'] },
    { id: 'ex-hammer', name: 'Hammer Curl', muscle_group: 'arms', equipment: 'dumbbell', is_timed: false,
      is_active: true, sort_order: 501, gym_id: null, cues: ['Palms in'], steps: ['Curl.'] },
    { id: 'ex-drag', name: 'Tyre Drag', muscle_group: 'full_body', equipment: 'other', is_timed: false,
      is_active: true, sort_order: 900, gym_id: 'gym-b', cues: [], steps: [] },
    { id: 'ex-logged', name: 'Sandbag Carry', muscle_group: 'full_body', equipment: 'other', is_timed: false,
      is_active: true, sort_order: 901, gym_id: 'gym-b', cues: [], steps: [] },
  ];
  const DELETED = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'gym_photo_usage') return json([{ used: 0, cap: 100 }]);
      if (fn === 'exercise_routine_counts') return json([]);
      if (fn === 'my_gym_modules' || fn === 'my_support_grant') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'exercises') {
      if (req.method() === 'DELETE') {
        const id = (req.url().match(/id=eq\.([^&]+)/) || [])[1];
        // As the database does: a logged exercise is refused by its foreign key.
        if (id === 'ex-logged') return json({ code: '23503', message: 'update or delete on table "exercises" violates foreign key constraint', details: null, hint: null }, 409);
        DELETED.push(id);
        return json([{ id }]);
      }
      return json(EXERCISES.filter((e) => !DELETED.includes(e.id)));
    }
    if (t === 'gym_exercise_media') return json([]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5174/exercises', { waitUntil: 'domcontentloaded' });
  await page.getByText('Tyre Drag').waitFor({ timeout: 15000 });

  const del = (name) => page.getByRole('button', { name: `Delete ${name}` });
  out.push('delete on your own exercise: ' + ((await del('Tyre Drag').count()) === 1 ? 'shown' : 'MISSING'));
  out.push('no delete on a library exercise: ' + ((await del('Back Squat').count()) === 0 ? 'none' : 'MISSING (shown on the shared library)'));

  await page.getByLabel('Search exercises').fill('hammer');
  await page.waitForTimeout(200);
  let seen = await text();
  out.push('search: ' + (/Hammer Curl/.test(seen) && !/Back Squat|Tyre Drag/.test(seen) ? 'finds Hammer Curl only' : 'MISSING'));
  await page.getByLabel('Search exercises').fill('');
  await page.getByLabel('Muscle group').selectOption('legs');
  await page.waitForTimeout(200);
  seen = await text();
  out.push('muscle group filter: ' + (/Back Squat/.test(seen) && !/Hammer Curl|Tyre Drag/.test(seen) ? 'legs only' : 'MISSING'));
  await page.getByLabel('Muscle group').selectOption('all');
  await page.waitForTimeout(200);

  await del('Tyre Drag').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(800);
  seen = await text();
  out.push('deleting your unused exercise: ' + (DELETED.includes('ex-drag') && !/Tyre Drag/.test(seen.replace(/Tyre Drag deleted/, '')) ? 'gone' : 'MISSING'));
  await page.screenshot({ path: 'shots/exercise-delete.png' });

  await del('Sandbag Carry').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(800);
  seen = await text();
  out.push('a logged exercise is refused and explained: ' + (/cannot be deleted\. Hide it instead/.test(seen) && /Sandbag Carry/.test(seen) ? 'yes' : 'MISSING'));

  return out.join('\n');
}
