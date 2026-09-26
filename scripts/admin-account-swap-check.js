/**
 * One gym's owner signs out, another gym's owner signs in, same browser tab.
 *
 * Reported 2026-09-26: the G Fitness owner set a logo and a tagline, logged
 * out, and Ana signed into her own gym — whose Settings page said "Anafitness"
 * while the sidebar beside it still wore G Fitness's name, logo and tagline.
 *
 * The cause was not the database. Every read was filtered to the right gym.
 * The admin app kept the gym's branding (and its nouns) in module memory, and
 * Logout was `signOut()` + `navigate()`: a client-side route change, so the
 * modules survived and the next person inherited the last gym's identity. The
 * member app had the same shape once (the achievement catalogue, 17ee93f).
 *
 * So this drives the real path — the Logout button, the real login form, no
 * page.goto in between — and asserts on what the second owner's sidebar says.
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
  const sessionFor = (id, email) => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r-' + id, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} },
  });

  // Two gyms that share nothing: different names, logos, taglines and nouns.
  const GYMS = {
    u1: {
      gym_id: 'gym-g', gym_name: 'G Fitness', slug: 'g-fitness', short_name: 'GF',
      tagline: 'Building community', logo_url: 'https://example.test/g-fitness.png', accent: 'violet',
      address: 'Mamburao', vocabulary: { trainers: 'PTs' },
    },
    u2: {
      gym_id: 'gym-a', gym_name: 'Ana gymanigga', slug: 'ana-gym', short_name: 'Anafitness',
      tagline: 'whatatops', logo_url: 'https://example.test/ana.png', accent: 'rose',
      address: 'Brgy Bunot', vocabulary: {},
    },
  };
  const EMAIL = { u1: 'owner@gfitness.test', u2: 'ana@anafitness.test' };

  // Whoever the browser is signed in as right now. The login POST changes it,
  // so every read after that answers for the second gym, as the database would.
  let who = 'u1';
  await page.addInitScript(([k, s]) => {
    if (!sessionStorage.getItem('planted')) {
      localStorage.setItem(k, JSON.stringify(s));
      sessionStorage.setItem('planted', '1');
    }
  }, [KEY, sessionFor('u1', EMAIL.u1)]);

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');

    if (path.startsWith('/auth/v1/token')) {
      const body = JSON.parse(req.postData() || '{}');
      if (body.email) who = body.email === EMAIL.u2 ? 'u2' : 'u1';
      return json(sessionFor(who, EMAIL[who]));
    }
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    if (path.startsWith('/auth/v1/')) return json(sessionFor(who, EMAIL[who]).user);

    const g = GYMS[who];
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{
        gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin', status: 'active',
        lock_reason: null, short_name: g.short_name, logo_url: g.logo_url, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open',
      }]);
      if (fn === 'my_gyms') return json([{ gym_id: g.gym_id, name: g.gym_name, slug: g.slug, role: 'admin', status: 'active' }]);
      if (fn === 'my_gym_app') return json([{
        gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name, logo_url: g.logo_url,
        accent: g.accent, accent_action: null, tagline: g.tagline, points_name: 'Points', points_name_short: 'points',
        welcome_message: null, vocabulary: g.vocabulary, join_policy: 'code', join_code: 'X',
        modules: { classes: true, coaching: true, engagement: true, progress: true, push: true, assistant: false },
      }]);
      if (fn === 'my_gym_modules' || fn === 'my_support_grant') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name,
        tagline: g.tagline, logo_url: g.logo_url, address: g.address };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: who, role: 'admin', status: 'active', first_name: who === 'u1' ? 'Gabby' : 'Ana',
        last_name: who === 'u1' ? 'Owner' : 'Lisa', email: EMAIL[who], phone: null, photo_url: null,
        created_at: new Date().toISOString() };
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

  // 1. The first owner, in their own gym.
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let s = await aside();
  out.push('first owner sees G Fitness: ' + (/G Fitness/i.test(s.text) ? 'shown' : 'MISSING'));

  // 2. Logout, from the sidebar — the button the reporter pressed.
  await page.getByRole('button', { name: 'Logout' }).last().click();
  await page.waitForURL('**/admin/login', { timeout: 8000 });
  await page.waitForTimeout(800);

  // 3. The second owner signs in on the same tab, through the real form.
  await page.getByPlaceholder('Email address').fill(EMAIL.u2);
  await page.getByPlaceholder('Password').fill('test-password-1');
  await page.getByPlaceholder('Password').press('Enter');
  await page.waitForTimeout(3500);

  s = await aside();
  out.push('second owner sees their gym name: ' + (/Ana gymanigga/i.test(s.text) ? 'shown' : 'MISSING'));
  out.push('second owner sees their tagline: ' + (/whatatops/i.test(s.text) ? 'shown' : 'MISSING'));
  out.push('second owner sees their logo: ' + (s.logos.includes(GYMS.u2.logo_url) ? 'shown' : 'MISSING'));
  // The two that must be gone. Worded so a leak trips the runner's MISSING rule.
  out.push('first gym name gone: ' + (/G Fitness/i.test(s.text) ? 'MISSING (still G Fitness)' : 'gone'));
  out.push('first gym logo gone: ' + (s.logos.includes(GYMS.u1.logo_url) ? 'MISSING (still G Fitness logo)' : 'gone'));
  // The nouns are the same kind of cache. G Fitness calls trainers "PTs"; Ana renamed nothing.
  await page.getByRole('button', { name: /^People/ }).click().catch(() => {});
  await page.waitForTimeout(500);
  s = await aside();
  out.push('first gym nouns gone: ' + (/\bPTs\b/.test(s.text) ? 'MISSING (still says PTs)' : 'gone'));
  await page.screenshot({ path: 'shots/admin-account-swap.png', fullPage: true });

  return out.join('\n');
}
