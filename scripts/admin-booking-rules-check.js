/**
 * Settings → Bookings: repeat bookings, late cancels and no-shows (0260), every rule the owner's. Both parts say
 * they are off until switched on (and where); who may repeat (any mix, never none), how (weeks / until stopped, its
 * number); a window per kind and "Use the same for all"; what a late cancel does; who decides a no-show, the
 * check-in window, the effects and the pause numbers. Then Bookings: a past confirmed session offers Came / No-show
 * (mark_attendance) and the mark shows; a late cancel and a weekly booking are labelled; the desk's Repeat sends the
 * weeks. Light and dark; the pages never scroll. Setup copied from admin-time-slots-check.js. Admin dev server :5174.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const now = Date.now();
  const at = (h) => new Date(now + h * 3600_000).toISOString();
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: at(-9000) };
  const SETTINGS = { gym_styles: ['pt_appointments'], class_booking_approval: 'instant', pt_booking_approval: 'instant' };
  const base = { trainer_id: 't1', member_id: 'm1', duration_minutes: 60, notes: null, requested_at: at(-100), approved_at: at(-99), approved_by: null,
    decided_by: null, decided_by_role: 'system', decided_at: at(-99), payment_id: null, gym_id: 'gym-1' };
  const PT = [
    { ...base, id: 'p-past', starts_at: at(-0.05), status: 'approved', attended: null, late_cancel: false, repeat_id: null },
    { ...base, id: 'p-late', starts_at: at(2), status: 'cancelled', attended: null, late_cancel: true, repeat_id: null, cancelled_by_role: 'member' },
    { ...base, id: 'p-weekly', starts_at: at(30), status: 'approved', attended: null, late_cancel: false, repeat_id: 'r1' },
    { ...base, id: 'p-ahead', starts_at: at(50), status: 'approved', attended: null, late_cancel: false, repeat_id: null },
  ];
  const TABLES = { profiles: [admin], notifications: [], gym_settings: [SETTINGS], pt_sessions: PT };

  const CALLS = [];
  const RULES = { repeats_on: false, noshows_on: false, repeat_who: ['member'], repeat_kind: 'weeks', repeat_max_weeks: 4, repeat_ahead_days: 7,
    class_cancel_minutes: 0, pt_cancel_minutes: 0, slot_cancel_minutes: 0, late_cancel_mode: 'mark', noshow_mode: 'auto_coach',
    noshow_window_minutes: 60, noshow_tell: true, noshow_counts_used: true, noshow_pause: false, noshow_pause_count: 3,
    noshow_pause_within_days: 30, noshow_pause_days: 7, my_pause: null };
  const RPC = { my_gym_app: [{ modules: { points: true } }] };
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'gym_booking_rules') return json(RULES);
      if (fn === 'set_repeat_rules') { CALLS.push({ fn, body }); Object.assign(RULES, { repeat_who: body.p_who, repeat_kind: body.p_kind, repeat_max_weeks: body.p_max_weeks, repeat_ahead_days: body.p_ahead_days }); return json(null); }
      if (fn === 'set_cancel_rules') { CALLS.push({ fn, body }); Object.assign(RULES, { class_cancel_minutes: body.p_class, pt_cancel_minutes: body.p_pt, slot_cancel_minutes: body.p_slot, late_cancel_mode: body.p_mode }); return json(null); }
      if (fn === 'set_noshow_rules') { CALLS.push({ fn, body }); Object.assign(RULES, { noshow_mode: body.p_mode, noshow_window_minutes: body.p_window, noshow_pause: body.p_pause, noshow_pause_count: body.p_count }); return json(null); }
      if (fn === 'mark_attendance' || fn === 'repeat_booking') { CALLS.push({ fn, body }); return json(fn === 'repeat_booking' ? 'r9' : null); }
      if (fn === 'settle_no_shows' || fn === 'extend_repeats') { CALLS.push({ fn, body }); return json(0); }
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const rows = TABLES[t] ?? [];
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const go = async (path) => { await page.goto('about:blank'); await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2600); };
  const last = (fn) => CALLS.filter((x) => x.fn === fn).pop();

  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/settings?tab=bookings');
  say('Settings → Bookings has the three cards', (await page.locator('[data-booking-rules] [data-rules-repeats], [data-booking-rules] [data-rules-late], [data-booking-rules] [data-rules-noshows]').count()) === 3);
  say('…repeats and no-shows say they are off, and where to switch them on', (await page.locator('[data-part-off] a[href="/gym-app?tab=runs"]').count()) === 2);
  say('…members set repeats by default', (await page.locator('[data-repeat-who="member"][aria-pressed="true"]').count()) === 1
    && (await page.locator('[data-repeat-who="desk"][aria-pressed="false"]').count()) === 1);

  await page.locator('[data-repeat-who="desk"]').click(); await page.waitForTimeout(600);
  let c = last('set_repeat_rules');
  say('adding the front desk saves members + desk', c && JSON.stringify([...c.body.p_who].sort()) === '["desk","member"]', JSON.stringify(c));
  await page.locator('[data-repeat-who="member"]').click(); await page.waitForTimeout(400);
  await page.locator('[data-repeat-who="desk"]').click(); await page.waitForTimeout(600);
  c = last('set_repeat_rules');
  say('…and never nobody (the last one cannot be taken away)', c && c.body.p_who.length >= 1, JSON.stringify(c));
  await page.locator('[data-choice="repeat-kind:until_stopped"]').click(); await page.waitForTimeout(600);
  c = last('set_repeat_rules');
  say('"until it is stopped" saves, and asks how far ahead instead of how many weeks', c && c.body.p_kind === 'until_stopped'
    && (await page.locator('[data-rule="repeat_ahead_days"]').count()) === 1 && (await page.locator('[data-rule="repeat_max_weeks"]').count()) === 0, JSON.stringify(c));

  await page.locator('[data-rule="class_cancel_minutes"]').fill('120');
  await page.locator('[data-rule="pt_cancel_minutes"]').click(); await page.waitForTimeout(600);
  c = last('set_cancel_rules');
  say('a window per kind: classes 120 minutes, the rest untouched', c && c.body.p_class === 120 && c.body.p_pt === 0 && c.body.p_slot === 0, JSON.stringify(c));
  await page.locator('[data-same-for-all]').click(); await page.waitForTimeout(600);
  c = last('set_cancel_rules');
  say('"Use the same for all" sets all three at once', c && c.body.p_pt === 120 && c.body.p_slot === 120, JSON.stringify(c));
  say('…and the shortcut goes once they match', (await page.locator('[data-same-for-all]').count()) === 0);
  say('"Allowed, marked late" is the default', (await page.locator('[data-choice="late-mode:mark"][aria-checked="true"]').count()) === 1);
  await page.locator('[data-rule="pt_cancel_minutes"]').fill('99999');
  await page.locator('[data-rule="class_cancel_minutes"]').click(); await page.waitForTimeout(600);
  c = last('set_cancel_rules');
  say('an impossible window is held to 24 hours', c && c.body.p_pt === 1440, JSON.stringify(c));

  say('no-shows: check-in for classes, the coach for 1-on-1, by default', (await page.locator('[data-choice="noshow-mode:auto_coach"][aria-checked="true"]').count()) === 1);
  say('…the hand-only choice tells owners whose desk does not scan everyone', /does not scan everyone/.test(await page.locator('[data-choice="noshow-mode:hand"]').innerText()));
  await page.locator('[data-toggle="noshow-pause"]').click(); await page.waitForTimeout(700);
  c = last('set_noshow_rules');
  say('switching the pause on saves it, and its three numbers appear', c && c.body.p_pause === true && (await page.locator('[data-pause-rules] input').count()) === 3, JSON.stringify(c));
  say('…never points', /never take points away/.test(await page.locator('[data-rules-noshows]').innerText()));
  await page.locator('[data-choice="noshow-mode:off"]').click(); await page.waitForTimeout(700);
  say('"Do not track" saves and hides the rest', last('set_noshow_rules')?.body.p_mode === 'off' && (await page.locator('[data-toggle="noshow-tell"]').count()) === 0);
  let scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('the page itself does not scroll', scroll <= 0, `(${scroll}px)`);
  await page.screenshot({ path: 'shots/admin-booking-rules-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/admin-booking-rules-light.png' });

  // Bookings, with both parts on.
  Object.assign(RULES, { repeats_on: true, noshows_on: true, noshow_mode: 'auto_coach', repeat_who: ['desk'], repeat_kind: 'weeks', repeat_max_weeks: 4 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/personal-training?tab=sessions');
  if ((await page.locator('[data-bookings]').count()) === 0) await go('/bookings');
  say('the page sweeps first (no-shows, repeats)', CALLS.some((x) => x.fn === 'settle_no_shows') && CALLS.some((x) => x.fn === 'extend_repeats'));
  // Started three minutes ago: today's row in By day (the week view).
  const past = page.locator('[data-booking-row]').filter({ has: page.locator('[data-mark-buttons]') });
  say('a past confirmed session offers Came / No-show', (await past.count()) === 1);
  await past.getByRole('button', { name: 'No-show' }).click(); await page.waitForTimeout(800);
  c = last('mark_attendance');
  say('…No-show sends mark_attendance(pt, came = false)', c && c.body.p_kind === 'pt' && c.body.p_id === 'p-past' && c.body.p_came === false, JSON.stringify(c));
  say('…and the row says No-show', (await page.locator('[data-mark="no_show"]').count()) === 1);
  await page.getByRole('button', { name: 'Next 30 days' }).click(); await page.waitForTimeout(800);
  say('a weekly booking is labelled', (await page.locator('[data-repeating]').count()) >= 1);
  await page.locator('[data-desk-repeat-btn]').first().click(); await page.waitForTimeout(500);
  await page.locator('[data-desk-repeat] [role="radio"]', { hasText: '3 weeks' }).click();
  await page.getByRole('button', { name: 'Repeat for 3 weeks' }).click(); await page.waitForTimeout(800);
  c = last('repeat_booking');
  say('the desk repeats a booking for 3 weeks', c && c.body.p_id === 'p-ahead' && c.body.p_weeks === 3 && c.body.p_kind === 'pt', JSON.stringify(c));
  scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('Bookings does not scroll', scroll <= 0, `(${scroll}px)`);
  await page.screenshot({ path: 'shots/admin-booking-marks-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/admin-booking-marks-light.png' });
  return out.join(String.fromCharCode(10));
}
