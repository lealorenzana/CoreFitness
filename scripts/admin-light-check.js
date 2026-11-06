/**
 * Light mode (0234) on the owner's and desk's app: with the computer in light
 * mode and no choice saved, the app is light; every main page keeps its text
 * readable (3:1 or better against what is behind it); the sun/moon in the top
 * bar flips it and saves the choice.
 *
 * Fixture from admin-redesign-check.js. Admin dev server on :5174.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'lea@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = new Date();
  const iso = (d, h = 9) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, 5, 0, 0); return x.toISOString(); };
  const day = (d) => { const x = new Date(now.getTime() + 8 * 3600000); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const NAMES = [['Aileen', 'Lopez'], ['Aileen', 'Navarro'], ['Ana', 'Andrada'], ['Ana', 'Iturralde'], ['Ana', 'Par'], ['Ana', 'Ramos'],
    ['Angelica', 'Lopez'], ['Angelica', 'Reyes'], ['Angelica', 'Rivera'], ['Ben', 'Cruz'], ['Carla', 'Diaz'], ['Dino', 'Santos']];
  const STATUSES = ['cancelled', 'active', 'active', 'pending', 'active', 'active', 'expired', 'active', 'frozen', 'active', 'active', 'expired'];
  const members = NAMES.map(([f, l], i) => ({ id: `m${i}`, role: 'member', status: i === 0 ? 'suspended' : i === 11 ? 'pending_approval' : 'active',
    first_name: f, last_name: l, email: `${f.toLowerCase()}.${l.toLowerCase()}@seed.corefitness-test.com`, phone: `+63 9${String(10 + i)}0 080 54${String(10 + i)}`,
    photo_url: null, created_at: iso(-200 + i) }));
  const T = [['Bianca', 'Soriano', 'Rehab & Injury Prevention'], ['Dante', 'Evangelista', 'Powerlifting'], ['Jen', 'Lacsamana', 'HIIT & Fat Loss']]
    .map(([f, l, sp], i) => ({ id: `t${i}`, role: 'trainer', status: 'active', first_name: f, last_name: l, email: `coach.${f.toLowerCase()}@seed.corefitness-test.com`,
      phone: null, photo_url: null, created_at: iso(-300), _sp: sp }));
  const PLANS = [
    { id: 'p1', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true },
    { id: 'p2', name: 'Free Plan', price: 0, duration_days: null, tier: 'free', is_active: true },
    { id: 'p3', name: 'Free Trial', price: 0, duration_days: 30, tier: 'freemium', is_active: true },
  ];
  const TABLES = {
    profiles: [admin, ...members, ...T],
    member_profiles: members.map((m, i) => ({ profile_id: m.id, gym_id: 'gym-1', qr_code: `QR-${m.id}`, experience_level: ['beginner', 'intermediate', 'advanced'][i % 3],
      address: 'Mamburao', date_of_birth: '1998-04-12', gender: 'female', created_at: m.created_at, profiles: m })),
    trainer_profiles: T.map((t) => ({ profile_id: t.id, specialization: t._sp, bio: null, availability: null, years_experience: 5,
      certifications: [], focus_areas: [], achievements: null, profiles: t })),
    membership_plans: PLANS,
    memberships: members.map((m, i) => {
      const plan = PLANS[i % 3];
      return { id: `ms${i}`, member_id: m.id, plan_id: plan.id, status: STATUSES[i], start_date: day(-20), expiry_date: plan.duration_days ? day(i === 2 ? 1 : 10 + i) : null,
        never_expires: !plan.duration_days, frozen_at: null, created_at: iso(-20), membership_plans: plan };
    }),
    attendance: [
      { id: 'a1', member_id: 'm1', check_in_time: iso(0, 7), method: 'qr', activity: 'Weight Training' },
      { id: 'a2', member_id: 'm2', check_in_time: iso(0, 8), method: 'manual', activity: null },
      { id: 'a3', member_id: 'm4', check_in_time: iso(-2, 18), method: 'qr', activity: 'Cardio' },
      { id: 'a4', member_id: 'm1', check_in_time: iso(-5, 18), method: 'qr', activity: 'Strength Training' },
    ],
    gym_invitations: [], payments: [], notifications: [], bookings: [], pt_sessions: [],
    gym_settings: [{ id: true, gym_id: 'gym-1', gym_name: 'G Fitness', activity_options: ['Weight Training', 'Cardio', 'Strength Training'],
      day_pass_on: true, day_pass_price: 150, pack5_price: 650, pack10_price: 1200, guest_nudge_visits: 3 }],
  };
  const RPC_CALLS = [];
  const RPC = { guest_visits_on: [], my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [], list_invitations: [] };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-0/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      try { RPC_CALLS.push([fn, JSON.parse(req.postData() || '{}')]); } catch { RPC_CALLS.push([fn, {}]); }
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET') return json([]);
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        let m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
        m = /^gte\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) >= m[1]);
        m = /^lte?\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) <= m[1] + (k.endsWith('_time') ? 'T23:59:59Z' : ''));
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const H2 = { 'Access-Control-Allow-Origin': '*' };
  let saved = 'system';
  const setCalls = [];
  await page.route('**/rest/v1/rpc/my_color_mode', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify(saved) }));
  await page.route('**/rest/v1/rpc/set_color_mode', (r) => { setCalls.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: 'null' }); });
  await page.emulateMedia({ colorScheme: 'light' });
  // What the owner asked for (2026-11-03): in light every word is plainly seen, fills are solid, and
  // nothing dark is left behind. Three findings, each walked up to the first painted background:
  //   words (or a field's typed value) under 3:1 against what is behind them;
  //   a gradient behind words — light mode's fills are solid (a photo's scrim is exempt);
  //   a near-black block bigger than a dot — a dark-mode fill that never turned light.
  const faint = () => page.evaluate(() => {
    const rgb = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const kept = (el) => !!el.closest('.keep-dark, img, video, canvas, svg, [data-photo-viewer], [data-tv-preview]');
    // Returns a colour, or 'gradient' when words sit on one, or 'photo' when a picture is behind them.
    const bgOf = (el, ignoreImage) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const img = cs.backgroundImage;
        if (!ignoreImage && img && img !== 'none') return img.includes('url(') ? 'photo' : { grad: `${n.tagName.toLowerCase()}.${String(n.className).split(' ').slice(0, 2).join('.')} ${img.slice(0, 70)}` };
        const c = rgb(cs.backgroundColor); if (c && c[3] > 0.6) return c;
      }
      return [246, 246, 249, 1];
    };
    const label = (el) => `"${String(/^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value : el.textContent ?? '').trim().slice(0, 24)}"`;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5 || kept(el)) continue;
      const field = /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|color|file|hidden/.test(el.type) && el.value?.trim();
      const words = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (field || words) {
        const fg = rgb(cs.color); const bg = bgOf(el, !!field);
        if (bg && bg.grad) { bad.push(`gradient behind ${label(el)} [${bg.grad}]`); continue; }
        if (!fg || !Array.isArray(bg) || fg[3] < 0.5) continue;
        const c = ratio(fg, bg);
        if (c < 3) bad.push(`${label(el)} ${c.toFixed(1)}:1`);
        continue;
      }
      const c = rgb(cs.backgroundColor);
      if (c && c[3] > 0.8 && lum(c) < 0.05 && r.width * r.height > 900) bad.push(`dark block <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}> ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(bad)].slice(0, 8);
  });

  // Every page a route leads to (App.tsx), not a sample of them.
  const pages = ['/dashboard', '/members', '/invitations', '/attendance', '/attendance/walk-ins', '/attendance-history', '/analytics', '/retention',
    '/retention/messages', '/revenue', '/payments', '/membership-plans', '/resources', '/trainers', '/gym-app', '/schedule', '/personal-training',
    '/bookings/classes', '/equipment', '/events', '/notifications', '/activity', '/achievements', '/exercises', '/programs', '/rooms', '/shop',
    '/help', '/inbox', '/subscription', '/rewards', '/challenges', '/credentials', '/settings', '/system'];
  const bad = [];
  for (const p of pages) {
    await page.goto('http://localhost:5174' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (p === '/dashboard') say('with the computer in light mode, the app is light', (await page.evaluate(() => document.documentElement.dataset.mode)) === 'light');
    const f = await faint();
    if (f.length) bad.push(`${p}: ${f.join(' | ')}`);
    await page.screenshot({ path: `shots/admin-light${p.replace(/\//g, '-')}.png` });
  }
  say('every main page readable in light (3:1 or better)', bad.length === 0, bad.join(' || '));

  // The pop-ups: each is opened for real and its text judged the same way. One that cannot be
  // opened is reported, never skipped.
  const POPS = [
    ['search', '/dashboard', (p) => p.getByText('Search anything').first()],
    ['bell', '/dashboard', (p) => p.locator('header button[aria-label*="lert"]').first()],
    ['member drawer', '/members', (p) => p.getByText('Aileen Navarro').first()],
    ['record payment', '/payments', (p) => p.getByRole('button', { name: /record payment/i }).first()],
    ['new plan', '/membership-plans', (p) => p.getByRole('button', { name: /new plan/i }).first()],
    ['invite a group', '/invitations', (p) => p.getByRole('tab', { name: /invite a group/i }).first()],
    ['new product', '/shop', async (p) => {
      const tab = p.getByRole('button', { name: /^add products$/i }).first();
      if (await tab.count()) { await tab.click(); await p.waitForTimeout(600); }
      return p.getByRole('button', { name: /^add product$/i }).first();
    }],
  ];
  // These open in the page itself (the side panel, a tab), not over it.
  const INLINE = new Set(['member drawer', 'new plan', 'invite a group']);
  const OPEN = '[role="dialog"], [aria-modal="true"], [role="menu"], [data-popover], [role="listbox"], .fixed.inset-0';
  const popBad = [], unopened = [];
  for (const [name, path, target] of POPS) {
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const before = await page.locator(OPEN).count();
    try { await (await target(page)).click({ timeout: 3000 }); } catch { unopened.push(name); continue; }
    await page.waitForTimeout(700);
    const after = await page.locator(OPEN).count();
    if (after <= before && !INLINE.has(name)) { unopened.push(`${name} (nothing opened)`); }
    const f = await faint();
    if (f.length) popBad.push(`${name}: ${f.join(' | ')}`);
    await page.screenshot({ path: `shots/admin-light-pop-${name.replace(/ /g, '-')}.png` });
    await page.keyboard.press('Escape');
  }
  say('every pop-up readable in light (3:1 or better)', popBad.length === 0, popBad.join(' || '));
  say('every pop-up opened', unopened.length === 0, unopened.join(', '));
  // The gym's own colours win in light too (2026-11-06): Core Fitness Lab's button colour is violet,
  // and light.css's amber default was beating it — the terms notice, Review/View and links turned amber.
  await page.route('**/rest/v1/rpc/my_gym_app', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: H2,
    body: JSON.stringify([{ accent: 'violet', accent_action: 'violet' }]) }));
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const gymAction = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-secondary').trim().toLowerCase());
  say("a gym's own button colour shows in light (not the default amber)", gymAction === '#6d28d9', gymAction);
  await page.screenshot({ path: 'shots/admin-light-dashboard-settled.png' });
  await page.locator('[data-mode-toggle]').click();
  await page.waitForTimeout(400);
  say('the sun/moon flips to dark and saves it', (await page.evaluate(() => document.documentElement.dataset.mode)) === 'dark' && setCalls.some((c) => c.p_mode === 'dark'));
  await page.emulateMedia({ colorScheme: 'dark' });
  return out.join(String.fromCharCode(10));
}
