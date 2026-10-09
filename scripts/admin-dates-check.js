/**
 * Calendars obey one rule (2026-10-10, lib/dateRules.ts).
 *
 * An evaluator set the gym-wide goal to start in 2002. A challenge, the gym
 * goal and an event are FUTURE dates: no year before this one, no day before
 * today, and the month arrow will not page into the past. A date of birth is
 * a BIRTH date: 120 years back to 16 years ago, never the future.
 *
 * Setup copied from admin-switches-check.js. Admin dev server on :5174.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: '2025-03-01T00:00:00Z' };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/0', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{
        gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open', accent_action: null,
      }]);
      if (fn === 'my_support_grant') return json([]);
      return json(null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    if (t === 'gyms') return json(one ? { created_at: '2025-03-01T00:00:00Z' } : [{ created_at: '2025-03-01T00:00:00Z' }]);
    return json(one ? null : []);
  });

  const now = new Date();
  const thisYear = now.getFullYear();
  const out = [];

  // Reads the open calendar: the year list (after tapping the header), and
  // whether the previous-month arrow and yesterday are disabled.
  const readCalendar = async () => page.evaluate(() => {
    const pop = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Previous month');
    const panel = pop?.closest('div.p-3');
    const prevDisabled = pop?.disabled ?? null;
    const hint = panel?.querySelector('[data-date-hint]')?.textContent ?? '';
    const days = [...(panel?.querySelectorAll('.grid-cols-7.gap-0\\.5 button') ?? [])];
    return { prevDisabled, hint, enabledDays: days.filter((d) => !d.disabled).length, disabledDays: days.filter((d) => d.disabled).length };
  });
  const years = async () => {
    await page.locator('div.p-3 button.font-bold').first().click();
    await page.waitForTimeout(200);
    const ys = await page.evaluate(() => [...document.querySelectorAll('div.p-3 .grid-cols-4 button')].map((b) => Number(b.textContent)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    return ys;
  };

  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto('http://localhost:5174/challenges', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // ---- the gym-wide goal (the evaluator's 2002) ----
  const goalStart = page.locator('[aria-label="Goal starts"] button').first();
  if (await goalStart.count()) {
    await goalStart.click();
    await page.waitForTimeout(300);
    const cal = await readCalendar();
    out.push('gym goal: cannot page into last month: ' + (cal.prevDisabled ? 'yes' : 'FAILED'));
    out.push('gym goal: says what it allows: ' + (/From today/.test(cal.hint) ? cal.hint : 'MISSING'));
    const ys = await years();
    out.push('gym goal: no year before this one: ' + (ys.length && Math.min(...ys) === thisYear ? `yes (${Math.min(...ys)}–${Math.max(...ys)})` : 'FAILED ' + ys.join(',')));
    await page.keyboard.press('Escape');
  } else {
    out.push('gym goal: the form is on the page: MISSING');
  }

  // ---- a new challenge ----
  await page.getByRole('button', { name: /New challenge/ }).first().click();
  await page.waitForTimeout(500);
  // The form opens with today filled in, so find the pickers by their labels.
  const pickers = page.locator('label:has-text("Starts") button, label:has-text("Ends") button');
  out.push('challenge: both dates use the calendar: ' + ((await pickers.count()) >= 2 ? 'yes' : 'MISSING (' + (await pickers.count()) + ')'));
  if (!(await pickers.count())) {
    out.push('page says: ' + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600))));
    return out.join(' | ');
  }
  await pickers.first().click();
  await page.waitForTimeout(300);
  const ch = await readCalendar();
  const day = now.getDate();
  out.push('challenge: the days before today are disabled: ' + (day === 1 || ch.disabledDays >= day - 1 ? 'yes' : 'FAILED'));
  const chYears = await years();
  out.push('challenge: no year before this one: ' + (chYears.length && Math.min(...chYears) === thisYear ? 'yes' : 'FAILED ' + chYears.join(',')));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'shots/admin-dates-challenge.png' });

  // ---- a date of birth ----
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const add = page.getByRole('button', { name: /Add member/i }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(600);
    const dob = page.locator('button:has-text("Pick a date")').first();
    if (await dob.count()) {
      await dob.click();
      await page.waitForTimeout(300);
      const ys = await page.evaluate(() => [...document.querySelectorAll('div.p-3 .grid-cols-4 button')].map((b) => Number(b.textContent)));
      out.push('birth date: youngest year is 16 years ago: ' + (Math.max(...ys) === thisYear - 16 ? 'yes' : 'FAILED ' + Math.max(...ys)));
      out.push('birth date: oldest year is 120 years ago: ' + (Math.min(...ys) === thisYear - 120 ? 'yes' : 'FAILED ' + Math.min(...ys)));
      out.push('birth date: no future year offered: ' + (ys.every((y) => y <= thisYear) ? 'yes' : 'FAILED'));
    } else out.push('birth date: the picker is in the wizard: MISSING');
  } else out.push('birth date: Add member button: MISSING');
  return out.join('\n');
}
