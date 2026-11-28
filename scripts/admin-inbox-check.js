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
  const N = (id, title, read, h, extra = {}) => ({ id, user_id: 'u2', type: 'system', title, message: `${title} — details`, action_url: null,
    metadata: null, read, archived_at: null, cleared_at: null, created_at: ago(h), gym_id: g.gym_id, ...extra });
  const NOTES = [
    N('n1', '80% of this month’s AI coach messages used', false, 1, { action_url: '/gym-app' }),
    N('n2', 'Leg press reported', false, 3),
    N('n3', 'Day pass paid', true, 30),
    N('n4', 'Old message', true, 200, { archived_at: ago(100), cleared_at: ago(100) }),
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
  // Design V2 (2026-11-22): a mail app. The kinds are folders, the overview a line of words, no ring.
  out.push('the overview says what is in the inbox, and the kinds are folders: ' + (/in your inbox/.test(await page.locator('[data-overview]').innerText().catch(() => '')) && (await page.locator('[data-kind]').count()) >= 1 ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-tab="attention"]').click();
  await page.waitForTimeout(300);
  out.push('Needs attention is a folder of its own: ' + ((await page.locator('[data-attention]').count()) === 1 ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-tab="all"]').click();
  await page.waitForTimeout(300);
  out.push('messages are grouped by day: ' + (/Today/.test(await page.locator('[data-inbox-list]').innerText()) ? 'yes' : 'MISSING'));
  await page.locator('[data-inbox-row]').filter({ hasText: 'AI coach' }).locator('button').nth(0).click();
  await page.waitForTimeout(500);
  // 2026-11-28 (owner): a message opens in its own window; Needs you stays on the right, never hidden.
  out.push('a message opens in its own window, with its page named: ' + ((await page.locator('[data-message-window] [data-opened]').count()) === 1 && /Open Your app/.test(await page.locator('[data-open-page]').innerText().catch(() => '')) ? 'yes' : 'MISSING'));
  out.push('…and Needs you stays on the right: ' + ((await page.locator('[data-reading] [data-opened]').count()) === 0 && (await page.locator('[data-reading]').innerText()).length > 20 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-inbox-open.png' });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/admin-inbox-open-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  out.push('…Escape closes the window: ' + ((await page.locator('[data-message-window]').count()) === 0 ? 'yes' : 'MISSING'));
  await page.locator('[data-kind="system"]').click();
  await page.waitForTimeout(300);
  out.push('a kind narrows the list: ' + ((await page.locator('[data-inbox-row]').count()) >= 1 && (await page.getByRole('button', { name: /Show every kind/ }).count()) === 1 ? 'yes' : 'MISSING'));
  // Needs you (2026-11-27): the greeting on a band in the gym's colour, with a mascot; an empty search shows the map mascot.
  await page.getByRole('button', { name: /Show every kind/ }).click().catch(() => {}); await page.waitForTimeout(300);
  out.push('Needs you has its band and mascot: ' + ((await page.locator('.nb-band [data-needs-mascot]').count()) === 1 ? 'yes' : 'MISSING'));
  for (const mode of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: mode }); await page.waitForTimeout(700);
    await page.screenshot({ path: `shots/admin-inbox-needs-${mode}.png` });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByLabel('Search messages').first().fill('zzzz nothing'); await page.waitForTimeout(500);
  out.push('an empty search shows a mascot: ' + ((await page.locator('[data-inbox-empty] .ib2-buddy').count()) === 1 ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-inbox-empty.png' });
  // A teal gym: the look arrives after the page starts, and the mascot must repaint in it (not stay violet).
  await page.route('**/rest/v1/rpc/my_gym_app*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ gym_id: 'gym-a', gym_name: 'gabby pogi 123', slug: 'gabby-pogi-123', accent: 'teal', accent_action: 'rose', join_policy: 'closed' }]) }));
  await page.goto('http://localhost:5174/inbox?show=all', { waitUntil: 'domcontentloaded' });
  await page.locator('.nb-band [data-needs-mascot]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const teal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase());
  const painted = await page.evaluate(() => {
    const img = document.querySelector('.nb-band [data-needs-mascot]');
    if (!img || !img.src.startsWith('data:')) return null;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let violet = 0, greenblue = 0;
    for (let i = 0; i < d.length; i += 16) { if (d[i + 3] < 200) continue; const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (b > r + 30 && r > g + 20) violet++; if (g > r + 30 && b > r + 10) greenblue++; }
    return { violet, greenblue };
  });
  await page.screenshot({ path: 'shots/admin-inbox-needs-teal.png' });
  out.push('a teal gym: the mascot repaints in teal, no violet left: ' + (teal === '#0d9488' && painted && painted.greenblue > 50 && painted.violet < painted.greenblue / 20 ? 'yes' : 'MISSING ' + teal + ' ' + JSON.stringify(painted)));
  return out.join('\n');
}
