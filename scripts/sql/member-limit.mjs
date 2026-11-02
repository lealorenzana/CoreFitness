/**
 * 0230: plans differ by features (Starter the essentials, Growth + packages and
 * engagement, Pro + the assistant, online payments, analytics) and a plan's
 * member limit holds — a new member past it is refused, in words for the desk
 * or for the person signing up; nobody already in is touched; the admin app
 * can read the allowance; Standard and Premium are retired.
 *
 *   node <repo>/scripts/sql/member-limit.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);

const ADMIN = 'a2300000-0000-4000-8000-000000000001';
const A = 'a2300000-0000-4000-8000-0000000000a1', B = 'a2300000-0000-4000-8000-0000000000b1', C = 'a2300000-0000-4000-8000-0000000000c1';
await owner();
const G = (await one(`select gym_one() g`)).g;
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'boss@limit-test.ph', '{}'), ('${A}', 'a@limit-test.ph', '{}'), ('${B}', 'b@limit-test.ph', '{}'), ('${C}', 'c@limit-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${ADMIN}', 'Boss', 'Owner', 'boss@limit-test.ph', 'active', 'member', '${G}'),
    ('${A}', 'Ann', 'A', 'a@limit-test.ph', 'active', 'member', '${G}'),
    ('${B}', 'Ben', 'B', 'b@limit-test.ph', 'active', 'member', '${G}'),
    ('${C}', 'Cy', 'C', 'c@limit-test.ph', 'active', 'member', '${G}')
  on conflict (id) do update set active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id in ('${ADMIN}', '${A}', '${B}', '${C}');
  set session_replication_role = replica;
  insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${ADMIN}', 'admin', 'active');
  set session_replication_role = origin;
  update gyms set plan = 'starter' where id = '${G}';`);

// ---- what each plan unlocks -------------------------------------------------------------------------------
const allows = async (plan, f) => (await one(`select enabled from platform_plan_features where plan_key = '${plan}' and feature_key = '${f}'`))?.enabled;
check('Starter: the desk, check-in and coaches, not packages, the assistant or online payments',
  (await allows('starter', 'front_desk')) && (await allows('starter', 'checkin')) && (await allows('starter', 'coaching'))
  && !(await allows('starter', 'rooms')) && !(await allows('starter', 'assistant')) && !(await allows('starter', 'online_pay')));
check('Growth adds packages, points, the shop and Lobby TV, not the assistant or analytics',
  (await allows('growth', 'rooms')) && (await allows('growth', 'engagement')) && (await allows('growth', 'shop')) && (await allows('growth', 'lobby_tv'))
  && !(await allows('growth', 'assistant')) && !(await allows('growth', 'analytics')));
check('Pro and the trial unlock everything', Number((await one(`select count(*) n from platform_plan_features where plan_key in ('pro', 'trial') and not enabled`)).n) === 0);
check('a Starter gym is told the assistant is not in its plan', (await one(`select gym_plan_allows('${G}', 'assistant') ok`)).ok === false);
const p = await one(`select max_members m, price_monthly::int pm, price_yearly::int py from platform_plans where key = 'starter'`);
check('Starter is 75 members at ₱1,299 / ₱12,990', p.m === 75 && p.pm === 1299 && p.py === 12990, JSON.stringify(p));
// Before this script moves gym_one to Starter it sits on Premium, so 0230 keeps Premium and retires Standard.
check('an unused old plan is retired, one a gym is on is kept', (await one(`select is_active a from platform_plans where key = 'standard'`)).a === false
  && (await one(`select is_active a from platform_plans where key = 'premium'`)).a === true);

// ---- the limit -------------------------------------------------------------------------------------------------
const n = (await one(`select active_members n from gym_member_limit('${G}')`)).n;
await db.exec(`update platform_plans set max_members = ${n + 1} where key = 'starter'`);
let err = await tryExec(`insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${A}', 'member', 'active')`);
check('a member up to the limit is let in', err === null, err);
await as(ADMIN);
const mine = await one(`select * from my_member_allowance()`);
check('the admin app reads the allowance', mine && mine.plan_name === 'Starter' && mine.max_members === n + 1 && mine.active_members === n + 1, JSON.stringify(mine));
await owner();
err = await tryExec(`insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${C}', 'member', 'active')`);
check('past the limit the desk is told the plan and to upgrade', /Your plan \(Starter\) allows \d+ members .* Upgrade your plan/.test(err ?? ''), err);
await as(B);
err = await tryExec(`insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${B}', 'member', 'pending_approval')`);
check('someone signing up is told the gym is full, kindly', /This gym is full on its current plan/.test(err ?? ''), err);
await owner();
err = await tryExec(`update gym_roles set status = 'active' where gym_id = '${G}' and user_id = '${A}'`);
check('nobody already in is touched', err === null, err);
await db.exec(`update platform_plans set max_members = null where key = 'starter'`);
err = await tryExec(`insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${C}', 'member', 'active')`);
check('no limit, no refusal', err === null, err);
check('the probe marker answers a visitor', (await (async () => { await db.exec(`reset role; set role anon;`); return one(`select migration_0230_applied() ok`); })()).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
