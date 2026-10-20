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
      if (fn === 'log_retention_call') return json('c1');
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
    if (t === 'winback_sends') return json([{ member_id: 'm2', sent_at: minute, rule_key: 'manual', kind: 'message', note: null }]);
    if (t === 'attendance') {
      // Ana and Ben came last month; only Ben came this month.
      const last = new Date(); last.setMonth(last.getMonth() - 1, 10);
      const thisM = new Date(); thisM.setDate(1); thisM.setHours(9);
      return json([{ member_id: 'm1', check_in_time: last.toISOString() }, { member_id: 'm2', check_in_time: last.toISOString() }, { member_id: 'm2', check_in_time: thisM.toISOString() }]);
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
  const has = (label, ok, extra = '') => out.push(`${label}: ${ok ? 'yes' : 'MISSING' + (extra ? ' ' + extra : '')}`);
  has('the radar members, with why', /No visit in 20 days/.test(seen) && /Stopped logging workouts/.test(seen) && /Membership ends in 5 days/.test(seen));
  has('one count of who to win back', /Who to win back 2/.test(seen));
  has('still coming: one of last month\'s two visitors came this month', /Still coming 50%/.test(seen), (seen.match(/Still coming.{0,60}/) || [''])[0]);
  has('slipping counts no visit in 14+ days', /Slipping 1 no visit in 14\+ days/.test(seen));
  has('came back after a message, from the results', /Came back after a message 2 of 6 messaged/.test(seen));
  has('last contact says how: a desk message, or never', /· message/.test(seen) && /never/.test(seen));
  has('filters with counts', /High risk 1/.test(seen) && /Plan ending 1/.test(seen) && /Not contacted 1/.test(seen));
  has('win-back sweep ran on open', CALLS.some(([f]) => f === 'winback_sweep'));
  has('the page does not scroll', await page.evaluate(() => { const m = document.querySelector('main'); return !m || m.scrollHeight <= m.clientHeight + 1; }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/admin-retention.png' });

  // Ben is listed only because his membership ends: the ready words must say so, never "we miss you".
  await page.locator('[data-winback-row]', { hasText: 'Ben Cruz' }).getByRole('button', { name: 'Message' }).click();
  await page.locator('[data-message-card]').getByRole('button', { name: 'Plan ending' }).click();
  await page.locator('[data-send-winback]').click();
  await page.waitForTimeout(600);
  const sentBen = CALLS.filter(([f]) => f === 'send_retention_message').find(([, b]) => b.p_member === 'm2');
  has('a message says the real reason, and is recorded', !!sentBen && /your membership ends in 5 days/.test(sentBen[1].p_message), JSON.stringify(sentBen));
  await page.locator('[data-winback-row]', { hasText: 'Ana Reyes' }).locator('[data-mark-called]').click();
  await page.getByLabel(/What they said/).fill('Back on Thursday');
  await page.locator('[data-log-call]').click();
  await page.waitForTimeout(600);
  const call = CALLS.find(([f]) => f === 'log_retention_call');
  has('Mark called logs the call with its note (0205)', !!call && call[1].p_member === 'm1' && call[1].p_note === 'Back on Thursday', JSON.stringify(call));

  await page.locator('[data-view="msgs"]').click();
  await page.waitForTimeout(1000);
  seen = await text();
  has('/retention/messages is the Automatic messages tab', /\/retention\/messages$/.test(page.url()) && (await page.locator('[data-rule]').count()) === 3);
  has('the three messages, all off', (await page.locator('[data-rule] .a-toggle.off').count()) === 3 && /We miss you/.test(seen) && /Still with us\?/.test(seen) && /Come back/.test(seen));
  has('results under the one that was sent', /6 sent in 30 days · 2 came back within 2 weeks/.test(seen));
  await page.getByLabel('Send "We miss you" automatically').click();
  await page.waitForTimeout(800);
  has('switching one on saves', CALLS.some(([f, k, b]) => f === 'patch' && k === 'no_visit_14' && b && b.is_active === true));
  await page.locator('[data-rule="lapsed"]').getByRole('button', { name: 'Edit message' }).click();
  await page.getByLabel('Text of lapsed').fill('Your plan ended. Renew at the desk any time.');
  await page.getByRole('button', { name: 'Save wording' }).click();
  await page.waitForTimeout(800);
  has('rewording saves', CALLS.some(([f, k, b]) => f === 'patch' && k === 'lapsed' && b && b.message === 'Your plan ended. Renew at the desk any time.'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/admin-winback.png' });
  return out.join('\n');
}
