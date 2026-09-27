/**
 * The gym's side of talking to Core Fitness (0137): a platform announcement is a
 * banner on every admin screen until dismissed, and Support is where the owner
 * or desk asks us something and reads the answer.
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
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u2', role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u2', aud: 'authenticated', role: 'authenticated', email: 'ana@anafitness.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const g = { gym_id: 'gym-a', gym_name: 'Ana Gymanigga', slug: 'ana-gym', short_name: 'anafitness', accent: 'violet' };
  const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

  const ANNS = [{ id: 'an1', title: 'Maintenance tonight', body: 'The service pauses 10–11pm.', level: 'warning', starts_at: iso(0) }];
  const DISMISSED = [];
  const TICKETS = [{ id: 't1', subject: 'Receipts will not print', status: 'answered', created_at: iso(2), updated_at: iso(1),
    last_from: 'platform', unread: true, messages: 2 }];
  const THREADS = { t1: [
    { id: 'm0', author_name: 'Ana Lisa', from_platform: false, body: 'The print button does nothing.', created_at: iso(2) },
    { id: 'm1', author_name: 'Core Fitness', from_platform: true, body: 'Try Chrome — we are fixing Edge.', created_at: iso(1) }] };

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const b = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, role: 'admin',
        status: 'active', lock_reason: null, short_name: g.short_name, logo_url: null, accent: g.accent, gym_count: 1,
        onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'my_gym_app') return json([{ gym_id: g.gym_id, gym_name: g.gym_name, slug: g.slug, short_name: g.short_name,
        logo_url: null, accent: g.accent, accent_action: null, tagline: null, points_name: 'Points',
        points_name_short: 'points', welcome_message: null, vocabulary: {}, join_policy: 'open', join_code: null, modules: {} }]);
      if (fn === 'my_announcements') return json(ANNS.filter((a) => !DISMISSED.includes(a.id)));
      if (fn === 'dismiss_announcement') { DISMISSED.push(b.p_id); return json(null); }
      if (fn === 'my_support_tickets') return json(TICKETS);
      if (fn === 'support_thread') { const t = TICKETS.find((x) => x.id === b.p_ticket); if (t) t.unread = false; return json(THREADS[b.p_ticket] ?? []); }
      if (fn === 'open_support_ticket') {
        const id = 't' + (TICKETS.length + 1);
        TICKETS.unshift({ id, subject: b.p_subject, status: 'open', created_at: iso(0), updated_at: iso(0), last_from: 'gym', unread: false, messages: 1 });
        THREADS[id] = [{ id: id + 'm0', author_name: 'Ana Lisa', from_platform: false, body: b.p_body, created_at: iso(0) }];
        return json(id);
      }
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' || fn === 'my_gyms' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'gym_settings') {
      const row = { id: true, gym_id: g.gym_id, gym_name: g.gym_name, short_name: g.short_name, logo_url: null, address: 'Brgy Bunot' };
      return json(one ? row : [row]);
    }
    if (t === 'profiles' || t === 'gym_people') {
      const p = { id: 'u2', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Lisa',
        email: 'ana@anafitness.test', phone: null, photo_url: null, created_at: iso(30) };
      return json(one ? p : [p]);
    }
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' });
  await page.getByText('Maintenance tonight').waitFor({ timeout: 15000 });
  let t = await text();
  out.push('announcement banner on the dashboard: ' + (/Maintenance tonight from Core Fitness/.test(t) && /pauses 10–11pm/.test(t) ? 'shown' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-announcement.png', clip: { x: 0, y: 0, width: 1280, height: 200 } });

  await page.getByRole('link', { name: 'Support' }).first().click();
  await page.getByText('Your messages').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  t = await text();
  out.push('Support in the sidebar, opens: ' + (/\/support$/.test(page.url()) ? 'yes' : 'MISSING ' + page.url()));
  out.push('the banner follows onto every screen: ' + (/Maintenance tonight/.test(t) ? 'yes' : 'MISSING'));
  out.push('an answered ticket, marked new: ' + (/Receipts will not print/.test(t) && /NEW/.test(t) && /Answered/.test(t) ? 'shown' : 'MISSING'));
  await page.getByRole('button', { name: /Receipts will not print/ }).click();
  await page.waitForTimeout(600);
  t = await text();
  out.push("Core Fitness's reply in the thread: " + (/Try Chrome — we are fixing Edge/.test(t) && !/NEW/.test(t) ? 'shown, and no longer new' : 'MISSING'));

  await page.getByLabel('Subject').fill('How do I add a second desk?');
  await page.getByLabel('Message', { exact: true }).fill('We hired someone for evenings.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  out.push('a new question: ' + (TICKETS.length === 2 && TICKETS[0].subject === 'How do I add a second desk?' && /Waiting for Core Fitness/.test(t) && /We hired someone for evenings/.test(t) ? 'sent, and opened' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-support.png' });

  await page.getByRole('button', { name: 'Dismiss this announcement' }).click();
  await page.waitForTimeout(400);
  out.push('dismissed, gone: ' + (DISMISSED[0] === 'an1' && !/Maintenance tonight/.test(await text()) ? 'yes' : 'MISSING'));
  return out.join('\n');
}
