/**
 * The owner's fixes (2026-10-28, plan Task F2) against fixtures:
 *   Events — rebuilt on the redesign kit (the Announcements header and tabs, a table that fits, no page scroll);
 *            cancelling asks why, and nothing is written before a reason is given;
 *   Payments → To approve — a member who paid by reference comes first, with "Approve payment";
 *   Walk-ins — a guest with pack visits left is a choice to tap, and tapping chooses "Use a pack visit";
 *   Programs — Delete asks why and calls delete_or_retire_program with the reason.
 * Setup copied from admin-renew-check.js. Admin dev server on :5174.
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
  const day = (d) => iso(d).slice(0, 10);
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Gabrielle', last_name: 'Facalarin',
    email: 'admin@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const M1 = { id: 'm1', role: 'member', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-120) };
  const M2 = { id: 'm2', role: 'member', status: 'active', first_name: 'Ana', last_name: 'Reyes',
    email: 'ana@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-90) };

  const TABLES = {
    profiles: [admin, M1, M2],
    member_profiles: [{ profile_id: 'm1', qr_code: 'QR-m1', created_at: iso(-120), profiles: M1 }, { profile_id: 'm2', qr_code: 'QR-m2', created_at: iso(-90), profiles: M2 }],
    memberships: [
      { id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: day(-10), expiry_date: day(20), never_expires: false, frozen_at: null, created_at: iso(-10),
        membership_plans: { id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium' } },
      { id: 'ms2', member_id: 'm2', plan_id: 'p3', status: 'active', start_date: day(-28), expiry_date: day(2), never_expires: false, frozen_at: null, created_at: iso(-28),
        membership_plans: { id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium' } },
    ],
    membership_plans: [{ id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true }],
    payments: [], notifications: [], attendance: [],
    events: [{ id: 'ev1', title: 'Saturday Bootcamp', description: 'Outdoor circuit', starts_at: iso(3), duration_minutes: 60, location: 'Plaza',
      capacity: 20, who_is_it_for: null, what_to_bring: null, fee: null, contact: null, is_featured: false, image_url: null, cancelled: false, created_at: iso(-2) }],
    event_registrations: [{ id: 'er1', event_id: 'ev1', member_id: 'm1', registered_at: iso(-1) }],
    // Two requests: one paid by reference (must come first), one coming to pay at the desk.
    renewal_requests: [
      { id: 'rr1', member_id: 'm1', plan_id: 'p3', note: 'Coming tomorrow', status: 'open', created_at: iso(-0.3),
        membership_plans: { name: 'Premium', price: 1500, duration_days: 30 } },
      { id: 'rr2', member_id: 'm2', plan_id: 'p3', note: null, status: 'open', created_at: iso(-0.1),
        pay_method_label: 'GCash', pay_kind: 'gcash', pay_reference: 'GC-12345', pay_amount: 1500, paid_on: day(0), pay_proof: null,
        membership_plans: { name: 'Premium', price: 1500, duration_days: 30 } },
    ],
    gym_settings: [{ day_pass_on: true, day_pass_price: 100, pack5_price: 400, pack10_price: null, guest_nudge_visits: null }],
    gym_programs: [{ id: 'pg1', name: 'Beginner Strength', description: 'Three days a week', cover_url: null, level: 'beginner', weeks: 4, premium: false,
      published: false, hidden: false, deload_every: null, member_id: null, gym_program_days: [] }],
    gym_workouts: [], exercises: [],
  };
  const CALLED = [];
  const RPC = {
    guests_with_visits: [{ id: 'gu1', name: 'Pia Cruz', phone: '09175551212', visits_left: 3, visits_this_month: 2, last_visit: day(-2) }],
    guest_visits_on: [], frequent_guests: [], find_guest: [],
    delete_or_retire_program: 'deleted',
    record_reason: null,
  };
  const WROTE = [];

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
      let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
      CALLED.push({ fn, body });
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
        WROTE.push({ t, method: req.method(), body });
      }
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  const out = [];
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const go = async (path) => { await page.goto(`http://localhost:5174${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };

  // ── Events ──
  await go('/events');
  const t1 = await text();
  out.push('Events wears the kit: header, both tabs, the table: ' + ((await page.locator('[data-rd-header]').count()) === 1
    && (await page.locator('[data-rd-tabs]').getByText('Announcements').count()) === 1 && (await page.locator('[data-event-row]').count()) === 1 ? 'yes' : 'MISSING'));
  out.push('…with the sign-ups and places left: ' + (/1\/20/.test(t1) && /19 places left/.test(t1) ? 'yes' : 'MISSING'));
  const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  out.push('…and the page does not scroll: ' + (scroll <= 2 ? 'yes' : `SCROLLS ${scroll}px`));
  await page.screenshot({ path: 'shots/admin-events.png' });
  await page.getByRole('button', { name: 'More for Saturday Bootcamp' }).click();
  await page.getByRole('menuitem', { name: 'Cancel the event' }).click();
  await page.waitForTimeout(500);
  await page.locator('[data-reason-confirm]').click();
  await page.waitForTimeout(500);
  out.push('cancelling with no reason writes nothing and says why: ' + (!WROTE.some((w) => w.t === 'events') && /Say why/.test(await text()) ? 'yes' : 'MISSING ' + JSON.stringify(WROTE)));
  await page.locator('[data-reason-dialog]').getByRole('button', { name: 'Bad weather' }).click();
  await page.locator('[data-reason-confirm]').click();
  await page.waitForTimeout(1200);
  out.push('…with one, the event is cancelled: ' + (WROTE.some((w) => w.t === 'events' && w.method === 'PATCH' && w.body?.cancelled === true) ? 'yes' : 'MISSING'));
  out.push('…and the reason is recorded: ' + (CALLED.some((c) => c.fn === 'record_reason' && c.body?.p_reason === 'Bad weather' && c.body?.p_action === 'event.cancelled') ? 'yes' : 'MISSING'));

  // ── Payments → To approve ──
  await go('/payments');
  await page.getByRole('tab', { name: /To approve/ }).click();
  await page.waitForTimeout(700);
  const cards = await page.locator('[data-renew] [data-approve]').allInnerTexts();
  out.push('To approve lists the paid request first, as Approve payment: ' + (cards[0] === 'Approve payment' && cards[1] === 'Record payment' ? 'yes' : 'MISSING ' + JSON.stringify(cards)));
  out.push('…with its reference: ' + (/GC-12345/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-to-approve.png' });

  // ── Walk-ins ──
  await go('/attendance/walk-ins');
  const chip = page.locator('[data-pack-guest="Pia Cruz"]');
  out.push('a guest with pack visits left is a choice: ' + ((await chip.count()) === 1 && /3 left/.test(await chip.innerText()) ? 'yes' : 'MISSING'));
  await chip.click();
  await page.waitForTimeout(500);
  out.push('…tapping them chooses Use a pack visit: ' + (/Record visit · ₱0/.test(await page.locator('[data-record-visit]').innerText()) ? 'yes' : 'MISSING ' + await page.locator('[data-record-visit]').innerText()));
  await page.screenshot({ path: 'shots/admin-walkin-pack.png' });

  // ── Programs ──
  await go('/programs');
  await page.locator('[data-program="Beginner Strength"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-delete-program]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-reason-dialog]').getByRole('button', { name: 'Nobody uses it' }).click();
  await page.locator('[data-reason-confirm]').click();
  await page.waitForTimeout(1200);
  out.push('deleting a program sends the reason to delete_or_retire_program: ' + (CALLED.some((c) => c.fn === 'delete_or_retire_program' && c.body?.p_program === 'pg1' && c.body?.p_reason === 'Nobody uses it') ? 'yes' : 'MISSING'));
  return out.join(String.fromCharCode(10));
}
