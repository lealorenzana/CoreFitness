/**
 * 0182 on the owner's side: Settings → Gym Information pins the gym on a map
 * (tap where the door is, Save the pin) through set_gym_location().
 *
 * Fixture from admin-booking-approval-check.js.
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
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'gabby@x.test', app_metadata: {}, user_metadata: {} },
  };
  const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('**://*.tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const g = { gym_id: 'gym-a', gym_name: 'gabby pogi 123', slug: 'gabby-pogi-123', short_name: 'gabby', accent: 'violet' };
  const ymd = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const CALLS = [];
  const CLAIMS = [];

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
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: 'emerald', accent_action: 'lime', tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, join_policy: 'code',
        vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' }, join_code: 'PPDSSJ', modules: {} }]);
      if (fn === 'my_gym_subscription') return json([{ plan_name: 'Standard', price_monthly: '999', paid_until: ymd(-3), days_left: 3, grace_days: 7,
        read_only_on: ymd(-11), lock_reason: null, max_members: 150, members: 38, max_staff: 3, staff: 2, on_trial: false }]);
      if (fn === 'my_gym_payments') return json([]);
      if (fn === 'platform_payment_options') return json([{ id: 'pm1', kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz',
        account_number: '0917 555 0101', qr_image: PNG, instructions: 'Send the exact amount.' }]);
      if (fn === 'my_gym_payment_claims') return json(CLAIMS);
      if (fn === 'set_gym_location') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'set_booking_approval') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'set_join_settings') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'set_join_policy') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'submit_gym_payment') { CALLS.push(body); CLAIMS.push({ id: 'c1', amount: String(body.p_amount), paid_on: body.p_paid_on,
        method_label: 'GCash', reference: body.p_reference, months: body.p_months, status: 'pending', reason: null, created_at: new Date().toISOString(), decided_at: null }); return json('c1'); }
      return json(['my_gym_modules', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gyms') { const r = { latitude: null, longitude: null }; return json(one ? r : [r]); }
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao',
        join_approval: 'desk', min_age: 16,
        class_booking_approval: 'coach', pt_booking_approval: 'coach' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Gabby', last_name: 'Owner',
        email: 'gabby@x.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto('http://localhost:5174/settings', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Gym Information$/ }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /^Gym Information$/ }).first().click();
  await page.locator('[data-location-picker]').waitFor({ timeout: 10000 });
  await page.locator('[data-location-picker]').scrollIntoViewIfNeeded();
  out.push('Gym Information has the map pin: yes');
  out.push('Save waits for a pin: ' + (await page.locator('[data-save-location]').isDisabled() ? 'yes' : 'NO'));
  const box = await page.locator('[data-location-picker] .leaflet-container').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await page.locator('[data-save-location]').click();
  await page.waitForTimeout(700);
  const c = CALLS.find(([f]) => f === 'set_gym_location');
  out.push('tapping the map and saving sends a place: ' + (c && typeof c[1].p_lat === 'number' && typeof c[1].p_lng === 'number' && Math.abs(c[1].p_lat) <= 90 ? 'yes' : 'MISSING ' + JSON.stringify(CALLS)));
  await page.screenshot({ path: 'shots/admin-gym-location.png' });
  return out.join('\n');
}
