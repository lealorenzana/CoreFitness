/**
 * Reports → Revenue with the shop (2026-10-04): when the gym runs the shop,
 * counter sales are their own line — added to the total, a tile, a segment on
 * each month's bar, best sellers — with voids never counted; switched off, the
 * page is memberships alone.
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

  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const year = day.slice(0, 4);
  const run = async (shopOn) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
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
        if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
          role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
          gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
        if (fn === 'my_gym_app') return json([{ modules: { shop: shopOn } }]);
        if (fn === 'shop_report') return json([{ product_id: 'p1', name: 'Water 500ml', qty: 30, revenue: 600 }, { product_id: 'p2', name: 'Whey scoop', qty: 4, revenue: 240 }]);
        return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
      }
      if (!path.startsWith('/rest/v1/')) return json([]);
      const t = path.split('/rest/v1/')[1];
      if (t === 'payments') return json([{ id: 'pay1', amount: 1500, status: 'completed', member_id: 'm1', paid_on: day, invoice_number: 'INV-1', created_at: minute }]);
      if (t === 'shop_sales') return json([
        { id: 's1', sale_day: day, total: 840, created_at: minute, voided_at: null, void_reason: null, member: null, seller: null, shop_sale_items: [] },
        { id: 's2', sale_day: day, total: 999, created_at: minute, voided_at: minute, void_reason: 'twice', member: null, seller: null, shop_sale_items: [] },
      ]);
      if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
      return json(one ? null : []);
    });
    await page.goto('http://localhost:5174/revenue', { waitUntil: 'domcontentloaded' });
    await page.getByText('Monthly breakdown').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  };

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  let t = await run(true);
  out.push('shop on: total is memberships + shop, voids out: ' + (/Total Revenue ₱2,340/i.test(t) ? '₱1,500 + ₱840' : 'MISSING ' + (t.match(/Total Revenue [^ ]+/i) || [''])[0]));
  out.push('…shop as its own tile: ' + (/Shop \(all time\) ₱840/i.test(t) ? 'yes' : 'MISSING'));
  out.push('…the year split into memberships and shop: ' + (new RegExp(`${year} total ₱2,340`, "i").test(t) && /■ Memberships ₱1,500/i.test(t) && /■ Shop ₱840/i.test(t) ? 'yes' : 'MISSING'));
  out.push('…a shop segment on this month\'s bar: ' + ((await page.locator('[data-part="shop"]').count()) === 1 ? 'yes' : 'MISSING'));
  out.push('…best sellers: ' + (/Shop — best sellers/.test(t) && /Water 500ml · 30 sold/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-revenue-shop.png' });
  t = await run(false);
  out.push('shop off: no shop anywhere: ' + (!/best sellers/i.test(t) && !/Shop \(all time\)/i.test(t) && !/■ Shop/i.test(t) && (await page.locator('[data-part="shop"]').count()) === 0 ? 'none' : 'STILL SHOWN'));
  out.push('…total is memberships alone: ' + (/Total Revenue ₱1,500/i.test(t) ? '₱1,500' : 'MISSING'));
  return out.join('\n');
}
