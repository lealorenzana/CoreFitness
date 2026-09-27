/**
 * Billing -> Shop (0133), as the front desk: today's counter total and low stock, a sale
 * that adds up and stops at what is on the shelf, recording it (prices left to
 * the database), voiding with a reason, and no product or stock controls,
 * the sales report. The rules are proven in scripts/sql/shop.mjs.
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
      if (fn === 'record_sale') return json('s9');
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
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  page.on('dialog', (d) => void d.accept('Rang up twice'));
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
  await page.screenshot({ path: 'shots/admin-shop-sell.png' });
  await page.getByRole('button', { name: 'Record cash sale' }).click();
  await page.waitForTimeout(800);
  const sale = CALLS.find(([f]) => f === 'record_sale');
  out.push('recording a cash sale: ' + (sale && JSON.stringify(sale[1].p_items) === JSON.stringify([{ product_id: 'p1', qty: 2 }, { product_id: 'p3', qty: 1 }]) ? 'sent, prices left to the database' : 'MISSING ' + JSON.stringify(sale)));
  await page.getByRole('button', { name: 'Void' }).first().click();
  await page.waitForTimeout(800);
  const v = CALLS.find(([f]) => f === 'void_sale');
  out.push('voiding asks why: ' + (v && v[1].p_reason === 'Rang up twice' ? 'sent with the reason' : 'MISSING'));

  await page.getByRole('tab', { name: 'products' }).click();
  await page.waitForTimeout(400);
  seen = await text();
  out.push('products with stock: ' + (/24 in stock/.test(seen) && /hidden from the app/.test(seen) && /not counted/.test(seen) ? 'shown' : 'MISSING'));
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
  out.push('sales report: ' + (/₱840/.test(await text()) ? 'totals shown' : 'MISSING'));
  return out.join('\n');
}
