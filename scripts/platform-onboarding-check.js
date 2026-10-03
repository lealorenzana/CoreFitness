/**
 * The platform app's 0148/0149 screens (2026-10-03): Overview's check-in
 * drill-down and Needs-you, Activity details, Applications (plan, source,
 * contact, messages, where they come from), Money's payments to verify, Settings'
 * ways to pay, Usage's AI section, Plans' comparison, support access you can
 * actually open, and the Ctrl+K search across everything.
 *
 * Playwright runner's `filename` argument, platform dev server on :5175.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'pa', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'pa', aud: 'authenticated', role: 'authenticated', email: 'owner@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const day = (d) => new Date(Date.now() + 8 * 3600000 - d * 86400000).toISOString().slice(0, 10);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const gym = (id, name, over = {}) => ({ id, name, slug: id, status: 'active', plan: 'standard', paid_until: day(-40), lock_reason: null, members: 40,
    staff: 1, created_at: iso(100), last_activity: iso(1), owners: 1, onboarded: true, plan_name: 'Standard', price_monthly: '999', days_left: 40,
    max_members: 100, paid_total: '999', logo_url: null, accent: 'violet', ...over });
  const GYMS = [gym('g1', 'G Fitness', { members: 142 }), gym('g2', 'gabby pogi 123', { members: 12, plan: 'trial', plan_name: 'Free trial' }),
    gym('g3', 'Harbour Strength', { members: 38, lock_reason: 'overdue', days_left: -12 })];
  const APPS = [
    { id: 'a1', gym_name: 'Iron Den', owner_name: 'Ana Cruz', email: 'ana@ironden.ph', phone: '09171234567', address: 'Calapan, Oriental Mindoro',
      member_estimate: 80, message: 'Hello', status: 'pending', reason: null, gym_id: null, created_at: iso(4), duplicates: 0, already_a_gym: false,
      plan_key: 'premium', plan_name: 'Premium', billing: 'yearly', heard_from: 'Facebook', contact_pref: 'viber', contact_handle: null,
      status_token: 'f'.repeat(64), messages: 2, unread: 1, last_message_at: iso(1) },
    { id: 'a2', gym_name: 'Bulwark Gym', owner_name: 'Ben Ramos', email: 'ben@bulwark.ph', phone: '09981112222', address: 'Mamburao, Occidental Mindoro',
      member_estimate: 40, message: null, status: 'pending', reason: null, gym_id: null, created_at: iso(1), duplicates: 0, already_a_gym: false,
      plan_key: 'standard', plan_name: 'Standard', billing: 'monthly', heard_from: 'A friend or another gym', contact_pref: 'messenger', contact_handle: 'ben.ramos',
      status_token: 'e'.repeat(64), messages: 0, unread: 0, last_message_at: null },
    { id: 'a3', gym_name: 'Old Gym', owner_name: 'Old Owner', email: 'old@x.ph', phone: '09170000000', address: null, member_estimate: null, message: null,
      status: 'approved', reason: null, gym_id: 'g2', created_at: iso(40), duplicates: 0, already_a_gym: false },
  ];
  const THREAD = [{ id: 'm1', from_platform: false, body: 'How much for 200 members?', author_name: null, created_at: iso(2) },
    { id: 'm2', from_platform: true, body: 'Premium is ₱1,999 a month.', author_name: 'Lea Lorenzana', created_at: iso(1.5) }];
  const CLAIMS = [{ id: 'c1', gym_id: 'g3', gym_name: 'Harbour Strength', plan_key: 'standard', plan_name: 'Standard', price_monthly: '999', paid_until: day(12),
    amount: '999', paid_on: day(0), method_label: 'GCash', reference: 'GC 1234 5678', months: 1, proof_image: PNG, note: 'For October',
    status: 'pending', reason: null, submitted_by_name: 'Harbour Owner', created_at: iso(0.1), decided_at: null, payment_id: null }];
  const METHODS = [{ id: 'pm1', kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz', account_number: '0917 555 0101', qr_image: PNG,
    instructions: 'Send the exact amount.', sort_order: 10, active: true }];
  const PLANS = [
    { key: 'trial', name: 'Free trial', blurb: 'Thirty days', price_monthly: '0', price_yearly: null, trial_days: 30, max_members: null, max_staff: null, is_public: true, is_active: true, sort_order: 1 },
    { key: 'standard', name: 'Standard', blurb: 'One gym', price_monthly: '999', price_yearly: null, trial_days: null, max_members: 150, max_staff: 3, is_public: true, is_active: true, sort_order: 2 },
    { key: 'premium', name: 'Premium', blurb: 'Coaching too', price_monthly: '1999', price_yearly: '19990', trial_days: null, max_members: null, max_staff: null, is_public: true, is_active: true, sort_order: 3 }];
  const FEATURES = [['front_desk', 'The front desk'], ['checkin', 'QR check-in and the kiosk'], ['coaching', 'Coaches'], ['assistant', 'The in-app assistant']]
    .map(([key, label], i) => ({ key, label, description: label, sort_order: i }));
  const CELLS = [{ plan_key: 'standard', feature_key: 'coaching', enabled: false }];
  const EVENTS = [{ id: 501, gym_id: 'g3', gym_name: 'Harbour Strength', action: 'gym.suspended', summary: 'Harbour Strength was suspended',
    detail: { reason: 'unpaid', amount: 999, covers_until: day(-3) }, actor_name: 'Lea Lorenzana', created_at: iso(0.2) },
    { id: 500, gym_id: 'g3', gym_name: 'Harbour Strength', action: 'gym.paid', summary: 'Harbour Strength paid ₱999',
      detail: { payment: 'p1', amount: 999 }, actor_name: 'Lea Lorenzana', created_at: iso(3) }];
  const CALLS = [];

  const RPC = {
    is_platform_admin: () => true,
    platform_gyms: () => GYMS,
    platform_overview: () => [{ gyms: 3, gyms_live: 2, gyms_suspended: 0, gyms_locked: 1, gyms_unclaimed: 0, gyms_unset_up: 0, members: 192, staff: 3,
      trainers: 4, checkins_30d: 432, new_gyms_30d: 1, applications_waiting: 2, crashes_open: 0, revenue_this_month: '999', revenue_all_time: '5000', overdue_gyms: 1 }],
    platform_revenue: () => [], gyms_due: () => [], platform_events_recent: () => EVENTS,
    platform_gym_health: () => [], platform_growth: () => [], platform_funnel: () => [{ applied: 3, let_in: 3, set_up: 3, active_30d: 2, paying: 2 }],
    platform_support_grants: () => [{ id: 'sg1', gym_id: 'g2', gym_name: 'gabby pogi 123', reason: 'the member invite not working', expires_at: new Date(Date.now() + 3600000).toISOString(), first_used_at: null }],
    platform_payment_claims: () => CLAIMS,
    verify_gym_payment: (b) => { CALLS.push(['verify', b]); return 'pay1'; },
    platform_checkins_breakdown: () => [
      { gym_id: 'g1', name: 'G Fitness', logo_url: null, accent: 'violet', checkins: 400, demo: 380, people: 120, last_at: iso(0.1), by_method: { qr: 300, manual: 100 } },
      { gym_id: 'g3', name: 'Harbour Strength', logo_url: null, accent: 'teal', checkins: 32, demo: 0, people: 9, last_at: iso(2), by_method: { manual: 32 } },
      { gym_id: 'g2', name: 'gabby pogi 123', logo_url: null, accent: 'emerald', checkins: 0, demo: 0, people: 0, last_at: null, by_method: {} }],
    platform_checkins_daily: () => Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), checkins: 10 + (i % 7) * 2, demo: 8 })),
    platform_events_search: (b) => EVENTS.filter((e) => (!b.p_q || e.summary.toLowerCase().includes(b.p_q.toLowerCase())) && (!b.p_gym || e.gym_id === b.p_gym)).map((e) => ({ ...e, total: EVENTS.length })),
    platform_event_actions: () => [{ action: 'gym.suspended', n: 1 }, { action: 'gym.paid', n: 1 }],
    platform_applications: () => APPS,
    platform_application_thread: () => THREAD,
    platform_application_reply: (b) => { CALLS.push(['reply', b]); THREAD.push({ id: 'm3', from_platform: true, body: b.p_body, author_name: 'Lea', created_at: iso(0) }); return null; },
    platform_payment_options: () => METHODS,
    billing_settings: () => [{ grace_days: 7, reminder_days: [7, 3, 1], business_name: 'Core Fitness', business_address: null, business_email: null, business_phone: null, receipt_note: null }],
    list_platform_admins: () => [{ user_id: 'pa', email: 'owner@corefitness.test', first_name: 'Lea', last_name: 'L', is_me: true }],
    platform_gym_usage: () => [{ gym_id: 'g1', feature: 'checkins', n: 400 }, { gym_id: 'g1', feature: 'coach', n: 96 }, { gym_id: 'g1', feature: 'assistant', n: 12 }],
    platform_ai_usage: () => [{ gym_id: 'g1', messages: '96', tokens_in: '400000', tokens_out: '43450', est_cost_usd: 1.2345 }],
    platform_ai_overview: () => [
      { gym_id: 'g1', name: 'G Fitness', coach_messages: '96', coach_members: 14, tokens_in: '400000', tokens_out: '43450', est_cost_usd: '1.2345', assistant_messages: '12', assistant_members: 5 },
      { gym_id: 'g3', name: 'Harbour Strength', coach_messages: '0', coach_members: 0, tokens_in: '0', tokens_out: '0', est_cost_usd: '0', assistant_messages: '0', assistant_members: 0 }],
    platform_support_snapshot: () => ({
      grant: { reason: 'the member invite not working', expires_at: new Date(Date.now() + 3600000).toISOString(), granted_by: 'Gabby Owner' },
      gym: { id: 'g2', name: 'gabby pogi 123', slug: 'gabby-pogi-123', status: 'active', plan: 'trial', paid_until: day(-20), created_at: iso(30), onboarded_at: iso(29), lock_reason: null },
      settings: { phone: '0917', email: 'g@x.ph', address: 'Mamburao', join_policy: 'code', join_code: 'PPDSSJ', accent: 'emerald', accent_action: 'lime', logo_url: null },
      counts: { 'member:active': 10, 'member:pending_approval': 2, 'admin:active': 1 },
      staff: [{ name: 'Gabby Owner', email: 'gabby@x.ph', role: 'admin', status: 'active', last_sign_in_at: iso(0.1) }],
      members: [{ name: 'Lea Lorenaza', email: 'lea123@gmail.com', status: 'pending_approval', joined: iso(1), last_sign_in_at: null }],
      invitations: [{ email: 'lea123@gmail.com', name: 'Lea Lorenaza', role: 'member', created_at: iso(4), expires_at: iso(-26), accepted_at: null, revoked_at: null, state: 'waiting', has_account: true }],
      pending_registrations: 2, activity: [{ at: iso(0.2), action: 'member.invited', summary: 'Lea Lorenaza was invited', by: 'Gabby Owner' }], errors: [], plans: [{ name: 'Monthly', price: '800', active: 'true' }] }),
    demo_data_summary: () => [{ people: 150, coaches: 12, payments: 300, attendance: 2400, classes: 20, bookings: 90, events: 4, challenges: 3, rewards: 5 }],
    platform_tickets: () => [], platform_support_tickets: () => [], platform_bell: () => [], platform_announcements_list: () => [],
  };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn](JSON.parse(req.postData() || '{}')) : []);
    }
    if (path.startsWith('/rest/v1/platform_plans')) return json(PLANS);
    if (path.startsWith('/rest/v1/platform_features')) return json(FEATURES);
    if (path.startsWith('/rest/v1/platform_plan_features')) return json(CELLS);
    return json([]);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1600, height: 1000 });

  // ---- Overview: the 432, explained; the gym that opened its doors ---------------------------
  await page.goto('http://localhost:5175/overview', { waitUntil: 'domcontentloaded' });
  await page.getByText('Check-ins, 30 days').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  let t = await text();
  out.push('demo data is said where the numbers are: ' + (/still includes the demo seed: 150 seeded people/.test(t) ? 'yes' : 'MISSING'));
  out.push('needs-you: a gym opened its doors: ' + (/gabby pogi 123 opened its doors to you/.test(t) ? 'yes' : 'MISSING'));
  out.push('needs-you: a payment to verify: ' + (/1 payment to verify/.test(t) ? 'yes' : 'MISSING'));
  await page.getByText('Check-ins, 30 days').click();
  await page.getByRole('heading', { name: 'Per gym' }).waitFor({ timeout: 5000 });
  t = await text();
  out.push('the check-ins open a breakdown: ' + (/432/.test(t) && /G Fitness/.test(t) && /380 of these \(88%\) are the demo/.test(t) ? 'yes, per gym with the demo share' : 'MISSING'));
  out.push('…by method: ' + (/QR code 300 · At the desk 100/.test(t) ? 'yes' : 'MISSING'));
  out.push('…per day: ' + ((await page.locator('.spark span').count()) === 30 ? '30 days drawn' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-checkins-drilldown.png' });
  await page.keyboard.press('Escape');
  await page.locator('.ov-event').first().click();
  await page.getByText('Recorded with it').waitFor({ timeout: 5000 });
  t = await text();
  out.push('a recent-activity item opens its details: ' + (/Reason given: “unpaid”/.test(t) && /Covers until/.test(t) ? 'yes' : 'MISSING'));
  await page.keyboard.press('Escape');

  // ---- Activity -----------------------------------------------------------------------------
  await page.goto('http://localhost:5175/activity', { waitUntil: 'domcontentloaded' });
  await page.locator('.act-row').first().waitFor({ timeout: 15000 });
  await page.locator('.act-row').first().click();
  await page.getByText('Also at Harbour Strength').waitFor({ timeout: 5000 });
  t = await text();
  out.push('an activity row opens: when, who, detail, links, nearby: ' + (/Lea Lorenzana/.test(t) && /Event no\. 501/.test(t) && /Open Harbour Strength/.test(t) && /Harbour Strength paid ₱999/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-activity-detail.png' });
  await page.keyboard.press('Escape');

  // ---- Applications ---------------------------------------------------------------------------
  await page.goto('http://localhost:5175/applications', { waitUntil: 'domcontentloaded' });
  await page.getByText('Iron Den').first().waitFor({ timeout: 15000 });
  t = await text();
  out.push('the plan they want, where they heard, how to reach them: ' + (/Wants Premium, yearly/.test(t) && /Heard from Facebook/.test(t) && /Prefers Viber/.test(t) ? 'yes' : 'MISSING'));
  out.push('members they say they have, labelled: ' + (/120 Members they say they have/.test(t) ? 'yes' : 'MISSING'));
  out.push('where they come from has data: ' + (/How they heard of us/.test(t) && /Facebook/.test(t) && /Oriental Mindoro/.test(t) && /Plan they asked for/.test(t) ? 'yes' : 'MISSING'));
  out.push('call/SMS/Viber/email buttons: ' + ((await page.locator('.reach a[href^="tel:+63917"]').count()) === 1 && (await page.locator('.reach a[href^="viber://"]').count()) >= 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-applications.png' });
  await page.getByRole('button', { name: /Messages \(2\)/ }).click();
  await page.getByText('How much for 200 members?').waitFor({ timeout: 5000 });
  await page.locator('.modal textarea').fill('We can set you up this week.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('We can set you up this week.').waitFor({ timeout: 5000 });
  out.push('a conversation with the applicant: ' + (CALLS.some((c) => c[0] === 'reply' && c[1].p_id === 'a1') ? 'sent and shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-application-thread.png' });
  await page.keyboard.press('Escape');

  // ---- Money: verify a GCash payment --------------------------------------------------------------
  await page.goto('http://localhost:5175/money', { waitUntil: 'domcontentloaded' });
  await page.getByText('Payments to verify').waitFor({ timeout: 15000 });
  t = await text();
  out.push('a payment claim with its reference: ' + (/Harbour Strength · ₱999 by GCash/.test(t) && /GC 1234 5678/.test(t) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /Check it/ }).click();
  await page.locator('.proof').waitFor({ timeout: 5000 });
  const until = await page.locator('#pc-until').inputValue();
  out.push('covers-until continues from paid-until: ' + (until > day(12) ? until : 'MISSING ' + until));
  await page.screenshot({ path: 'shots/platform-verify-payment.png' });
  await page.getByRole('button', { name: /verify and record/ }).click();
  await page.waitForTimeout(500);
  out.push('verify records it: ' + (CALLS.some((c) => c[0] === 'verify' && c[1].p_claim === 'c1' && Number(c[1].p_amount) === 999) ? 'yes' : 'MISSING'));

  // ---- Settings: how gyms pay ----------------------------------------------------------------------
  await page.goto('http://localhost:5175/settings', { waitUntil: 'domcontentloaded' });
  await page.getByText('How gyms pay you').waitFor({ timeout: 15000 });
  await page.getByText('J. Dela Cruz · 0917 555 0101').waitFor({ timeout: 10000 }).catch(() => undefined);
  t = await text();
  out.push('ways to pay, with QR: ' + (/0917 555 0101/.test(t) && (await page.locator('img.qr-thumb').count()) === 1 ? 'yes' : 'MISSING ' + t.slice(t.indexOf('How gyms pay'), t.indexOf('How gyms pay') + 300)));
  await page.screenshot({ path: 'shots/platform-pay-methods.png' });

  // ---- Usage: AI --------------------------------------------------------------------------------------
  await page.goto('http://localhost:5175/usage', { waitUntil: 'domcontentloaded' });
  await page.getByText(/AI, last 30 days/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  t = await text();
  out.push('AI per gym: ' + (/96 AI coach messages/.test(t) && /14 members using the coach/.test(t) && /\$1\.23/.test(t) && /12 assistant questions/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-usage-ai.png' });

  // ---- Plans: the comparison, no stale notices ----------------------------------------------------------
  await page.goto('http://localhost:5175/plans', { waitUntil: 'domcontentloaded' });
  await page.getByText('What each plan gets').waitFor({ timeout: 15000 });
  t = await text();
  out.push('the two confusing notices are gone: ' + (!/plans have no price/.test(t) && !/exactly the same things/.test(t) ? 'yes' : 'STILL SHOWN'));
  out.push('the difference is visible: ' + (/1 feature differs/.test(t) && (await page.locator('.compare tr.diff').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-plans-compare.png' });

  // ---- Support access ---------------------------------------------------------------------------------------
  await page.goto('http://localhost:5175/support', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /Look inside/ }).first().waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: /Look inside/ }).first().click();
  await page.getByText(/Looking at gabby pogi 123 — read-only/).waitFor({ timeout: 10000 });
  await page.getByRole('tab', { name: /Invitations/ }).click();
  t = await text();
  out.push('support access opens the gym: ' + (/lea123@gmail.com/.test(t) && /Has one — must sign in/.test(t) ? 'yes, invitations explained' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-support-view.png' });

  // ---- Ctrl+K ---------------------------------------------------------------------------------------------
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search gyms, applicants/).waitFor({ timeout: 5000 });
  await page.keyboard.type('gc 1234');
  await page.waitForTimeout(500);
  t = await text();
  out.push('search finds a payment by reference: ' + (/Harbour Strength: ₱999 by GCash/.test(t) ? 'yes' : 'MISSING'));
  await page.getByPlaceholder(/Search gyms, applicants/).fill('ana@ironden');
  await page.waitForTimeout(300);
  t = await text();
  out.push('…an applicant by email: ' + (/Iron Den/.test(t) && /Applications/.test(t) ? 'yes' : 'MISSING'));
  await page.getByPlaceholder(/Search gyms, applicants/).fill('overdue');
  await page.waitForTimeout(300);
  t = await text();
  out.push('…a gym by its state: ' + (/Harbour Strength/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-search.png' });

  return out.join('\n');
}
