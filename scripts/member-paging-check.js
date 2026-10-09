/**
 * Histories have page numbers (2026-10-10). "See all visits" was 321 check-ins
 * in one endless scroll. Now: twenty to a page, fetched a page at a time
 * (`range()` with an exact count), "321 visits · page 1 of 17", numbered
 * buttons, the page kept in the address so Back and a reload return to it.
 *
 * Setup copied from member-get-app-check.js. Member dev server on :5173.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o); let bits = '', out = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) out += C[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'm1', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'm1', aud: 'authenticated', role: 'authenticated', email: 'lea@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  // 321 check-ins, one a day going back.
  const TOTAL = 321;
  const visit = (i) => ({
    id: `v${i}`, member_id: 'm1', gym_id: 'gym-1', method: i % 3 ? 'qr' : 'manual', activity: i % 2 ? 'Legs' : null,
    check_in_time: new Date(Date.now() - i * 86_400_000).toISOString(),
  });
  const ASKED = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (b, range = '0-0/1') => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': range, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path === '/rest/v1/rpc/my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'G Fitness', slug: 'g-fitness',
      role: 'member', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1 }]);
    if (path === '/rest/v1/attendance') {
      // supabase-js sends range() as offset/limit and the count as a Prefer header.
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? TOTAL);
      // A HEAD is a count with no rows (the check-in block's "been in today?").
      ASKED.push({ offset, limit, head: req.method() === 'HEAD', unbounded: !url.searchParams.has('limit'),
        count: /count=exact/.test(req.headers()['prefer'] ?? '') });
      const rows = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, k) => visit(offset + k));
      return json(rows, `${offset}-${offset + rows.length - 1}/${TOTAL}`);
    }
    return json([]);
  });

  const out = [];
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://localhost:5173/member/visits', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.locator('[data-pager]').waitFor({ timeout: 10000 }).catch(() => {});

  const reads = ASKED.filter((a) => !a.head);
  const first = reads.find((a) => a.offset === 0 && a.limit === 20);
  const whole = reads.filter((a) => a.unbounded && a.limit === TOTAL);
  out.push('asks for one page, not everything: ' + (first && whole.length === 0 ? 'yes (20)' : 'MISSING ' + JSON.stringify(ASKED)));
  out.push('…with an exact count: ' + (first?.count ? 'yes' : 'MISSING'));
  let t = await text();
  out.push('says how many and which page: ' + (/321 visits · page 1 of 17/.test(t) ? '321 visits · page 1 of 17' : 'MISSING'));
  const rows = await page.locator('main .noc-row, main [data-line-row]').count();
  out.push('shows twenty rows: ' + (rows === 20 || /· 20|· 1\d/.test(t) ? 'yes' : `MISSING (${rows})`));

  await page.locator('[data-pager] button', { hasText: /^2$/ }).click();
  await page.waitForTimeout(800);
  out.push('page 2 asks for rows 20–39: ' + (ASKED.some((a) => a.offset === 20 && a.limit === 20) ? 'yes' : 'MISSING ' + JSON.stringify(ASKED.slice(-2))));
  out.push('the page is in the address: ' + (/[?&]page=2\b/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  t = await text();
  out.push('…and says so: ' + (/page 2 of 17/.test(t) ? 'yes' : 'MISSING'));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-pager]').waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  out.push('a reload stays on page 2: ' + (/page 2 of 17/.test(await text()) ? 'yes' : 'MISSING'));

  await page.locator('[data-pager] button', { hasText: /^17$/ }).click();
  await page.waitForTimeout(800);
  out.push('the last page holds the last one: ' + (ASKED.some((a) => a.offset === 320) && /page 17 of 17/.test(await text()) ? 'yes' : 'MISSING'));
  out.push('next is disabled on the last page: ' + ((await page.getByRole('button', { name: 'Next page' }).isDisabled()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/member-paging.png', fullPage: true });
  return out.join('\n');
}
