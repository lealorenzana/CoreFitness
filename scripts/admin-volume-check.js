/**
 * Volume (2026-10-20, the owner's rule): with a lot of data — 240 members,
 * 24 coaches, 120 coachings, 15 payments to confirm and 12 pause/cancel requests — Members, Trainers and
 * Coaching still fit the screen. Nothing pushes anything else down: the page
 * never scrolls, tables page by what fits, the pager stays a handful of buttons,
 * and a long side list shows a preview plus See all, which opens a floating window. The fixture is admin-redesign-check's,
 * multiplied. Screenshots shots/vol-*.png. Admin dev server on :5174.
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
  const BIG = Array.from({ length: 20 }, (_, k) => NAMES.map(([f, l]) => [f, `${l}${k ? ' ' + (k + 1) : ''}`])).flat();
  const STAT = BIG.map((_, i) => STATUSES[i % 12]);
  const members = BIG.map(([f, l], i) => ({ id: `m${i}`, role: 'member', status: i === 0 ? 'suspended' : i % 12 === 11 ? 'pending_approval' : 'active',
    first_name: f, last_name: l, email: `${f.toLowerCase()}.${i}@seed.corefitness-test.com`, phone: `+63 917 ${String(1000 + i)} 080`,
    photo_url: null, created_at: iso(-200 + i) }));
  const T = Array.from({ length: 8 }, (_, k) => [['Bianca', 'Soriano', 'Rehab & Injury Prevention'], ['Dante', 'Evangelista', 'Powerlifting'], ['Jen', 'Lacsamana', 'HIIT & Fat Loss']]
    .map(([f, l, sp]) => [f, `${l}${k ? ' ' + (k + 1) : ''}`, sp])).flat()
    .map(([f, l, sp], i) => ({ id: `t${i}`, role: 'trainer', status: 'active', first_name: f, last_name: l, email: `coach.${f.toLowerCase()}.${i}@seed.corefitness-test.com`,
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
      return { id: `ms${i}`, member_id: m.id, plan_id: plan.id, status: STAT[i], start_date: day(-20), expiry_date: plan.duration_days ? day(i % 12 === 2 ? 1 : 10 + (i % 40)) : null,
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
  TABLES.coachings = Array.from({ length: 120 }, (_, i) => ({ id: `k${i}`, member_id: `m${i}`, trainer_id: `t${i % T.length}`, kind: i % 5 ? 'pt' : 'group',
    months: [1, 3, 6][i % 3], status: i < 15 ? 'payment_sent' : i % 9 === 0 ? 'ended' : 'active', fee_mode: 'gym_priced', price: 2400,
    pay_reference: i < 15 ? `GC-${1000 + i}` : null, starts_on: i < 15 ? null : day(-10 - (i % 40)), ends_on: i < 15 ? null : day(80 - i), started_by: 'desk',
    created_at: iso(-30) }));
  TABLES.trainer_availability = T.map((t) => ({ id: `av-${t.id}`, trainer_id: t.id, day_of_week: 1, start_time: '08:00', end_time: '12:00' }));
  const RPC_CALLS = [];
  const RPC = { open_membership_requests: Array.from({ length: 12 }, (_, i) => ({ id: `rq${i}`, member_id: `m${i + 1}`, member_name: `Member ${i + 1}`, kind: i % 2 ? 'cancel' : 'freeze',
    requested_days: 14, reason: 'Travelling for work', plan_name: 'Premium', expiry_date: day(20), created_at: iso(-1) })), coaching_settings: [{ modes: ['pick_pt', 'desk_assigns'], lengths: [1, 3, 6], fee_mode: 'gym_priced' }], coaching_sweep: 0, trainer_month_summary: [], guest_visits_on: [], my_gym_modules: [], my_gyms: [], my_announcements: [], my_gym_features: [], list_invitations: [] };

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
  const BAD = /Something went wrong|Couldn'?t load|Could not load|Failed to load|is not a function|Cannot read prop|NaN|\[object Object\]|Invalid Date/;
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const visit = async (path, shot) => {
    errs.length = 0;
    await page.goto('http://localhost:5174' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const bad = BAD.exec(t);
    out.push(`${path}: ${bad ? 'ERROR TEXT "' + t.slice(Math.max(0, bad.index - 40), bad.index + 60) + '"' : 'renders'}${errs.length ? ' | ' + errs.join(' || ') : ''}`);
    await page.screenshot({ path: `shots/rd-${shot}.png`, fullPage: true });
    return t;
  };
  const has = (label, ok) => out.push(`  ${label}: ${ok ? 'yes' : 'MISSING'}`);

  /** How far the page (main) and the window can scroll — both must be nothing. */
  const overflow = async () => page.evaluate(() => {
    const m = document.querySelector('main');
    return Math.max(m ? m.scrollHeight - m.clientHeight : 999, document.documentElement.scrollHeight - innerHeight);
  });
  const pagerButtons = async () => page.locator('[data-pager] button').count();
  for (const [w, h] of [[1600, 1000], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    const at = `${w}×${h}`;

    let t = await visit('/members', `vol-members-${w}`);
    let rows = await page.locator('[data-member-row]').count();
    const reqs = await page.locator('[data-ms-requests] > .a-card').count();
    has(`${at} Members: many requests show one above the table and See all (${reqs} shown)`, reqs <= 1 && (reqs === 0 || (await page.locator('[data-see-all-requests]').count()) === 1));
    has(`${at} Members: 240 members, the page does not scroll`, (await overflow()) <= 2 && /of 220 members|of 2\d\d members/.test(t));
    has(`${at} Members: the table shows only what fits (${rows} rows) and the pager stays short (${await pagerButtons()} buttons)`, rows >= 3 && rows < 40 && (await pagerButtons()) <= 7);
    await page.locator('[data-pager] button[aria-label="Next page"]').click(); await page.waitForTimeout(300);
    has(`${at} Members: Next goes to page 2, still no scroll`, (await page.locator('[data-pager] [aria-current="page"]').innerText()) === '2' && (await overflow()) <= 2);

    t = await visit('/trainers', `vol-trainers-${w}`);
    rows = await page.locator('[data-trainer-row]').count();
    has(`${at} Trainers: 24 coaches, the page does not scroll`, (await overflow()) <= 2 && /of 24 trainers/.test(t));
    has(`${at} Trainers: the table pages by what fits (${rows} rows), not a fixed eight`, rows >= 3 && rows < 24 && (await pagerButtons()) <= 7);

    t = await visit('/coaching', `vol-coaching-${w}`);
    rows = await page.locator('[data-coaching-row]').count();
    has(`${at} Coaching: 120 coachings, the page does not scroll`, (await overflow()) <= 2);
    has(`${at} Coaching: the table never runs off sideways (its last button is fully inside)`, await page.evaluate(() => { const b = document.querySelector('[data-coaching-list] .a-scroll'); return !!b && b.scrollWidth <= b.clientWidth + 1; }));
    await page.locator('[data-chip="all"]').click(); await page.waitForTimeout(300);
    has(`${at} Coaching: All — the table shows what fits (${await page.locator('[data-coaching-row]').count()} rows) with a short pager (${await pagerButtons()} buttons)`,
      (await page.locator('[data-coaching-row]').count()) < 40 && (await pagerButtons()) <= 7 && (await overflow()) <= 2);
    has(`${at} Coaching: 15 payments and 24 coaches show a short preview with See all, and no card is squeezed`, (await page.locator('[data-see-all-pay]').innerText()).includes('15')
      && (await page.locator('[data-see-all-load]').innerText()).includes('24') && (await page.locator('[data-coach-load] [data-tip]').count()) === 4
      && (await page.evaluate(() => [...document.querySelectorAll('.coaching-side > .a-card')].every((e) => e.scrollHeight <= e.clientHeight + 2))));
    await page.locator('[data-view-all]').click(); await page.waitForTimeout(400);
    has(`${at} Coaching: View all opens every coaching in a floating window (${await page.locator('[data-window-row]').count()})`, (await page.locator('[data-coaching-window] [data-window-row]').count()) === 120);
    await page.screenshot({ path: `shots/vol-coaching-window-${w}.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.locator('[data-see-all-pay]').click(); await page.waitForTimeout(300);
    has(`${at} Coaching: See all payments lists all 15 to confirm`, (await page.locator('[data-pay-window] button', { hasText: /^Confirm$/ }).count()) === 15);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.locator('[data-see-all-load]').click(); await page.waitForTimeout(300);
    has(`${at} Coaching: See all coaches lists all 24`, (await page.locator('[data-load-window] [data-tip]').count()) === 24);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/vol-coaching-all-${w}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  return out.join('\n');
}
