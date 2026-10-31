/**
 * 0224 on the website: paying for the plan before approval. Signed in, an
 * application on a paid plan shows *Pay for your plan* — waiting for the six
 * documents, then open: PayMongo (the price from the database) or a GCash /
 * Maya / bank reference; then "being checked", a refusal with its reason, and
 * paid after PayMongo brings them back (reconciled). The free trial shows none.
 *
 * Playwright runner's `filename` argument, website dev server on :5176.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const out = [];
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const APP = 'a2240000-0000-4000-8000-0000000000aa';
  const CALLS = [];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const USER = { id: 'u-ana', aud: 'authenticated', role: 'authenticated', email: 'ana@ironden.ph', user_metadata: {}, app_metadata: {}, identities: [{ id: 'i1' }], created_at: iso(3) };
  const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp, email: USER.email })}.sig`;
  const KINDS = ['permit', 'dti_sec', 'bir_2303', 'barangay', 'owner_id', 'front_photo'].map((k, i) => ({ kind: k, label: k, needs_expiry: false, sort_order: i + 1 }));
  const APPLICATION = {
    id: APP, status_token: 'c'.repeat(64), gym_name: 'Iron Den', owner_name: 'Ana Cruz', email: 'ana@ironden.ph', status: 'pending', reason: null,
    created_at: iso(2), decided_at: null, plan: { key: 'starter', name: 'Starter', price_monthly: '1499', price_yearly: '14990', trial_days: null },
    billing: 'monthly', gym_slug: null, paid_until: null, pay: null, contact: null, messages: [],
    documents: KINDS.map((k, i) => ({ id: 'd' + i, kind: k.kind, label: k.label, path: `${APP}/${k.kind}.jpg`, file_name: k.kind + '.jpg', expires_on: null, status: 'verified', reason: null, uploaded_at: iso(1), reviewed_at: iso(0.5) })),
    missing: [],
  };
  let STATE = { due: true, plan_name: 'Starter', months: 1, amount: 1499, ready: false, paid: false, last: null };
  const METHODS = [{ id: 'm1', kind: 'gcash', label: 'GCash · Core Fitness', account_name: 'Core Fitness', account_number: '0917 555 0101', qr_image: null, instructions: null, sort_order: 1, active: true }];
  const RPC = {
    list_gyms: () => [], platform_price_list: () => [], platform_public_terms: () => null, public_testimonials: () => [],
    application_document_kinds: () => KINDS,
    my_applications: () => [APPLICATION],
    platform_payment_options: () => METHODS,
    application_payment_state: () => STATE,
    claim_application_payment: (b) => { CALLS.push(['claim', b]);
      STATE = { ...STATE, last: { id: 'p1', status: 'pending', method_label: 'GCash · Core Fitness', reference: b.p_reference, amount: 1499, reason: null, created_at: iso(0), decided_at: null } }; return 'p1'; },
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
  await page.route('**/functions/v1/paymongo-checkout', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    CALLS.push(['paymongo', body]);
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
    if (body.probe) return json({ configured: true });
    if (body.reconcile) {
      STATE = { ...STATE, paid: true, last: { id: 'p2', status: 'paid', method_label: 'PayMongo · gcash', reference: 'pay_1', amount: 1499, reason: null, created_at: iso(0), decided_at: iso(0) } };
      return json({ status: 'paid' });
    }
    // The checkout "page": straight back to the site, as PayMongo's success_url does.
    return json({ configured: true, id: 'ck1', url: `${body.returnUrl}&paid=ck1` });
  });
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.endsWith('/token')) return json({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user: USER });
    if (url.pathname.endsWith('/user')) return json(USER);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return json({});
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5176/#account', { waitUntil: 'domcontentloaded' });
  await page.locator('#acc-email').waitFor();
  await page.locator('#acc-email').fill('ana@ironden.ph');
  await page.locator('#acc-password').fill('correct-horse');
  await page.locator('form.account-form button[type=submit]').click();
  const pay = page.locator('[data-pay-plan]');
  await pay.waitFor({ timeout: 8000 });
  let t = await pay.innerText();
  out.push('a paid plan shows Pay for your plan, waiting for the documents: ' + (/₱1,499 for a month/.test(t) && (await page.locator('[data-pay-state="waiting"]').count()) === 1
    && (await page.locator('[data-pay-online]').count()) === 0 ? 'yes' : 'MISSING ' + t));
  out.push('the page says a paid plan pays before being let in: ' + (/you pay here once your six documents are verified/.test(await page.locator('main').innerText()) ? 'yes' : 'MISSING'));

  STATE = { ...STATE, ready: true };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-pay-state="open"]').waitFor({ timeout: 8000 });
  t = await pay.innerText();
  out.push('all six verified: pay online, or send a reference: ' + ((await page.locator('[data-pay-online]').count()) === 1 && /Pay ₱1,499 online/.test(t)
    && (await page.locator('[data-pay-reference]').count()) === 1 && /0917 555 0101/.test(t) ? 'yes' : 'MISSING ' + t));
  await page.screenshot({ path: 'shots/site-pay-open.png', fullPage: true });
  const send = page.locator('[data-pay-reference] button[type=submit]');
  out.push('a reference needs a real number: ' + (await send.isDisabled() ? 'yes' : 'NO'));
  await page.locator('#pay-ref').fill('GC-123456');
  await send.click();
  await page.locator('[data-pay-state="checking"]').waitFor({ timeout: 8000 });
  const claim = CALLS.find((c) => c[0] === 'claim');
  out.push('the reference is sent with the method, never an amount: ' + (claim && claim[1].p_application === APP && claim[1].p_method === 'm1'
    && claim[1].p_reference === 'GC-123456' && !('p_amount' in claim[1]) ? 'yes' : 'MISSING ' + JSON.stringify(claim)));
  out.push('…and the page says it is being checked: ' + (/checking your GCash · Core Fitness payment \(ref GC-123456/.test(await pay.innerText()) ? 'yes' : 'MISSING'));

  STATE = { ...STATE, last: { ...STATE.last, status: 'refused', reason: 'No GCash payment with that reference.' } };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-pay-refused]').waitFor({ timeout: 8000 });
  out.push('a refusal shows its reason, and they can send again: ' + (/No GCash payment with that reference\./.test(await pay.innerText())
    && (await page.locator('[data-pay-reference]').count()) === 1 ? 'yes' : 'MISSING'));

  await page.locator('[data-pay-online]').click();
  await page.locator('[data-pay-state="paid"]').waitFor({ timeout: 10000 });
  const open = CALLS.find((c) => c[0] === 'paymongo' && c[1].purpose);
  out.push('PayMongo is asked for the application, with no price from the page: ' + (open && open[1].purpose === 'application' && open[1].details?.application === APP
    && !('amount' in (open[1].details ?? {})) && open[1].returnUrl.startsWith('http://localhost:5176/') ? 'yes' : 'MISSING ' + JSON.stringify(open)));
  out.push('back from PayMongo, the payment is checked and shown paid: ' + (CALLS.some((c) => c[0] === 'paymongo' && c[1].reconcile === 'ck1')
    && /Paid — Starter, ₱1,499 for a month/.test(await pay.innerText()) ? 'yes' : 'MISSING ' + (await pay.innerText())));
  out.push('…and the address is clean again: ' + (!/paid=/.test(page.url()) && page.url().endsWith('#account') ? 'yes' : 'NO ' + page.url()));
  await page.screenshot({ path: 'shots/site-pay-paid.png', fullPage: true });

  STATE = { due: false, plan_name: null, months: null, amount: null, ready: true, paid: false, last: null };
  APPLICATION.plan = { key: 'trial', name: 'Free trial', price_monthly: '0', price_yearly: null, trial_days: 7 };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-documents]').waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  out.push('the free trial pays nothing first: ' + ((await page.locator('[data-pay-plan]').count()) === 0
    && /The free trial needs no payment/.test(await page.locator('main').innerText()) ? 'yes' : 'MISSING'));

  await page.evaluate(() => localStorage.clear());
  return out.join('\n');
}
