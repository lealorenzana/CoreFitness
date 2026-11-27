/**
 * The admin Members View menu (2026-11-27, the platform owner's File Explorer ask): Details (the table, as before),
 * List (the same table on one line a member, so more fit), Tiles (a card a member), and a Details pane that docks the
 * member record beside the roster instead of over it. The choice lives in the address (?view=, ?pane=1), never in
 * the browser's storage. Light and dark, 1280 and 1600, no page scroll.
 *
 * Playwright runner, admin dev server :5174. Fixtures only, a made-up gym.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.addInitScript(() => { window.__CF_NO_TOURS = true; });
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@corefitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const day = (d) => iso(d).slice(0, 10);
  const NAMES = ['Ana Cruz', 'Ben Ramos', 'Carla Diaz', 'Dino Santos', 'Ella Reyes', 'Femi Tan', 'Gio Lim', 'Hana Uy', 'Ivan Go', 'Jia Co',
    'Kiko Sy', 'Lea Lorenzana', 'Mara Dee', 'Nico Ong', 'Olive Lao', 'Paolo Yu', 'Quin Ty', 'Rina Chua', 'Sam Lee', 'Tess Ang',
    'Ugo Bautista', 'Vera Mendoza', 'Wes Navarro', 'Xena Ramos', 'Yuri Pascual', 'Zoe Garcia', 'Abel Torres', 'Bea Flores', 'Cid Rivera', 'Dana Castro'];
  const profiles = NAMES.map((n, i) => ({ id: `m${i}`, role: 'member', status: 'active', first_name: n.split(' ')[0], last_name: n.split(' ')[1],
    email: `m${i}@lab.test`, phone: '09171234567', photo_url: null, created_at: iso(-100 - i) }));
  const TABLES = {
    profiles,
    member_profiles: profiles.map((p) => ({ profile_id: p.id, gym_id: 'gym-1', qr_code: 'QR-' + p.id, experience_level: 'beginner', created_at: p.created_at, profiles: p })),
    memberships: profiles.map((p, i) => ({ id: 'ms' + i, member_id: p.id, plan_id: 'p1', status: 'active', start_date: day(-10), expiry_date: day(5 + i),
      never_expires: false, frozen_at: null, freeze_count: 0, created_at: iso(-10), membership_plans: { id: 'p1', name: 'Monthly', price: 800, duration_days: 30, tier: 'premium' } })),
    membership_plans: [{ id: 'p1', name: 'Monthly', price: 800, duration_days: 30, tier: 'premium', is_active: true }],
  };
  const RPC = {
    my_gym_context: [{ gym_id: 'gym-1', gym_name: 'Core Fitness Lab', slug: 'core-fitness-lab', role: 'admin', status: 'active',
      lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'live' }],
  };
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const pathname = qi === -1 ? after : after.slice(0, qi);
    const params = (qi === -1 ? '' : after.slice(qi + 1)).split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('='); return eq === -1 ? [decodeURIComponent(kv), ''] : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (pathname.startsWith('/auth/v1/')) return json(pathname.includes('/user') ? session.user : { ...session });
    if (pathname.startsWith('/rest/v1/rpc/')) { const fn = pathname.split('/rest/v1/rpc/')[1]; return json(fn in RPC ? RPC[fn] : []); }
    if (pathname.startsWith('/rest/v1/') && req.method() !== 'GET') return json([], 200);
    if (pathname.startsWith('/rest/v1/')) {
      const t = pathname.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      let rows = TABLES[t] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  const say = (k, ok, v) => out.push(`${k}: ${ok ? v : 'MISSING ' + v}`);
  const pick = async (label) => {
    await page.locator('[data-view-menu]').click();
    await page.getByRole(label === 'Details pane' ? 'menuitemcheckbox' : 'menuitemradio', { name: label, exact: true }).click();
    await page.waitForTimeout(700);
  };
  const rows = () => page.locator('[data-member-row]:visible').count();
  const noScroll = () => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);

  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-member-row]').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const details = await rows();
    if (mode === 'dark') say('Details by default, the table as before', details > 0 && !page.url().includes('view='), `${details} rows`);
    await pick('List');
    const list = await rows();
    say(`${mode}: List fits more, one line a member`, list > details && /view=list/.test(page.url()) && await noScroll(), `${list} rows vs ${details}`);
    await pick('Tiles');
    say(`${mode}: Tiles are a grid of cards`, (await page.locator('[data-member-tiles] .a-tile').count()) >= 10 && await noScroll(), `${await page.locator('[data-member-tiles] .a-tile').count()} tiles`);
    await page.screenshot({ path: `.tmp-shots/admin-members-tiles-${mode}-1600.png` });
    await pick('Details pane');
    say(`${mode}: the pane waits for a pick, no backdrop`, (await page.locator('[data-member-pane]').count()) === 1 && /Pick a member/.test(await page.locator('[data-member-pane]').innerText()), 'empty pane');
    await page.locator('[data-member-tiles] .a-tile', { hasText: 'Ben Ramos' }).click();
    await page.waitForTimeout(1500);
    const pane = await page.locator('[data-member-pane]').innerText();
    say(`${mode}: a click fills the pane beside the roster`, /Ben/.test(pane) && (await page.locator('[data-member-tiles]').count()) === 1 && await noScroll(), pane.replace(/\s+/g, ' ').slice(0, 60));
    await page.screenshot({ path: `.tmp-shots/admin-members-pane-${mode}-1600.png` });
    await page.setViewportSize({ width: 1280, height: 860 });
    await pick('List');
    await page.waitForTimeout(600);
    say(`${mode}: List with the pane at 1280`, (await rows()) >= 3 && await noScroll(), `${await rows()} rows`);
    // Every filter chip whole and in view with the pane open (the toolbar wraps; before, the chips hid behind the search).
    const clipped = await page.evaluate(() => {
      const box = document.querySelector('[data-rd-chips]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-rd-chips] [data-chip]')].filter((c) => { const r = c.getBoundingClientRect();
        return r.width === 0 || r.right > box.right + 1 || r.bottom > box.bottom + 1; }).map((c) => c.dataset.chip);
    });
    say(`${mode}: every filter chip shows with the pane at 1280`, clipped.length === 0 && (await page.locator('[data-rd-chips] [data-chip]').count()) === 7, clipped.join(', ') || 'all 7');
    await page.screenshot({ path: `.tmp-shots/admin-members-list-pane-${mode}-1280.png` });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-member-row]').first().waitFor({ timeout: 20000 });
    say(`${mode}: the address keeps the choice`, /view=list/.test(page.url()) && /pane=1/.test(page.url()) && (await page.locator('[data-member-pane]').count()) === 1, 'after reload');
    await pick('Details pane');
    await pick('Details');
    say(`${mode}: back to the table, no pane`, !/view=|pane=/.test(page.url()) && (await page.locator('[data-member-pane]').count()) === 0, 'reset');
  }
  // The member drawer, two columns (owner, 2026-11-27): who they are on the left, figures, recent activity, attendance by day, Export.
  // A logo, so the documents' header is tested with one (a data URL: no network).
  const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAADfUlEQVR4nO3dTbLcIAwEYHDlBMltkquFFVwtuU3eGbJK1avM+AckdQtQr6ds+EqWsWfsSSkSiUQiXpOT7/z8/uf5h9vvb8lr8tSyE7nnxXDdoue1ff2I532Iudx5K1+ieN6WGMx9WO/Av3KCjDBvTgwrbSvo6YituU1ax9TKyWb8+tCzKxvNQrN1rEFs1EbUKnpJ5aQ3Lx3oVZUVZ6cAvbay1hyl0Dsoq8xUBL2Psny+49C7KQtnPQi9p7Jk7iPQOysPC3RDh/KYA+I2aaQbOsp5WKMDOpQlJk+hQ1koEz0alEfQUc5yn6hoUO6ho5yf5FYpT6Fcf329/kD58ZF8fx3zJTlOvfN9/aQT8b6KZpVzfex7EZb4WVH7quiqQfx5U34K/FhS2XSbytDgvlHNRMDWZ2781lGfQVw0gdsteGgjmVvOVXXd5mcV+HpKZELXS5dhFKPNzgpdzzlULKy33wt9eLsaLEoK3I78apj9lHOxoUHu66KoCevoip352y3j19do6OrmCgI8ksNDgy7GBzKlX/8nCa3oSmqXHhqIo3sda4cMXYAHNXfBd2x4GqSM6iCeCQu8xMB7/OwZPRqUY+e+gRwbraIL6dTE2m+0DlACGpSABiWgQQloUAIalIAGJaBXh66ka0XWfkHQxc2PDVlji9YBykF8Y2eFH8XgPX72xFV0cdk9YKMit44KLDHurdro0StCF953/sRfOryHprwwvBpbU5oG+bd3xc0pETwSQo8u2AZCbxrMn+2mc1lFAsAuRK2D+08aVam0uYs5R49WpHiGJZ7KwlW0K2v5c4a3W9DN297Lhwa0VPAa4y306fIOfEos2GdY7HLm5uheRzEQ8XN9xH8W/NVl6vd1TPmqn9ovzvWd9VU/5Z+an6fpDf8exMn7q/znevlw+P9vyylyq+Ro1bF2HkFHUct9oqJBeQodRS2U6ajosJaY9LWOsB7WiB4NSjd0FPWYw0hFh3Xrv4gbbB07W7ehuY/36D2t2+isRSfD3aybYL7SVcc+1k02U4Xl3Q7WTTxHnXX02tZNY3ZqFyyrWjeleWn+Afti38g01dLRvwRfo7Sb9ixM7nXMbt0Mxq/fOqZuI82sRGyhJ+Juxkch4jZpc99JACNEVLTn0oYVARTajzj+IONAE7lZfYwJjRSnnydcQBuh03FdQ0vcXclGIpFIEucvu7WINnwnEfUAAAAASUVORK5CYII='; // square, black corners, like a real upload
  await page.route('**/rest/v1/gym_settings*', (r) => { const row = { name: 'Core Fitness Lab', logo_url: LOGO, address: 'Mamburao, Occidental Mindoro', tagline: null };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/vnd\.pgrst\.object/.test(r.request().headers().accept ?? '') ? row : [row]) }); });
  const readDl = async (dl) => { const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c); return Buffer.concat(chunks); };
  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('http://localhost:5174/members', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-member-row]').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.locator('[data-member-row]', { hasText: 'Ben Ramos' }).first().click();
    await page.locator('[data-member-drawer-wide]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(900);
    const side = await page.locator('.md-side').innerText();
    say(`${mode}: the drawer is two columns, contact with copy buttons on the left`, /Ben/.test(side) && /Contact/.test(side) && (await page.locator('.md-side [data-copy-field]').count()) >= 1, side.replace(/\s+/g, ' ').slice(0, 80));
    say(`${mode}: four figures and recent activity`, (await page.locator('[data-member-figures] > div').count()) === 4 && (await page.getByText('Recent activity').count()) === 1, 'figures');
    await page.screenshot({ path: `.tmp-shots/admin-member-drawer-${mode}-1600.png` });
    await page.locator('.md-tabs button', { hasText: 'Attendance' }).click(); await page.waitForTimeout(400);
    await page.screenshot({ path: `.tmp-shots/admin-member-drawer-attendance-${mode}-1600.png` });
    say(`${mode}: attendance by day, or says they never came`, (await page.locator('[data-member-days] .md-day').count()) > 0 || /never checked in/.test(await page.locator('.md-main').innerText()), `${await page.locator('[data-member-days] .md-day').count()} days`);
    if (mode === 'dark') {
      await page.locator('[data-member-export]').click(); await page.waitForTimeout(300);
      await page.screenshot({ path: '.tmp-shots/admin-member-export-menu.png' });
      let [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export-pick="report-docx"]').click()]);
      let buf = await readDl(dl); await dl.saveAs('.tmp-shots/member-report.docx');
      say('the profile report downloads as a real Word file', /\.docx$/.test(dl.suggestedFilename()) && buf[0] === 0x50 && buf[1] === 0x4b && buf.includes('word/document.xml') && buf.includes('word/header1.xml') && buf.includes('word/media/logo.png'), dl.suggestedFilename());
      await page.locator('[data-member-export]').click(); await page.waitForTimeout(300);
      const [pop] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-export-pick="report-pdf"]').click()]);
      await pop.waitForLoadState('domcontentloaded'); await pop.waitForTimeout(300);
      const ptxt = await pop.locator('body').innerText();
      await pop.setViewportSize({ width: 900, height: 1200 }); await pop.screenshot({ path: '.tmp-shots/admin-member-report-pdf.png', fullPage: true });
      say('the PDF report opens for printing: the gym, the member, payments, attendance', /Member profile/.test(ptxt) && /Mamburao/.test(ptxt) && (await pop.locator('header img').count()) === 1 && /Ben/.test(ptxt) && /Payments/.test(ptxt) && /Attendance/.test(ptxt), ptxt.replace(/\s+/g, ' ').slice(0, 80));
      await pop.close();
      await page.locator('[data-member-export]').click(); await page.waitForTimeout(300);
      [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export-pick="full-docx"]').click()]);
      buf = await readDl(dl);
      say('everything held downloads as Word too', /\.docx$/.test(dl.suggestedFilename()) && buf[0] === 0x50 && buf.includes('word/document.xml'), dl.suggestedFilename());
      await dl.saveAs('.tmp-shots/member-full.docx');
    }
  }
  // Invite members (2026-11-27): the Add member window's look, a QR and a mascot; desk-only gyms told what to do instead.
  for (const policy of ['closed', 'code']) {
    await page.route('**/rest/v1/rpc/my_gym_app*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ slug: 'core-fitness-lab', gym_name: 'Core Fitness Lab', join_code: 'LAB4K2', join_policy: policy, accent: 'teal', accent_action: 'rose', logo_url: LOGO, tagline: 'Where Core Fitness is tried first' }]) }));
    for (const mode of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: mode });
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto('http://localhost:5174/members?invite=1', { waitUntil: 'domcontentloaded' });
      await page.locator('[data-invite-panel] .iv-mores').waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `.tmp-shots/admin-invite-${policy}-${mode}.png` });
    }
    const t = await page.locator('[data-invite-panel]').innerText();
    say(policy === 'closed' ? 'invite, desk only: says so, two ways forward, the map mascot' : 'invite: the code, the link, a QR, one amber button',
      policy === 'closed'
        ? (await page.locator('[data-invite-closed]').count()) === 1 && /Change how they join/.test(t) && /Add a walk-in/.test(t) && /mascot-map/.test(await page.locator('.am-buddy img').getAttribute('data-art'))
        : /LAB4K2/.test(t) && /join\/core-fitness-lab/.test(t) && (await page.locator('[data-invite-qr] svg').count()) === 1 && (await page.locator('[data-invite-panel] .am-btn.go').count()) === 1,
      t.replace(/\s+/g, ' ').slice(0, 90));
    if (policy !== 'closed') {
      await page.locator('[data-print-poster]').click(); await page.waitForTimeout(500);
      say('Print a poster opens the poster from the invite window', (await page.locator('[data-invite-panel]').count()) === 0 && (await page.getByRole('button', { name: /Print/ }).count()) >= 1, 'poster');
      say('the poster wears the gym: its logo, its colour', (await page.locator('[data-poster-logo] img').count()) === 1
        && await page.evaluate(() => [...document.querySelectorAll('[data-join-poster] div')].some((d) => getComputedStyle(d).backgroundColor === 'rgb(17, 94, 89)')), 'teal 800');
      await page.screenshot({ path: '.tmp-shots/admin-invite-poster.png', fullPage: true });
      await page.emulateMedia({ media: 'print' }); await page.setViewportSize({ width: 800, height: 1130 }); await page.waitForTimeout(300);
      await page.screenshot({ path: '.tmp-shots/admin-invite-poster-print.png', fullPage: true });
      await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1400, height: 900 });
    } else say('a desk-only gym is offered no poster it cannot print', (await page.locator('[data-print-poster]').count()) === 0, 'none');
    await page.unroute('**/rest/v1/rpc/my_gym_app*');
  }
  return out.join('\n');
}
