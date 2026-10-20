/**
 * 0206: a badge pays its points once, the moment it is earned, only to a member
 * whose plan earns points; it tells the member only when switched on; and the
 * maker's "already qualify" count matches what sync would award.
 *
 *   node <repo>/scripts/sql/achievement-points.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2060000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), M2 = id('0b'), T = id('0c'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['m2', M2, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@badge-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@badge-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-BP1'), ('${M2}', '${GYM}', 'QR-BP2') on conflict do nothing;
  select act_as_gym('${GYM}');
  update point_rules set is_active = true where gym_id = '${GYM}' and key = 'achievement';
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Badge Premium', 900, 30, 'premium', true, true, true),
           ('${id('f2')}', '${GYM}', 'Badge Free', 0, null, 'free', false, false, true);
  insert into plan_features (plan_id, feature_key, enabled) values ('${id('f1')}', 'points_earn', true), ('${id('f2')}', 'points_earn', false)
    on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
           ('${M2}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, null, true);
  insert into attendance (member_id, gym_id, check_in_time)
    select '${M}', '${GYM}', now() - (d || ' days')::interval from generate_series(1, 4) d;
  insert into attendance (member_id, gym_id, check_in_time) values ('${M2}', '${GYM}', now() - interval '1 day');
  insert into achievements (gym_id, key, audience, title, description, requirement, icon, tier, category, rule_kind, metric, threshold, points, secret, tell_member, sort_order, active)
    values ('${GYM}', 'bp_four', 'member', 'Four Days', 'You trained four days.', 'Train four days.', 'Rocket', 'bronze', 'Test', 'metric', 'training_days', 4, 75, true, true, 900, true),
           ('${GYM}', 'bp_quiet', 'member', 'Quiet One', 'Given.', 'Given by the gym.', 'Star', 'gold', 'Test', 'manual', null, null, 0, false, false, 901, true);
  select act_as_gym(null);`);

check('the plan with points earns them; the free one does not', (await one(`select plan_allows('${M}', 'points_earn') a, plan_allows('${M2}', 'points_earn') b`)).a === true
  && (await one(`select plan_allows('${M2}', 'points_earn') b`)).b === false);

await as(ST);
let q = await tryOne(`select * from achievement_qualifiers('member', 'training_days', 4)`);
check('the desk sees who already qualifies: one at 4 days, one past halfway at 1? (no: 1 < 2)', q.err === null && q.row.qualify === 1 && q.row.halfway === 0, JSON.stringify(q));
q = await tryOne(`select * from achievement_qualifiers('member', 'training_days', 2)`);
check('…and at a lower bar, one qualifies and one is halfway', q.err === null && q.row.qualify === 1 && q.row.halfway === 1, JSON.stringify(q));
await as(M);
check('a member cannot ask', /owner and the desk/.test((await tryOne(`select * from achievement_qualifiers('member', 'training_days', 4)`)).err ?? ''));

await as(M);
await db.exec(`select * from sync_my_achievements()`);
await owner();
const led = await one(`select count(*)::int n, coalesce(sum(points), 0)::int p from point_ledger where member_id = '${M}' and rule_key = 'achievement'`);
check('earning it pays its points, once', led.n === 1 && led.p === 75, JSON.stringify(led));
check('…and tells the member, because it is switched on', !!(await one(`select 1 x from notifications where user_id = '${M}' and title = 'New badge: Four Days'`)));
await as(M);
await db.exec(`select * from sync_my_achievements()`);
await owner();
check('syncing again pays nothing more', (await one(`select count(*)::int n from point_ledger where member_id = '${M}' and rule_key = 'achievement'`)).n === 1);

// Given by hand to someone whose plan earns no points: no points, and no message (tell_member is off).
await as(AD);
await db.exec(`update achievements set points = 40 where key = 'bp_quiet'`);
await db.exec(`select award_achievement('${M2}', 'bp_quiet')`);
await owner();
check('a plan that earns no points gets none', (await one(`select count(*)::int n from point_ledger where member_id = '${M2}' and rule_key = 'achievement'`)).n === 0);
check('…and a badge with telling off sends nothing', !(await one(`select 1 x from notifications where user_id = '${M2}' and title like 'New badge%'`)));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'achievement_qualifiers(text, text, numeric, text, numeric)', 'execute') x`)).x);
check('the trigger function is not callable by anyone', !(await one(`select has_function_privilege('authenticated', 'trg_achievement_unlocked()', 'execute') x`)).x);
check('marker', (await one(`select migration_0206_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0206 checks passed');
process.exit(failures ? 1 : 0);
