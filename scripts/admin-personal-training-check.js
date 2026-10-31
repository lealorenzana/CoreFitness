/**
 * The admin side of the simplify (2026-10-28): one Personal training page —
 * To decide (the 1-on-1s the gym decides, package payments to confirm,
 * packages waiting on a coach), Sessions (Bookings' 1-on-1s) and Packages
 * (Coaching) — writing the same calls those pages did; old /bookings and
 * /coaching addresses redirect; Schedule and Class bookings show only while
 * classes are on; no group option in Settings; the Events switch in Your app.
 *
 * Fixture from admin-coaching-check.js. Admin dev server on :5174.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'gabby@x.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const g = { gym_id: 'gym-a', gym_name: 'gabby pogi 123', slug: 'gabby-pogi-123', short_name: 'gabby', accent: 'violet' };
  const ymd = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const CALLS = [];
  let MODULES = { classes: false };
  const SETTINGS = { modes: ['classes', 'pick_pt', 'desk_assigns', 'coach_invites'], lengths: [1, 3, 6], fee: 'gym_priced' };
  const COACHINGS = [
    { id: 'k1', member_id: 'm1', trainer_id: 't1', kind: 'pt', months: 3, status: 'payment_sent', fee_mode: 'gym_priced', price: 2400,
      pay_reference: 'GC-1234', starts_on: null, ends_on: null, started_by: 'member', created_at: new Date().toISOString() },
    { id: 'k2', member_id: 'm2', trainer_id: 't1', kind: 'pt', months: 1, status: 'active', fee_mode: 'gym_priced', price: 900,
      pay_reference: null, starts_on: ymd(5), ends_on: ymd(-25), started_by: 'desk', created_at: new Date().toISOString() },
    { id: 'k3', member_id: 'm3', trainer_id: 't1', kind: 'pt', months: 1, status: 'requested', fee_mode: 'gym_priced', price: null,
      pay_reference: null, starts_on: null, ends_on: null, started_by: 'member', created_at: new Date().toISOString() },
  ];
  const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const PT = [
    { id: 's1', member_id: 'm1', trainer_id: 't1', starts_at: at(2, 9), duration_minutes: 60, status: 'pending', notes: null,
      created_at: at(-2, 9), requested_at: new Date(Date.now() - 2.2 * 86400000).toISOString(), coach_ok_by: null, decided_by_role: null },
  ];
  const PEOPLE = {
    member_profiles: [{ profile_id: 'm1', profiles: { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', status: 'active', role: 'member' } },
      { profile_id: 'm2', profiles: { id: 'm2', first_name: 'Ana', last_name: 'Reyes', status: 'active', role: 'member' } },
      { profile_id: 'm3', profiles: { id: 'm3', first_name: 'Joy', last_name: 'Tan', status: 'active', role: 'member' } }],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Strength', profiles: { id: 't1', first_name: 'Rae', last_name: 'Santos', status: 'active', role: 'trainer' } }],
  };
  const CLAIMS = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: 'emerald', accent_action: 'lime', tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, join_policy: 'code',
        vocabulary: { member: 'member', members: 'members', trainer: 'coach', trainers: 'coaches', class: 'class', classes: 'classes' }, join_code: 'PPDSSJ', modules: MODULES }]);
      if (fn === 'my_gym_subscription') return json([{ plan_name: 'Standard', price_monthly: '999', paid_until: ymd(-3), days_left: 3, grace_days: 7,
        read_only_on: ymd(-11), lock_reason: null, max_members: 150, members: 38, max_staff: 3, staff: 2, on_trial: false }]);
      if (fn === 'my_gym_payments') return json([]);
      if (fn === 'platform_payment_options') return json([{ id: 'pm1', kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz',
        account_number: '0917 555 0101', qr_image: PNG, instructions: 'Send the exact amount.' }]);
      if (fn === 'my_gym_payment_claims') return json(CLAIMS);
      if (fn === 'coaching_settings') return json([{ modes: SETTINGS.modes, lengths: SETTINGS.lengths, fee_mode: SETTINGS.fee }]);
      if (fn === 'set_coaching_settings') { CALLS.push([fn, body]); SETTINGS.modes = body.p_modes; SETTINGS.lengths = body.p_lengths; SETTINGS.fee = body.p_fee_mode; return json(null); }
      if (fn === 'set_coaching_price') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'confirm_coaching_payment' || fn === 'assign_coaching' || fn === 'end_coaching') { CALLS.push([fn, body]); return json('ok'); }
      if (fn === 'coaching_sweep') return json(0);
      if (fn === 'set_booking_approval') { CALLS.push([fn, body]); return json(null); }
      if (fn === 'set_join_settings') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'set_join_policy') { CALLS.push([fn, body]); return json('PPDSSJ'); }
      if (fn === 'submit_gym_payment') { CALLS.push(body); CLAIMS.push({ id: 'c1', amount: String(body.p_amount), paid_on: body.p_paid_on,
        method_label: 'GCash', reference: body.p_reference, months: body.p_months, status: 'pending', reason: null, created_at: new Date().toISOString(), decided_at: null }); return json('c1'); }
      if (fn === 'my_gym_modules') return json(Object.entries({ coaching: true, classes: MODULES.classes, push: true, events: !!MODULES.events })
        .map(([k, on], i) => ({ feature_key: k, label: k, description: k, state: 'on', enabled: on, sort_order: i, parent_key: k === 'events' ? 'push' : null })));
      if (fn === 'sweep_stale_requests') return json(0);
      return json(['my_support_grant', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'coachings') return json(COACHINGS);
    if (t === 'pt_sessions') {
      if (req.method() === 'PATCH') { CALLS.push(['pt_status', JSON.parse(req.postData() || '{}')]); return json([{ id: 's1' }]); }
      return json(PT);
    }
    if (t === 'notifications') { if (req.method() === 'POST') CALLS.push(['notify', JSON.parse(req.postData() || '{}')]); return json([]); }
    if (t === 'coaching_prices') return json([{ kind: 'pt', months: 3, price: 2400 }]);
    if (t in PEOPLE) return json(PEOPLE[t]);
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao',
        join_approval: 'desk', min_age: 16,
        class_booking_approval: 'coach', pt_booking_approval: 'desk' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Gabby', last_name: 'Owner',
        email: 'gabby@x.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const go = async (p) => { await page.goto(`http://localhost:5174${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
  await page.setViewportSize({ width: 1400, height: 950 });

  // ── One Personal training page: To decide · Sessions · Packages ──
  await go('/personal-training');
  await page.locator('[data-personal-training]').waitFor({ timeout: 15000 });
  const tabs = (await page.locator('[data-pt-tabs] button').allInnerTexts()).map((x) => x.replace(/\d+$/, '').trim());
  say('three tabs: To decide · Sessions · Packages', JSON.stringify(tabs) === JSON.stringify(['To decide', 'Sessions', 'Packages']), JSON.stringify(tabs));
  await page.locator('[data-to-decide] table').waitFor({ timeout: 10000 }).catch(() => {});
  let t = await text();
  say('To decide: the session the desk decides', (await page.locator('[data-decide-row="session"]').count()) === 1 && /Single session/.test(t) && /waiting 2 days/.test(t), t.slice(0, 300));
  say('…the package payment to confirm, with its reference', (await page.locator('[data-decide-row="payment"]').count()) === 1 && /3-month package/.test(t) && /ref GC-1234/.test(t));
  say('…and the package waiting on its coach', (await page.locator('[data-decide-row="asked"]').count()) === 1 && /Joy Tan/.test(t) && /the coach decides/.test(t));
  say('…counted on the tab (the two the gym decides)', /To decide\s*2/.test(await page.locator('[data-pt-tabs]').innerText()));
  say('no page scroll', await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 2));
  await page.screenshot({ path: 'shots/admin-personal-training.png' });

  await page.locator('[data-decide-row="session"]').getByRole('button', { name: 'Confirm' }).click();
  await page.waitForTimeout(1000);
  const st = CALLS.find(([f]) => f === 'pt_status');
  say('Confirm writes the session as approved, as Bookings did', st && st[1].status === 'approved', JSON.stringify(st));
  const nt = CALLS.find(([f]) => f === 'notify');
  say('…and tells the member, linking their sessions', nt && /\/member\/sessions/.test(JSON.stringify(nt[1])), JSON.stringify(nt));
  await page.locator('[data-decide-row="payment"]').getByRole('button', { name: 'Confirm payment' }).click();
  await page.waitForTimeout(1000);
  const cp = CALLS.find(([f]) => f === 'confirm_coaching_payment');
  say('Confirm payment uses the same call as Coaching', cp && cp[1].p_id === 'k1' && cp[1].p_received === true && cp[1].p_method === 'online', JSON.stringify(cp));

  await page.locator('[data-pt-tabs] button', { hasText: 'Sessions' }).click();
  await page.waitForTimeout(1500);
  t = await text();
  say('Sessions: the Bookings views, 1-on-1 only (no Kind choice)', /By day/.test(t) && /Waiting/.test(t) && /History/.test(t) && (await page.getByLabel('Kind').count()) === 0 && /tab=sessions/.test(page.url()), page.url());
  await page.locator('[data-pt-tabs] button', { hasText: 'Packages' }).click();
  await page.waitForTimeout(1500);
  t = await text();
  say('Packages: the Coaching page, with its cards and assign', (await page.locator('[data-coaching-cards] > *').count()) === 4 && /1 mo/.test(t) && !/Group/.test(t), t.slice(0, 200));
  say('…no page scroll', await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 2));

  // ── Old addresses redirect ──
  for (const [from, want] of [['/bookings', /\/personal-training\?tab=sessions$/], ['/coaching', /\/personal-training\?tab=packages$/]]) {
    await go(from);
    say(`${from} lands on Personal training`, want.test(page.url()), page.url());
  }

  // ── The sidebar: Personal training always; class pages only while classes are on ──
  await go('/personal-training');
  let nav = await page.locator('aside, nav').first().innerText();
  say('sidebar: Personal training, and no Class bookings or Schedule with classes off', /Personal training/.test(nav) && !/Class bookings/.test(nav) && !/Schedule/.test(nav), nav.replace(/\s+/g, ' ').slice(0, 300));
  say('…no Coaching or Bookings rows left', !/\bCoaching\b/.test(nav) && !/^Bookings$/m.test(nav));
  MODULES = { classes: true };
  await go('/dashboard');
  nav = await page.locator('aside, nav').first().innerText();
  await page.getByText('Classes', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  nav = await page.locator('aside, nav').first().innerText();
  say('with classes on: Schedule and Class bookings come back', /Schedule/.test(nav) && /Class bookings/.test(nav), nav.replace(/\s+/g, ' ').slice(0, 300));
  await go('/bookings/classes');
  say('Class bookings is its own page', /Class bookings/.test(await text()), page.url());

  // ── Settings: Personal training, no groups; Your app lists the Events switch ──
  await go('/settings?tab=coaching');
  await page.getByRole('button', { name: /^Personal training$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  t = await text();
  say('Settings → Personal training offers no group option', /Members pick a coach/.test(t) && !/as a group/.test(t), t.slice(0, 200));
  await go('/gym-app?tab=runs');
  say('Your app lists the Events switch', (await page.locator('[data-module="events"]').count()) === 1 || /events/i.test(await text()));
  return out.join('\n');
}
