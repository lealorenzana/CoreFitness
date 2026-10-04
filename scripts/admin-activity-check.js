/**
 * The Activity log after 0165: the shop, coaching, rewards and the team are
 * logged by triggers, and each has its own filter chip — a chip asks the
 * database for its prefixes, and a row links to the screen that owns it.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'ana@anafitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const g = { gym_id: 'gym-a', gym_name: 'Ana Gymanigga', slug: 'ana-gym', short_name: 'anafitness', accent: 'violet' };
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

  const ROWS = [
    { id: 5, occurred_at: iso(0), action: 'shop.sale_voided', subject_type: 'shop_sale', summary: 'Voided a ₱150.00 sale: Rang up twice' },
    { id: 4, occurred_at: iso(0), action: 'shop.sale', subject_type: 'shop_sale', summary: 'Sold ₱150.00 to Mara Cruz' },
    { id: 3, occurred_at: iso(0), action: 'classwork.turned_in', subject_type: 'room_assignment', summary: 'Mara Cruz turned in "Leg day"' },
    { id: 2, occurred_at: iso(1), action: 'streak.milestone', subject_type: 'member', summary: 'Mara Cruz reached a 12-week streak' },
    { id: 1, occurred_at: iso(1), action: 'credential.verified', subject_type: 'trainer_credential', summary: "Verified Carlo Cruz's \"First Aid\"" },
  ].map((r) => ({ subject_id: null, detail: null, reconstructed: false, actor_id: 'u2', actor_role: 'admin', actor_name: 'Ana Lisa',
    actor_photo_url: null, member_id: null, member_name: null, ...r }));
  const ASKED = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'activity_feed') {
      const u = new URL(req.url());
      const or = u.searchParams.get('or');
      ASKED.push(or ?? '');
      const prefixes = or ? [...or.matchAll(/action\.ilike\.([a-z_.]+)%/g)].map((m) => m[1]) : null;
      const rows = prefixes ? ROWS.filter((r) => prefixes.some((p) => r.action.startsWith(p))) : ROWS;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows),
        headers: { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    }
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Brgy Bunot' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
        email: 'ana@anafitness.test', phone: null, photo_url: null, created_at: iso(30) };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5174/activity', { waitUntil: 'domcontentloaded' });
  await page.getByText('Sold ₱150.00 to Mara Cruz').waitFor({ timeout: 15000 });
  let t = await text();
  out.push('the new events are listed: ' + (/Mara Cruz turned in "Leg day"/.test(t) && /12-week streak/.test(t) && /First Aid/.test(t) ? 'yes' : 'MISSING'));
  out.push('the new chips: ' + (['Shop', 'Coaching', 'Rewards & streaks', 'Team & settings'].every((c) => t.includes(c)) ? 'all four' : 'MISSING'));

  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('Shop asks the database for shop.%: ' + (/action\.ilike\.shop\.%/.test(ASKED[ASKED.length - 1]) ? 'yes' : 'MISSING ' + ASKED[ASKED.length - 1]));
  out.push('…and shows only the shop: ' + (/Sold ₱150\.00/.test(t) && /Rang up twice/.test(t) && !/Leg day/.test(t) && !/12-week streak/.test(t) ? 'yes' : 'MISSING'));

  await page.getByRole('button', { name: 'Coaching', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('Coaching shows the classwork: ' + (/Leg day/.test(t) && !/Sold ₱150/.test(t) ? 'yes' : 'MISSING'));
  await page.getByText('Mara Cruz turned in "Leg day"').click();
  await page.waitForTimeout(800);
  out.push('a coaching row opens Rooms: ' + (new URL(page.url()).pathname === '/rooms' ? 'yes' : 'MISSING ' + page.url()));
  await page.goto('http://localhost:5174/activity', { waitUntil: 'domcontentloaded' });
  await page.getByText('Sold ₱150.00 to Mara Cruz').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Rewards & streaks', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('Rewards & streaks: ' + (/12-week streak/.test(t) && !/Leg day/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-activity.png' });
  return out.join(String.fromCharCode(10));
}
