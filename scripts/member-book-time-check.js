/**
 * Time slots on the member's side (0259): Today offers Book a time only at a gym that runs slots (and never before
 * the database has the switch); Book a time shows the gym's own rules in words, the days the gym lets members book
 * ahead, each slot with how full it is, Book / Full / Cancel; booking sends the day and the time; the booked slot
 * shows on Today; light and dark. Member dev server on :5173.
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
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return ymd(x); };
  const STATE = { on: true, door: 'reserve', mine: null };
  const slotsFor = (day) => [
    { slot_date: day, starts: '06:00:00', ends: '07:30:00', capacity: 30, booked: 12, walk_ins: 3, my_booking: day === STATE.mine ? 'b1' : null },
    { slot_date: day, starts: '22:00:00', ends: '23:30:00', capacity: 2, booked: 2, walk_ins: 0, my_booking: null },
    { slot_date: day, starts: '23:30:00', ends: '23:59:00', capacity: 30, booked: 4, walk_ins: 0, my_booking: null },
  ];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? user() : { ...session, user: user() });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab',
        role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_color_mode_asked') return json(true);
      if (fn === 'my_gym_app') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', short_name: null, logo_url: null,
        accent: 'violet', accent_action: null, points_name: null, points_name_short: null, welcome_message: null, tagline: null,
        vocabulary: null, join_policy: 'open', join_code: null, modules: STATE.on === null ? {} : { slots: STATE.on } }]);
      if (fn === 'gym_slot_settings') return json({ on: !!STATE.on, door: STATE.door, ahead_days: 2, per_day: 1, cancel_minutes: 30, desk_override: true });
      if (fn === 'gym_slots') {
        const days = Number(body.p_days ?? 0);
        return json(Array.from({ length: days + 1 }, (_, i) => { const x = new Date(`${body.p_from}T00:00`); x.setDate(x.getDate() + i); return slotsFor(ymd(x)); }).flat());
      }
      if (fn === 'book_slot') { CALLS.push([fn, body]); STATE.mine = body.p_date; return json('b1'); }
      if (fn === 'cancel_slot') { CALLS.push([fn, body]); STATE.mine = null; return json(null); }
      return json(null);
    }
    const t = path.split('/rest/v1/')[1];
    if (t === 'profiles' || t === 'gym_people') {
      const me = { id: 'u1', role: 'member', status: 'active', first_name: 'Mia', last_name: 'Reyes', email: 'mia@example.test', photo_url: null };
      return json(one ? me : [me]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  await page.setViewportSize({ width: 393, height: 852 });
  const go = async (p) => {
    await page.goto('about:blank');
    await page.goto(`http://localhost:5173${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(1800);
  };
  const main = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    STATE.mine = null;
    await go('/member/home');
    say(`${mode}: Today offers Book a time`, (await page.locator('[data-book-time]').count()) === 1 && /Book a time/.test(await page.locator('[data-book-time]').innerText()));
    await page.locator('[data-book-time]').click();
    await page.waitForTimeout(1500);
    const m = await main();
    say(`${mode}: it opens Book a time`, /\/member\/slots$/.test(page.url()) && /Book a time/.test(m), page.url());
    say(`${mode}: the gym's own rules, in words`, /Your booking keeps your place; others come in while there is room\. One slot a day\. Cancel up to 30 minutes before\./.test(m), m.slice(0, 260));
    const chips = await page.locator('[role="tablist"] button').count();
    say(`${mode}: today and the 2 days the gym allows ahead`, chips === 3, String(chips));
    await page.locator('[role="tablist"] button').nth(1).click();
    await page.waitForTimeout(1200);
    const rows = await page.locator('[data-slot]').count();
    const fullRow = await page.locator('[data-full="true"]').innerText().catch(() => '');
    say(`${mode}: each slot with how full it is; a full one says Full and offers nothing`, rows === 3 && /Full/.test(fullRow)
      && (await page.locator('[data-full="true"] button').count()) === 0 && /15 of 30/.test(await main()), `${rows} ${fullRow}`);
    await page.screenshot({ path: `shots/member-book-time-${mode}.png` });
    if (mode === 'dark') {
      await page.locator('[data-slot]').first().getByRole('button', { name: 'Book' }).click();
      await page.waitForTimeout(1200);
      const b = CALLS.find(([f]) => f === 'book_slot');
      say('Book sends the day and the time', b && b[1].p_date === d(1) && b[1].p_starts === '06:00:00', JSON.stringify(b));
      say('…and the row says your place is kept, with Cancel', /Your place is kept/.test(await page.locator('[data-mine="true"]').innerText().catch(() => ''))
        && (await page.locator('[data-mine="true"]').getByRole('button', { name: 'Cancel' }).count()) === 1);
      await page.locator('[data-mine="true"]').getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(1200);
      say('Cancel sends the booking', CALLS.some(([f, x]) => f === 'cancel_slot' && x.p_id === 'b1'));
      STATE.mine = d(1);
      await go('/member/home');
      say('Today names the booked time', /Your time/.test(await page.locator('[data-book-time]').innerText().catch(() => '')));
    }
  }

  // A gym that runs no slots — and a database without the switch yet: nothing is offered, the page is gated.
  for (const [label, on] of [['switched off', false], ['before 0259 (no switch at all)', null]]) {
    STATE.on = on;
    await go('/member/home');
    say(`${label}: Today offers nothing`, (await page.locator('[data-book-time]').count()) === 0);
    await go('/member/slots');
    say(`${label}: Book a time does not open`, (await page.locator('[data-slots]').count()) === 0);
  }
  return out.join('\n');
}
