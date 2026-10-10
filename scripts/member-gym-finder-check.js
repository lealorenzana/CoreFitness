/**
 * 0182, Find your gym, signed out, with the phone's location allowed:
 *   - nearest first, with the distance; each row says what to do by the gym's
 *     rule — Join (listed), Directions (front desk only), Have a code? (code);
 *   - OpenStreetMap's gyms nearby that are not on Core Fitness, each with
 *     Suggest — and one standing on a Core Fitness gym is not repeated;
 *   - only the 25 km square is sent to the osm-gyms function, never the point;
 *   - the Map shows the legend (the list never does).
 *
 * Playwright runner's `filename` argument, member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const HERE = { latitude: 13.22321, longitude: 120.59612 };
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(HERE);
  const base = { short_name: null, logo_url: null, accent: 'violet', accent_action: null, tagline: null };
  const GYMS = [
    { ...base, id: 'g-code', slug: 'far-code', name: 'Far Code Gym', join_policy: 'code', latitude: 13.40, longitude: 120.80, address: 'Sablayan' },
    { ...base, id: 'g-open', slug: 'near-open', name: 'Near Open Gym', join_policy: 'open', latitude: 13.2240, longitude: 120.5970, address: 'Mamburao' },
    { ...base, id: 'g-desk', slug: 'mid-desk', name: 'Mid Desk Gym', join_policy: 'closed', latitude: 13.26, longitude: 120.62, address: 'Mamburao' },
  ];
  const OSM = [
    { osm_id: 'node/1', name: 'Iron Den', latitude: 13.2300, longitude: 120.6000, address: null },
    // Within 150 m of Near Open Gym: the same place, not a second gym.
    { osm_id: 'node/2', name: 'Near Open Gym (OSM)', latitude: 13.2241, longitude: 120.5971, address: null },
  ];
  const CALLS = [];
  let osmBody = null;
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = req.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Range': '0-0/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (req.method() === 'OPTIONS') return json({});
    if (path.startsWith('/auth/v1/')) return json({ error: 'no session' }, 401);
    if (path.startsWith('/functions/v1/osm-gyms')) { osmBody = JSON.parse(req.postData() || '{}'); return json({ gyms: OSM }); }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, b]);
      if (fn === 'gym_finder') return json(GYMS);
      if (fn === 'gym_join_rules') return json([{ policy: 'open', approval: 'desk', min_age: 16 }]);
      return json(null);
    }
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 412, height: 900 });
  await page.goto('http://localhost:5173/join', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.getByText('Near Open Gym').first().waitFor({ timeout: 15000 });
  await page.getByText('Iron Den').first().waitFor({ timeout: 8000 }).catch(() => {});
  let t = await text();
  const order = ['Near Open Gym', 'Mid Desk Gym', 'Far Code Gym'].map((n) => t.indexOf(n));
  out.push('nearest first: ' + (order[0] >= 0 && order[0] < order[1] && order[1] < order[2] ? 'yes' : 'NO ' + JSON.stringify(order)));
  out.push('with the distance: ' + (/0\.\d km/.test(t) ? 'yes' : 'MISSING'));
  const rowText = (name) => page.evaluate((n) => [...document.querySelectorAll('[data-finder] *')].find((el) => el.textContent?.trim() === n)?.closest('button, [role="button"], div')?.parentElement?.innerText ?? '', name);
  out.push('a listed gym: Join: ' + (/Join/.test(await rowText('Near Open Gym')) ? 'yes' : 'MISSING'));
  out.push('a front-desk-only gym: Directions: ' + (/Directions/.test(t) && /Joins at the front desk/.test(t) ? 'yes' : 'MISSING'));
  out.push('a code-only gym: Have a code?: ' + (/Have a code\?/.test(t) ? 'yes' : 'MISSING'));
  out.push('no legend in the list: ' + ((await page.locator('[data-legend]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  out.push('OpenStreetMap gyms nearby, with Suggest: ' + (/Not on Core Fitness yet/.test(t) && /Iron Den/.test(t) && /Suggest/.test(t) ? 'yes' : 'MISSING'));
  out.push('…without repeating a Core Fitness gym: ' + (!/Near Open Gym \(OSM\)/.test(t) ? 'yes' : 'STILL SHOWN'));
  out.push('only the 25 km square went to the server, not the point: ' + (osmBody && osmBody.lat === 13.125 && osmBody.lng === 120.625 ? 'yes' : 'NO ' + JSON.stringify(osmBody)));
  await page.screenshot({ path: 'shots/member-gym-finder.png' });
  await page.locator('[data-osm]').getByText('Iron Den').click();
  await page.waitForTimeout(800);
  out.push('Suggest sends that gym: ' + (CALLS.some(([f, b]) => f === 'suggest_gym' && b.p_osm_id === 'node/1') ? 'yes' : 'MISSING'));

  await page.getByRole('button', { name: /^Map$/ }).click();
  await page.waitForURL(/\/join\/map/, { timeout: 8000 });
  await page.locator('[data-legend]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  t = await text();
  out.push('the map carries the legend: ' + (['Open to join', 'Join with a code', 'Front desk only', 'Not on Core Fitness'].every((w) => t.includes(w)) ? 'yes' : 'MISSING'));
  out.push('…and a mark for each pinned gym: ' + ((await page.locator('.leaflet-interactive').count()) >= 3 ? 'yes' : 'MISSING'));
  // Centred on the phone: the open gym 100 m away is near the middle of the screen.
  const near = await page.evaluate(() => [...document.querySelectorAll('path.leaflet-interactive')]
    .filter((p) => p.getAttribute('fill') === '#7C3AED')
    .map((p) => { const r = p.getBoundingClientRect(); return Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight / 2); })[0]);
  out.push('the map opens centred on the phone: ' + (near != null && near < 120 ? 'yes' : 'NO ' + near));
  await page.screenshot({ path: 'shots/member-gym-map.png' });
  return out.join('\n');
}
