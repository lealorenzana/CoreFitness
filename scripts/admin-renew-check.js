/**
 * The admin side of 0091 against fixtures: the "Coming to renew" queue on
 * Payments, Record payment opening prefilled from a request, the Dashboard
 * heatmap reading gym_traffic(), and the member drawer's request banner.
 *
 * 2026-11-10 (owner: "pay at the front desk should be one click"): Lea is on Premium and asks for Quarterly. The
 * card says approving switches the plan; Edit details opens the form on Quarterly at its price, with the plan
 * picker and a "Custom amount" note when the amount is changed; one click on the approve button switches the
 * membership to Quarterly FIRST, then records ₱4,200 cash (the order the request-closing trigger needs).
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.addInitScript(() => { window.__CF_NO_TOURS = true; });
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
  const T1 = { id: 't1', role: 'trainer', status: 'active', first_name: 'Bianca', last_name: 'Soriano',
    email: 'bianca@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-300) };
  const M1 = { id: 'm1', role: 'member', status: 'active', first_name: 'Lea', last_name: 'Lorenzana',
    email: 'lea@corefitness-test.com', phone: null, photo_url: null, created_at: iso(-120) };

  const MEMBER_ROW = { profile_id: 'm1', gym_id: null, qr_code: 'QR-m1', experience_level: 'beginner',
    address: 'Mamburao', date_of_birth: '1998-04-12', gender: 'female', created_at: iso(-120), profiles: M1 };

  const TABLES = {
    profiles: [admin, T1, M1],
    trainer_profiles: [{ profile_id: 't1', specialization: 'Rehab & Injury Prevention',
      bio: 'Physical therapist. Helps members return to training after an injury.', availability: null,
      years_experience: 11, certifications: ['NASM Corrective Exercise Specialist'], focus_areas: ['rehab', 'mobility'],
      achievements: null, profiles: T1 }],
    member_profiles: [MEMBER_ROW],
    workout_resources: [
      { id: 'w1', title: 'Yoga With Adriene', provider: 'YouTube', url: 'https://youtube.com/x', image_url: null,
        description: 'Yoga', category: 'Follow-along', level: 'all_levels', is_active: true, sort_order: 1, created_at: iso(-50), created_by: null },
      { id: 'w2', title: 'Bodyweight workouts', provider: 'Darebee', url: 'https://darebee.com', image_url: null,
        description: 'No equipment', category: 'Bodyweight', level: 'beginner', is_active: true, sort_order: 2, created_at: iso(-50), created_by: null },
    ],
    exercises: [
      { id: 'e1', name: 'Back Squat', muscle_group: 'legs', equipment: 'barbell', is_timed: false, is_active: true, sort_order: 20 },
      { id: 'e2', name: 'Plank', muscle_group: 'core', equipment: 'bodyweight', is_timed: true, is_active: true, sort_order: 50 },
    ],
    gym_plans: [1, 3, 5].map((d) => ({ id: `gp${d}`, member_id: 'm1', day_of_week: d, remind_at: '18:00:00',
      active: true, last_reminded_on: null, routine_id: d === 1 ? 'r1' : null, created_at: iso(-9) })),
    workout_routines: [{ id: 'r1', member_id: 'm1', name: 'Leg day', notes: null, position: 0, updated_at: iso(-2),
      workout_routine_exercises: [{ id: 'x1' }, { id: 'x2' }] }],
    trainer_feedback: [{ id: 'f1', trainer_id: 't1', member_id: 'm1', created_at: iso(-2),
      note: 'Knee tracks well now.', recommendation: 'Add one mobility session a week.',
      seen_at: iso(-1), done_at: null }],
    fitness_goals: [{ id: 'g1', member_id: 'm1', title: 'Squat 80 kg', metric: 'lift_kg', start_value: 50,
      target_value: 80, target_date: null, achieved_on: null, created_at: iso(-20), template_key: null, exercise_id: 'e1' }],
    // A term that started 10 days ago: 3 visit days (two check-ins on one), one
    // class that has happened and one that has not, one finished workout and
    // one still open. Expected: 3 visit days, 1 class, 0 1-on-1, 1 workout.
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active', start_date: day(-10), expiry_date: day(20),
      never_expires: false, frozen_at: null, created_at: iso(-10),
      membership_plans: { id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium' } }],
    attendance: [-1, -1, -4, -8].map((d, i) => ({ id: 'a' + i, member_id: 'm1', check_in_time: iso(d), method: 'qr' })),
    bookings: [
      { id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved', requested_at: iso(-6), classes: { id: 'c1', name: 'HIIT', scheduled_at: iso(-3), duration_minutes: 45 } },
      { id: 'b2', member_id: 'm1', class_id: 'c2', status: 'approved', requested_at: iso(-1), classes: { id: 'c2', name: 'Yoga', scheduled_at: iso(2), duration_minutes: 60 } },
    ],
    workout_logs: [
      { id: 'l1', member_id: 'm1', performed_on: day(-2), activity: 'Leg day', duration_minutes: 50, notes: null, created_at: iso(-2), completed_at: iso(-2) },
      { id: 'l2', member_id: 'm1', performed_on: day(0), activity: 'Arms', duration_minutes: null, notes: null, created_at: iso(0), completed_at: null },
    ],
    // One past payment, so the Records search can be asked for its invoice number (staging QA, DASH-PAYMENTS).
    payments: [{ id: 'pay1', gym_id: 'gym-1', member_id: 'm1', membership_id: 'ms1', amount: 1500, method: 'Cash', status: 'completed',
      plan_name: 'Premium', invoice_number: 'CF-2026-00042', paid_on: day(-10), due_date: null, notes: null, recorded_by: 'u1', created_at: iso(-10) }],
    pt_sessions: [], body_measurements: [], notifications: [],
    membership_plans: [{ id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true },
      { id: 'p4', name: 'Quarterly', price: 4200, duration_days: 90, tier: 'premium', is_active: true }],
    // A plan change: on Premium, asking for Quarterly (the owner's screenshot, 2026-11-10).
    renewal_requests: [{ id: 'rr1', member_id: 'm1', plan_id: 'p4', note: 'Coming tomorrow', status: 'open', created_at: iso(-0.2),
      membership_plans: { name: 'Quarterly', price: 4200, duration_days: 90 } }],
  };
  const CALLED = [];
  /** Every write, in order: [method, table, body]. */
  const WRITES = [];
  const RPC = {
    // Tenancy (0104): the owner is signed in to a gym — without this the app sends them back to sign in.
    my_gym_context: [{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness', role: 'admin', status: 'active',
      lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }],
    gym_traffic: [{ dow: 1, band: '6pm', visits: 12, weeks: 4 }, { dow: 3, band: '9am', visits: 4, weeks: 4 }],
    resource_save_counts: [{ resource_id: 'w1', saved: 12, done: 5 }],
    exercise_routine_counts: [{ exercise_id: 'e1', routines: 3, members: 2 }],
    goal_current_value: 65,
  };

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
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      CALLED.push(fn);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/') && req.method() !== 'GET') {
      const t = pathname.split('/rest/v1/')[1];
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = null; }
      WRITES.push([req.method(), t, body]);
      const row = { id: 'w' + WRITES.length, ...(Array.isArray(body) ? body[0] : body) };
      const base = t === 'memberships' ? { ...TABLES.memberships[0], ...row } : row;
      return json(one ? base : [base], req.method() === 'POST' ? 201 : 200);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1];
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
  const grab = (t, from, n = 140) => { const i = t.toLowerCase().indexOf(from.toLowerCase()); return i < 0 ? `MISSING "${from}"` : t.slice(i, i + n); };


  // Payments: the queue, and Record payment opening filled in
  await page.goto('http://localhost:5174/payments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // The queue is its own tab on Payments (Records · To approve) since the redesign.
  await page.getByRole('button', { name: /To approve/ }).first().click().catch(() => page.getByText('To approve').first().click());
  await page.waitForTimeout(1200);
  let t = await text();
  out.push('queue: ' + grab(t, 'Members who paid', 120));
  out.push('card says the plan switches: ' + (/Approving switches them from Premium to Quarterly/.test(t) ? 'yes' : 'MISSING'));
  out.push('no trip to Members → Membership: ' + (!/switch them to Quarterly in Members/.test(t) ? 'yes' : 'MISSING'));
  const card = page.locator('div.rounded-xl', { hasText: 'Wants Quarterly' }).first();
  out.push('one-click button names the money: ' + ((await card.locator('[data-approve]').innerText()).includes('4,200') ? 'yes' : 'MISSING'));
  out.push('approve is not blocked by the plan change: ' + (await card.locator('[data-approve]').isEnabled() ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-renew-queue.png' });

  // Edit details: the form on Quarterly at its price, the picker, and a custom amount said so
  await card.locator('[data-approve-edit]').click();
  await page.waitForTimeout(1200);
  const amount = await page.locator('input[type="number"]').first().inputValue().catch(() => '?');
  const who = await page.getByPlaceholder('Search by name, email, or QR code...').inputValue().catch(() => '?');
  const picked = await page.locator('[data-plan-picker] select').inputValue().catch(() => '?');
  out.push(`modal prefilled: member="${who}" amount=${amount} plan=${picked}`);
  out.push('prefilled on Quarterly at its price: ' + (picked === 'p4' && Number(amount) === 4200 ? 'yes' : 'MISSING'));
  out.push('the form says the plan switches: ' + ((await page.locator('[data-plan-switch-note]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('[data-plan-picker] select').selectOption('p3');
  out.push('picking Premium fills its price: ' + (Number(await page.locator('input[type="number"]').first().inputValue()) === 1500 ? 'yes' : 'MISSING'));
  await page.locator('[data-plan-picker] select').selectOption('p4');
  await page.locator('input[type="number"]').first().fill('4000');
  out.push('a custom amount is allowed and said so: ' + ((await page.locator('[data-custom-amount]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-renew-modal.png' });
  // The member list closes when you click elsewhere (owner, 2026-11-11: it stayed open over the form until a pick).
  await page.getByPlaceholder('Search by name, email, or QR code...').click();
  await page.waitForTimeout(300);
  const listUp = await page.locator('[data-member-list]').count();
  await page.getByText('Payment Method').first().click();
  await page.waitForTimeout(300);
  out.push('the member list opens on the search and closes on a click elsewhere: '
    + (listUp === 1 && (await page.locator('[data-member-list]').count()) === 0 ? 'yes' : `MISSING open=${listUp}`));
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.waitForTimeout(600);

  // One click: switch the plan, then record the cash
  WRITES.length = 0;
  await page.locator('div.rounded-xl', { hasText: 'Wants Quarterly' }).first().locator('[data-approve]').click();
  await page.waitForTimeout(2500);
  const iPlan = WRITES.findIndex(([m, tb, b]) => m === 'PATCH' && tb === 'memberships' && b && b.plan_id === 'p4');
  const iPay = WRITES.findIndex(([m, tb]) => m === 'POST' && tb === 'payments');
  const pay = iPay >= 0 ? WRITES[iPay][2] : null;
  out.push('writes: ' + WRITES.map(([m, tb, b]) => `${m} ${tb}${b && b.plan_id ? ' plan=' + b.plan_id : ''}${b && b.amount ? ' amount=' + b.amount : ''}`).join(' | '));
  out.push('one click switches the plan, THEN records ₱4,200 cash: '
    + (iPlan >= 0 && iPay > iPlan && pay && Number(pay.amount) === 4200 && pay.method === 'cash' ? 'yes' : 'MISSING'));

  // Records → By member: the box says "Member, plan or invoice" — it searched names only (staging QA, DASH-PAYMENTS).
  await page.goto('http://localhost:5174/payments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const search = page.getByPlaceholder('Member, plan or invoice');
  const shows = async (q) => { await search.fill(q); await page.waitForTimeout(600); return (await page.locator('main').innerText()).includes('Lea Lorenzana'); };
  // RdSelect is a button that shows the chosen option's words, not a native <select>.
  out.push('records open By member: ' + ((await page.locator('main button', { hasText: /^\s*By member\s*$/ }).count()) > 0 ? 'yes' : 'MISSING'));
  out.push('By member finds the member by invoice number: ' + (await shows('00042') ? 'yes' : 'MISSING'));
  out.push('…and by plan: ' + (await shows('premium') ? 'yes' : 'MISSING'));
  out.push('…and still by name: ' + (await shows('lorenzana') ? 'yes' : 'MISSING'));
  out.push('…and shows nobody for a miss: ' + (!(await shows('zzzz-nobody')) ? 'yes' : 'MISSING'));
  await search.fill('');

  // Dashboard heatmap reads the shared function
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  out.push('dashboard called gym_traffic: ' + (CALLED.includes('gym_traffic') ? 'yes' : 'NO'));

  // Member drawer banner
  await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText('Lea Lorenzana').first().click();
  await page.waitForTimeout(1500);
  await page.locator('aside').getByRole('button', { name: 'Membership', exact: true }).click();
  await page.waitForTimeout(800);
  out.push('drawer: ' + grab(await text(), 'Coming to renew', 150));
  return out.join('\n');
}
