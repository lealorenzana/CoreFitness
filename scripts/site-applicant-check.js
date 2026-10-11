/**
 * 0187 on the website: the apply form makes an account (the sign-up carries the
 * application's token), and #account signs the applicant in to their
 * application — the six documents with what was made of each, sending one
 * (upload into the application's folder, then filed), writing to Core Fitness
 * and calling it off.
 *
 * Playwright runner's `filename` argument, website dev server on :5176.
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
  const USER = { id: 'u-ana', aud: 'authenticated', role: 'authenticated', email: 'ana@ironden.ph', user_metadata: {}, app_metadata: {}, identities: [{ id: 'i1' }], created_at: iso(3) };
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
    if (url.pathname.endsWith('/token')) {
      return json(GOOGLE ? GOOGLE : { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user: USER });
    }
    if (url.pathname.endsWith('/user')) return json(GOOGLE ? GOOGLE.user : USER);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    return json({});
  });
  await page.route('**/storage/v1/object/applications/**', async (route) => {
    CALLS.push(['upload', new URL(route.request().url()).pathname]);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'applications/x', Id: 'o1' }) });
  });

  // ---- the apply form makes an account -------------------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5176/#apply', { waitUntil: 'domcontentloaded' });
  await page.locator('#gym_name').waitFor();
  await page.locator('#voices').waitFor({ timeout: 8000 }).catch(() => {});
  out.push('approved owners\' words are on the page: ' + (/Core Fitness changed how we run the desk\./.test(await page.locator('main').innerText()) && /Owner, G Fitness/.test(await page.locator('main').innerText()) ? 'yes' : 'MISSING'));
  out.push('the form asks for a password: ' + ((await page.locator('#password').count()) === 1 && (await page.locator('#password2').count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('#gym_name').fill('Iron Den');
  await page.locator('#owner_name').fill('Ana Maria Cruz');
  await page.locator('#email').fill('ana@ironden.ph');
  await page.locator('#phone').fill('09171234567');
  await page.locator('#password').fill('correct-horse');
  await page.locator('#password2').fill('different');
  await page.locator('form.apply button[type=submit]').click();
  await page.waitForTimeout(300);
  out.push('mismatched passwords are caught first: ' + ((await page.getByText('The two passwords do not match.').count()) === 1 && !CALLS.some((c) => c[0] === 'submit') ? 'yes' : 'MISSING'));
  await page.locator('#password2').fill('correct-horse');
  await page.locator('form.apply button[type=submit]').click();
  await page.locator('[data-account-made]').waitFor({ timeout: 8000 });
  const su = CALLS.find((c) => c[0] === 'signup');
  out.push('the account carries the application token: ' + (su && su[1].data?.signup_source === 'gym_applicant' && su[1].data?.application_token === TOKEN
    && su[1].data?.first_name === 'Ana' && su[1].data?.last_name === 'Maria Cruz' ? 'yes' : 'MISSING ' + JSON.stringify(su)));
  out.push('…after the application went in: ' + (CALLS.findIndex((c) => c[0] === 'submit') < CALLS.findIndex((c) => c[0] === 'signup') ? 'yes' : 'NO'));
  out.push('the page says to confirm the email: ' + (/Confirm your email/.test(await page.locator('#apply').innerText()) ? 'yes' : 'MISSING'));

  // ---- signing in to the application -----------------------------------------------------------------------
  await page.goto('http://localhost:5176/#account', { waitUntil: 'domcontentloaded' });
  await page.locator('#acc-email').waitFor();
  await page.locator('#acc-email').fill('ana@ironden.ph');
  await page.locator('#acc-password').fill('correct-horse');
  await page.locator('form.account-form button[type=submit]').click();
  await page.locator('[data-documents]').waitFor({ timeout: 8000 });
  let t = await page.locator('main').innerText();
  out.push('signed in, their application opens: ' + (/Iron Den/.test(t) && /signed in as ana@ironden\.ph/i.test(t) ? 'yes' : 'MISSING'));
  out.push('six documents, with what was made of each: ' + ((await page.locator('[data-doc]').count()) === 6 && /1 of 6 verified/.test(t)
    && /The photo is blurred\./.test(t) ? 'yes' : 'MISSING ' + (await page.locator('[data-doc]').count())));
  out.push('a verified one cannot be resent here: ' + ((await page.locator('[data-doc="permit"] input[type=file]').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.screenshot({ path: 'shots/site-applicant-documents.png', fullPage: true });

  // send the BIR 2303 (no expiry) and the ID (expiry)
  await page.locator('[data-doc="bir_2303"] input[type=file]').setInputFiles({ name: '2303.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.locator('[data-doc="bir_2303"]').getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(800);
  const add = CALLS.find((c) => c[0] === 'add');
  const up = CALLS.find((c) => c[0] === 'upload');
  out.push('a document uploads into the application\'s folder, then is filed: ' + (up && up[1].includes(`/applications/${APP}/bir_2303-`)
    && add && add[1].p_application === APP && add[1].p_kind === 'bir_2303' && add[1].p_path.startsWith(`${APP}/bir_2303-`) && add[1].p_expires_on === null ? 'yes' : 'MISSING ' + JSON.stringify([up, add])));
  out.push('…and shows as sent: ' + (/Sent — we are checking it/.test(await page.locator('[data-doc="bir_2303"]').innerText()) ? 'yes' : 'MISSING'));
  const idRow = page.locator('[data-doc="owner_id"]');
  await idRow.locator('input[type=file]').setInputFiles({ name: 'id.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) });
  await idRow.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(300);
  out.push('an ID needs its expiry date: ' + (/Give the date it expires/.test(await idRow.innerText()) ? 'yes' : 'MISSING'));
  await idRow.getByLabel('Month').selectOption('3');
  await idRow.getByLabel('Day').selectOption('15');
  const yearOpts = await idRow.getByLabel('Year').locator('option').allTextContents();
  await idRow.getByLabel('Year').selectOption(yearOpts[3]);
  out.push('the year list starts this year (no past years): ' + (Number(yearOpts[1]) === new Date().getFullYear() ? 'yes' : 'NO ' + yearOpts[1]));
  await idRow.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(800);
  const add2 = CALLS.filter((c) => c[0] === 'add')[1];
  out.push('…sent with it: ' + (add2 && add2[1].p_kind === 'owner_id' && add2[1].p_expires_on === `${yearOpts[3]}-03-15` ? 'yes' : 'MISSING ' + JSON.stringify(add2)));

  await page.locator('.compose textarea').fill('Sent the 2303 and a clearer ID.');
  await page.locator('.compose').getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(600);
  const rep = CALLS.find((c) => c[0] === 'reply');
  out.push('writing goes through the account, not a link: ' + (rep && rep[1].p_application === APP && !('p_token' in rep[1]) ? 'yes' : 'MISSING ' + JSON.stringify(rep)));

  await page.getByRole('button', { name: 'Call off this application' }).click();
  await page.getByRole('button', { name: 'Call it off' }).click();
  await page.waitForTimeout(800);
  t = await page.locator('main').innerText();
  out.push('they can call it off: ' + (CALLS.some((c) => c[0] === 'withdraw' && c[1].p_application === APP) && /Called off/.test(t) ? 'yes' : 'MISSING'));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out.push('no sideways scroll on a phone: ' + (overflow <= 0 ? 'yes' : 'NO, ' + overflow + 'px'));
  await page.evaluate(() => localStorage.clear());

  // ---- 0190: applying with Google — filled in, no password, one step at a time ----
  const GUSER = { ...USER, id: 'u-g', email: 'gabby.owner@gmail.com', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Gabby Owner' } };
  const GSESSION = { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r2', user: GUSER };
  CALLS.length = 0;
  await page.setViewportSize({ width: 1280, height: 900 });
  GOOGLE = GSESSION;
  // Signed in as the Google account (what the PKCE return leaves behind), then the form.
  await page.goto('about:blank');
  await page.goto('http://localhost:5176/#account', { waitUntil: 'domcontentloaded' });
  await page.locator('#acc-email').fill('gabby.owner@gmail.com');
  await page.locator('#acc-password').fill('x-test');
  await page.locator('form.account-form button[type=submit]').click();
  await page.waitForTimeout(1200);
  await page.goto('about:blank');
  await page.goto('http://localhost:5176/#apply', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-google-apply]').waitFor({ timeout: 10000 }).catch(async () => { throw new Error('no google mode: ' + JSON.stringify(await page.evaluate(() => Object.keys(localStorage))) + ' ' + (await page.locator('#apply').innerText()).slice(0, 160)); });
  out.push('applying with Google says who, and that it goes step by step: ' + (/Applying as gabby\.owner@gmail\.com with Google — step 1 of 2/.test(await page.locator('#apply').innerText()) ? 'yes' : 'MISSING'));
  out.push('the name and email come from Google, the email fixed: ' + ((await page.locator('#owner_name').inputValue()) === 'Gabby Owner'
    && (await page.locator('#email').inputValue()) === 'gabby.owner@gmail.com' && (await page.locator('#email').getAttribute('readonly')) !== null ? 'yes' : 'MISSING'));
  out.push('no password to choose: ' + ((await page.locator('#password').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  out.push('one step at a time: ' + ((await page.locator('#heard_from').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  await page.locator('[data-google-next]').click();
  await page.waitForTimeout(200);
  out.push('Next waits for the gym\u2019s details: ' + (/Fill in the gym/.test(await page.locator('#apply').innerText()) ? 'yes' : 'MISSING'));
  await page.locator('#gym_name').fill('Owner Gym');
  await page.locator('#phone').fill('09175550000');
  await page.locator('[data-google-next]').click();
  await page.locator('#heard_from').waitFor({ timeout: 5000 });
  await page.locator('form.apply button[type=submit]').click();
  await page.locator('[data-account-google]').waitFor({ timeout: 8000 });
  const gs = CALLS.find((c) => c[0] === 'submit');
  out.push('sent under the Google address, and no second account made: ' + (gs && gs[1].p_email === 'gabby.owner@gmail.com' && gs[1].p_owner_name === 'Gabby Owner'
    && !CALLS.some((c) => c[0] === 'signup') ? 'yes' : 'MISSING ' + JSON.stringify(gs)));
  await page.evaluate(() => localStorage.clear());
  return out.join('\n');
}
