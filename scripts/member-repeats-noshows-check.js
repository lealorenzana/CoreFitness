/**
 * The member's side of 0260 (repeat bookings, no-shows, late cancels): Your sessions sweeps first, tells a paused
 * member why and until when, shows the gym's own mark on a past session (a no-show says how to have it undone), a
 * late cancel says so, Repeat weekly asks how many weeks (2 … the gym's maximum) and sends it, the member's running
 * repeats list a week that could not be booked with its reason and can be stopped, the cancel dialog says before
 * confirming that this cancel is inside the gym's window (and blocks it when the gym says so), and the Terms read
 * the gym's own rules. 393px, light and dark. Member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = () => ({ id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'mia@example.test', app_metadata: { providers: ['email'] }, user_metadata: {}, identities: [] });
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: user(),
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  const CALLS = [];
  const now = Date.now();
  const at = (h) => new Date(now + h * 3600_000).toISOString();
  const base = { trainer_id: 't1', member_id: 'u1', duration_minutes: 60, notes: null, requested_at: at(-200), approved_at: at(-199), approved_by: null,
    decided_by: null, decided_by_role: 'system', decided_at: at(-199), payment_id: null, gym_id: 'gym-1', attended: null, late_cancel: false, repeat_id: null };
  const PT = [
    { ...base, id: 'p-miss', starts_at: at(-50), status: 'approved', attended: 'no_show' },
    { ...base, id: 'p-late', starts_at: at(-20), status: 'cancelled', late_cancel: true, cancelled_by_role: 'member', cancellation_reason: 'changed_plans' },
    { ...base, id: 'p-soon', starts_at: at(1), status: 'approved' },
    { ...base, id: 'p-later', starts_at: at(72), status: 'approved' },
  ];
  const RULES = { repeats_on: true, noshows_on: true, repeat_who: ['member'], repeat_kind: 'weeks', repeat_max_weeks: 4, repeat_ahead_days: 7,
    class_cancel_minutes: 0, pt_cancel_minutes: 120, slot_cancel_minutes: 0, late_cancel_mode: 'mark', noshow_mode: 'auto_coach',
    noshow_window_minutes: 60, noshow_tell: true, noshow_counts_used: true, noshow_pause: true, noshow_pause_count: 3,
    noshow_pause_within_days: 30, noshow_pause_days: 7, my_pause: { until: at(100), reason: '3 no-shows or late cancels in 30 days' } };
  const REPEATS = [{ id: 'r1', member_id: 'u1', member_name: 'Mia Reyes', kind: 'pt', what: '1-on-1 with Ben Cruz', weekday: 2, starts: '18:00:00',
    weeks: 4, first_date: '2026-11-17', created_by_role: 'member', stopped_at: null, stop_reason: null,
    week_list: [{ date: '2026-11-17', outcome: 'booked', message: null, booking_id: 'x1' }, { date: '2026-11-24', outcome: 'refused', message: 'That clashes with your class', booking_id: null }] }];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-${Math.max(0, (Array.isArray(b) ? b.length : 1) - 1)}/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_color_mode_asked') return json(true);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', short_name: null, logo_url: null,
        accent: 'violet', accent_action: null, points_name: null, points_name_short: null, welcome_message: null, tagline: null,
        vocabulary: null, join_policy: 'open', join_code: null, modules: { repeats: true, noshows: true } }]);
      if (fn === 'my_booking_modes') return json([{ class_mode: 'instant', pt_mode: 'instant' }]);
      if (fn === 'gym_booking_rules') return json(RULES);
      if (fn === 'booking_repeats_for') return json(REPEATS);
      if (['settle_no_shows', 'extend_repeats', 'repeat_booking', 'stop_repeat', 'cancel_booking'].includes(fn)) { CALLS.push([fn, body]); return json(fn === 'repeat_booking' ? 'r2' : 0); }
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: 'member', status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    if (t === 'pt_sessions') return json(one ? PT[0] : PT);
    if (t === 'cancellation_reasons') return json([{ key: 'changed_plans', label: 'Changed plans', applies_to: 'member', needs_note: false, sort_order: 60, is_active: true }]);
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto('about:blank');
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(2200);
  };
  const main = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/member/sessions');
  say('Your sessions sweeps first (no-shows, repeats)', CALLS.some(([f]) => f === 'settle_no_shows') && CALLS.some(([f]) => f === 'extend_repeats'));
  say('a paused member is told why and until when', /can’t book in the app until .*3 no-shows or late cancels in 30 days.*front desk can still book/.test(await main()));
  const rep = page.locator('[data-my-repeats]');
  say('the running repeat is listed, with the week that could not be booked and why', /1-on-1 with Ben Cruz/.test(await rep.innerText()) && /not booked — That clashes with your class/.test(await rep.innerText()));
  await page.screenshot({ path: 'shots/member-sessions-repeats-dark.png', fullPage: false });
  await rep.getByRole('button', { name: 'Stop' }).click(); await page.waitForTimeout(800);
  say('…and Stop sends stop_repeat', CALLS.some(([f, b]) => f === 'stop_repeat' && b.p_id === 'r1'));

  await page.locator('[data-repeat-weekly]').first().click(); await page.waitForTimeout(600);
  const dlg = page.locator('[data-repeat-dialog]');
  const dtext = (await dlg.innerText()).replace(/\s+/g, ' ');
  say('Repeat weekly asks how many weeks — 2 to the gym’s 4, no more', /2 weeks.*3 weeks.*4 weeks/.test(dtext) && !/5 weeks/.test(dtext), dtext);
  await dlg.getByText('3 weeks').click();
  await page.getByRole('button', { name: 'Repeat for 3 weeks' }).click(); await page.waitForTimeout(900);
  const r = CALLS.filter(([f]) => f === 'repeat_booking').pop();
  say('…and sends the booking and 3 weeks', r && r[1].p_kind === 'pt' && r[1].p_weeks === 3, JSON.stringify(r));

  // The soonest session starts in an hour; the gym's 1-on-1 window is 2 hours, a late cancel is marked.
  await page.getByRole('button', { name: 'Cancel' }).first().click(); await page.waitForTimeout(900);
  say('the cancel dialog says, before confirming, that this is a late cancel and what that means', /within 2 hours of the start.*late cancel.*counts like a no-show/.test((await page.locator('[data-late-window]').innerText().catch(() => '')).replace(/\s+/g, ' ')));
  await page.screenshot({ path: 'shots/member-cancel-late-dark.png' });
  await page.getByRole('button', { name: 'Keep it' }).click(); await page.waitForTimeout(400);
  RULES.late_cancel_mode = 'block';
  await go('/member/sessions');
  await page.getByRole('button', { name: 'Cancel' }).first().click(); await page.waitForTimeout(900);
  say('when the gym blocks late cancels, the dialog says ask the desk and will not confirm',
    /too late to cancel in the app — ask the front desk/.test(await page.locator('[data-late-window]').innerText().catch(() => ''))
    && await page.getByRole('button', { name: 'Confirm cancellation' }).isDisabled());
  await page.getByRole('button', { name: 'Keep it' }).click(); await page.waitForTimeout(400);
  RULES.late_cancel_mode = 'mark';

  await page.getByRole('tab', { name: /Past/ }).click().catch(async () => page.getByText(/^Past ·/).click());
  await page.waitForTimeout(600);
  say('a past session shows the gym’s mark, and how to have a wrong one undone', /Marked as a no-show — if you were there, tell the front desk or your coach/.test(await main()));
  await page.getByRole('tab', { name: /Cancelled/ }).click().catch(async () => page.getByText(/^Cancelled ·/).click());
  await page.waitForTimeout(600);
  say('a late cancel says so', /a late cancel/.test(await main()));
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  say('nothing runs off the side at 393px', sideways <= 0, `(${sideways}px)`);
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/member-sessions-light.png' });

  await go('/terms');
  const terms = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  say('the Terms read the gym’s own cut-off and what a late cancel means', /At your gym you can cancel classes up to until it starts, 1-on-1 sessions up to 2 hours before/.test(terms) && /counts like a no-show/.test(terms));
  say('…its repeat rule and its no-show rule, never points', /At your gym, you can set a booking to repeat for up to 4 weeks/.test(terms) && /after 3 no-shows or late cancels in 30 days you cannot book in the app for 7 days/.test(terms) && /never takes away points/.test(terms));
  say('…and the date moved with the wording', /15 November 2026/.test(terms));
  return out.join(String.fromCharCode(10));
}
