/**
 * The admin Notifications page (/inbox): live alerts plus the owner's own
 * messages (the notifications rows — before this they had no screen in the
 * admin app), Unread / All / Archived, mark read and unread, bulk archive; the
 * bell carries unread messages and links to the page. Also the dashboard's
 * "Put your gym on the map" for an unpinned gym.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'gabby@x.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const g = { gym_id: 'gym-a', gym_name: 'gabby pogi 123', slug: 'gabby-pogi-123', short_name: 'gabby', accent: 'violet' };
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  // "Today" is Manila's calendar day: at 00:20, "an hour ago" is yesterday. Today's
  // messages sit between Manila midnight and now, at the same fractions of the gap.
  const manilaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const sinceMidnight = Date.now() - Date.parse(`${manilaDay}T00:00:00+08:00`);
  const todayAgo = (h) => new Date(Date.now() - Math.min(h * 3600000, sinceMidnight * h / 4)).toISOString();
  const N = (id, title, read, at, extra = {}) => ({ id, user_id: 'u2', type: 'system', title, message: `${title} — details`, action_url: null,
    metadata: null, read, archived_at: null, cleared_at: null, created_at: at, gym_id: g.gym_id, ...extra });
  const NOTES = [
    N('n1', '80% of this month’s AI coach messages used', false, todayAgo(1), { action_url: '/gym-app' }),
    N('n2', 'Leg press reported', false, todayAgo(3)),
    N('n3', 'Day pass paid', true, ago(30)),
    N('n4', 'Old message', true, ago(200), { archived_at: ago(100), cleared_at: ago(100) }),
  ];
  const PATCHES = [];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const query = decodeURIComponent(qi === -1 ? '' : after.slice(qi + 1));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'live' }]);
      return json(['my_gym_modules', 'my_support_grant', 'my_gyms', 'my_announcements', 'my_gym_features'].includes(fn) ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'notifications') {
      if (req.method() === 'PATCH') {
        const body = JSON.parse(req.postData() || '{}');
        const m = /id=in\.\(([^)]*)\)/.exec(query);
        const ids = m ? m[1].split(',').map((x) => x.replace(/"/g, '')) : NOTES.map((n) => n.id);
        PATCHES.push([ids, body]);
        NOTES.forEach((n) => { if (ids.includes(n.id) && (!/read=eq\.false/.test(query) || !n.read)) Object.assign(n, body); });
        return json([]);
      }
      let rows = NOTES.slice();
      if (/archived_at=is\.null/.test(query)) rows = rows.filter((n) => !n.archived_at);
      if (/cleared_at=is\.null/.test(query)) rows = rows.filter((n) => !n.cleared_at);
      if (/read=eq\.false/.test(query)) rows = rows.filter((n) => !n.read);
      return json(rows);
    }
    if (t === 'gyms') { const r = { latitude: null, longitude: null }; return json(one ? r : [r]); }
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Mamburao' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Gabby', last_name: 'Owner',
        email: 'gabby@x.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-pin-gym]').waitFor({ timeout: 15000 }).catch(() => {});
  out.push('an unpinned gym is asked to put itself on the map: ' + ((await page.locator('[data-pin-gym]').count()) === 1 ? 'yes' : 'MISSING'));

  // The bell: unread messages ride in it, and it links to the page.
  await page.locator('header button:has(svg.lucide-bell)').first().click();
  await page.waitForTimeout(500);
  out.push('the bell shows unread messages, not only alerts: ' + ((await page.locator('[data-bell-message]').count()) === 2 ? 'yes' : 'MISSING ' + (await page.locator('[data-bell-message]').count())));
  await page.locator('[data-bell-see-all]').click();
  await page.locator('[data-inbox]').waitFor({ timeout: 8000 });
  out.push('…and "See all notifications" opens the page: ' + (page.url().endsWith('/inbox') ? 'yes' : 'MISSING ' + page.url()));

  await page.locator('[data-inbox-row]').first().waitFor({ timeout: 8000 });
  out.push('Unread lists the two unread messages: ' + ((await page.locator('[data-inbox-row]').count()) === 2 ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-tab="all"]').click();
  await page.waitForTimeout(300);
  out.push('All adds the read one, not the archived: ' + ((await page.locator('[data-inbox-row]').count()) === 3 ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-tab="archived"]').click();
  await page.waitForTimeout(300);
  out.push('Archived holds the archived one: ' + ((await page.locator('[data-inbox-row]').count()) === 1 && /Old message/.test(await page.locator('[data-inbox-list]').innerText()) ? 'yes' : 'MISSING'));

  // Mark one read from its row, then unread again.
  await page.locator('[data-inbox-tab="all"]').click();
  await page.waitForTimeout(300);
  const row = page.locator('[data-inbox-row]').filter({ hasText: 'Leg press reported' });
  await row.getByRole('button', { name: 'Mark as read' }).click();
  await page.waitForTimeout(600);
  out.push('a message is marked read in the database: ' + (PATCHES.some(([ids, b]) => ids.includes('n2') && b.read === true) && NOTES.find((n) => n.id === 'n2').read ? 'yes' : 'MISSING ' + JSON.stringify(PATCHES)));
  await page.locator('[data-inbox-row]').filter({ hasText: 'Leg press reported' }).getByRole('button', { name: 'Mark as unread' }).click();
  await page.waitForTimeout(600);
  out.push('…and back to unread: ' + (!NOTES.find((n) => n.id === 'n2').read ? 'yes' : 'MISSING'));

  // Bulk: select two, archive.
  await page.getByLabel('Select Day pass paid').check();
  await page.getByLabel('Select Leg press reported').check();
  await page.locator('[data-bulk]').getByRole('button', { name: 'Archive' }).click();
  await page.waitForTimeout(700);
  out.push('two selected are archived together: ' + (NOTES.filter((n) => ['n2', 'n3'].includes(n.id)).every((n) => n.archived_at) ? 'yes' : 'MISSING'));

  await page.locator('[data-mark-all]').click();
  await page.waitForTimeout(700);
  out.push('Mark all as read: ' + (NOTES.filter((n) => !n.archived_at).every((n) => n.read) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-inbox.png' });
  // The 2026-10-11 redesign: three boxes that hold the screen, a reading pane, kinds.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.locator('[data-inbox-tab="all"]').click();
  await page.waitForTimeout(400);
  const scrolls = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight - m.clientHeight : 0; });
  out.push('the page does not scroll; each box scrolls itself: ' + (scrolls <= 2 ? 'yes' : 'MISSING ' + scrolls));
  out.push('the overview has the ring and the kinds: ' + ((await page.locator('[data-overview] [data-ring]').count()) >= 1 && (await page.locator('[data-kind]').count()) >= 1 ? 'yes' : 'MISSING'));
  out.push('messages are grouped by day: ' + (/Today/.test(await page.locator('[data-inbox-list]').innerText()) ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-row]').filter({ hasText: 'AI coach' }).locator('button').nth(0).click();
  await page.waitForTimeout(500);
  out.push('a message opens in the reading pane, with its page named: ' + ((await page.locator('[data-opened]').count()) === 1 && /Open Your app/.test(await page.locator('[data-open-page]').innerText().catch(() => '')) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-inbox-open.png' });
  await page.getByRole('button', { name: 'Close message' }).click();
  await page.locator('[data-kind="system"]').click();
  await page.waitForTimeout(300);
  out.push('a kind narrows the list: ' + ((await page.locator('[data-inbox-row]').count()) >= 1 && (await page.getByRole('button', { name: /Show every kind/ }).count()) === 1 ? 'yes' : 'MISSING'));
  return out.join('\n');
}
