/**
 * 0208: a squad week and a gym goal, settled from the owner's screen, pay a
 * member whose plan earns points and not one whose plan has points_earn off.
 * Before 0208 plan_allows() said yes to the admin caller, so both were paid.
 *
 *   node <repo>/scripts/sql/settle-pays-by-plan.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2080000-0000-4000-8000-0000000000${n}`;
const MP = id('0a'), MF = id('0b'), AD = id('0d');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const paid = async (rule) => (await db.query(
  `select member_id, points from point_ledger where rule_key = '${rule}' and member_id in ('${MP}', '${MF}')`)).rows;

await owner();
await db.exec(`
  ${[['mp', MP, 'member'], ['mf', MF, 'member'], ['own', AD, 'admin']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@settle-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@settle-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${MP}', '${GYM}', 'QR-SP1'), ('${MF}', '${GYM}', 'QR-SP2') on conflict do nothing;
  select act_as_gym('${GYM}');
  update point_rules set is_active = true where gym_id = '${GYM}' and key in ('squad_week', 'gym_goal');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Settle Premium', 900, 30, 'premium', true, true, true),
           ('${id('f2')}', '${GYM}', 'Settle No Points', 500, 30, 'premium', true, true, true);
  insert into plan_features (plan_id, feature_key, enabled) values ('${id('f1')}', 'points_earn', true), ('${id('f2')}', 'points_earn', false)
    on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${MP}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
           ('${MF}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, manila_today() + 30, false);
  insert into squads (id, gym_id, name, code, weekly_target, created_by)
    values ('${id('e1')}', '${GYM}', 'Settle Squad', 'SETTLE', 2, '${MP}');
  insert into squad_members (gym_id, squad_id, member_id) values ('${GYM}', '${id('e1')}', '${MP}'), ('${GYM}', '${id('e1')}', '${MF}');
  insert into workout_logs (member_id, gym_id, activity, performed_on) values
    ('${MP}', '${GYM}', 'Gym', manila_today()), ('${MF}', '${GYM}', 'Gym', manila_today());
  insert into gym_goals (id, gym_id, created_by, title, metric, target, starts_on, ends_on, reward_points)
    values ('${id('e2')}', '${GYM}', '${AD}', 'Two days together', 'training_days', 2, manila_today() - 1, manila_today() + 5, 40);
  select act_as_gym(null);`);

await as(AD);
check('the trap is real: plan_allows says yes to the owner for a plan with points off',
  (await one(`select plan_allows('${MF}', 'points_earn') a`)).a === true);
await owner();
check('member_plan_allows asks the plan alone: yes for one, no for the other',
  (await one(`select member_plan_allows('${MP}', 'points_earn') a, member_plan_allows('${MF}', 'points_earn') b`)).a === true
  && (await one(`select member_plan_allows('${MF}', 'points_earn') b`)).b === false);

await as(AD);
let err = await tryExec(`select settle_squads(); select settle_squads();`);
check('the owner settles the squads (as the admin page does on load)', err === null, err ?? '');
await owner();
check('the week is recorded once', (await one(`select count(*)::int n from squad_weeks where squad_id = '${id('e1')}'`)).n === 1);
let rows = await paid('squad_week');
check('a squad week pays the member whose plan earns points', rows.some((r) => r.member_id === MP), JSON.stringify(rows));
check('…and not the one whose plan has points off', !rows.some((r) => r.member_id === MF), JSON.stringify(rows));

await as(AD);
err = await tryExec(`select settle_gym_goals(); select settle_gym_goals();`);
check('the owner settles the gym goal (Challenges → Gym goal on load)', err === null, err ?? '');
await owner();
check('the goal is reached', (await one(`select reached_at is not null r from gym_goals where id = '${id('e2')}'`)).r === true);
rows = await paid('gym_goal');
check('a gym goal pays the contributor whose plan earns points, once', rows.filter((r) => r.member_id === MP).length === 1
  && rows.find((r) => r.member_id === MP).points === 40, JSON.stringify(rows));
check('…and not the contributor whose plan has points off', !rows.some((r) => r.member_id === MF), JSON.stringify(rows));

await owner();
check('member_plan_allows is closed to signed-in callers', !(await one(`select has_function_privilege('authenticated', 'member_plan_allows(uuid, text)', 'execute') x`)).x);
check('…and to visitors', !(await one(`select has_function_privilege('anon', 'member_plan_allows(uuid, text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0208_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0208 checks passed');
process.exit(failures ? 1 : 0);
