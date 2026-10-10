/**
 * 0179 on the member's side, signed out:
 *   - tapping a front-desk-only gym says so, instead of opening a sign-up the
 *     database would refuse at the end;
 *   - its sign-up page says so too, unless a member's invite (?ref=) came along;
 *   - a gym found by its own link is signed up into with join_via 'link'.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const CLOSED = { id: 'gym-c', slug: 'desk-gym', name: 'Desk Gym', short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null };
  const OPEN = { id: 'gym-o', slug: 'g-fitness', name: 'G Fitness', short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null };
  const RULES = { 'gym-c': { policy: 'closed', approval: 'desk', min_age: 16 }, 'gym-o': { policy: 'open', approval: 'auto', min_age: 18 } };
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json({ error: 'no session' }, 401);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, b]);
      if (fn === 'list_gyms') return json([OPEN, { ...OPEN, id: 'gym-x', slug: 'x', name: 'Another Gym' }]);
      if (fn === 'gym_by_slug') return json([CLOSED, OPEN].filter((g) => g.slug === b.p_slug));
      if (fn === 'gym_join_rules') return json(RULES[b.p_gym] ? [RULES[b.p_gym]] : []);
      return json([]);
    }
    if (path.startsWith('/rest/v1/membership_plans')) return json([{ id: 'mp1', name: 'Free', price: 0, duration_days: null, is_active: true, tier: 'free', description: null }]);
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 412, height: 900 });

  // ---- tapping a front-desk-only gym --------------------------------------------------------
  await page.goto('http://localhost:5173/join/desk-gym', { waitUntil: 'domcontentloaded' });
  await page.getByText('Desk Gym').first().waitFor({ timeout: 15000 });
  await page.getByText('Desk Gym').first().click();
  await page.waitForTimeout(1500);
  let t = await text();
  out.push('a front-desk-only gym says so when tapped: ' + (/creates its members' accounts at the front desk/.test(t) ? 'yes' : 'MISSING'));
  out.push('…and does not open a sign-up: ' + (!page.url().includes('/register') ? 'yes' : 'NO — ' + page.url()));

  // ---- its sign-up page ----------------------------------------------------------------------------
  await page.goto('http://localhost:5173/register?gym=gym-c&join=desk-gym', { waitUntil: 'domcontentloaded' });
  await page.getByText('What should we call you?').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  out.push('its sign-up page says to visit the desk: ' + ((await page.locator('[data-desk-only]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-join-desk-only.png' });
  await page.goto('http://localhost:5173/register?gym=gym-c&join=desk-gym&ref=FRIEND', { waitUntil: 'domcontentloaded' });
  await page.getByText('What should we call you?').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  out.push("…but not with a member's invite: " + ((await page.locator('[data-desk-only]').count()) === 0 ? 'yes' : 'STILL SHOWN'));

  // ---- a listed gym with its own rules ---------------------------------------------------------------
  await page.goto('http://localhost:5173/register?gym=gym-o&join=g-fitness', { waitUntil: 'domcontentloaded' });
  await page.getByText('What should we call you?').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  out.push("the gym's rules are asked of the database: " + (CALLS.some(([f, b]) => f === 'gym_join_rules' && b.p_gym === 'gym-o') ? 'yes' : 'MISSING'));
  out.push('an open gym shows no desk notice: ' + ((await page.locator('[data-desk-only]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  return out.join('\n');
}
