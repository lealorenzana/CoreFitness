/**
 * Usernames and login slips (0236) on the owner's app, in light: an invitation
 * with a username and no email gives a printable slip that says to hand it over;
 * Add member types no password, suggests a username and ends on the slip; the
 * member drawer shows the login and Reset login asks first, then gives a new
 * slip; the login screen sends a username to the server function. Judged as
 * admin-light-check.js in light.
 *
 * Fixture from admin-light-check.js. Admin dev server on :5174.
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

  // What the owner asked for (2026-11-03, 2026-11-06): in light every word is plainly seen, fills are
  // solid with white words, the lines dark mode draws are drawn too, and nothing dark is left behind.
  // Each finding is walked up to the first painted background:
  //   words (or a field's typed value) under 3:1 against what is behind them;
  //   a gradient behind words — light mode's fills are solid (a photo's scrim is exempt);
  //   dark words on a coloured fill — a filled thing carries white words;
  //   a line that disappears into what is behind it (dark mode's white hairlines on white);
  //   a near-black block bigger than a dot — a dark-mode fill that never turned light.
  const faint = () => page.evaluate(() => {
    const rgb = (s) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
      // color-mix() computes to color(srgb r g b / a), 0–1 — unread, every tinted ground passed as see-through (2026-11-07).
      const c = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s);
      return c ? [+c[1] * 255, +c[2] * 255, +c[3] * 255, c[4] === undefined ? 1 : +c[4]] : null;
    };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
    const kept = (el) => !!el.closest('.keep-dark, img, video, canvas, svg, [data-photo-viewer], [data-tv-preview], [data-light-exempt]');
    // A colour, or { grad } when words sit on a gradient, or 'photo' when a picture is behind them.
    const bgOf = (el, ignoreImage) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const img = cs.backgroundImage;
        if (!ignoreImage && img && img !== 'none') return img.includes('url(') ? 'photo' : { grad: `${n.tagName.toLowerCase()}.${String(n.className).split(' ').slice(0, 2).join('.')} ${img.slice(0, 70)}` };
        const c = rgb(cs.backgroundColor);
        if (c && c[3] > 0.6) return layers.reduceRight((under, top) => over(top, under), c);
        // A see-through fill is blended with what is behind it, never skipped — a 55% near-black
        // row read as "the page" and passed while it showed grey.
        if (c && c[3] >= 0.12) layers.push(c);
      }
      return layers.reduceRight((under, top) => over(top, under), [246, 246, 249, 1]);
    };
    const tag = (el) => `<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''}>`;
    const label = (el) => `"${String(/^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value : el.textContent ?? '').trim().slice(0, 24)}"`;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5 || kept(el)) continue;
      // Lines: a drawn border must stand off what is behind it.
      for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
        if (parseFloat(cs[`border${side}Width`]) < 1 || cs[`border${side}Style`] === 'none') continue;
        const bc = rgb(cs[`border${side}Color`]); if (!bc || bc[3] < 0.02) continue; // transparent on purpose
        const behind = bgOf(el.parentElement ?? el, true);
        if (!Array.isArray(behind)) continue;
        const own = rgb(cs.backgroundColor);
        const ground = own && own[3] > 0.6 ? own : behind;
        if (ratio(over(bc, ground), ground) < 1.06 && ratio(over(bc, behind), behind) < 1.06) { bad.push(`invisible line ${tag(el)} ${side.toLowerCase()} (${cs[`border${side}Color`]} on rgb(${ground.slice(0, 3).map(Math.round).join(', ')}))`); break; }
      }
      const field = /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|color|file|hidden/.test(el.type) && el.value?.trim();
      const words = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (field || words) {
        const fg = rgb(cs.color); const bg = bgOf(el, !!field);
        if (bg && bg.grad) { bad.push(`gradient behind ${label(el)} [${bg.grad}]`); continue; }
        if (!fg || !Array.isArray(bg) || fg[3] < 0.5) continue;
        const c = ratio(fg, bg);
        if (c < 3) { bad.push(`${label(el)} ${c.toFixed(1)}:1`); continue; }
        // A coloured fill (saturated, not a pale tint) or a dark one carries light words.
        if (!field && ((sat(bg) > 0.45 && lum(bg) < 0.5) || lum(bg) < 0.2) && lum(fg) < lum(bg)) bad.push(`dark words on a fill ${label(el)}`);
        continue;
      }
      const c = rgb(cs.backgroundColor);
      if (c && c[3] > 0.8 && lum(c) < 0.05 && r.width * r.height > 900 && !el.querySelector('video, canvas')) bad.push(`dark block ${tag(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      // A dark gradient is a dark block too (owner, 2026-11-07: Equipment's #2a2050→#14323a squares passed as "an image").
      const gi = cs.backgroundImage;
      if (gi && gi.includes('gradient') && !gi.includes('url(') && r.width * r.height > 900) {
        const stops = [...gi.matchAll(/rgba?\([^)]*\)/g)].map((m) => rgb(m[0])).filter((s) => s && s[3] > 0.6);
        if (stops.length && stops.every((s) => lum(s) < 0.05)) bad.push(`dark gradient block ${tag(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return [...new Set(bad)].slice(0, 10);
  });

  const H2 = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const ok = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify(b) });
  const argsOf = (r) => { try { return JSON.parse(r.request().postData() || '{}'); } catch { return {}; } };
  const calls = [];
  const fn = (name, answer) => page.route(`**/functions/v1/${name}`, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H2, body: 'ok' });
    const a = argsOf(r); calls.push([name, a]); return ok(r, answer(a));
  });
  await page.route('**/rest/v1/rpc/my_login', (r) => ok(r, [{ username: null, has_email: true, email: 'owner@lab.test' }]));
  await page.route('**/rest/v1/rpc/username_available', (r) => ok(r, null));
  await page.route('**/rest/v1/rpc/login_info_for', (r) => ok(r, [{ username: 'aileen.n', has_email: false, set_up: true, can_reset: true }]));
  await page.route('**/rest/v1/rpc/my_color_mode', (r) => ok(r, 'system'));
  await fn('invite-account', (a) => ({ id: 'inv1', token: 't1', userId: 'u9', existing: false, emailed: 'skipped', password: 'ABCDE-fghjk', username: a.username, email: a.email || null }));
  await fn('create-member', (a) => ({ id: 'u10', email: a.email || null, username: a.username || null, password: 'PQRST-uvwxy' }));
  await fn('reset-login', () => ({ password: 'NEWPW-23456', username: 'aileen.n', email: null }));

  await page.setViewportSize({ width: 1600, height: 1000 });
  const out = [];
  const say = (label, good, extra = '') => out.push(`${label}: ${good ? 'yes' : 'MISSING ' + extra}`);
  const go = async (p) => { await page.goto('http://localhost:5174' + p, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000); };
  const slipText = async () => { const s = page.locator('[data-login-slip]'); return (await s.count()) ? (await s.innerText()).replace(/\s+/g, ' ') : '(no slip)'; };
  await page.emulateMedia({ colorScheme: 'light' });

  // ---- 1. Invitations: a username and no email ----
  await go('/invitations');
  say('the invite form has a username field', (await page.locator('[data-invite-username]').count()) === 1);
  await page.locator('#iv-first').fill('Juan');
  await page.locator('#iv-last').fill('Dela Cruz');
  await page.getByRole('button', { name: 'Suggest' }).click();
  say('Suggest makes juan.dela.cruz from the name', (await page.locator('#iv-username').inputValue()) === 'juan.dela.cruz', await page.locator('#iv-username').inputValue());
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(900);
  const inv = calls.find((c) => c[0] === 'invite-account');
  say('the invitation is sent with the username and no email', !!inv && inv[1].username === 'juan.dela.cruz' && inv[1].email === '', JSON.stringify(inv?.[1]));
  let st = await slipText();
  say('the login slip shows the name, the username and the one-time password', /Juan Dela Cruz/.test(st) && /juan\.dela\.cruz/.test(st) && /ABCDE-fghjk/.test(st), st.slice(0, 300));
  say('…and says there is no email, so hand it over', /No email — hand this slip over/.test(st));
  say('…with a print button', (await page.locator('[data-slip-print]').count()) === 1);
  let f = await faint();
  say('the slip is right in light (words, fills, lines)', f.length === 0, f.join(' | '));
  await page.locator('[data-login-slip]').screenshot({ path: 'shots/login-slip-light.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  say('Escape closes the slip', (await page.locator('[data-login-slip]').count()) === 0);

  // ---- 2. Members → Add member: no typed password, a slip at the end ----
  await go('/members');
  await page.getByRole('button', { name: /Add member/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('First name').fill('Maria');
  await page.getByLabel('Last name').fill('Santos');
  await page.locator('[data-step-next]').click();
  await page.waitForTimeout(700);
  say('Add member asks for no password', (await page.getByLabel('Password').count()) === 0);
  say('…and suggests maria.santos as the username', (await page.locator('[data-add-username]').inputValue().catch(() => '')) === 'maria.santos');
  for (let i = 0; i < 2; i++) { await page.locator('[data-step-next]').click(); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Add member', exact: true }).last().click();
  await page.waitForTimeout(1200);
  const cm = calls.find((c) => c[0] === 'create-member');
  say('the member is made with the username, no email and no password sent', !!cm && cm[1].username === 'maria.santos' && !cm[1].email && !('password' in cm[1]), JSON.stringify(cm?.[1]));
  st = await slipText();
  say('the slip opens by itself with the one-time password', /maria\.santos/.test(st) && /PQRST-uvwxy/.test(st), st.slice(0, 200));
  await page.keyboard.press('Escape');

  // ---- 3. The member drawer: Login, Reset login ----
  await go('/members');
  await page.getByText('Aileen Navarro').first().click();
  await page.waitForTimeout(1200);
  const ls = page.locator('[data-login-section]');
  await ls.waitFor({ timeout: 6000 }).catch(() => {});
  say('the drawer shows the login: @aileen.n, no email', (await ls.count()) === 1 && /@aileen\.n/.test(await ls.innerText()) && /no email/.test(await ls.innerText()));
  f = await faint();
  say('the drawer is right in light (words, fills, lines)', f.length === 0, f.join(' | '));
  if (await ls.count()) {
    await ls.locator('[data-reset-login]').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Reset login' }).last().click();
    await page.waitForTimeout(900);
  }
  const rl = calls.find((c) => c[0] === 'reset-login');
  st = await slipText();
  say('Reset login asks first, then gives a new slip', !!rl && /NEWPW-23456/.test(st), JSON.stringify(rl?.[1]) + ' ' + st.slice(0, 120));
  await page.keyboard.press('Escape');

  // ---- 4. Sign in with a username ----
  await page.route('**/functions/v1/sign-in-username', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H2, body: 'ok' });
    calls.push(['sign-in-username', argsOf(r)]);
    return r.fulfill({ status: 400, contentType: 'application/json', headers: H2, body: JSON.stringify({ error: 'That username and password do not match.' }) });
  });
  // The page is signed in by the fixture, so the helper is called through the dev server (VERIFYING's recipe).
  const res = await page.evaluate(async () => {
    const m = await import('/src/lib/api/logins.ts');
    return m.signInWithLogin('desk.ana', 'whatever1');
  });
  const si = calls.find((c) => c[0] === 'sign-in-username');
  say('a username goes to the server, never a lookup in the browser', !!si && si[1].username === 'desk.ana' && si[1].password === 'whatever1', JSON.stringify(si?.[1]));
  say("…and the server's answer is shown as it is", /do not match/.test(res?.error ?? ''), JSON.stringify(res));
  const src = await page.evaluate(async () => (await fetch('/src/pages/AdminLogin.tsx')).text());
  say('the admin login field says "Email or username"', /placeholder["=: ]+"Email or username"/.test(src));

  // ---- dark, to look at ----
  await page.emulateMedia({ colorScheme: 'dark' });
  return out.join(String.fromCharCode(10));
}
