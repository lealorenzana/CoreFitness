/**
 * Billing → Plans (2026-10-20, the approved mock-up): the plans on sale as cards,
 * the one being edited beside them, who is on it sorted by renewal (Remind on
 * whoever renews within a week), the tiles counted from real memberships, Copy
 * makes a new plan, Retire takes one off sale, and Retired restores or deletes.
 *
 * Playwright runner's `filename` argument, admin dev server on :5174.
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
  const exp = Math.floor(Date.now() / 1000) + 36000;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Olive', last_name: 'Owner',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const day = (n) => new Date(Date.now() + 8 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  const at = (n) => new Date(Date.now() + n * 86400000).toISOString();

  const PLANS = [
    { id: 'pt', name: 'Free Trial', tier: 'freemium', price: 0, duration_days: 30, is_active: true, can_book_classes: true, can_book_pt: false, class_bookings_per_week: 2, pt_sessions_per_month: null, description: 'Book 2 classes a week\nWorkout tracker', price_unset: false, created_at: at(-200) },
    { id: 'pf', name: 'Free Plan', tier: 'free', price: 0, duration_days: null, is_active: true, can_book_classes: false, can_book_pt: false, class_bookings_per_week: null, pt_sessions_per_month: null, description: 'Free workout library\nCheck in at the door', price_unset: false, created_at: at(-200) },
    { id: 'pp', name: 'Premium', tier: 'premium', price: 1500, duration_days: 30, is_active: true, can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: 4, description: 'Unlimited classes\n4 coach sessions a month', price_unset: false, created_at: at(-200) },
    { id: 'po', name: 'Old Quarterly', tier: 'premium', price: 4000, duration_days: 90, is_active: false, can_book_classes: true, can_book_pt: true, class_bookings_per_week: null, pt_sessions_per_month: null, description: 'Three months', price_unset: false, created_at: at(-400) },
  ];
  const mem = (id, member, plan, status, exp, created) => ({ id, member_id: member, plan_id: plan, status, start_date: day(created), expiry_date: exp == null ? null : day(exp),
    never_expires: exp == null && plan === 'pf', frozen_at: null, freeze_count: 0, created_at: at(created), updated_at: at(created), membership_plans: PLANS.find((p) => p.id === plan) });
  const MEMBERSHIPS = [
    mem('a2', 'm1', 'pp', 'active', 3, -27), mem('a1', 'm1', 'pt', 'expired', -27, -57), // a trial that became paid
    mem('b1', 'm2', 'pp', 'active', 6, -24),
    mem('c1', 'm3', 'pp', 'active', 24, -6),
    mem('d1', 'm4', 'pt', 'active', 20, -10), // still on trial
    mem('e1', 'm5', 'pf', 'active', null, -100),
  ];
  const person = (id, first, last) => ({ id, user_id: id, profiles: { id, role: 'member', status: 'active', first_name: first, last_name: last, email: `${id}@x.test`, phone: null, photo_url: null, created_at: at(-300) } });
  const MEMBERS = [person('m1', 'Andrea', 'Flores'), person('m2', 'Bea', 'Salazar'), person('m3', 'Carlo', 'Ocampo'), person('m4', 'Dina', 'Reyes'), person('m5', 'Eli', 'Santos')];
  const PAYMENTS = [{ id: 'y1', member_id: 'm1', amount: 1500, status: 'completed', paid_on: day(-27) }, { id: 'y2', member_id: 'm1', amount: 1500, status: 'completed', paid_on: day(-57) },
    { id: 'y3', member_id: 'm2', amount: 1500, status: 'completed', paid_on: day(-24) }];
  const CALLS = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    const body = () => JSON.parse(req.postData() || '{}');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour', role: 'admin', status: 'active', lock_reason: null,
        short_name: null, logo_url: null, accent: 'teal', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'plan_member_counts') return json([{ plan_id: 'pp', active_count: 3, total_count: 3 }, { plan_id: 'pt', active_count: 1, total_count: 2 }, { plan_id: 'pf', active_count: 1, total_count: 1 }, { plan_id: 'po', active_count: 0, total_count: 0 }]);
      if (fn === 'notify_user' || fn === 'send_notification') { CALLS.push([fn, body()]); return json(null); }
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'membership_plans' && req.method() === 'PATCH') { CALLS.push(['patch', body(), after]); return json([{ id: 'pp' }]); }
    if (t === 'membership_plans' && req.method() === 'POST') { CALLS.push(['post', body()]); return json({ ...PLANS[2], ...body(), id: 'pnew' }); }
    if (t === 'membership_plans') return json(PLANS);
    if (t === 'memberships') return json(MEMBERSHIPS);
    if (t === 'member_profiles') return json(MEMBERS);
    if (t === 'payments') return json(PAYMENTS);
    if (t === 'notifications' && req.method() === 'POST') { CALLS.push(['notify', body()]); return json(one ? { id: 'n1' } : [{ id: 'n1' }]); }
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const has = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (extra ? ' ' + extra : '')}`);
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const noScroll = () => page.evaluate(() => { const m = document.querySelector('main'); return !m || m.scrollHeight <= m.clientHeight + 1; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5174/membership-plans', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-plan-cards]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
  let t = await text();
  has('three plans on sale as cards, plus New plan; the retired one is not among them', (await page.locator('[data-plan-card]').count()) === 3 && /Retired 1/.test(t));
  has('tiles from real memberships: 3 paid of 5 active, the ended trial became paid (one still trying is not counted), 2 renew this week', /Members on a paid plan 3 of 5 active/.test(t)
    && /Trials that became paid 100% 1 of 1 whose trial ended/.test(t) && /Renewing in 7 days 2 ₱3,000 due/.test(t), (t.match(/Trials that.{0,120}/) || [''])[0]);
  has('a trial reads as 30 days then the free plan; a free plan never expires', /₱0 · 1 month, then the free plan/.test(t) && /₱0 · never expires/.test(t));
  has('Premium opens first in the editor, kind Paid and 1 month pressed', (await page.locator('[data-plan-editor]').count()) === 1
    && (await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: 'Paid', pressed: true }).count()) === 1
    && (await page.getByRole('group', { name: 'Length' }).getByRole('button', { name: '1 month', pressed: true }).count()) === 1);
  has('who is on Premium, sorted by renewal, with what each has paid', (await page.locator('[data-roster-row]').count()) === 3
    && /Andrea Flores/.test(await page.locator('[data-roster-row]').first().innerText()) && /₱3,000/.test(await page.locator('[data-roster-row]').first().innerText()));
  has('Remind only on whoever renews within a week', (await page.getByRole('button', { name: 'Remind' }).count()) === 2);
  has('members-see line names the plan and the price', /Members see this plan as “Premium · ₱1,500 a month”/.test(t));
  has('the page does not scroll', await noScroll());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/admin-plans-page.png' });

  await page.getByRole('button', { name: 'Remind' }).first().click();
  await page.waitForTimeout(500);
  has('Remind tells the member, once a day', CALLS.some(([k, b]) => (k === 'notify' || k === 'notify_user') && JSON.stringify(b).includes('renews soon')), JSON.stringify(CALLS.map((c) => c[0])));

  await page.getByLabel('Add a line').fill('AI coach, points, challenges');
  await page.getByLabel('Add a line').press('Enter');
  await page.locator('[data-plan-save]').click();
  await page.waitForTimeout(600);
  const patch = CALLS.find(([k]) => k === 'patch');
  has('Save writes the plan, the new line last, unlimited classes as NULL', !!patch && patch[1].description === 'Unlimited classes\n4 coach sessions a month\nAI coach, points, challenges'
    && patch[1].class_bookings_per_week === null && patch[1].pt_sessions_per_month === 4 && patch[1].duration_days === 30, JSON.stringify(patch && patch[1]));

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole('group', { name: 'Length' }).getByRole('button', { name: '3 months' }).click();
  await page.locator('[data-plan-save]').click();
  await page.waitForTimeout(600);
  const post = CALLS.find(([k]) => k === 'post');
  has('Copy makes a new plan from this one, at its own length', !!post && post[1].name === 'Premium copy' && post[1].duration_days === 90 && post[1].price === 1500, JSON.stringify(post && post[1]));

  await page.locator('[data-plan-card="Premium"]').click();
  await page.waitForTimeout(200);
  CALLS.length = 0;
  await page.locator('[data-plan-retire]').click();
  await page.waitForTimeout(500);
  const retire = CALLS.find(([k]) => k === 'patch');
  has('Retire takes it off sale and nothing else', !!retire && retire[1].is_active === false && Object.keys(retire[1]).length === 1, JSON.stringify(retire && retire[1]));

  await page.locator('[data-view="retired"]').click();
  await page.waitForTimeout(400);
  t = await text();
  has('Retired: the old plan, Restore and Delete, and what Delete does', (await page.locator('[data-retired-row="Old Quarterly"]').count()) === 1
    && (await page.getByRole('button', { name: 'Restore' }).count()) >= 1 && /moves every membership on the plan to the free plan/.test(t));
  await page.screenshot({ path: 'shots/admin-plans-retired.png' });
  await page.locator('[data-view="unlock"]').click();
  await page.waitForTimeout(500);
  has('What each unlocks: one column per plan on sale', (await page.locator('[data-plan-matrix] thead th').count()) === 4 && await noScroll());
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/admin-plans-unlock.png' });
  return out.join('\n');
}
