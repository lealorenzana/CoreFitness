/**
 * 0123 in the admin app: the monthly season, weekly quests, and removing a
 * false personal record.
 *
 *   - Rewards: the season card lists claims waiting at the desk; Handed over
 *     sends hand_over_season_claim; Add tier sends the tier with its reward.
 *   - Challenges: a repeating template is marked "Repeats weekly", its weekly
 *     copies are not listed as challenges of their own, and ticking "Repeat
 *     every week" sends repeats_weekly.
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
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'owner@harbour.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);
  const owner = { id: 'u1', role: 'admin', status: 'active', first_name: 'Ana', last_name: 'Ferrer',
    email: 'owner@harbour.test', phone: null, photo_url: null, created_at: new Date().toISOString() };
  const d = (n) => new Date(Date.now() + 8 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

  const TIERS = [{ id: 't1', name: 'Bronze', points_needed: 300, reward_id: 'rw1', rewards: { name: 'Protein shake' } }];
  let claims = [{ id: 'c1', member_id: 'm1', member_name: 'Lea Lorenzana', tier_name: 'Bronze', reward_name: 'Protein shake',
    claimed_at: new Date().toISOString() }];
  const CHALLENGES = [
    { id: 'qT', title: 'Train twice a week', description: null, metric_key: 'training_days', target: 2,
      starts_on: d(-10), ends_on: d(60), reward_points: 50, is_active: true, image_url: null, repeats_weekly: true, parent_id: null },
    { id: 'qW', title: 'Train twice a week (this week copy)', description: null, metric_key: 'training_days', target: 2,
      starts_on: d(-2), ends_on: d(4), reward_points: 50, is_active: true, image_url: null, repeats_weekly: false, parent_id: 'qT' },
  ];
  const SENT = { rpc: {}, tiers: [], challenges: [], goals: [] };
  const GOALS = [{ id: 'g1', title: 'October days', metric: 'training_days', target: 1000, starts_on: d(-5), ends_on: d(20),
    reward_points: 50, is_active: true, reached_at: null }];

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const after = req.url().replace(/^https?:\/\/[^/]+/, '');
    const path = (after.indexOf('?') === -1 ? after : after.slice(0, after.indexOf('?')));
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b),
      headers: { 'Content-Range': '0-9/10', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' } });
    const one = req.headers()['accept']?.includes('vnd.pgrst.object');
    const body = () => { const b = JSON.parse(req.postData() || '{}'); return Array.isArray(b) ? b[0] : b; };
    if (path.startsWith('/auth/v1/')) return json(path.includes('/user') ? session.user : { ...session });
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/rest/v1/rpc/')[1];
      SENT.rpc[fn] = JSON.parse(req.postData() || '{}');
      if (fn === 'my_gym_context') return json([{ gym_id: 'gym-b', gym_name: 'Harbour Strength', slug: 'harbour',
        role: 'admin', status: 'active', lock_reason: null, short_name: null, logo_url: null, accent: 'violet',
        gym_count: 1, onboarded: true, onboarding_step: null, gym_state: 'open' }]);
      if (fn === 'open_season_claims') return json(claims);
      if (fn === 'gym_referrals') return json([
        { id: 'rf1', referrer_name: 'Lea Lorenzana', friend_name: 'Ana Reyes', status: 'rewarded', created_at: new Date().toISOString(),
          rewarded_at: new Date().toISOString(), referrer_points: 100, friend_points: 50 },
        { id: 'rf2', referrer_name: 'Lea Lorenzana', friend_name: 'Joy Mendoza', status: 'pending', created_at: new Date().toISOString(),
          rewarded_at: null, referrer_points: 0, friend_points: 0 }]);
      if (fn === 'gym_goal_progress') return json([{ progress: 412, contributors: 88 }]);
      if (fn === 'hand_over_season_claim') { claims = claims.filter((c) => c.id !== SENT.rpc[fn].p_claim); return json(null); }
      return json(fn === 'my_gym_modules' || fn === 'my_support_grant' ? [] : null);
    }
    if (!path.startsWith('/rest/v1/')) return json([]);
    const t = path.split('/rest/v1/')[1];
    const m = req.method();
    if (t === 'season_tiers') {
      if (m === 'POST') { const r = body(); SENT.tiers.push(r); TIERS.push({ id: 't' + (TIERS.length + 1), ...r, rewards: r.reward_id ? { name: 'Protein shake' } : null }); return json([], 201); }
      return json(TIERS);
    }
    if (t === 'rewards') return json([{ id: 'rw1', name: 'Protein shake', description: null, cost_points: 200, stock: null, is_active: true }]);
    if (t === 'challenges') {
      if (m === 'POST') { SENT.challenges.push(body()); return json([], 201); }
      return json(CHALLENGES);
    }
    if (t === 'gym_goals') {
      if (m === 'POST') { SENT.goals.push(body()); return json([], 201); }
      return json(GOALS);
    }
    if (t === 'squads') return json([{ id: 'sq1', name: 'Iron Barkada', weekly_target: 9 }]);
    if (t === 'squad_members') return json([{ squad_id: 'sq1' }, { squad_id: 'sq1' }, { squad_id: 'sq1' }]);
    if (t === 'achievement_metrics') return json([{ key: 'training_days', label: 'Training days', unit: 'days' }]);
    if (t === 'profiles' || t === 'gym_people') return json(one ? owner : [owner]);
    return json(one ? null : []);
  });

  const out = [];
  const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

  // 1 - Rewards: referrals and the season are tabs of their own (2026-10-04).
  await page.goto('http://localhost:5174/rewards?tab=referrals', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let t = await text();
  out.push('referrals listed: ' + (/Lea Lorenzana brought Ana Reyes/.test(t) && /Paid · 100 \+ 50 pts/.test(t) && /Waiting for their first payment/.test(t) ? 'shown' : 'MISSING'));
  out.push('referral counts: ' + (/2 invited · 1 joined and paid · 1 this month/.test(t) ? 'shown' : 'MISSING'));
  await page.getByRole('tab', { name: 'Monthly season' }).click();
  await page.waitForTimeout(1200);
  t = await text();
  out.push('season card: ' + (/Monthly season/.test(t) && /How it works/.test(t) && /Example\./.test(t) ? 'shown, explained, with an example' : 'MISSING'));
  out.push('claim waiting: ' + (/Lea Lorenzana · Bronze — Protein shake/.test(t) ? 'shown' : 'MISSING'));
  out.push('tier listed: ' + ((await page.getByLabel('Bronze points').inputValue()) === '300'
    && (await page.getByLabel('Bronze reward').inputValue()) === 'rw1' ? 'Bronze, 300, Protein shake' : 'MISSING'));
  await page.screenshot({ path: 'shots/admin-season.png', fullPage: true });
  await page.getByRole('button', { name: 'Handed over' }).click();
  await page.waitForTimeout(900);
  out.push('hand-over sent: ' + (SENT.rpc.hand_over_season_claim?.p_claim === 'c1' ? 'c1' : 'MISSING'));
  t = await text();
  out.push('queue emptied: ' + (/Nothing to hand over/.test(t) ? 'yes' : 'MISSING'));
  await page.getByLabel('Tier name').fill('Silver');
  await page.getByLabel('Points needed').fill('800');
  await page.getByLabel('Tier reward').selectOption('rw1');
  await page.getByRole('button', { name: 'Add tier' }).click();
  await page.waitForTimeout(900);
  const tier = SENT.tiers[SENT.tiers.length - 1] || {};
  out.push('new tier shows its reward: ' + ((await page.getByLabel('Silver points').count()) === 1 && (await page.getByLabel('Silver reward').inputValue()) === 'rw1' ? 'shown' : 'MISSING'));
  out.push('tier sent: ' + (tier.name === 'Silver' && tier.points_needed === 800 && tier.reward_id === 'rw1' ? 'Silver 800 + reward' : 'MISSING ' + JSON.stringify(tier)));
  await page.screenshot({ path: 'shots/admin-season.png', fullPage: true });

  // 2 - Challenges: the weekly template.
  await page.goto('http://localhost:5174/challenges', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  t = await text();
  out.push('template marked: ' + (/Repeats weekly/.test(t) ? 'shown' : 'MISSING'));
  out.push('gym goal with progress: ' + (/October days/.test(t) && /412 of 1,000 training days · 88 members contributing/.test(t) ? 'shown' : 'MISSING'));
  out.push("members' squads listed: " + (/Iron Barkada · 3 · target 9\/wk/.test(t) ? 'shown' : 'MISSING'));
  await page.getByLabel('Goal title').fill('500 workouts this month');
  await page.getByLabel('What counts').selectOption('workouts_logged');
  await page.getByLabel('Goal target').fill('500');
  await page.getByRole('button', { name: 'Set the goal' }).click();
  await page.waitForTimeout(900);
  const gl = SENT.goals[SENT.goals.length - 1] || {};
  out.push('goal sent: ' + (gl.title === '500 workouts this month' && gl.metric === 'workouts_logged' && gl.target === 500 ? 'workouts 500' : 'MISSING ' + JSON.stringify(gl)));
  await page.screenshot({ path: 'shots/admin-gym-goal.png', fullPage: true });
  out.push('weekly copies not listed: ' + (/this week copy/.test(t) ? 'MISSING (copy listed)' : 'hidden'));
  await page.getByRole('button', { name: /New challenge/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. 15 visits in November').fill('Two classes a week');
  await page.getByLabel('Repeat every week').check();
  await page.getByRole('button', { name: 'Create challenge' }).click();
  await page.waitForTimeout(1000);
  const c = SENT.challenges[SENT.challenges.length - 1] || {};
  out.push('repeating challenge sent: ' + (c.title === 'Two classes a week' && c.repeats_weekly === true ? 'repeats_weekly' : 'MISSING ' + JSON.stringify(c)));

  return out.join('\n');
}
