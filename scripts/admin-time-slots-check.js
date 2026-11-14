/**
 * Settings → Time slots (0259), the owner's every rule: off until switched on (and says where); how the door treats a
 * slot and whether the desk may let someone in anyway; days ahead, slots a day, the cancel cut-off; the weekly grid
 * cut from the opening hours and edited by hand (add, remove). Light and dark; the page never scrolls.
 * Setup copied from admin-gym-styles-check.js. Admin dev server on :5174.
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

  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const SETTINGS = { gym_styles: ['classes', 'pt_appointments'], class_booking_approval: 'instant', pt_booking_approval: 'coach' };
  const TABLES = { profiles: [admin], notifications: [], gym_settings: [SETTINGS] };

  let ROLE = 'admin';
  const CALLS = [];
  const RULES = { on: false, door: 'reserve', ahead_days: 7, per_day: 1, cancel_minutes: 0, desk_override: true,
    opening_time: '06:00', closing_time: '22:00', closed_days: [0] };
  let SLOTS = [];
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
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: ROLE, status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'gym_slot_settings') return json(RULES);
      if (fn === 'slot_template_list') return json(SLOTS);
      if (fn === 'set_slot_settings') { const b = req.postDataJSON(); CALLS.push({ fn, body: b });
        Object.assign(RULES, { door: b.p_door, ahead_days: b.p_ahead_days, per_day: b.p_per_day, cancel_minutes: b.p_cancel_minutes, desk_override: b.p_desk_override }); return json(null); }
      if (fn === 'fill_slots_from_hours') { const b = req.postDataJSON(); CALLS.push({ fn, body: b });
        SLOTS = [1, 2, 3, 4, 5, 6].flatMap((d) => [['06:00:00', '07:30:00'], ['07:30:00', '09:00:00']].map(([s, e], i) => ({ id: `t${d}${i}`, day_of_week: d, starts: s, ends: e, capacity: b.p_capacity })));
        return json(SLOTS.length); }
      if (fn === 'save_slot_template') { const b = req.postDataJSON(); CALLS.push({ fn, body: b });
        SLOTS.push({ id: 'new', day_of_week: b.p_day, starts: `${b.p_starts}:00`, ends: `${b.p_ends}:00`, capacity: b.p_capacity }); return json('new'); }
      if (fn === 'delete_slot_template') { const b = req.postDataJSON(); CALLS.push({ fn, body: b }); SLOTS = SLOTS.filter((s) => s.id !== b.p_id); return json(null); }
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const rows = (TABLES[t] ?? []).map((r) => (t === 'profiles' ? { ...r, role: ROLE } : r));
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const say = (label, ok, why = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (why ? ' ' + why : '')}`);
  const go = async (path) => { await page.goto('about:blank'); await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
  page.on('dialog', (dg) => void dg.accept());

  await page.emulateMedia({ colorScheme: 'dark' });
  await go('/settings?tab=slots');
  say('Settings has Time slots', (await page.locator('[data-time-slots-settings]').count()) === 1);
  say('…off until switched on, and says where', /Time slots are off/.test(await page.locator('[data-slots-off]').innerText().catch(() => ''))
    && (await page.locator('[data-slots-off] a[href="/gym-app?tab=runs"]').count()) === 1);
  say('…a booking keeps a place, by default', (await page.locator('[data-door="reserve"][aria-checked="true"]').count()) === 1);
  await page.locator('[data-door="required"]').click();
  await page.waitForTimeout(700);
  let c = CALLS.filter((x) => x.fn === 'set_slot_settings').pop();
  say('choosing "Only members who booked" saves it', c && c.body.p_door === 'required', JSON.stringify(c));
  await page.locator('[data-desk-override]').click();
  await page.waitForTimeout(700);
  c = CALLS.filter((x) => x.fn === 'set_slot_settings').pop();
  say('…and the desk override can be switched off', c && c.body.p_desk_override === false, JSON.stringify(c));
  await page.locator('[data-rule="ahead_days"]').fill('3');
  await page.locator('[data-rule="per_day"]').click();
  await page.waitForTimeout(700);
  c = CALLS.filter((x) => x.fn === 'set_slot_settings').pop();
  say('days ahead is the owner’s number', c && c.body.p_ahead_days === 3, JSON.stringify(c));
  await page.locator('[data-rule="cancel_minutes"]').fill('99999');
  await page.locator('[data-rule="per_day"]').click();
  await page.waitForTimeout(700);
  c = CALLS.filter((x) => x.fn === 'set_slot_settings').pop();
  say('…and an impossible cut-off is held to 24 hours', c && c.body.p_cancel_minutes === 1440, JSON.stringify(c));

  say('closed days say so, empty days say the door ignores them', /closed/.test(await page.locator('[data-slot-day="0"]').innerText())
    && /No slots/.test(await page.locator('[data-slot-day="1"]').innerText()));
  await page.getByLabel('People per slot').fill('25');
  await page.locator('[data-fill-go]').click();
  await page.waitForTimeout(1200);
  const f = CALLS.find((x) => x.fn === 'fill_slots_from_hours');
  say('Fill from opening hours sends the length and the limit', f && f.body.p_minutes === 90 && f.body.p_capacity === 25, JSON.stringify(f));
  say('…and the grid shows the slots', (await page.locator('[data-slot]').count()) === 12 && /6:00 AM – 7:30 AM · up to 25/.test(await page.locator('[data-slot-day="1"]').innerText()));
  await page.locator('[data-slot-day="6"]').getByRole('button', { name: /Add a slot/ }).click();
  await page.getByLabel('Ends').fill('10:30');
  await page.getByLabel('Up to how many people').fill('12');
  await page.locator('[data-slot-edit]').getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1000);
  const sv = CALLS.find((x) => x.fn === 'save_slot_template');
  say('a slot added by hand on one day', sv && sv.body.p_day === 6 && sv.body.p_starts === '09:00' && sv.body.p_ends === '10:30' && sv.body.p_capacity === 12, JSON.stringify(sv));
  await page.locator('[data-slot="1:06:00"]').getByRole('button', { name: 'Remove this slot' }).click();
  await page.waitForTimeout(1000);
  say('…and one removed', CALLS.some((x) => x.fn === 'delete_slot_template' && x.body.p_id === 't10'));
  await page.screenshot({ path: 'shots/admin-time-slots-dark.png' });
  const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  say('the page itself does not scroll', scroll <= 0, `(${scroll}px)`);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(500);
  say('light mode', (await page.evaluate(() => document.documentElement.dataset.mode)) === 'light');
  await page.screenshot({ path: 'shots/admin-time-slots-light.png' });
  return out.join(String.fromCharCode(10));
}
