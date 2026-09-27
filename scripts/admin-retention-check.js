/**
 * Reports -> Retention with 0130's radar: the at-risk list with the reasons,
 * one at-risk count (the radar's), who was already contacted, "Reach out" going
 * through send_retention_message (recorded), and the Win-back messages page:
 * three messages, off, switched on and reworded by the owner. The rules are
 * proven in scripts/sql/retention.mjs.
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

  const CALLS = [];
  const RULES = [
    { key: 'no_visit_14', title: 'We miss you', message: 'It has been two weeks.', is_active: false, sort_order: 1 },
    { key: 'no_visit_30', title: 'Still with us?', message: 'A month without a visit.', is_active: false, sort_order: 2 },
    { key: 'lapsed', title: 'Come back', message: 'Your membership ended recently.', is_active: false, sort_order: 3 },
  ];
  const RADAR = [
    { member_id: 'm1', name: 'Ana Reyes', phone: '09171234567', photo_url: null, score: 55, level: 'high',
      reasons: ['No visit in 20 days', 'Stopped logging workouts'], last_visit: new Date(Date.now() - 20 * 86400000).toISOString(), visits_14: 0, usual_14: 2, expires_on: null, last_contact: null },
    { member_id: 'm2', name: 'Ben Cruz', phone: null, photo_url: null, score: 35, level: 'medium',
      reasons: ['Membership ends in 5 days'], last_visit: minute, visits_14: 3, usual_14: 3, expires_on: null, last_contact: minute },
  ];
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
        role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'teal',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'winback_sweep') return json(0);
      if (fn === 'retention_radar') return json(RADAR);
      if (fn === 'send_retention_message') return json(null);
      if (fn === 'winback_results') return json([{ rule_key: 'no_visit_14', sent: 6, came_back: 2 }]);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    if (t === 'winback_rules') {
      if (req.method() === 'PATCH') {
        const key = (req.url().match(/key=eq\.([^&]+)/) || [])[1];
        const body = JSON.parse(req.postData() || '{}');
        Object.assign(RULES.find((x) => x.key === key), body);
        CALLS.push(['patch', key, body]);
        return json([{ key }]);
      }
      return json(RULES);
    }
    if (t === 'profiles' || t === 'gym_people') return json(one ? desk : [desk]);
    return json(one ? null : []);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  await page.goto('http://localhost:5174/retention', { waitUntil: 'domcontentloaded' });
  await page.getByText('Ana Reyes').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  let seen = await text();
  out.push('the radar members, with why: ' + (/No visit in 20 days · Stopped logging workouts/.test(seen) && /Membership ends in 5 days/.test(seen) ? 'shown' : 'MISSING'));
  out.push('one count of at risk: ' + (/At Risk Members 2/i.test(seen) ? '2, the radar count' : 'MISSING'));
  out.push('who was already contacted: ' + (/contacted/.test(seen) ? 'shown' : 'MISSING'));
  out.push('win-back sweep ran on open: ' + (CALLS.some(([f]) => f === 'winback_sweep') ? 'yes' : 'MISSING'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/admin-retention.png' });
  await page.getByRole('button', { name: 'Reach out' }).first().click();
  await page.waitForTimeout(800);
  const sent = CALLS.find(([f]) => f === 'send_retention_message');
  // Ben is listed only because his membership ends: his message must say so.
  await page.getByRole('button', { name: 'Reach out' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const sentBen = CALLS.filter(([f]) => f === 'send_retention_message').find(([, b]) => b.p_member === 'm2');
  out.push('reach out says the real reason: ' + (sentBen && /Your membership ends in 5 days/.test(sentBen[1].p_message) && !/since your last visit/.test(sentBen[1].p_message) ? 'ends in 5 days' : 'MISSING ' + JSON.stringify(sentBen)));
  out.push('reach out is recorded: ' + (sent && sent[1].p_member === 'm1' && /20 days/.test(sent[1].p_message) ? 'through send_retention_message' : 'MISSING ' + JSON.stringify(sent)));

  await page.getByRole('button', { name: 'Win-back messages' }).click();
  await page.waitForTimeout(1000);
  seen = await text();
  const titles = await page.locator('input[aria-label^="Title of"]').evaluateAll((els) => els.map((e) => e.value));
  const offs = await page.locator('input[type=checkbox]').evaluateAll((els) => els.filter((e) => !e.checked).length);
  out.push('the three messages, off: ' + (titles.join('|') === 'We miss you|Still with us?|Come back' && offs === 3 ? 'shown' : 'MISSING ' + titles.join('|') + ' off=' + offs));
  out.push('results: ' + (/sent to 6, 2 came back within two weeks/.test(seen) ? 'shown' : 'MISSING'));
  await page.getByLabel('Send "We miss you" automatically').click();
  await page.waitForTimeout(800);
  out.push('switching one on: ' + (CALLS.some(([f, k, b]) => f === 'patch' && k === 'no_visit_14' && b && b.is_active === true) ? 'saved' : 'MISSING'));
  await page.getByLabel('Text of lapsed').fill('Renew this week and your first month of classes is on us.');
  await page.getByRole('button', { name: 'Save wording' }).click();
  await page.waitForTimeout(800);
  out.push('rewording: ' + (CALLS.some(([f, k, b]) => f === 'patch' && k === 'lapsed' && b && b.message === 'Renew this week and your first month of classes is on us.') ? 'saved' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-winback.png' });
  return out.join('\n');
}
