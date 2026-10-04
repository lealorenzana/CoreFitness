/**
 * Billing -> Shop (0133), as the front desk: today's counter total and low stock, a sale
 * that adds up and stops at what is on the shelf, search and category chips,
 * "who is buying" linking a member, cash received -> change, recording it
 * (prices left to the database) and its receipt, voiding with a reason, no
 * product or stock controls, the sales report. The rules are proven in scripts/sql/shop.mjs.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'desk@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const desk = { id: 'u1', role: 'admin', status: 'active', first_name: 'Dee', last_name: 'Desk',
    email: 'desk@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const later = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const minute = new Date(Date.now() - 3600_000).toISOString();

  const ROLE = 'staff';
  const CALLS = [];
  const PRODUCTS = [
    { id: 'p1', name: 'Water 500ml', category: 'Drinks', description: null, price: 20, photo_url: null, track_stock: true, stock: 24, low_stock_at: 5, shown_in_app: true, active: true },
    { id: 'p2', name: 'Whey scoop', category: 'Supplements', description: null, price: 60, photo_url: null, track_stock: true, stock: 2, low_stock_at: 3, shown_in_app: true, active: true },
    { id: 'p3', name: 'Towel rental', category: 'Other', description: null, price: 15, photo_url: null, track_stock: false, stock: 0, low_stock_at: 5, shown_in_app: false, active: true },
  ];
  const SALES = [{ id: 's0', sale_day: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), total: 40, created_at: minute,
    voided_at: null, void_reason: null, member: { first_name: 'Ana', last_name: 'Reyes' }, seller: { first_name: 'Dee', last_name: 'Desk' },
    shop_sale_items: [{ qty: 2, unit_price: 20, shop_products: { name: 'Water 500ml' } }] }];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      CALLS.push([fn, b]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: ROLE, status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'record_sale') {
        SALES.unshift({ id: 's9', sale_day: SALES[0].sale_day, total: 55, created_at: new Date().toISOString(), voided_at: null, void_reason: null,
          member: { first_name: 'Ana', last_name: 'Reyes' }, seller: { first_name: 'Dee', last_name: 'Desk' },
          shop_sale_items: [{ qty: 2, unit_price: 20, shop_products: { name: 'Water 500ml' } }, { qty: 1, unit_price: 15, shop_products: { name: 'Towel rental' } }] });
        return json('s9');
      }
      if (fn === 'void_sale') { SALES[0].voided_at = new Date().toISOString(); SALES[0].void_reason = b.p_reason; return json(null); }
      if (fn === 'save_product') return json('p9');
      if (fn === 'move_stock') return json(48);
      if (fn === 'shop_report') return json([{ product_id: 'p1', name: 'Water 500ml', qty: 30, revenue: 600 }, { product_id: 'p2', name: 'Whey scoop', qty: 4, revenue: 240 }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'shop_products') return json(PRODUCTS);
    if (t === 'shop_sales') return json(SALES);
    if (t === 'gym_people' && /role=eq\.member/.test(req.url())) return json([{ id: 'm1', first_name: 'Ana', last_name: 'Reyes', email: 'ana@x.ph', photo_url: null }]);
    if (t === 'gym_settings') return json(one ? { gym_name: 'Harbour Strength', address: 'Rizal St', phone: null, email: null, logo_url: null } : []);
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5174/shop', { waitUntil: 'domcontentloaded' });
  await page.getByText('Water 500ml').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  let seen = await text();
  out.push('today and low stock: ' + (/Counter sales today: ₱40/.test(seen) && /1 running low/.test(seen) ? 'shown' : 'MISSING'));
  await page.getByRole('button', { name: 'Add Water 500ml' }).click();
  await page.getByRole('button', { name: 'Add Water 500ml' }).click();
  await page.getByRole('button', { name: 'Add Towel rental' }).click();
  seen = await text();
  out.push('the sale adds up: ' + (/₱55/.test(seen) ? '₱55' : 'MISSING'));
  out.push('cannot add more than the shelf has: ' + (await (async () => { await page.getByRole('button', { name: 'Add Whey scoop' }).click(); await page.getByRole('button', { name: 'Add Whey scoop' }).click();
    return await page.getByRole('button', { name: 'Add Whey scoop' }).isDisabled(); })() ? 'stops at 2' : 'MISSING'));
  await page.getByRole('button', { name: 'One less Whey scoop' }).click();
  await page.getByRole('button', { name: 'One less Whey scoop' }).click();
  // Find by name, filter by category chip.
  await page.getByLabel('Find a product').fill('whey');
  out.push('search narrows the till: ' + ((await page.getByRole('button', { name: /^Add / }).count()) === 1 ? 'Whey only' : 'MISSING'));
  await page.getByLabel('Find a product').fill('');
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Drinks' }).click();
  out.push('category chips: ' + ((await page.getByRole('button', { name: /^Add / }).count()) === 1 ? 'Drinks -> Water' : 'MISSING'));
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'All' }).click();
  // Who is buying: a member picker, and what it does is said where it is asked.
  seen = await text();
  out.push('who is buying is explained: ' + (/Who is buying\? \(optional\)/.test(seen) && /shows on their profile/.test(seen) ? 'yes' : 'MISSING'));
  await page.getByLabel('Who is buying').fill('Ana Re');
  await page.getByRole('option', { name: /Ana Reyes/ }).click();
  // Cash received -> change; short cash cannot be recorded.
  await page.getByLabel('Cash received').fill('50');
  out.push('short cash blocks recording: ' + (/Still owed ₱5/.test(await text()) && await page.getByRole('button', { name: /Record cash sale/ }).isDisabled() ? 'yes' : 'MISSING'));
  await page.getByLabel('Cash received').fill('100');
  out.push('change due: ' + (/Change ₱45/.test(await text()) ? '₱45 from ₱100' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-shop-sell.png' });
  await page.getByRole('button', { name: /Record cash sale/ }).click();
  await page.locator('.receipt-paper').waitFor({ timeout: 5000 });
  const sale = CALLS.find(([f]) => f === 'record_sale');
  out.push('recording a cash sale: ' + (sale && JSON.stringify(sale[1].p_items) === JSON.stringify([{ product_id: 'p1', qty: 2 }, { product_id: 'p3', qty: 1 }]) && sale[1].p_member === 'm1' ? 'sent with the member, prices left to the database' : 'MISSING ' + JSON.stringify(sale)));
  const rt = (await page.locator('.receipt-paper').innerText()).replace(/\s+/g, ' ');
  out.push('a receipt with the change: ' + (/SALES RECEIPT/.test(rt) && /Ana Reyes/.test(rt) && /2 × Water 500ml/.test(rt) && /Change ₱45\.00/.test(rt) ? 'yes' : 'MISSING ' + rt));
  await page.screenshot({ path: 'shots/admin-shop-receipt.png' });
  await page.keyboard.press('Escape');
  out.push('the ticket is cleared for the next sale: ' + (/Tap a product to start a sale/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Void' }).last().click();
  await page.getByLabel('Why is this sale voided').fill('Rang up twice');
  await page.getByRole('button', { name: 'Void sale' }).click();
  await page.waitForTimeout(800);
  const v = CALLS.find(([f]) => f === 'void_sale');
  out.push('voiding asks why: ' + (v && v[1].p_reason === 'Rang up twice' ? 'sent with the reason' : 'MISSING'));

  await page.getByRole('tab', { name: 'products' }).click();
  await page.waitForTimeout(400);
  seen = await text();
  out.push('products with stock: ' + (/24 in stock/.test(seen) && /hidden from the app/.test(seen) && /not counted/.test(seen) ? 'shown' : 'MISSING'));
  out.push('low stock alert: ' + (/1 running low/.test(seen) && /Whey scoop \(2 left\)/.test(seen) ? 'Whey scoop, 2 left' : 'MISSING'));
  if (ROLE === 'admin') {
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByLabel('Product name').fill('Protein bar');
    await page.getByLabel('Category').fill('Snacks');
    await page.getByLabel('Price').fill('75');
    await page.getByLabel('How many you have now').fill('3');
    await page.screenshot({ path: 'shots/admin-shop-form.png' });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(600);
    const sp = CALLS.find(([f]) => f === 'save_product');
    out.push('the owner adds a product: ' + (sp && sp[1].p_name === 'Protein bar' && sp[1].p_price === 75 ? 'saved' : 'MISSING ' + JSON.stringify(sp)));
    const open = CALLS.find(([f, b]) => f === 'move_stock' && b.p_note === 'Opening stock');
    out.push('what they have now becomes the opening stock: ' + (open && open[1].p_product === 'p9' && open[1].p_qty === 3 && open[1].p_reason === 'delivery' ? '3, recorded' : 'MISSING ' + JSON.stringify(open)));
    await page.getByRole('button', { name: 'Delivery' }).first().click();
    await page.getByLabel('Quantity').fill('24');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(600);
    const mv = CALLS.find(([f, b]) => f === 'move_stock' && b.p_qty === 24);
    out.push('the owner records a delivery: ' + (mv && mv[1].p_reason === 'delivery' && mv[1].p_qty === 24 ? 'recorded' : 'MISSING ' + JSON.stringify(mv)));
    await page.screenshot({ path: 'shots/admin-shop-products.png' });
  } else {
    out.push('the desk cannot manage products: ' + ((await page.getByRole('button', { name: 'Add product' }).count()) === 0
      && (await page.getByRole('button', { name: 'Delivery' }).count()) === 0 ? 'no controls' : 'MISSING'));
  }
  await page.getByRole('tab', { name: 'sales' }).click();
  await page.waitForTimeout(600);
  seen = await text();
  out.push('sales report: ' + (/₱840/.test(seen) && /Best sellers/.test(seen) && /Every sale/.test(seen) ? 'totals, best sellers, every sale' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-shop-sales.png' });
  return out.join('\n');
}
