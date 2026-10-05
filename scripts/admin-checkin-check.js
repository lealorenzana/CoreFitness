/**
 * Check-in at the kiosk with real-shaped member ids (2026-10-05). The bug: a
 * member whose code is "0E4 CAF" typed "OE4CAF" and was refused, and a member
 * approved after the kiosk opened was never in its roster. Now: O reads as 0,
 * a code not in the roster is asked of the database, and the member app's QR
 * payload (CF1.<time>.<ID IN CAPITALS>) checks the member in.
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
  const ADMIN_ID = '9a000000-0000-4000-8000-000000000001';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN_ID, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'owner@gfitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const person = (id, first) => ({ id, role: 'member', status: 'active', first_name: first, last_name: 'Reyes', email: `${first}@m.test`, phone: null, photo_url: null, created_at: today });
  const LEA = person('0e4caf37-0f2a-4b11-9c22-1234567890ab', 'Lea');
  const NEW = person('a1b2c3d4-1111-4222-8333-1234567890ab', 'Nina');   // approved after the kiosk opened
  const QRM = person('7f00aa11-2222-4333-8444-1234567890ab', 'Paolo');  // checks in with the app's QR
  const row = (p) => ({ profile_id: p.id, gym_id: 'gym-1', qr_code: p.id, experience_level: 'beginner', created_at: today, profiles: p });
  const membership = (p) => ({ id: 'ms-' + p.id.slice(0, 4), member_id: p.id, plan_id: 'p1', status: 'active', start_date: today,
    expiry_date: today, never_expires: false, frozen_at: null, created_at: today,
    membership_plans: { id: 'p1', name: 'Premium', price: 999, duration_days: 30, tier: 'premium' } });
  const ALL = [LEA, NEW, QRM];
  let rosterCalls = 0;
  const INSERTED = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = new URLSearchParams(qi === -1 ? '' : after.slice(qi + 1));
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true }]);
      if (fn === 'get_point_balance' || fn === 'my_point_balance') return json(120);
      return json(null);
    }
    const t = pathname.split('/rest/v1/')[1] ?? '';
    if (t === 'member_profiles') {
      const gte = params.get('profile_id')?.replace(/^gte\./, '');
      const all = params.getAll('profile_id');
      if (all.some((v) => v.startsWith('gte.')) && all.some((v) => v.startsWith('lte.'))) {
        const lo = all.find((v) => v.startsWith('gte.')).slice(4); const hi = all.find((v) => v.startsWith('lte.')).slice(4);
        return json(ALL.filter((p) => p.id >= lo && p.id <= hi).map(row));
      }
      const eq = all.find((v) => v.startsWith('eq.'))?.slice(3) ?? params.get('qr_code')?.replace(/^eq\./, '');
      const qr = params.get('qr_code')?.replace(/^eq\./, '');
      if (qr) { const p = ALL.find((x) => x.id === qr); return json(one ? (p ? row(p) : null) : (p ? [row(p)] : [])); }
      if (eq || gte) { const p = ALL.find((x) => x.id === eq); return json(one ? (p ? row(p) : null) : (p ? [row(p)] : [])); }
      rosterCalls++;
      // The roster the kiosk loads when it opens: Nina is not approved yet.
      return json([row(LEA), row(QRM)]);
    }
    if (t === 'memberships') {
      const id = params.get('member_id')?.replace(/^eq\./, '');
      const p = ALL.find((x) => x.id === id);
      return json(one ? (p ? membership(p) : null) : (p ? [membership(p)] : []));
    }
    if (t === 'attendance') {
      if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); INSERTED.push(...(Array.isArray(b) ? b : [b])); return json(one ? { id: 'att' } : [{ id: 'att' }], 201); }
      return json([]);
    }
    if (t === 'gym_settings') return json(one ? { id: true, gym_name: 'G Fitness' } : [{ id: true, gym_name: 'G Fitness' }]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? { id: ADMIN_ID, role: 'admin', status: 'active', first_name: 'Owner', last_name: 'G' } : []);
    if (req.method() === 'POST') return json([], 201);
    return json(one ? null : []);
  });

  const out = [];
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('http://localhost:5174/kiosk', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Check-in code').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const send = async (code) => {
    await page.getByLabel('Check-in code').fill(code);
    await page.getByLabel('Check-in code').press('Enter');
    await page.waitForTimeout(1800);
    return text();
  };

  let t = await send('OE4 CAF');
  out.push('"OE4 CAF" (letter O) checks in 0E4 CAF: ' + (/Welcome, Lea/.test(t) && INSERTED.some((r) => r.member_id === LEA.id) ? 'yes' : 'MISSING ' + t.slice(0, 160)));
  await page.waitForTimeout(4500);
  t = await send('a1b2c3');
  out.push('a member not in the roster is found in the database: ' + (/Welcome, Nina/.test(t) && INSERTED.some((r) => r.member_id === NEW.id) ? 'yes' : 'MISSING ' + t.slice(0, 160)));
  await page.waitForTimeout(4500);
  t = await send(`CF1.${Date.now().toString(36)}.${QRM.id}`.toUpperCase());
  out.push("the member app's QR payload checks in: " + (/Welcome, Paolo/.test(t) && INSERTED.some((r) => r.member_id === QRM.id) ? 'yes' : 'MISSING ' + t.slice(0, 160)));
  out.push('roster loaded once at open: ' + (rosterCalls >= 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-checkin.png' });
  return out.join(String.fromCharCode(10));
}
