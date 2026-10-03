/**
 * The gym's side of 2026-10-03's fixes: Your plan → Pay Core Fitness (0148:
 * GCash details and QR, the reference and a screenshot sent back), Members →
 * Invite link (link, code, QR and the app page in one place), and Your app's
 * colour pairs with a preview of the members' app gradient.
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
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'gabby@x.test', app_metadata: {}, user_metadata: {} },
  };
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
      if (fn === 'submit_gym_payment') { CALLS.push(body); CLAIMS.push({ id: 'c1', amount: String(body.p_amount), paid_on: body.p_paid_on,
        method_label: 'GCash', reference: body.p_reference, months: body.p_months, status: 'pending', reason: null, created_at: new Date().toISOString(), decided_at: null }); return json('c1'); }
      return json(['my_gym_modules', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao' };
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
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1400, height: 950 });

  // ---- Your plan → Pay Core Fitness -----------------------------------------------------------
  await page.goto('http://localhost:5174/subscription', { waitUntil: 'domcontentloaded' });
  await page.getByText('Pay Core Fitness').waitFor({ timeout: 15000 });
  let t = await text();
  out.push('how to pay, with the GCash number and QR: ' + (/0917 555 0101/.test(t) && (await page.locator('img[alt="GCash QR code"]').count()) === 1 ? 'yes' : 'MISSING'));
  out.push('the amount starts at the list price: ' + ((await page.locator('input[type="number"]').first().inputValue()) === '999' ? 'yes' : 'MISSING'));
  await page.locator('select').nth(1).selectOption('3');
  out.push('3 months: the amount follows: ' + ((await page.locator('input[type="number"]').first().inputValue()) === '2997' ? 'yes' : 'MISSING'));
  await page.getByPlaceholder('From your GCash or bank receipt').fill('GC 9876 5432');
  await page.locator('input[type="file"]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png',
    buffer: Buffer.from(PNG.split(',')[1], 'base64') });
  await page.getByText('Screenshot attached').waitFor({ timeout: 5000 });
  await page.screenshot({ path: 'shots/admin-pay-core-fitness.png' });
  await page.getByRole('button', { name: /Tell Core Fitness I paid/ }).click();
  await page.getByText(/being checked/).waitFor({ timeout: 5000 });
  const c = CALLS[0] || {};
  out.push('the claim carries amount, months, reference and screenshot: ' + (Number(c.p_amount) === 2997 && c.p_months === 3 && c.p_reference === 'GC 9876 5432'
    && /^data:image\/jpeg/.test(c.p_proof || '') ? 'yes' : 'MISSING ' + JSON.stringify({ ...c, p_proof: (c.p_proof || '').slice(0, 20) })));

  // ---- Members → Invite link ------------------------------------------------------------------------
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Invite link/ }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Invite link/ }).click();
  await page.getByRole('dialog', { name: 'Invite members' }).waitFor({ timeout: 5000 });
  t = await text();
  out.push('Members has the join link, the code and the app page: ' + (/corefitness-gym\.vercel\.app\/join\/gabby-pogi-123/.test(t) && /PPDSSJ/.test(t) && /\/get-app/.test(t) ? 'yes' : 'MISSING'));
  out.push('a QR code to scan at the desk: ' + ((await page.locator('[role="dialog"] svg').count()) >= 1 ? 'yes' : 'MISSING'));
  out.push('it says the gym is not listed: ' + (/people join only with this link or code/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-invite-members.png' });
  await page.keyboard.press('Escape');

  // ---- Your app: colour pairs and the gradient preview ---------------------------------------------------
  await page.goto('http://localhost:5174/gym-app', { waitUntil: 'domcontentloaded' });
  await page.getByText('Pairs that go together').waitFor({ timeout: 15000 });
  const grad = await page.locator('button', { hasText: 'Forest' }).locator('span').first().evaluate((e) => getComputedStyle(e).backgroundImage);
  out.push('a pair is drawn as its gradient: ' + (/linear-gradient/.test(grad) && /rgb\(5, 150, 105\)/.test(grad) && /rgb\(101, 163, 13\)/.test(grad) ? 'yes (emerald → lime)' : 'MISSING ' + grad));
  out.push('the saved pair is marked: ' + ((await page.locator('button[aria-pressed="true"]', { hasText: 'Forest' }).count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('button', { hasText: 'Sunset' }).click();
  await page.waitForTimeout(200);
  const book = await page.getByText('Book', { exact: true }).evaluate((e) => getComputedStyle(e).backgroundColor);
  out.push('one tap changes the preview: ' + (book === 'rgb(234, 88, 12)' ? 'yes (orange button)' : 'MISSING ' + book));
  t = await text();
  out.push('the copy buttons are separate: ' + (/Copy link/.test(t) && /Copy code/.test(t) && /Copy a message to send/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-theme-preview.png', fullPage: true });
  return out.join('\n');
}
