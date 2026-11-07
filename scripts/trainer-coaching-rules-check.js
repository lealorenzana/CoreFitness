/**
 * Coaching house rules (0235) on the coach's side, in light and dark: Today
 * asks "Pause their coaching?" only for this coach's own trainees, and Pause
 * too / Keep running sends the decision; Packages → Your pay shows what members
 * paid the coach, the gym's share, and the coach's dues with "Behind" counted
 * from unpaid months before this one. Judged as admin-light-check.js in light.
 *
 * Fixture from trainer-coaching-check.js. Member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const s = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < s.length; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const now = new Date();
  const iso = (d, h, m) => { const x = new Date(now); x.setDate(now.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };

  const ME = { id: 't1', first_name: 'Kenji', last_name: 'Ramos', email: 'kenji@corefitness-test.com',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) };
  const M1 = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness-test.com',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-120, 9, 0) };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 't1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 't1', aud: 'authenticated', role: 'authenticated', email: ME.email, app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('user', JSON.stringify({ id: 't1', name: 'Kenji Ramos', email: 'kenji@corefitness-test.com', role: 'trainer' }));
  }, [KEY, session]);

  const REASONS = [
    { key: 'schedule_conflict', label: 'Schedule conflict', applies_to: 'any', needs_note: false, sort_order: 10 },
    { key: 'trainer_unavailable', label: 'Trainer unavailable', applies_to: 'trainer', needs_note: false, sort_order: 40 },
    { key: 'changed_plans', label: 'Changed plans', applies_to: 'member', needs_note: false, sort_order: 60 },
    { key: 'other', label: 'Other', applies_to: 'any', needs_note: true, sort_order: 999 },
  ];

  const TABLES = {
    profiles: [ME, M1],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength', bio: null, availability: null,
      years_experience: 10, certifications: null, focus_areas: null, achievements: null, profiles: ME }],
    member_profiles: [{ profile_id: 'm1', qr_code: 'm1', experience_level: 'intermediate',
      created_at: M1.created_at, profiles: M1 }],
    my_trainer_members: [{ member_id: 'm1', name: 'Lea Lorenzana', photo_url: null,
      experience_level: 'intermediate', last_visit: iso(-1, 7, 0), visits_last_30: 4, upcoming_with_me: 1 }],
    classes: [], class_availability: [],
    // The desk alone decides classes at this gym.
    bookings: [{ id: 'bk1', member_id: 'm1', class_id: 'c1', status: 'pending', requested_at: iso(-1, 8, 0),
      approved_at: null, rejected_at: null, approved_by: null, coach_ok_by: null, coach_ok_at: null,
      classes: { id: 'c1', name: 'HIIT', trainer_id: 't1', scheduled_at: iso(3, 7, 0), capacity: 10 } }],
    pt_sessions: [
      // Coach, then desk, and this coach has already accepted: waiting for the desk.
      { id: 'ptA', member_id: 'm1', trainer_id: 't1', starts_at: iso(4, 9, 0), duration_minutes: 60,
        status: 'pending', notes: null, payment_id: null, requested_at: iso(-1, 9, 0), created_at: iso(-1, 9, 0),
        coach_ok_by: 't1', coach_ok_at: iso(0, 8, 0) },
      // Coach, then desk, not yet accepted: the coach still decides first.
      { id: 'ptB', member_id: 'm1', trainer_id: 't1', starts_at: iso(5, 9, 0), duration_minutes: 60,
        status: 'pending', notes: null, payment_id: null, requested_at: iso(-1, 10, 0), created_at: iso(-1, 10, 0),
        coach_ok_by: null, coach_ok_at: null },
    ],
    cancellation_reasons: REASONS,
    trainer_payment_methods: [{ id: 'pm1', trainer_id: 't1', kind: 'gcash', label: 'GCash', account_name: 'Kenji Ramos',
      account_number: '0917 000 1111', qr_url: null, active: true, created_at: iso(-3, 9, 0) }],
    memberships: [], membership_plans: [], notifications: [], attendance: [],
    trainer_availability: [], trainer_credentials: [], trainer_feedback: [],
    trainer_ratings: [], trainer_busy_slots: [], workout_logs: [], body_measurements: [],
    fitness_goals: [], achievements: [], achievement_unlocks: [], member_share_prefs: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao', phone: '+63 917 555 0101',
      email: 'hello@corefitness.ph', opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, activity_options: [], updated_at: iso(0, 9, 0), updated_by: null }],
    notification_prefs: [{ member_id: 't1', bookings: true, payments: true, announcements: true }],
    push_subscriptions: [], events: [], workout_resources: [], class_templates: [],
  };
  const RPC = {
    my_trainer_ratings: [], trainer_schedule_conflicts: [], sweep_stale_requests: 0,
    my_features: [], plan_allows: true,
    member_progression: [{ level: 2, points: 90, next_level_points: 300 }],
    sync_my_achievements: 0,
    my_booking_modes: [{ class_mode: 'desk', pt_mode: 'coach_desk' }],
  };

  let cancelCall = null;
  const CC = [];
  const row = (o) => ({ member_id: 'm1', member_name: 'Lea Lorenzana', member_photo: null, trainer_id: 't1', trainer_name: 'Kenji Ramos',
    trainer_photo: null, kind: 'pt', room_id: null, months: 3, fee_mode: 'trainer_direct', price: null, pay_reference: null,
    pay_sent_at: null, starts_on: null, ends_on: null, started_by: 'member', created_at: iso(-1, 9, 0), standin_id: null,
    standin_trainer_id: null, standin_name: null, standin_from: null, standin_to: null, group_code: null, i_am: 'coach', ...o });
  const COACHINGS = [
    row({ id: 'k1', status: 'requested' }),
    row({ id: 'k2', member_id: 'm2', member_name: 'Ana Reyes', status: 'payment_sent', price: 1500, pay_reference: 'GC-777' }),
    row({ id: 'k3', member_id: 'm3', member_name: 'Joy Tan', status: 'active', room_id: 'rm3', starts_on: '2026-10-01', ends_on: '2027-01-01' }),
  ];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-1/2', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness', slug: 'core-fitness', role: 'trainer',
        status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true }]);
      const cb = JSON.parse(req.postData() || '{}');
      if (fn === 'coaching_settings') return json([{ modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee_mode: 'trainer_direct' }]);
      if (fn === 'my_coachings') return json(COACHINGS);
      if (fn === 'coaching_sweep') return json(0);
      if (fn === 'my_payment_account') return json(null);
      if (['respond_coaching', 'confirm_coaching_payment', 'invite_coaching'].includes(fn)) { CC.push([fn, cb]); return json('ok'); }
      if (fn === 'cancel_booking') { cancelCall = req.postData() ?? ''; return json(null); }
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1];
      const rows = TABLES[t] ?? [];
      if (req.method() !== 'GET') return json(one ? (rows[0] ?? {}) : rows.slice(0, 1));
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
    const rgb = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
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
      if (c && c[3] > 0.8 && lum(c) < 0.05 && r.width * r.height > 900) bad.push(`dark block ${tag(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(bad)].slice(0, 10);
  });

  const H2 = { 'Access-Control-Allow-Origin': '*' };
  const ok = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify(b) });
  const argsOf = (r) => { try { return JSON.parse(r.request().postData() || '{}'); } catch { return {}; } };
  const manila = new Date(Date.now() + 8 * 3600000);
  const monthKey = (back) => new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
  const THIS = monthKey(0), LAST = monthKey(1), BEFORE = monthKey(2);
  const calls = [];
  // Joy (on a package with this coach) froze; the gym lets the coach decide. Lea's pause belongs to another coach.
  const PAUSES = [
    { id: 'pz1', coaching_id: 'k3', member_id: 'm3', member_name: 'Joy Tan', trainer_id: 't1', trainer_name: 'Kenji Ramos',
      frozen_on: '2026-11-05', decision: 'pending', resumed_on: null, days_credited: null, ends_on: '2027-01-01' },
    { id: 'pz2', coaching_id: 'kx', member_id: 'm9', member_name: 'Other Person', trainer_id: 't9', trainer_name: 'Someone Else',
      frozen_on: '2026-11-04', decision: 'pending', resumed_on: null, days_credited: null, ends_on: null },
  ];
  await page.route('**/rest/v1/rpc/coaching_house_rules', (r) => ok(r, [{ pause: 'coach_decides', cut_on: true, cut_percent: 10, dues_on: true, dues_amount: 500 }]));
  await page.route('**/rest/v1/rpc/my_coaching_pauses', (r) => ok(r, PAUSES));
  await page.route('**/rest/v1/rpc/decide_coaching_pause', (r) => { calls.push(['decide', argsOf(r)]); ok(r, null); });
  await page.route('**/rest/v1/rpc/coach_earnings', (r) => ok(r, [
    { month: THIS, paid_total: 4500, packages: 3, percent: 10, owed: 450, settled: false },
    { month: LAST, paid_total: 3000, packages: 2, percent: 10, owed: 300, settled: true },
  ]));
  // This month unpaid (only due), last month unpaid (behind), the month before paid.
  await page.route('**/rest/v1/rpc/coach_dues', (r) => ok(r, [
    { month: THIS, due: 500, paid: null, method: null },
    { month: LAST, due: 500, paid: null, method: null },
    { month: BEFORE, due: 500, paid: 500, method: 'cash' },
  ]));
  await page.route('**/rest/v1/rpc/my_color_mode', (r) => ok(r, 'system'));

  await page.setViewportSize({ width: 393, height: 852 });
  const out = [];
  const say = (label, good, extra = '') => out.push(`${label}: ${good ? 'yes' : 'MISSING ' + extra}`);
  const go = async (p) => {
    await page.goto('http://localhost:5173' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2500);
  };
  await page.emulateMedia({ colorScheme: 'light' });

  // ---- Today: the coach decides Joy's pause ----
  await go('/trainer/home');
  const box = page.locator('[data-coaching-pauses]');
  await box.waitFor({ timeout: 12000 }).catch(() => {});
  const asks = page.locator('[data-pause-ask]');
  say("Today asks about Joy's pause, and only this coach's trainees", (await asks.count()) === 1
    && /Joy Tan paused their membership/.test((await box.count()) ? await box.innerText() : ''), (await box.count()) ? await box.innerText() : '(no section)');
  let f = await faint();
  say('the question is right in light (words, fills, lines)', f.length === 0, f.join(' | '));
  if (await box.count()) await box.screenshot({ path: 'shots/coach-pause-light.png' });
  if (await asks.count()) {
    await asks.first().getByRole('button', { name: 'Pause too' }).click();
    await page.waitForTimeout(900);
  }
  const d = calls.find((c) => c[0] === 'decide');
  say('Pause too sends pause = yes for that pause', !!d && d[1].p_id === 'pz1' && d[1].p_pause === true, JSON.stringify(d));
  say('…and the question goes away', (await page.locator('[data-pause-ask]').count()) === 0);

  // ---- Packages → Your pay ----
  await go('/trainer/packages?tab=pay');
  const money = page.locator('[data-coach-money]');
  await money.waitFor({ timeout: 12000 }).catch(() => {});
  const mt = (await money.count()) ? (await money.innerText()).replace(/\s+/g, ' ') : '(no Your pay)';
  const fits = await page.evaluate(() => { const l = document.querySelector('[role="tablist"]'); return l ? [l.scrollWidth, l.clientWidth] : null; });
  say('the tab row fits the phone, nothing cut off', !!fits && fits[0] <= fits[1] + 1, JSON.stringify(fits));
  say('a Money tab holds it', (await page.getByRole('tab', { name: 'Money' }).count()) === 1);
  say("this month: 4,500 paid to the coach, the gym's 10% is 450, not given yet", /₱4,500/.test(mt) && /10% is ₱450/.test(mt) && /Not given yet/.test(mt), mt.slice(0, 300));
  say('last month shows as given', /₱3,000 paid to you/.test(mt) && /Given/.test(mt), mt.slice(0, 300));
  say('dues: 500 for this month, behind by 1 month (last month unpaid)', /₱500 for/.test(mt) && /Behind · 1 month\b/.test(mt), mt.slice(0, 400));
  say('says being behind never stops them coaching', /never stops you coaching/.test(mt));
  f = await faint();
  say('Your pay is right in light (words, fills, lines)', f.length === 0, f.join(' | '));
  await page.screenshot({ path: 'shots/coach-pay-tab-light.png' });

  // ---- dark, to look at ----
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/trainer/packages?tab=pay');
  await page.screenshot({ path: 'shots/coach-pay-tab-dark.png' });
  return out.join(String.fromCharCode(10));
}
