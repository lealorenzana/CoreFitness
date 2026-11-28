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
      await page.waitForSelector('[data-drawer-hero]', { timeout: 15000 });
      await page.waitForTimeout(600);
      const tag = `${m} ${w}`;
      // One drawer, one button, one floating page, a 7-day strip to change day (owner, 2026-11-28).
      const rail = (await page.locator('[data-cash]').innerText()).replace(/\s+/g, ' ');
      say(`${tag}: drawer tile reads the system's ₱4,580`, /In the drawer now ₱4,580/.test(await text()) && /Should be in the drawer now ₱4,580\.00/.test(rail), rail.slice(0, 300));
      say(`${tag}: the rail names the day and its state`, /^Today, /.test(await page.locator('[data-drawer-day]').innerText()) && /Not closed yet/.test(rail) && /Taken out today − ₱3,120\.00/.test(rail), rail);
      const yesterday = page.locator('[data-week] [data-week-day]').nth(5);
      say(`${tag}: the strip marks yesterday's automatic close`, (await page.locator('[data-week] [data-week-day]').count()) === 7
        && (await yesterday.getAttribute('data-state')) === 'auto' && /not counted/.test(await yesterday.getAttribute('aria-label')));
      const scroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
      const railFits = await page.evaluate(() => { const r = document.querySelector('.rd-fit-rail'); return !r || r.scrollHeight <= r.clientHeight + 1; });
      say(`${tag}: no page scroll`, scroll <= 1 && railFits, `overflow ${scroll}px, rail fits ${railFits}`);
      await page.screenshot({ path: `.tmp-shots/money-records-${m}-${w}.png` });

      // Money gets its steps one tap away (owner, 2026-11-28): How it works opens the drawer guide.
      await page.locator('[data-cash] [data-guide-button="cash-drawer"]').click();
      await page.waitForSelector('[data-guide-player]');
      say(`${tag}: How it works opens the drawer guide`, /Money → Payments → The drawer/.test(await page.locator('[data-guide-player]').innerText()));
      await page.screenshot({ path: `.tmp-shots/money-guide-${m}-${w}.png` });
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-guide-player]', { state: 'detached' });

      // Picking a day changes the whole card, and says so in amber; Back to today returns.
      await yesterday.click();
      await page.waitForSelector('[data-back-today]');
      say(`${tag}: picking a day says which day`, !/^Today/.test(await page.locator('[data-drawer-day]').innerText()));
      await page.screenshot({ path: `.tmp-shots/money-pastday-${m}-${w}.png` });
      await page.locator('[data-back-today]').click();

      await page.locator('[data-open-drawer]').click();
      await page.waitForSelector('[data-drawer-window] [data-drawer-sum]');
      const t = await text();
      say(`${tag}: End of day shows the carry and what left the drawer`, /Left from the last close ₱3,200\.00/.test(t) && /Handed over − ₱3,000\.00/.test(t) && /Paid out − ₱120\.00/.test(t) && /Should be in the drawer now ₱4,580\.00/.test(t));
      say(`${tag}: Close the day now`, (await page.locator('[data-close-day]').innerText()).includes('Close the day now'));
      say(`${tag}: recent closes mark the automatic one`, (await page.locator('[data-drawer-window] [data-month] [data-state="auto"]').count()) >= 1
        && (await page.locator('[data-month-next]').isDisabled()));
      // This month, from the saved closes: the short day says its net, the automatic one is counted apart.
      const sum = (await page.locator('[data-month-summary]').innerText()).replace(/\s+/g, ' ');
      say(`${tag}: This month adds up the closes`, day(-2).slice(0, 7) !== day(0).slice(0, 7)
        || (/Days short or over net −₱100\.00 1/.test(sum) && /Days nobody counted 1/.test(sum)), sum);
      const fits = await page.evaluate(() => [...document.querySelectorAll('[data-drawer-body], [data-drawer-body] [role="tabpanel"]')]
        .every((el) => el.scrollHeight <= el.clientHeight + 1));
      say(`${tag}: the drawer page fits, nothing scrolls`, fits && (await page.locator('[data-drawer-window] [data-guide-button="cash-drawer"]').count()) === 1);
      await page.screenshot({ path: `.tmp-shots/money-drawer-count-${m}-${w}.png` });
      // Two tabs (owner, 2026-11-28): Taken out has its form and its button in view, no scrolling.
      await page.locator('[data-tab="outs"]').click();
      await page.waitForSelector('[data-cash-outs]');
      const btnInView = await page.evaluate(() => {
        const b = document.querySelector('[data-take-out]').getBoundingClientRect();
        const pane = document.querySelector('[data-drawer-window] [role="tabpanel"]').getBoundingClientRect();
        return b.bottom <= pane.bottom && b.top >= pane.top;
      });
      say(`${tag}: Taken out's button shows without scrolling`, btnInView);
      const o = await page.locator('[data-cash-outs]').innerText();
      say(`${tag}: the day's cash outs are listed`, /Handed to Ana Reyes/.test(o) && /Paid out: Drinking water/.test(o));
      await page.locator('[aria-label="Amount taken out"]').fill('500');
      say(`${tag}: Take cash out opens with the owner picked`, (await page.locator('[aria-label="Taken by"] option:checked').innerText()).includes('Ana Reyes (owner)')
        && /Record ₱500\.00 handed to Ana Reyes/.test(await page.locator('[data-take-out]').innerText()));
      await page.screenshot({ path: `.tmp-shots/money-drawer-${m}-${w}.png` });

      // The month calendar: back a month, and a day past the last 7 is looked at, never counted (owner, 2026-11-28).
      const title0 = await page.locator('[data-month-title]').innerText();
      await page.locator('[data-month-prev]').click();
      const title1 = await page.locator('[data-month-title]').innerText();
      await page.locator('[data-month-day]').nth(9).click();
      await page.locator('[data-tab="count"]').click();
      await page.waitForSelector('[data-drawer-window] [data-read-only]');
      say(`${tag}: an older month opens, its days read only`, title0 !== title1 && (await page.locator('[data-close-form]').count()) === 0
        && (await page.locator('[data-take-out-form]').count()) === 0);
      await page.screenshot({ path: `.tmp-shots/money-month-${m}-${w}.png` });
      await page.keyboard.press('Escape');
      await page.locator('[data-back-today]').click();

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

      // The View menu, like Members: List and Details open a renewal in its own window, or in the Details pane.
      await page.locator('[data-view-menu]').click();
      await page.getByRole('menuitemradio', { name: 'Details' }).click();
      await page.waitForSelector('[data-renew-view="details"] table');
      say(`${tag}: Details view lines up reference and amount`, /7012 345 678901/.test(await page.locator('[data-renew-view] table').first().innerText()));
      await page.locator('[data-renew-view] tbody tr').first().click();
      await page.waitForSelector('[data-renew-window] [data-approve]');
      say(`${tag}: a row opens the whole renewal in its own window`, /It reached us, approve/.test(await page.locator('[data-renew-window]').innerText()));
      await page.screenshot({ path: `.tmp-shots/money-renew-window-${m}-${w}.png` });
      await page.keyboard.press('Escape');
      await page.locator('[data-view-menu]').click();
      await page.getByRole('menuitemcheckbox', { name: 'Details pane' }).click();
      await page.locator('[data-view-menu]').click();
      await page.getByRole('menuitemradio', { name: 'List' }).click();
      await page.waitForSelector('[data-renew-pane] [data-approve]');
      const scroll3 = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
      say(`${tag}: List with the Details pane, no page scroll`, scroll3 <= 1 && /rview=list/.test(page.url()) && /rpane=1/.test(page.url()), `overflow ${scroll3}px ${page.url()}`);
      await page.screenshot({ path: `.tmp-shots/money-renew-list-${m}-${w}.png` });
    }
  }
  return out.join('\n');
}
