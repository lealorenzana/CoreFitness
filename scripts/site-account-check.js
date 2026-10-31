/**
 * Plan Part A (0222), the website: the account a gym owner applies with is their
 * gym-app login. An email account that is not confirmed is told to confirm it
 * and can have the link sent again; once in, the application shows how they
 * sign in — email and password, and Google — and Connect Google links Google to
 * the same account.
 *
 * Fixture from site-applicant-check.js. Website dev server on :5176.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const out = [];
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const TOKEN = 'b'.repeat(64);
  const APP = 'a1870000-0000-4000-8000-0000000000aa';
  const CALLS = [];
  /** Set for the Google part (0190): the session the auth endpoint hands back. */
  let GOOGLE = null;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const USER = { id: 'u-ana', aud: 'authenticated', role: 'authenticated', email: 'ana@ironden.ph', user_metadata: {}, app_metadata: {}, identities: [{ id: 'i1', provider: 'email', identity_data: { email: 'ana@ironden.ph' } }], created_at: iso(3) };
  let CONFIRMED = false;
  const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp, email: USER.email })}.sig`;
  const KINDS = [
    { kind: 'permit', label: "Mayor's / business permit (this year)", needs_expiry: true, sort_order: 1 },
    { kind: 'dti_sec', label: 'DTI or SEC registration', needs_expiry: false, sort_order: 2 },
    { kind: 'bir_2303', label: 'BIR Certificate of Registration (2303)', needs_expiry: false, sort_order: 3 },
    { kind: 'barangay', label: 'Barangay business clearance', needs_expiry: true, sort_order: 4 },
    { kind: 'owner_id', label: "Owner's valid government ID", needs_expiry: true, sort_order: 5 },
    { kind: 'front_photo', label: "Photo of the gym's front and signage", needs_expiry: false, sort_order: 6 },
  ];
  const APPLICATION = {
    id: APP, status_token: TOKEN, gym_name: 'Iron Den', owner_name: 'Ana Cruz', email: 'ana@ironden.ph', status: 'pending', reason: null,
    created_at: iso(2), decided_at: null, plan: null, billing: 'monthly', gym_slug: null, paid_until: null, pay: null, contact: null,
    messages: [{ from_platform: true, body: 'Thanks — please send your documents.', created_at: iso(1) }],
    documents: [
      { id: 'd1', kind: 'permit', label: KINDS[0].label, path: `${APP}/permit-1.jpg`, file_name: 'permit.jpg', expires_on: '2026-12-31', status: 'verified', reason: null, uploaded_at: iso(1), reviewed_at: iso(0.5) },
      { id: 'd2', kind: 'owner_id', label: KINDS[4].label, path: `${APP}/owner_id-1.jpg`, file_name: 'id.jpg', expires_on: '2030-01-01', status: 'rejected', reason: 'The photo is blurred.', uploaded_at: iso(1), reviewed_at: iso(0.5) },
    ],
    missing: KINDS.slice(1).map((k) => k.label),
  };
  const RPC = {
    list_gyms: () => [], platform_price_list: () => [], platform_public_terms: () => null,
    public_testimonials: () => [{ id: 'q1', quote: 'Core Fitness changed how we run the desk.', shown_name: 'Gabby P.', shown_role: 'Owner, G Fitness', gym_name: 'G Fitness', logo_url: null }],
    submit_gym_application: (b) => { CALLS.push(['submit', b]); return TOKEN; },
    application_document_kinds: () => KINDS,
    my_applications: () => [APPLICATION],
    add_application_document: (b) => { CALLS.push(['add', b]); APPLICATION.documents.unshift({ id: 'd9', kind: b.p_kind, label: KINDS.find((k) => k.kind === b.p_kind).label, path: b.p_path, file_name: b.p_file_name, expires_on: b.p_expires_on, status: 'pending', reason: null, uploaded_at: iso(0), reviewed_at: null }); return 'd9'; },
    my_application_reply: (b) => { CALLS.push(['reply', b]); APPLICATION.messages.push({ from_platform: false, body: b.p_body, created_at: iso(0) }); return null; },
    withdraw_my_application: (b) => { CALLS.push(['withdraw', b]); APPLICATION.status = 'withdrawn'; return null; },
  };
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (path.includes('/rpc/')) {
      const fn = path.split('/rpc/')[1];
      return json(fn in RPC ? RPC[fn](JSON.parse(req.postData() || '{}')) : null);
    }
    return json([]);
  });
  await page.route('**/auth/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.endsWith('/signup')) { CALLS.push(['signup', JSON.parse(req.postData() || '{}')]); return json(USER); }
    if (url.pathname.endsWith('/resend')) { CALLS.push(['resend', JSON.parse(req.postData() || '{}')]); return json({}); }
    if (url.pathname.includes('/user/identities/authorize')) { CALLS.push(['link', url.searchParams.get('provider')]); return json({ url: 'http://localhost:5176/#account?linked=google' }); }
    if (url.pathname.endsWith('/token') && !CONFIRMED) return json({ error: 'invalid_grant', error_code: 'email_not_confirmed', msg: 'Email not confirmed', error_description: 'Email not confirmed' }, 400);
    if (url.pathname.endsWith('/token')) {
      return json(GOOGLE ? GOOGLE : { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user: USER });
    }
    if (url.pathname.endsWith('/user') && req.method() === 'PUT') { CALLS.push(['setpw', JSON.parse(req.postData() || '{}')]); return json(GOOGLE ? GOOGLE.user : USER); }
    if (url.pathname.endsWith('/user')) return json(GOOGLE ? GOOGLE.user : USER);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return json({});
  });
  await page.route('**/storage/v1/object/applications/**', async (route) => {
    CALLS.push(['upload', new URL(route.request().url()).pathname]);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'applications/x', Id: 'o1' }) });
  });

  const say = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING ' + extra}`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- an email account that is not confirmed yet ----
  await page.goto('http://localhost:5176/#account', { waitUntil: 'domcontentloaded' });
  await page.locator('#acc-email').waitFor();
  await page.locator('#acc-email').fill('ana@ironden.ph');
  await page.locator('#acc-password').fill('correct-horse');
  await page.locator('form.account-form button[type=submit]').click();
  await page.waitForTimeout(1200);
  let t = await page.locator('main').innerText();
  say('signing in before confirming says to confirm first', /Confirm your email first/.test(t), t.slice(0, 300));
  say('…and offers to send the link again', (await page.locator('[data-resend]').count()) === 1);
  await page.locator('[data-resend]').click();
  await page.waitForTimeout(800);
  const rs = CALLS.find((c) => c[0] === 'resend');
  say('Send the link again sends the confirmation to that address', rs && rs[1].email === 'ana@ironden.ph' && rs[1].type === 'signup', JSON.stringify(rs));
  say('…and says so', /Sent again to ana@ironden\.ph/.test(await page.locator('main').innerText()));
  await page.screenshot({ path: 'shots/site-account-unconfirmed.png' });

  // ---- confirmed: signed in, the application shows how they sign in ----
  CONFIRMED = true;
  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('[data-documents]').waitFor({ timeout: 8000 });
  await page.locator('[data-signin-methods]').waitFor({ timeout: 8000 }).catch(() => {});
  const box = await page.locator('[data-signin-methods]').innerText().catch(() => '');
  say('signed in, the page says this account is their gym app login', /login to the gym app/.test(box), box.replace(/\s+/g, ' '));
  say('…email and password, and Google not connected yet', /Email and password/.test(box) && /ana@ironden\.ph/.test(box) && /Not connected/.test(box));
  await page.screenshot({ path: 'shots/site-account-methods.png', fullPage: true });
  await page.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, body: 'google' }));
  await page.locator('[data-connect-google]').click();
  await page.waitForTimeout(1500);
  say('Connect Google links Google to this same account', CALLS.some((c) => c[0] === 'link' && c[1] === 'google'), JSON.stringify(CALLS.map((c) => c[0])));
  return out.join('\n');
}
