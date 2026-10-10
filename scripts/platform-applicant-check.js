/**
 * 0187 on the platform: each application's documents (n/6 verified, how many
 * to check), Let them in shut until all six are verified, verifying and
 * rejecting with a reason (each verdict offered to the applicant by email, and
 * the screen saying honestly that no mail provider is set), Called off as its
 * own list, and deleting a called-off applicant's account (files first).
 *
 * Fixture from platform-onboarding-check.js.
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
  APPS.push({ id: 'a4', gym_name: 'Quit Gym', owner_name: 'Quinn Q', email: 'q@quit.ph', phone: '09170001111', address: null, member_estimate: null,
    message: null, status: 'withdrawn', reason: null, gym_id: null, created_at: iso(9), duplicates: 0, already_a_gym: false });
  const KINDS = [
    { kind: 'permit', label: "Mayor's / business permit (this year)", needs_expiry: true, sort_order: 1 },
    { kind: 'dti_sec', label: 'DTI or SEC registration', needs_expiry: false, sort_order: 2 },
    { kind: 'bir_2303', label: 'BIR Certificate of Registration (2303)', needs_expiry: false, sort_order: 3 },
    { kind: 'barangay', label: 'Barangay business clearance', needs_expiry: true, sort_order: 4 },
    { kind: 'owner_id', label: "Owner's valid government ID", needs_expiry: true, sort_order: 5 },
    { kind: 'front_photo', label: "Photo of the gym's front and signage", needs_expiry: false, sort_order: 6 },
  ];
  // Iron Den: five verified, the ID waiting to be checked. Bulwark: everything verified.
  const DOCS = { a1: KINDS.map((k, i) => ({ id: 'd' + i, kind: k.kind, label: k.label, path: `a1/${k.kind}.jpg`, file_name: k.kind + '.jpg',
    expires_on: k.needs_expiry ? day(-200) : null, status: k.kind === 'owner_id' ? 'pending' : 'verified', reason: null, uploaded_at: iso(1), reviewed_at: null })) };
  const summary = (id) => {
    const d = DOCS[id] ?? [];
    const missing = id === 'a2' ? [] : KINDS.filter((k) => !d.some((x) => x.kind === k.kind && x.status === 'verified')).map((k) => k.label);
    return { application_id: id, verified: 6 - missing.length, waiting: d.filter((x) => x.status === 'pending').length, rejected: d.filter((x) => x.status === 'rejected').length, missing };
  };


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
    platform_application_send_payment: (b) => { CALLS.push(['sendpay', b]); THREAD.push({ id: 'm4', from_platform: true, body: b.p_note || 'Here is how to pay — GCash.', author_name: 'Lea', created_at: iso(0), method_label: 'GCash', method_kind: 'gcash' }); return null; },
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

  Object.assign(RPC, {
    platform_application_documents_summary: () => ['a1', 'a2', 'a3', 'a4'].map(summary),
    platform_application_accounts: () => [{ application_id: 'a1', has_account: true }, { application_id: 'a4', has_account: true }],
    application_document_kinds: () => KINDS,
    application_documents_of: (b) => DOCS[b.p_application] ?? [],
    platform_review_document: (b) => { CALLS.push(['review', b]); for (const list of Object.values(DOCS)) for (const d of list) if (d.id === b.p_document) { d.status = b.p_ok ? 'verified' : 'rejected'; d.reason = b.p_reason; } return null; },
    platform_delete_applicant: (b) => { CALLS.push(['delete', b]); return null; },
  });

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/functions/v1/send-email')) { CALLS.push(['email', JSON.parse(req.postData() || '{}')]); return json({ id: 'e1', configured: false, status: 'not_configured' }); }
    if (path.startsWith('/storage/v1/object/sign/applications/')) return json({ signedURL: '/storage/v1/object/sign/applications/x?token=t' });
    if (path.startsWith('/storage/v1/object/applications')) { CALLS.push(['remove', req.method(), req.postData()]); return json([]); }
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
  await page.goto('http://localhost:5175/applications', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-docs-chip]').first().waitFor({ timeout: 15000 });
  const iron = page.locator('.app-row').filter({ hasText: 'Iron Den' });
  const bulwark = page.locator('.app-row').filter({ hasText: 'Bulwark Gym' });
  out.push('each application says where its documents stand: ' + (/Documents 5\/6 verified/.test(await iron.innerText()) && /1 to check/.test(await iron.innerText())
    && /Documents 6\/6 verified/.test(await bulwark.innerText()) ? 'yes' : 'MISSING'));
  out.push('Let them in is shut until all six are verified: ' + ((await iron.getByRole('button', { name: 'Let them in' }).isDisabled())
    && !(await bulwark.getByRole('button', { name: 'Let them in' }).isDisabled()) ? 'yes' : 'NO'));
  out.push('whether there is an account to sign in with: ' + (/Has an account/.test(await iron.innerText()) && /No account/.test(await bulwark.innerText()) ? 'yes' : 'MISSING'));

  await iron.locator('[data-docs-chip]').click();
  await page.locator('[data-review-documents]').waitFor({ timeout: 8000 });
  out.push('the six documents, each to open: ' + ((await page.locator('[data-review-documents] [data-doc]').count()) === 6
    && (await page.locator('[data-review-documents]').getByRole('button', { name: 'Open' }).count()) === 6 ? 'yes' : 'MISSING'));
  const idRow = page.locator('[data-review-documents] [data-doc="owner_id"]');
  await idRow.getByRole('button', { name: 'Reject' }).click();
  out.push('rejecting needs a reason: ' + (await idRow.getByRole('button', { name: 'Reject' }).isDisabled() ? 'yes' : 'NO'));
  await idRow.getByLabel(/Why .* is rejected/).fill('The photo is blurred.');
  await idRow.getByRole('button', { name: 'Reject' }).click();
  await page.waitForTimeout(800);
  const rev = CALLS.find((c) => c[0] === 'review');
  out.push('a rejection is saved with its reason: ' + (rev && rev[1].p_document === 'd4' && rev[1].p_ok === false && rev[1].p_reason === 'The photo is blurred.' ? 'yes' : 'MISSING ' + JSON.stringify(rev)));
  const mail = CALLS.find((c) => c[0] === 'email');
  out.push('…the applicant is emailed the verdict: ' + (mail && mail[1].kind === 'application_documents' && mail[1].to === 'ana@ironden.ph' && /blurred/.test(mail[1].body) ? 'yes' : 'MISSING ' + JSON.stringify(mail)));
  let t = await text();
  out.push('…and the screen says plainly no mail went: ' + (/Not emailed — no mail provider is set up yet/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/platform-application-documents.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.locator('.filters').getByRole('button', { name: /Called off/ }).click();
  await page.waitForTimeout(300);
  const quit = page.locator('.app-row').filter({ hasText: 'Quit Gym' });
  out.push('called-off applications are their own list: ' + ((await quit.count()) === 1 && (await page.locator('.app-row').filter({ hasText: 'Iron Den' }).count()) === 0 ? 'yes' : 'MISSING'));
  await quit.getByRole('button', { name: 'Delete their account' }).click();
  await page.getByRole('button', { name: 'Delete the account' }).click();
  await page.waitForTimeout(800);
  out.push('their account can be deleted: ' + (CALLS.some((c) => c[0] === 'delete' && c[1].p_application === 'a4') ? 'yes' : 'MISSING'));
  return out.join('\n');
}
