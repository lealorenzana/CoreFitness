/**
 * The website's applicant pages (2026-10-04): the apply form's Philippine place
 * picker (province → city/municipality → street, composed into one address),
 * the status link as a page of its own (no marketing sections around it), a way
 * to pay sent inside the conversation while still pending (0158) — number,
 * copy, QR enlarged — and "I've paid" sending the reference as a message.
 *
 * Playwright runner's `filename` argument, website dev server on :5176.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const out = [];
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const TOKEN = 'a'.repeat(64);
  const CALLS = [];
  const GCASH = { kind: 'gcash', label: 'GCash', account_name: 'J. Dela Cruz', account_number: '0917 555 0101', qr_image: PNG, instructions: 'Send the exact amount.' };
  const STATUS = {
    gym_name: 'Iron Den', owner_name: 'Ana Cruz', email: 'ana@ironden.ph', status: 'pending', reason: null, created_at: iso(2), decided_at: null,
    plan: { key: 'standard', name: 'Standard', price_monthly: '999', price_yearly: null, trial_days: null }, billing: 'monthly',
    gym_slug: null, paid_until: null, pay: null,
    contact: { name: 'Core Fitness', email: 'hello@corefitness.ph', phone: '0917 000 1111' },
    messages: [
      { from_platform: false, body: 'Can we pay now and start this week?', created_at: iso(1) },
      { from_platform: true, body: 'Yes — pay the first month here and we let you in today.', created_at: iso(0.5), sent_method: true, pay: GCASH },
      { from_platform: true, body: 'Old bank details', created_at: iso(0.4), sent_method: true, pay: null },
    ],
  };
  const RPC = {
    list_gyms: () => [], platform_price_list: () => [], platform_public_terms: () => null,
    application_status: () => STATUS,
    application_reply: (b) => { CALLS.push(['reply', b]); STATUS.messages.push({ from_platform: false, body: b.p_body, created_at: iso(0) }); return null; },
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
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5176' });

  // ---- the place picker -------------------------------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5176/#apply', { waitUntil: 'domcontentloaded' });
  const province = page.locator('#province');
  await province.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#province option').length > 50, null, { timeout: 10000 });
  const provinces = await province.locator('option').count();
  out.push('provinces listed: ' + (provinces >= 80 ? provinces - 1 : 'MISSING ' + provinces));
  out.push('town waits for a province: ' + (await page.locator('#town').isDisabled() ? 'yes' : 'NO'));
  await province.selectOption('Occidental Mindoro');
  const towns = await page.locator('#town option').allTextContents();
  out.push('Occidental Mindoro towns: ' + (towns.includes('Mamburao') && towns.includes('San Jose') && towns.length === 12 ? `${towns.length - 1}, Mamburao among them` : 'MISSING ' + towns.join('|')));
  await page.locator('#town').selectOption('Mamburao');
  await page.locator('#street').fill('Brgy. Payompon');
  const metro = await (async () => { await province.selectOption('Metro Manila'); return page.locator('#town option').allTextContents(); })();
  out.push('Metro Manila has its cities: ' + (metro.includes('Quezon City') && metro.includes('Makati City') ? 'yes' : 'MISSING ' + metro.slice(0, 5).join('|')));
  out.push('changing province clears the town: ' + ((await page.locator('#town').inputValue()) === '' ? 'yes' : 'NO'));
  await page.locator('.place-picker').screenshot({ path: 'shots/site-place-picker.png' });

  // ---- the status link is its own page -----------------------------------------------------------------
  await page.goto(`http://localhost:5176/#status/${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Iron Den', level: 1 }).waitFor();
  const t = await page.locator('main').innerText();
  out.push('a page of its own, no marketing around it: ' + ((await page.locator('.hero').count()) === 0 && (await page.locator('#pricing').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  out.push('opens at its top: ' + ((await page.evaluate(() => window.scrollY)) < 10 ? 'yes' : 'NO ' + (await page.evaluate(() => window.scrollY))));
  out.push('where it stands: ' + (/Being read/.test(t) && /Set up and pay/.test(t) ? 'yes' : 'MISSING'));
  out.push('the plan beside it: ' + (/Standard/.test(t) && /₱999 a month/.test(t) ? 'yes' : 'MISSING'));
  out.push('a way to pay, sent while pending: ' + (/0917 555 0101/.test(t) && (await page.locator('.bubble .pay-card').count()) === 1 ? 'yes, as a card' : 'MISSING'));
  out.push('a switched-off method says so: ' + (/no longer offered/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/site-status-page.png', fullPage: true });
  await page.locator('.pay-number button').click();
  out.push('copy the number: ' + ((await page.evaluate(() => navigator.clipboard.readText())) === '0917 555 0101' ? 'copied' : 'MISSING'));
  await page.locator('.pay-qr').click();
  out.push('the QR opens large: ' + ((await page.locator('.qr-big img').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/site-status-qr.png' });
  await page.locator('.qr-big').getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: "I've paid" }).click();
  await page.locator('#paid-amount').fill('999');
  await page.locator('#paid-ref').fill('GC 1234 5678');
  await page.locator('.paid-form').getByRole('button', { name: 'Send' }).click();
  await page.getByText('Reference number: GC 1234 5678').waitFor({ timeout: 5000 });
  const sent = CALLS.find((c) => c[0] === 'reply');
  out.push("I've paid sends the reference: " + (sent && sent[1].p_token === TOKEN && /I paid ₱999 by GCash\. Reference number: GC 1234 5678\./.test(sent[1].p_body) ? 'yes' : 'MISSING ' + JSON.stringify(sent)));

  // ---- phone width ---------------------------------------------------------------------------------------
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  out.push('no sideways scroll on a phone: ' + (overflow <= 0 ? 'yes' : 'NO, ' + overflow + 'px'));
  await page.screenshot({ path: 'shots/site-status-phone.png', fullPage: true });

  // ---- back to the site -------------------------------------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.status-back').click();
  await page.locator('.hero').waitFor({ timeout: 5000 });
  out.push('back to the site: ' + ((await page.locator('.status-page').count()) === 0 ? 'yes' : 'STILL SHOWN'));
  return out.join('\n');
}
