/**
 * Training -> Rooms (0128), the desk's view: every trainer's rooms with their
 * activity, a room's stream to read, and removing a comment. No post box: the
 * desk moderates and never posts as a trainer (the database refuses it too —
 * scripts/sql/rooms.mjs).
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
  const exp = Math.floor(Date.now() / 1000) + 36000;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'desk@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const desk = { id: 'u1', role: 'staff', status: 'active', first_name: 'Dee', last_name: 'Desk',
    email: 'desk@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const later = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const minute = new Date(Date.now() - 3600_000).toISOString();

  const DELETED = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: 'staff', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'sync_gym_rooms') return json(0);
      if (fn === 'all_gym_rooms') return json([
        { id: 'rm1', kind: 'class', name: 'Morning HIIT', trainer_name: 'Coach Rae', member_count: 12, post_count: 3,
          comment_count: 5, last_post_at: minute, archived: false },
        { id: 'rm2', kind: 'group', name: '8-week fat loss', trainer_name: 'Coach Rae', member_count: 6, post_count: 1,
          comment_count: 0, last_post_at: minute, archived: false },
        { id: 'rm3', kind: 'pt', name: 'Ana Reyes · 1-on-1', trainer_name: 'Coach Ben', member_count: 1, post_count: 0,
          comment_count: 0, last_post_at: null, archived: false },
      ]);
      if (fn === 'room_stream') return json([{ post_id: 'po1', created_at: minute, body: 'Bring water tomorrow!', photo_url: null,
        video_url: null, author_name: 'Coach Rae', can_delete: true,
        comments: [{ id: 'c1', body: 'buy my supplements lol', created_at: minute, author: 'Spam M.', is_trainer: false, can_delete: true }]
          .filter((c) => !DELETED.includes(c.id)) }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'room_comments' && req.method() === 'DELETE') {
      const id = (req.url().match(/id=eq\.([^&]+)/) || [])[1];
      DELETED.push(id);
      return json([{ id }]);
    }
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5174/rooms', { waitUntil: 'domcontentloaded' });
  await page.getByText('Morning HIIT').first().waitFor({ timeout: 15000 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  let seen = await text();
  out.push('rooms by trainer: ' + (/Coach Rae/i.test(seen) && /Coach Ben/i.test(seen) && /8-week fat loss/.test(seen) && /Ana Reyes · 1-on-1/.test(seen) ? 'shown' : 'MISSING'));
  const hiit = (await page.getByRole('button', { name: /Morning HIIT/ }).first().innerText()).replace(/\s+/g, ' ');
  out.push('activity: ' + (/ 12 8$/.test(hiit) ? 'members and posts+comments on the row' : 'MISSING ' + hiit));
  // Find and filter (2026-10-04).
  await page.getByLabel('Find a room, coach or member').fill('fat loss');
  await page.waitForTimeout(400);
  const benOnly = await page.evaluate(() => document.body.innerText);
  out.push('search by room name: ' + (/8-week fat loss/.test(benOnly) && !/Morning HIIT/.test(benOnly) ? 'only that room' : 'MISSING'));
  await page.getByLabel('Find a room, coach or member').fill('');
  await page.locator('button[aria-pressed]', { hasText: '1-on-1' }).click();
  await page.waitForTimeout(300);
  out.push('filter by kind: ' + ((await page.getByRole('button', { name: /Morning HIIT/ }).count()) === 0 ? 'classes hidden' : 'MISSING'));
  await page.locator('button[aria-pressed]', { hasText: 'All' }).click();
  out.push('linked from the sidebar: ' + ((await page.locator('aside a[href="/rooms"], aside button:has-text("Rooms")').count()) > 0 || /Rooms/.test(seen) ? 'yes' : 'MISSING'));
  await page.getByText('Morning HIIT').first().click();
  await page.waitForTimeout(800);
  seen = await text();
  out.push('the stream to read: ' + (/Bring water tomorrow!/.test(seen) && /buy my supplements lol/.test(seen) ? 'shown' : 'MISSING'));
  out.push('no way to post as the trainer: ' + ((await page.locator('textarea').count()) === 0 ? 'none' : 'MISSING (a post box)'));
  await page.screenshot({ path: 'shots/admin-rooms.png' });
  await page.getByRole('button', { name: 'Remove comment by Spam M.' }).click();
  await page.waitForTimeout(800);
  out.push('removing a comment: ' + (DELETED.includes('c1') && !/buy my supplements lol/.test(await text()) ? 'removed' : 'MISSING'));
  return out.join('\n');
}
