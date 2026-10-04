/**
 * Payments → a member's receipt (2026-10-04): the paper fits a short screen
 * and scrolls inside with its buttons in reach, Download saves a PNG of the
 * receipt (it was a .txt), and Print prints the paper alone.
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
  const desk = { id: 'u1', role: 'admin', status: 'active', first_name: 'Dee', last_name: 'Desk',
    email: 'desk@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const later = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const minute = new Date(Date.now() - 3600_000).toISOString();

  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const PROFILE = { id: 'm1', first_name: 'Ana', last_name: 'Reyes', email: 'ana@x.ph', phone: null, photo_url: null, status: 'active', role: 'member', created_at: minute };
  const MP = { id: 'mp1', profile_id: 'm1', gym_id: 'gym-b', qr_code: 'm1', created_at: minute, profiles: PROFILE };
  const PAY = { id: 'pay1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'cash', status: 'completed', paid_on: today,
    created_at: minute, due_date: '2026-11-04', invoice_number: 'INV-2026-00042', plan_name: 'Premium', notes: null };
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
        role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'payments') return json([PAY]);
    if (t === 'member_profiles') return json([MP]);
    if (t === 'memberships') return json([{ id: 'ms1', member_id: 'm1', created_at: minute, status: 'active', membership_plans: { name: 'Premium', duration_days: 30, price: 1500 } }]);
    if (t === 'gym_settings') return json(one ? { gym_name: 'Harbour Strength', address: 'Rizal St, Mamburao', phone: '0917 222 3333', email: 'hi@harbour.ph', logo_url: null } : [{ gym_name: 'Harbour Strength', address: 'Rizal St, Mamburao', phone: '0917 222 3333', email: 'hi@harbour.ph', logo_url: null }]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1280, height: 640 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5174/payments', { waitUntil: 'domcontentloaded' });
  await page.getByText('Ana Reyes').first().waitFor({ timeout: 15000 });
  await page.getByText('Ana Reyes').first().click();
  await page.getByRole('button', { name: 'View receipt' }).click();
  const paper = page.locator('.receipt-paper');
  await paper.waitFor({ timeout: 5000 });
  const t = await paper.innerText();
  out.push('the receipt carries the facts: ' + (/Harbour Strength/.test(t) && /INV-2026-00042/.test(t) && /Ana Reyes/.test(t) && /Premium membership/.test(t)
    && /₱1,500\.00/.test(t) && /PAID/.test(t) && /Cash/.test(t) ? 'yes' : 'MISSING ' + t.replace(/\s+/g, ' ')));
  // Fits a short screen: its buttons are on screen and the paper scrolls inside.
  const btn = await page.getByRole('button', { name: 'Download image' }).boundingBox();
  out.push('buttons reachable on a 640px-tall screen: ' + (btn && btn.y >= 0 && btn.y + btn.height <= 640 ? 'yes' : 'NO ' + JSON.stringify(btn)));
  const scrolls = await page.evaluate(() => { const s = document.querySelector('.receipt-sheet .overflow-y-auto'); return s ? s.scrollHeight > s.clientHeight : false; });
  out.push('a tall receipt scrolls inside: ' + (scrolls ? 'yes' : 'NO (fits, or cannot scroll)'));
  await page.screenshot({ path: 'shots/admin-payment-receipt.png' });
  const dl = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Download image' }).click()])
    .then(([d]) => d, async () => null);
  if (!dl) await page.screenshot({ path: 'shots/admin-receipt-nodownload.png' });
  const name = dl ? dl.suggestedFilename() : 'NO DOWNLOAD — ' + (await page.locator('.receipt-sheet').innerText().catch(() => 'sheet gone')).slice(0, 200);
  out.push('download is a PNG image: ' + (/^Receipt-INV-2026-00042\.png$/.test(name) ? name : 'NO ' + name));
  // Print shows the paper alone.
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => ({
    app: getComputedStyle(document.getElementById('root')).display,
    toolbarHidden: [...document.querySelectorAll('.receipt-sheet button')].every((b) => b.offsetParent === null),
    paper: !!document.querySelector('.receipt-paper')?.offsetParent,
  }));
  out.push('print is only the receipt: ' + (printed.app === 'none' && printed.toolbarHidden && printed.paper ? 'yes' : 'NO ' + JSON.stringify(printed)));
  await page.screenshot({ path: 'shots/admin-payment-receipt-print.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  out.push('Esc closes it: ' + ((await page.locator('.receipt-paper').count()) === 0 ? 'yes' : 'NO'));
  return out.join('\n');
}
