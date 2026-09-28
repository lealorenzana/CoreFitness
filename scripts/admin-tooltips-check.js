/**
 * Tooltips across the admin app (2026-09-28): the sidebar says what each page
 * is for, the header's controls explain themselves, a `title` shows in the
 * app's style (not the browser's), an icon-only button shows its name, and a
 * bare "Archive" says what archiving does. Focus shows it too; Esc hides it.
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
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' || fn === 'my_announcements' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Brgy Bunot' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
        email: 'ana@anafitness.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const tip = () => page.locator('[role="tooltip"]').innerText().catch(() => '');
  const hover = async (loc) => { await loc.hover(); await page.waitForTimeout(450); return tip(); };
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('aside').getByText('Attendance').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);

  out.push('a sidebar page says what it is for: ' + (/Check people in/.test(await hover(page.locator('aside a', { hasText: 'Attendance' }).first())) ? 'yes' : 'MISSING'));
  out.push('a sidebar group too: ' + (/Payments, the shop and membership plans/.test(await hover(page.locator('aside button', { hasText: 'Billing' }).first())) ? 'yes' : 'MISSING'));
  out.push('the alerts bell has a name and a tip: ' + (/Alerts|thing/.test(await hover(page.getByRole('button', { name: /Alerts|alert/ }).first())) ? 'yes' : 'MISSING'));
  out.push('the search explains itself: ' + (/Find a member, payment/.test(await hover(page.locator('button', { hasText: 'Search anything' }).first())) ? 'yes' : 'MISSING'));

  // The layer's rules, on controls built the way the pages build them.
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.id = 'tip-probe';
    box.style.cssText = 'position:fixed;left:600px;top:420px;z-index:9;display:flex;gap:12px;';
    box.innerHTML = '<button id="t-title" title="Rows per page">20</button>'
      + '<button id="t-icon" aria-label="Edit this plan"><svg width="14" height="14"></svg></button>'
      + '<button id="t-archive">Archive</button>'
      + '<button id="t-approve">Approve selected</button>'
      + '<button id="t-plain">Save</button>';
    document.body.appendChild(box);
  });
  const t1 = await hover(page.locator('#t-title'));
  out.push('a title shows in the app\'s style, not the browser\'s: ' + (t1 === 'Rows per page' && (await page.locator('#t-title').getAttribute('title')) === null ? 'yes' : 'MISSING ' + t1));
  out.push('an icon-only button shows its name: ' + ((await hover(page.locator('#t-icon'))) === 'Edit this plan' ? 'yes' : 'MISSING'));
  out.push('"Archive" says what archiving does: ' + (/Nothing is deleted/.test(await hover(page.locator('#t-archive'))) ? 'yes' : 'MISSING'));
  out.push('"Approve selected" says what approving does: ' + (/free plan/.test(await hover(page.locator('#t-approve'))) ? 'yes' : 'MISSING'));
  await page.mouse.move(5, 890); await page.waitForTimeout(250);
  out.push('a button that says it all gets no tip: ' + ((await hover(page.locator('#t-plain'))) === '' ? 'yes' : 'MISSING'));
  await page.locator('#t-archive').focus();
  await page.waitForTimeout(100);
  out.push('focus shows it at once: ' + (/Nothing is deleted/.test(await tip()) ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  out.push('Esc hides it: ' + ((await page.locator('[role="tooltip"]').count()) === 0 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-tooltips.png' });
  return out.join('\n');
}
