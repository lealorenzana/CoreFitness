/**
 * The build studio (2026-11-07, the owner's game-style onboarding): opens for a gym not yet set up; the name
 * shows live in the top bar and the preview; saves advance; Enter confirms; colours change the preview of
 * the members' app and this dashboard; a finished chapter is celebrated; every chapter is reached. Each
 * step is pictured in light, and the studio in dark. Fixture from admin-light-check.js; admin on :5174.
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

  const H2 = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
  const ok = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { ...H2, 'Content-Range': '0-0/1' }, body: JSON.stringify(b) });
  const writes = [];
  // A gym that has not finished setting up: the guard sends its owner to the studio.
  await page.route('**/rest/v1/rpc/my_gym_context', (r) => ok(r, [{ gym_id: 'gym-1', gym_name: 'Iron Paradise', slug: 'iron-paradise', role: 'admin', status: 'active',
    lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: false, onboarding_step: null, gym_state: 'live' }]));
  await page.route('**/rest/v1/rpc/my_color_mode', (r) => ok(r, 'system'));
  await page.route('**/rest/v1/rpc/my_login', (r) => ok(r, [{ username: null, has_email: true, email: 'owner@iron.test' }]));
  await page.route('**/rest/v1/rpc/set_onboarding_step', (r) => { writes.push(['step', r.request().postData()]); ok(r, null); });
  // Every save reports one row written, as the database does.
  await page.route(/\/rest\/v1\/(gym_settings|membership_plans|gym_equipment|rewards)(\?.*)?$/, (r) => {
    const m = r.request().method();
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: H2, body: 'ok' });
    if (m === 'GET') return r.fallback();
    writes.push([m, r.request().url().split('/rest/v1/')[1].split('?')[0], r.request().postData()]);
    return ok(r, [{ id: 'row1', name: 'Saved' }]);
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  const out = [];
  const say = (label, good, extra = '') => out.push(`${label}: ${good ? 'yes' : 'MISSING ' + extra}`);
  const shot = async (name) => { await page.waitForTimeout(650); await page.screenshot({ path: `shots/studio-${name}.png` }); };
  const stepIs = async () => page.locator('[data-studio-step]').getAttribute('data-studio-step').catch(() => null);
  const nextBtn = () => page.locator('[data-studio-next]');
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto('http://localhost:5174/admin/setup', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-studio]').waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  say('a gym not yet set up opens the build studio', (await page.locator('[data-studio]').count()) === 1, page.url());
  say('six chapters down the left', (await page.locator('[data-chapter]').count()) >= 5, String(await page.locator('[data-chapter]').count()));
  say('the live preview shows the members’ app', (await page.locator('[data-preview-phone]').count()) === 1);

  // ── Identity · Name your gym ──
  await page.locator('input.ob-in').first().fill('Iron Paradise Fitness');
  await page.waitForTimeout(400);
  say('typing the name shows in the top bar and the phone preview at once',
    /Iron Paradise Fitness/.test(await page.locator('[data-studio-name]').innerText()) && /Iron Paradise Fitness/.test(await page.locator('[data-preview-phone]').innerText()));
  const pp = page.locator('[data-place-picker]');
  await pp.getByLabel('Province').selectOption('Occidental Mindoro');
  await page.waitForTimeout(150);
  await pp.getByLabel('City or municipality').selectOption('Mamburao');
  let f = await faint();
  say('step 1 is right in light', f.length === 0, f.join(' | '));
  await shot('01-identity-name-light');
  await nextBtn().click();
  await page.waitForTimeout(900);
  say('Save and continue saves the gym and moves to the hours', (await stepIs()) === 'hours' && writes.some((w) => w[1] === 'gym_settings'), String(await stepIs()));
  say('the build meter moves', Number((await page.locator('[data-build-pct]').innerText()).replace('%', '')) > 0);

  // ── hours ──
  await page.locator('input[type="time"]').first().fill('05:00');
  await page.locator('input[type="time"]').nth(1).fill('22:00');
  if (await page.locator('.ob-day').count()) await page.locator('.ob-day').last().click();
  await shot('02-identity-hours-light');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  say('Enter moves on, like a game’s confirm', (await stepIs()) === 'look', String(await stepIs()));

  // ── look: pick a colour, the preview follows ──
  const before = await page.locator('[data-preview-phone]').evaluate((el) => getComputedStyle(el).boxShadow);
  const swatch = page.locator('[data-studio-step="look"] button').nth(3);
  await swatch.click().catch(() => {});
  await page.waitForTimeout(700);
  const after = await page.locator('[data-preview-phone]').evaluate((el) => getComputedStyle(el).boxShadow);
  say('picking a colour changes the preview', before !== after, `${before} → ${after}`);
  await shot('03-identity-look-light');
  await page.locator('[data-preview-dashboard], .ob-pv-tabs button').nth(1).click();
  await page.waitForTimeout(500);
  say('the preview shows this dashboard too', (await page.locator('[data-preview-dashboard]').count()) === 1);
  await shot('03b-identity-look-dashboard-light');
  await page.locator('.ob-pv-tabs button').first().click();
  await nextBtn().click();
  await page.waitForTimeout(900);

  // ── words: finishing the chapter is celebrated ──
  await page.locator('input.ob-in').first().fill('Iron Points');
  await shot('04-identity-words-light');
  await nextBtn().click();
  await page.waitForTimeout(250);
  say('finishing a chapter is celebrated', (await page.locator('[data-chapter-burst]').count()) === 1);
  await page.screenshot({ path: 'shots/studio-04b-chapter-complete-light.png' });
  await page.waitForTimeout(1900);

  // ── the rest: each step, pictured, then on (self-saving ones Continue; others Skip) ──
  const seen = [];
  for (let i = 0; i < 25; i++) {
    const s = await stepIs();
    if (!s || seen.includes(s)) break;
    seen.push(s);
    f = await faint();
    if (f.length) out.push(`light check on ${s}: MISSING ${f.slice(0, 3).join(' | ')}`);
    await shot(`${String(seen.length + 4).padStart(2, '0')}-${s}-light`);
    if (s === 'ready') break;
    // The points' name is asked here, on Points and rewards — not on Your words (owner, 2026-11-12).
    if (s === 'rewards') {
      say('Points and rewards asks what the points are called', (await page.locator('[data-points-name]').getByText('Your points are called').count()) === 1);
      await page.locator('[data-points-name] input').first().fill('Lab Coins');
      await nextBtn().click();
      await page.waitForTimeout(1200);
      say('…and Save and continue saves that name', RPC_CALLS.some(([f, b]) => f === 'save_gym_words' && b.p_points_name === 'Lab Coins'), JSON.stringify(RPC_CALLS.filter(([f]) => f === 'save_gym_words').map(([, b]) => b)).slice(0, 200));
      continue;
    }
    if (s === 'password') { await page.locator('input[type="password"]').first().fill('newpass123'); await page.locator('input[type="password"]').nth(1).fill('newpass123'); }
    const skip = page.getByRole('button', { name: 'Skip for now' });
    if (s !== 'door' && s !== 'password' && await skip.count()) await skip.click(); else await nextBtn().click();
    await page.waitForTimeout(1200);
  }
  say('every chapter’s steps were reached, to Open your gym', seen.includes('ready') && ['runs', 'plans', 'refunds', 'waiver', 'team', 'equipment', 'rewards', 'door', 'members'].every((k) => seen.includes(k)), seen.join(' → '));
  say('the last step offers Open my gym', (await page.locator('[data-open-gym]').count()) === 1);

  // ── dark: the same studio ──
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('http://localhost:5174/admin/setup', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-studio]').waitFor({ timeout: 15000 }).catch(() => {});
  await shot('90-identity-name-dark');
  return out.join(String.fromCharCode(10));
}
