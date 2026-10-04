/**
 * Engagement, redesigned (2026-10-04):
 *   - Rewards in tabs: a reward edited and restocked; approving an out-of-stock
 *     request is blocked and says why; declining needs a reason;
 *   - "How members earn" adds a way to earn only from the rules the database pays;
 *   - Challenges explain themselves with an example, a preset fills the form,
 *     and the form reads back the sentence members will see;
 *   - New achievement is three steps, the requirement written from the rule;
 *   - Send an announcement is three steps, a template's [brackets] must be filled,
 *     and the review step sends; several announcements are recalled at once;
 *   - New event is three steps with quick picks; several events deleted at once.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@gym.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const day = (d) => new Date(Date.now() + 8 * 3600000 + d * 86400000).toISOString().slice(0, 10);
  const admin = { id: 'u1', role: 'admin', status: 'active', first_name: 'Olga', last_name: 'Owner', email: 'owner@gym.test', phone: null, photo_url: null, created_at: iso(-300) };

  const TABLES = {
    profiles: [admin, { id: 'm1', role: 'member', status: 'active', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@x.ph', phone: null, photo_url: null, created_at: iso(-90) }],
    rewards: [{ id: 'rw1', name: 'Shaker bottle', description: null, cost_points: 200, stock: 0, is_active: true },
      { id: 'rw2', name: 'Gym towel', description: null, cost_points: 500, stock: 3, is_active: true }],
    reward_redemptions: [
      { id: 'rd1', member_id: 'm1', reward_id: 'rw1', cost_points: 200, status: 'pending', requested_at: iso(-1), decision_note: null, fulfilled_at: null,
        rewards: { name: 'Shaker bottle' }, member_profiles: { profiles: { first_name: 'Lea', last_name: 'Lorenzana' } } },
      { id: 'rd2', member_id: 'm1', reward_id: 'rw2', cost_points: 500, status: 'pending', requested_at: iso(-1), decision_note: null, fulfilled_at: null,
        rewards: { name: 'Gym towel' }, member_profiles: { profiles: { first_name: 'Lea', last_name: 'Lorenzana' } } }],
    point_rules: [
      { key: 'checkin', label: 'Checked in at the gym', points: 10, is_active: true, sort_order: 1 },
      { key: 'shop_purchase', label: 'Points for every ₱100 spent at the counter', points: 5, is_active: false, sort_order: 40 },
      { key: 'membership_paid', label: 'Paid for a membership', points: 50, is_active: false, sort_order: 41 }],
    achievement_metrics: [
      { key: 'training_days', audience: 'member', label: 'Training days', unit: 'days', is_boolean: false, sort_order: 1, challengeable: true },
      { key: 'weekend_days', audience: 'member', label: 'Weekend days', unit: 'days', is_boolean: false, sort_order: 2, challengeable: true }],
    challenges: [], challenge_participants: [], achievements: [], achievement_unlocks: [], goal_templates: [],
    events: [
      { id: 'e1', title: 'Old fun run', description: null, starts_at: iso(-20), duration_minutes: 60, location: null, capacity: 30, cancelled: false, image_url: null, is_featured: false },
      { id: 'e2', title: 'Old yoga', description: null, starts_at: iso(-10), duration_minutes: 60, location: null, capacity: 30, cancelled: false, image_url: null, is_featured: false },
      { id: 'e3', title: 'Next week boxing', description: null, starts_at: iso(7), duration_minutes: 60, location: null, capacity: 30, cancelled: false, image_url: null, is_featured: false }],
    event_registrations: [{ id: 'er1', event_id: 'e1', member_id: 'm1', created_at: iso(-21) }],
    notifications: [
      { id: 'n1', title: 'Closed Sunday', message: 'We are closed', type: 'system', created_at: iso(-3), read: true, image_url: null },
      { id: 'n2', title: 'Closed Sunday', message: 'We are closed', type: 'system', created_at: iso(-3), read: false, image_url: null },
      { id: 'n3', title: 'New class', message: 'Boxing', type: 'event', created_at: iso(-2), read: false, image_url: null }],
  };
  const CALLS = [];
  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = after.indexOf('?');
    const path = qi === -1 ? after : after.slice(0, qi);
    const query = qi === -1 ? '' : decodeURIComponent(after.slice(qi + 1));
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : session);
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      const body = JSON.parse(req.postData() || '{}');
      CALLS.push(['rpc', fn, body]);
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-1', gym_name: 'Harbour Strength', slug: 'harbour', role: 'admin', status: 'active',
        lock_reason: null, short_name: null, logo_url: null, accent: 'violet', gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'count_audience' || fn === 'broadcast_audience_count') return json(12);
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const t = path.split('/rest/v1/')[1].replace('gym_people', 'profiles');
      const m = req.method();
      if (m !== 'GET') {
        const body = req.postData() ? JSON.parse(req.postData()) : null;
        CALLS.push([m, t, body, query]);
        const ids = (/id=in\.\(([^)]*)\)/.exec(query)?.[1] ?? /id=eq\.([^&]+)/.exec(query)?.[1] ?? '').split(',').filter(Boolean).map((x) => x.replace(/"/g, ''));
        if (m === 'DELETE') { TABLES[t] = (TABLES[t] ?? []).filter((r) => !ids.includes(r.id)); return json(ids.map((id) => ({ id }))); }
        if (m === 'PATCH') { (TABLES[t] ?? []).forEach((r) => { if (ids.includes(r.id) || (/key=eq\./.test(query) && query.includes(`key=eq.${r.key}`))) Object.assign(r, body); }); return json(ids.length ? ids.map((id) => ({ id })) : [{ id: 'x' }]); }
        const row = { id: `new-${CALLS.length}`, ...(Array.isArray(body) ? body[0] : body) };
        (TABLES[t] ??= []).push(row);
        return json(one ? row : [row]);
      }
      let rows = TABLES[t] ?? [];
      if (/challengeable=eq\.true/.test(query)) rows = rows.filter((r) => r.challengeable);
      return json(one ? (rows[0] ?? null) : rows);
    }
    return json([]);
  });

  const out = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

  // ---- Rewards ----------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/rewards', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Catalogue' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  let t = await text();
  out.push('rewards in tabs, out-of-stock counted: ' + ((await page.getByRole('tab').count()) >= 6 && /OUT OF STOCK 1/i.test(t) ? 'yes' : 'MISSING'));
  out.push('approving the out-of-stock one is blocked and explained: ' + (/Out of stock — restock it under Catalogue, or decline/.test(t)
    && await page.getByRole('button', { name: /Approve/ }).first().isDisabled() ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /Decline/ }).first().click();
  out.push('declining needs a reason: ' + (await page.getByRole('button', { name: 'Decline', exact: true }).last().isDisabled() ? 'yes' : 'NO'));
  await page.getByPlaceholder(/Out of stock this month/).fill('Sold out — back next month.');
  await page.getByRole('button', { name: 'Decline', exact: true }).last().click();
  await page.waitForTimeout(500);
  out.push('declined with it: ' + (CALLS.some((c) => c[1] === 'decide_redemption' && c[2].p_status === 'rejected' && /Sold out/.test(c[2].p_note)) ? 'yes' : 'MISSING'));
  await page.getByRole('tab', { name: 'Catalogue' }).click();
  await page.getByRole('button', { name: 'Add 5 to Shaker bottle' }).click();
  await page.waitForTimeout(500);
  out.push('restock adds to the shelf: ' + (CALLS.some((c) => c[0] === 'PATCH' && c[1] === 'rewards' && c[2]?.stock === 5) ? '0 → 5' : 'MISSING'));
  await page.getByRole('button', { name: 'Edit Gym towel' }).click();
  await page.locator('input[placeholder="500"]').fill('450');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  out.push('a reward can be edited: ' + (CALLS.some((c) => c[0] === 'PATCH' && c[1] === 'rewards' && c[2]?.cost_points === 450) ? 'price 500 → 450' : 'MISSING'));
  await page.getByRole('tab', { name: 'How members earn' }).click();
  await page.getByRole('button', { name: /Add a way to earn/ }).click();
  t = await text();
  out.push('only rules the database pays are offered: ' + (/Points for every ₱100 spent at the counter/.test(t) && /Paid for a membership/.test(t) ? 'shop + membership' : 'MISSING'));
  await page.getByRole('button', { name: /Points for every ₱100/ }).click();
  await page.getByLabel('Points', { exact: true }).fill('4');
  out.push('…with a worked example: ' + (/A ₱450 sale would earn 16 points/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Switch it on' }).click();
  await page.waitForTimeout(500);
  out.push('…and switched on: ' + (CALLS.some((c) => c[0] === 'PATCH' && c[1] === 'point_rules' && c[2]?.is_active === true && c[2]?.points === 4) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-earning-rules.png' });

  // ---- Challenges ---------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/challenges', { waitUntil: 'domcontentloaded' });
  await page.getByText('How a challenge works').waitFor({ timeout: 15000 });
  t = await text();
  out.push('challenges explain themselves with an example: ' + (/Example\./.test(t) && /reaches 10 in her fourth week/.test(t) ? 'yes' : 'MISSING'));
  out.push('completions settle on open: ' + (CALLS.some((c) => c[1] === 'settle_challenges') ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /New challenge/ }).click();
  await page.getByRole('button', { name: '10 training days in 30 days' }).click();
  t = await text();
  out.push('a preset fills the form and reads back the sentence: ' + (/Members will read:/.test(t) && /reach 10 × training days and earn 250 points/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-challenge-new.png' });
  await page.keyboard.press('Escape');

  // ---- Achievements --------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/achievements', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New achievement/ }).click();
  await page.getByText('1. What earns it').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /^Training days/ }).click();
  await page.getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Title').fill('Ten-Day Club');
  await page.getByLabel('Description').fill('You trained ten days.');
  out.push('the requirement writes itself: ' + ((await page.getByLabel('Requirement').inputValue()) === 'Reach 10 training days.' ? 'yes' : 'MISSING ' + (await page.getByLabel('Requirement').inputValue())));
  await page.getByRole('button', { name: 'Next' }).click();
  t = await text();
  out.push('a locked and earned preview: ' + (/Locked/i.test(t) && /Earned/i.test(t) && /Ten-Day Club/.test(t) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-achievement-new.png' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForTimeout(600);
  const made = CALLS.find((c) => c[0] === 'POST' && c[1] === 'achievements');
  out.push('created with the key made from the name: ' + (made && made[2].key === 'ten_day_club' && made[2].metric === 'training_days' && Number(made[2].threshold) === 10 ? 'yes' : 'MISSING ' + JSON.stringify(made?.[2])));

  // ---- Announcements ---------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/notifications', { waitUntil: 'domcontentloaded' });
  await page.getByText('Sent announcements').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: /Select all 2/ }).click();
  await page.getByRole('button', { name: 'Recall 2' }).click();
  out.push('recall several, with the count: ' + (/Recall 2 announcements/.test(await text()) && /3 inboxes in all/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Recall all of them' }).click();
  await page.waitForTimeout(600);
  const del = CALLS.find((c) => c[0] === 'DELETE' && c[1] === 'notifications');
  out.push('…all their rows go: ' + (del && /n1/.test(del[3]) && /n2/.test(del[3]) && /n3/.test(del[3]) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /Send|New announcement/ }).first().click();
  await page.getByText('1. Who gets it').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Closed for a day' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  out.push('a template must be filled in first: ' + (/Fill in the \[brackets\]/.test(await text()) ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-announce-step2.png' });

  // ---- Events ----------------------------------------------------------------------------------------------
  await page.goto('http://localhost:5174/events', { waitUntil: 'domcontentloaded' });
  await page.getByText('All events').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Past events' }).click();
  await page.getByRole('button', { name: 'Delete 2' }).click();
  out.push('delete past events, warned about sign-ups: ' + (/Delete 2 events/.test(await text()) && /removes 1 registration/.test(await text()) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(600);
  const dev = CALLS.find((c) => c[0] === 'DELETE' && c[1] === 'events');
  out.push('…both deleted, the upcoming one kept: ' + (dev && /e1/.test(dev[3]) && /e2/.test(dev[3]) && !/e3/.test(dev[3]) ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: /New event/i }).first().click();
  await page.getByText('1. What and when').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '1 h 30' }).click();
  out.push('quick picks for duration: ' + ((await page.getByLabel('Minutes').inputValue()) === '90' ? 'yes' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-event-new.png' });
  return out.join('\n');
}
