/**
 * A gym that has not uploaded a logo wears its own initials, never ours.
 *
 * Reported 2026-09-27: Ana's gym had no logo, and the expanded sidebar showed
 * the Core Fitness mark (the bundled fallback), while the collapsed rail
 * squeezed the whole short name "anafitness" into a 36px square. Both now draw
 * two letters from the gym's name in the gym's colour.
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
  const g = { gym_id: 'gym-a', gym_name: 'Ana Gymanigga', slug: 'ana-gym', short_name: 'anafitness',
    tagline: 'whatatops', logo_url: null, accent: 'violet', address: 'Brgy Bunot' };

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
        logo_url: null, accent: g.accent, accent_action: null, tagline: g.tagline, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name,
        tagline: g.tagline, logo_url: null, address: g.address };
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
  const aside = () => page.evaluate(() => {
    const a = document.querySelector('aside');
    return {
      text: (a?.innerText ?? '').replace(/\s+/g, ' '),
      logos: [...(a?.querySelectorAll('img') ?? [])].map((i) => i.getAttribute('src')),
    };
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.getByText('Ana Gymanigga', { exact: false }).first().waitFor({ timeout: 15000 });
  let a = await aside();
  out.push('expanded, no Core Fitness logo: ' + (a.logos.length === 0 ? 'none' : 'MISSING (' + a.logos.join(', ') + ')'));
  out.push('expanded, the gym\'s initials: ' + (/\bAG\b/.test(a.text) ? 'AG' : 'MISSING'));
  await page.screenshot({ path: 'shots/no-logo-expanded.png', clip: { x: 0, y: 0, width: 300, height: 140 } });

  await page.getByRole('button', { name: /collapse/i }).first().click();
  await page.waitForTimeout(500);
  a = await aside();
  out.push('collapsed, no Core Fitness logo: ' + (a.logos.length === 0 ? 'none' : 'MISSING (' + a.logos.join(', ') + ')'));
  out.push('collapsed, the gym\'s initials: ' + (/\bAG\b/.test(a.text) && !/anafitness/i.test(a.text) ? 'AG' : 'MISSING (' + a.text.slice(0, 40) + ')'));
  await page.screenshot({ path: 'shots/no-logo-collapsed.png', clip: { x: 0, y: 0, width: 120, height: 140 } });

  return out.join('\n');
}
