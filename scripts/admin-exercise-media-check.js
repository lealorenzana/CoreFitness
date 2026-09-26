/**
 * Admin → Exercises, after 0121: the gym's own guide on a shared exercise.
 *
 * What this pins down, each a way the screen could quietly do the wrong thing:
 *   - a shared (library) exercise says so, and hiding it writes the gym's own
 *     overlay — NOT a PATCH to `exercises`, which since 0121 is the platform's
 *     row and would either fail silently or, before 0121, hide it in every gym;
 *   - the guide editor sends the video link and cues to `gym_exercise_media`;
 *   - a link that is not YouTube or Vimeo is refused on screen and sends nothing;
 *   - the photo counter reads the database's number, not a count of the page.
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
      is_active: true, sort_order: 10, gym_id: null,
      cues: ['Chest up, brace your core', 'Knees track over toes'], steps: ['Rest the bar on your upper back.'] },
    { id: 'ex-sled', name: 'Sled Push', muscle_group: 'full_body', equipment: 'other', is_timed: false,
      is_active: true, sort_order: 900, gym_id: 'gym-b', cues: [], steps: [] },
  ];
  const MEDIA = [];
  const SENT = { media: [], exercisePatches: 0 };

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
      if (fn === 'gym_photo_usage') return json([{ used: 42, cap: 100 }]);
      if (fn === 'exercise_routine_counts') return json([]);
      if (fn === 'my_gym_modules' || fn === 'my_support_grant') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'exercises') {
      if (req.method() === 'PATCH') { SENT.exercisePatches++; return json([{ id: 'x' }]); }
      return json(EXERCISES);
    }
    if (t === 'gym_exercise_media') {
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        const row = Array.isArray(body) ? body[0] : body;
        SENT.media.push(row);
        const i = MEDIA.findIndex((m) => m.exercise_id === row.exercise_id);
        const merged = { photo_url: null, video_url: null, cues: null, steps: null, hidden: false,
          created_by: 'u1', ...(i >= 0 ? MEDIA[i] : {}), ...row };
        if (i >= 0) MEDIA[i] = merged; else MEDIA.push(merged);
        return json([{ exercise_id: row.exercise_id }], 201);
      }
      return json(MEDIA);
    }
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5174/exercises', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();

  out.push('photo counter: ' + (/42 of 100 photos/.test(t) ? 'shown' : 'MISSING'));
  out.push('library label: ' + (/Core Fitness library/.test(t) ? 'shown' : 'MISSING'));
  out.push('own label: ' + (/\bYours\b/.test(t) ? 'shown' : 'MISSING'));

  // Hide the shared squat. The write must be the gym's overlay.
  await page.getByRole('button', { name: 'Hide Back Squat from members' }).click();
  await page.waitForTimeout(800);
  const hid = SENT.media.find((m) => m.exercise_id === 'ex-squat' && m.hidden === true);
  out.push('hiding a library exercise writes the overlay: ' + (hid ? 'yes' : 'MISSING'));
  out.push('and never PATCHes the shared row: ' + (SENT.exercisePatches === 0 ? 'none' : 'MISSING (' + SENT.exercisePatches + ' patches)'));

  // The guide editor.
  await page.getByRole('button', { name: 'Guide for Back Squat' }).click();
  await page.waitForTimeout(600);
  t = await text();
  out.push('library cues offered as the starting point: ' + (/Chest up, brace your core/.test(t) ? 'shown' : 'MISSING'));

  await page.getByLabel('Video link').fill('https://example.com/v');
  await page.waitForTimeout(300);
  t = await text();
  out.push('bad link explained: ' + (/A YouTube or Vimeo link/.test(t) ? 'shown' : 'MISSING'));
  const before = SENT.media.length;
  await page.getByRole('button', { name: 'Save guide' }).click();
  await page.waitForTimeout(600);
  out.push('bad link sends nothing: ' + (SENT.media.length === before ? 'nothing' : 'MISSING (sent anyway)'));

  await page.getByLabel('Video link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.waitForTimeout(400);
  const frame = await page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]').count();
  out.push('video previews: ' + (frame > 0 ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-exercise-guide.png', fullPage: true });
  await page.getByLabel('Cues, one per line').fill('Sit between your heels\nBrace before you descend');
  await page.getByRole('button', { name: 'Save guide' }).click();
  await page.waitForTimeout(1000);
  const saved = SENT.media[SENT.media.length - 1] || {};
  out.push('video sent: ' + (saved.video_url === 'https://youtu.be/dQw4w9WgXcQ' ? 'yes' : 'MISSING'));
  out.push('cues sent: ' + (Array.isArray(saved.cues) && saved.cues.length === 2 && saved.cues[0] === 'Sit between your heels' ? 'yes' : 'MISSING ' + JSON.stringify(saved.cues)));
  out.push('hide was not undone by the save: ' + (!('hidden' in saved) ? 'untouched' : 'MISSING (sent hidden=' + saved.hidden + ')'));
  await page.screenshot({ path: 'shots/admin-exercise-media.png', fullPage: true });

  return out.join('\n');
}
