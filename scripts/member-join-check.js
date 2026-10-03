/**
 * Getting into a gym from the member app (2026-10-03), signed out:
 *   - a pasted link with the old "Join code:" text stuck to it still finds the gym;
 *   - a gym that is "only with your link or code" is found by typing its code;
 *   - an invitation's "Create my account" opens the sign-up for THAT gym —
 *     it used to fall to /join, because the gym was looked up in the public list;
 *   - /get-app explains how to install and join.
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const GYM = { id: 'gym-g', slug: 'gabby-pogi-123', name: 'gabby pogi 123', short_name: null, logo_url: null,
    accent: 'emerald', accent_action: 'lime', tagline: null, join_policy: 'code' };
  const OPEN = { id: 'gym-o', slug: 'g-fitness', name: 'G Fitness', short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null };
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
      if (fn === 'gym_by_slug') return json(b.p_slug === GYM.slug ? [GYM] : []);
      if (fn === 'gym_by_code') return json(String(b.p_code).toUpperCase() === 'PPDSSJ' ? [GYM] : []);
      if (fn === 'peek_invitation') return json([{ gym_id: GYM.id, gym_name: GYM.name, slug: GYM.slug, logo_url: null, accent: 'emerald',
        role: 'member', first_name: 'Lea', state: 'waiting' }]);
      return json([]);
    }
    if (path.startsWith('/rest/v1/membership_plans')) return json([{ id: 'mp1', name: 'Monthly', price: 800, duration_days: 30, is_active: true, tier: 'standard', description: null }]);
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 412, height: 900 });

  // ---- the pasted link that carried "Join code:" -------------------------------------------
  await page.goto('http://localhost:5173/join/gabby-pogi-123%20Join%20code:%20PPDSSJ', { waitUntil: 'domcontentloaded' });
  await page.getByText('gabby pogi 123').first().waitFor({ timeout: 15000 });
  out.push('a link with "Join code:" pasted onto it finds the gym: ' + (CALLS.some(([f, b]) => f === 'gym_by_slug' && b.p_slug === 'gabby-pogi-123') ? 'yes' : 'MISSING'));

  // ---- the code, typed ----------------------------------------------------------------------------
  await page.goto('http://localhost:5173/join', { waitUntil: 'domcontentloaded' });
  await page.getByText('Have a join code?').waitFor({ timeout: 15000 });
  let t = await text();
  out.push('the unlisted gym is not in the search list: ' + (!/gabby pogi 123/.test(t) ? 'yes' : 'STILL SHOWN'));
  out.push('/join offers the app: ' + (/Install the app on your phone/.test(t) ? 'yes' : 'MISSING'));
  await page.getByLabel('Join code').fill('ppdssj');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/member-join-code.png' });
  await page.getByRole('button', { name: 'Find' }).click();
  await page.waitForURL(/\/join\/gabby-pogi-123/, { timeout: 5000 });
  await page.getByText('gabby pogi 123').first().waitFor({ timeout: 5000 });
  out.push('typing the code opens that gym: ' + (page.url().endsWith('/join/gabby-pogi-123') ? 'yes' : 'MISSING ' + page.url()));
  await page.goto('http://localhost:5173/join', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Join code').fill('WRONG1');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByText(/No gym has that code/).waitFor({ timeout: 5000 });
  out.push('a wrong code is said plainly: yes');
  await page.goto('http://localhost:5173/join?code=PPDSSJ', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/join\/gabby-pogi-123/, { timeout: 8000 }).catch(() => undefined);
  out.push('a ?code= link (the QR) opens the gym: ' + (page.url().endsWith('/join/gabby-pogi-123') ? 'yes' : 'MISSING ' + page.url()));

  // ---- an invitation → Create my account ------------------------------------------------------------
  await page.goto('http://localhost:5173/invite/' + 'b'.repeat(64), { waitUntil: 'domcontentloaded' });
  await page.getByText(/has invited you/).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForTimeout(2500);
  t = await text();
  out.push('Create my account stays on sign-up (not /join): ' + (page.url().includes('/register?invite=') ? 'yes' : 'NO — ' + page.url()));
  out.push('…for the gym that invited them: ' + (CALLS.some(([f]) => f === 'peek_invitation') && CALLS.some(([f, b]) => f === 'gym_by_slug' && b.p_slug === GYM.slug) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-invite-register.png' });

  // ---- /get-app -----------------------------------------------------------------------------------------
  await page.goto('http://localhost:5173/get-app', { waitUntil: 'domcontentloaded' });
  await page.getByText('Get the app').first().waitFor({ timeout: 15000 });
  t = await text();
  out.push('the app page explains installing and joining: ' + (/Join your gym/.test(t) && /I have a join code/.test(t) ? 'yes' : 'MISSING'));
  out.push('no download button while the APK is not uploaded: ' + (!/Download for Android/.test(t) ? 'yes' : 'STILL SHOWN'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/member-get-app.png' });
  return out.join('\n');
}
