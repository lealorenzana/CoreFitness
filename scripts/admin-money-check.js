/**
 * Money (0271): Payments at 1280 and 1600, dark and light. The drawer tile reads the
 * End of day card's number; End of day shows the carry, cash in, handed over, paid
 * out and the total; Take cash out opens its form; To approve labels each renewal,
 * and a paid one shows the screenshot, amount, method, reference and date before
 * its approve button; no page scroll. Writes .tmp-shots/money-*.png.
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
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const now = new Date();
  const iso = (d) => { const x = new Date(now); x.setDate(now.getDate() + d); return x.toISOString(); };
  const day = (d) => { const x = new Date(now.getTime() + 8 * 3600_000); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  // A tiny real PNG so the screenshot box shows a picture.
  const PROOF = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200"><rect width="120" height="200" fill="#0b5ed7"/><rect x="10" y="20" width="100" height="16" fill="#fff"/><text x="14" y="80" font-size="14" fill="#fff">GCash</text><text x="14" y="110" font-size="12" fill="#fff">PHP 1,500.00</text></svg>').toString('base64');

  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Reyes', email: 'owner@corefitness.test', phone: null, photo_url: null, created_at: iso(-400) };
  const desk = { id: 'u2', role: 'staff', status: 'active', first_name: 'Ben', last_name: 'Cruz', email: 'desk@corefitness.test', phone: null, photo_url: null, created_at: iso(-300) };
  const M = [['m1', 'Lea', 'Lorenzana'], ['m2', 'Paolo', 'Santos'], ['m3', 'Mia', 'Dela Cruz']].map(([id, f, l]) => ({ id, role: 'member', status: 'active', first_name: f, last_name: l, email: `${id}@t.test`, phone: null, photo_url: null, created_at: iso(-90) }));
  const plan = { id: 'p3', name: 'Premium', price: 1500, duration_days: 30, tier: 'premium', is_active: true };
  const TABLES = {
    profiles: [owner, desk, ...M],
    member_profiles: M.map((m) => ({ profile_id: m.id, qr_code: 'QR-' + m.id, profiles: m, created_at: iso(-90) })),
    memberships: M.map((m) => ({ id: 'ms-' + m.id, member_id: m.id, plan_id: 'p3', status: 'active', start_date: day(-25), expiry_date: day(5), created_at: iso(-25), membership_plans: plan })),
    membership_plans: [plan],
    payments: M.flatMap((m, i) => [0, 1, 2].map((k) => ({ id: `pay-${m.id}-${k}`, member_id: m.id, membership_id: 'ms-' + m.id, amount: 1500, method: k ? 'cash' : 'gcash', status: 'completed', paid_on: day(-k * 30 - i), created_at: iso(-k * 30 - i), due_date: null, invoice_number: `INV-2026-${i}${k}`, plan_name: 'Premium' }))),
    renewal_requests: [
      { id: 'rr1', member_id: 'm1', plan_id: 'p3', note: 'Paid by GCash', created_at: iso(-0.1), status: 'open', pay_method_label: 'GCash 0917 555 0101', pay_kind: 'gcash', pay_reference: '7012 345 678901', pay_amount: 1500, paid_on: day(0), pay_proof: PROOF, membership_plans: plan },
      { id: 'rr2', member_id: 'm2', plan_id: 'p3', note: 'Paid by BPI', created_at: iso(-0.5), status: 'open', pay_method_label: 'BPI savings', pay_kind: 'bank', pay_reference: 'BPI88812', pay_amount: 1500, paid_on: day(-1), pay_proof: null, membership_plans: plan },
      { id: 'rr3', member_id: 'm3', plan_id: 'p3', note: null, created_at: iso(-1), status: 'open', membership_plans: plan },
    ],
    cash_closeouts: [
      { day: day(-1), expected: 3200, counted: 3200, difference: 0, payment_count: 3, refunds_out: 0, note: null, closed_at: iso(-0.5), previous: null, auto: true },
      { day: day(-2), expected: 2600, counted: 2500, difference: -100, payment_count: 2, refunds_out: 0, note: 'Change given', closed_at: iso(-1.5), previous: null, auto: false },
    ],
    cash_outs: [
      { id: 'co1', day: day(0), kind: 'handed_over', amount: 3000, note: 'Morning pickup', created_at: iso(0), voided_at: null, void_reason: null, taken: { first_name: 'Ana', last_name: 'Reyes' }, recorder: { first_name: 'Ben', last_name: 'Cruz' } },
      { id: 'co2', day: day(0), kind: 'paid_out', amount: 120, note: 'Drinking water', created_at: iso(0), voided_at: null, void_reason: null, taken: null, recorder: { first_name: 'Ben', last_name: 'Cruz' } },
    ],
  };
  const RPC = {
    cash_day_summary: [{ day: day(0), opening: 3200, cash_in: 4500, refunds_out: 0, handed_over: 3000, paid_out: 120, expected: 4580, payment_count: 3,
      closed: false, auto: false, counted: null, difference: null, note: null, closed_by_name: null, closed_at: null }],
    auto_close_cash_days: 0,
  };
  let mode = 'dark';
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': `0-0/${Array.isArray(b) ? b.length : 1}`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'lab', role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
      if (fn === 'my_color_mode') return json(mode);
      return json(fn in RPC ? RPC[fn] : []);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
        const n = /^in\.\((.*)\)$/.exec(v);
        if (n && rows.length && k in rows[0]) { const set = n[1].split(',').map((s) => s.replace(/"/g, '')); rows = rows.filter((r) => set.includes(String(r[k]))); }
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  const say = (label, ok, extra = '') => out.push(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  ' + extra}`);
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const m of ['dark', 'light']) {
    mode = m;
    await page.emulateMedia({ colorScheme: m });
    for (const [w, h] of [[1280, 800], [1600, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://localhost:5174/payments', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-drawer-sum]', { timeout: 15000 });
      await page.waitForTimeout(600);
      const t = await text();
      const tag = `${m} ${w}`;
      say(`${tag}: drawer tile reads the system's ₱4,580`, /In the drawer now ₱4,580/.test(t), t.slice(0, 300));
      say(`${tag}: End of day shows the carry and what left the drawer`, /Left from the last close ₱3,200\.00/.test(t) && /Handed over − ₱3,000\.00/.test(t) && /Paid out − ₱120\.00/.test(t) && /Should be in the drawer now ₱4,580\.00/.test(t));
      say(`${tag}: the day's cash outs are listed`, /Handed to Ana Reyes/.test(t) && /Paid out: Drinking water/.test(t));
      say(`${tag}: Close the day now`, (await page.locator('[data-close-day]').innerText()).includes('Close the day now'));
      say(`${tag}: recent closes mark the automatic one`, /not counted/.test(t));
      const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
      say(`${tag}: no page scroll`, scroll <= 1, `overflow ${scroll}px`);
      await page.screenshot({ path: `.tmp-shots/money-records-${m}-${w}.png` });

      await page.locator('[data-take-out]').click();
      await page.waitForTimeout(200);
      say(`${tag}: Take cash out opens with the owner picked`, (await page.locator('[data-take-out-form]').innerText()).includes('Ana Reyes (owner)'));
      await page.screenshot({ path: `.tmp-shots/money-takeout-${m}-${w}.png` });

      await page.getByRole('tab', { name: /To approve/ }).first().click().catch(async () => { await page.getByText('To approve', { exact: false }).first().click(); });
      await page.waitForSelector('[data-online-pay]', { timeout: 8000 });
      await page.waitForTimeout(300);
      const a = await text();
      say(`${tag}: each renewal says what it is`, /Paid online, check it/i.test(a) && /Coming to pay at the desk/i.test(a));
      say(`${tag}: the screenshot is shown before approving`, (await page.locator('[data-proof] img').count()) === 1 && /No screenshot/.test(a));
      say(`${tag}: amount, method, reference and date are shown`, /Reference 7012 345 678901/.test(a) && /Sent by GCash 0917 555 0101/.test(a) && /Amount ₱1,500/.test(a) && /Paid on/.test(a));
      say(`${tag}: approve says it reached us`, /It reached us, approve ₱1,500/.test(a));
      const scroll2 = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
      say(`${tag}: To approve has no page scroll`, scroll2 <= 1, `overflow ${scroll2}px`);
      await page.screenshot({ path: `.tmp-shots/money-approve-${m}-${w}.png` });
    }
  }
  return out.join('\n');
}
