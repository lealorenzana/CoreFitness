/**
 * 0186: an expired member keeps the gym's free tier (frozen keeps nothing);
 * announcement audiences by plan; a new gym's starter plans with no price
 * until the owner sets one; and points a gym can switch off.
 *
 *   node <repo>/scripts/sql/plans-and-points.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1860000-0000-4000-8000-0000000000${n}`;
const PAID = id('0a'), LAPSED = id('0b'), FROZEN = id('0c'), FREE = id('0d'), ST = id('0e'), PA = id('0f');
const P_FREE = id('f1'), P_PREM = id('f2');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const allows = async (m, f) => { await as(m); return (await one(`select plan_allows('${m}', '${f}') ok`)).ok; };

await owner();
await db.exec(`
  ${[['paid', PAID, 'member'], ['lapsed', LAPSED, 'member'], ['frozen', FROZEN, 'member'], ['free', FREE, 'member'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@plans-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@plans-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${PAID}', '${GYM}', 'QP1'), ('${LAPSED}', '${GYM}', 'QP2'), ('${FROZEN}', '${GYM}', 'QP3'), ('${FREE}', '${GYM}', 'QP4') on conflict do nothing;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@plans-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@plans-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  select act_as_gym('${GYM}');
  update membership_plans set is_active = false where gym_id = '${GYM}' and tier = 'free';
  insert into membership_plans (id, gym_id, name, tier, price, duration_days, is_active) values
    ('${P_FREE}', '${GYM}', 'Test Free', 'free', 0, null, true),
    ('${P_PREM}', '${GYM}', 'Test Premium', 'premium', 900, 30, true);
  insert into plan_features (gym_id, plan_id, feature_key, enabled) values
    ('${GYM}', '${P_FREE}', 'workout_tracker', true), ('${GYM}', '${P_FREE}', 'challenges', false),
    ('${GYM}', '${P_PREM}', 'workout_tracker', true), ('${GYM}', '${P_PREM}', 'challenges', true)
  on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ('${PAID}', '${GYM}', '${P_PREM}', 'active', manila_today() - 5, manila_today() + 25),
    ('${LAPSED}', '${GYM}', '${P_PREM}', 'expired', manila_today() - 40, manila_today() - 10),
    ('${FROZEN}', '${GYM}', '${P_PREM}', 'frozen', manila_today() - 5, manila_today() + 25),
    ('${FREE}', '${GYM}', '${P_FREE}', 'active', manila_today() - 5, null);`);

// ---- D1: expired → the free tier ----
check('a paid member has what the plan unlocks', (await allows(PAID, 'challenges')) === true);
check('an expired member keeps what the free tier allows', (await allows(LAPSED, 'workout_tracker')) === true);
check('…and loses what only the paid plan unlocked', (await allows(LAPSED, 'challenges')) === false);
check('a frozen member keeps nothing', (await allows(FROZEN, 'workout_tracker')) === false);

// ---- D1: audiences ----
await as(ST);
const ids = async (kind, plans = null) => (await all(`select user_id from members_in_audience('${kind}', ${plans ? `array['${plans}']::uuid[]` : 'null'})`)).map((r) => r.user_id);
let free = await ids('free_tier');
check('Free tier: the expired member and the free member', free.includes(LAPSED) && free.includes(FREE), JSON.stringify(free));
check('…not the paid member, not the frozen one', !free.includes(PAID) && !free.includes(FROZEN));
const paid = await ids('paid');
check('Paid plans: the paid member only — never the expired one', paid.includes(PAID) && !paid.includes(LAPSED) && !paid.includes(FREE));
check('a specific plan: its current members', (await ids('plans', P_PREM)).includes(PAID) && !(await ids('plans', P_PREM)).includes(LAPSED));
await as(PAID);
check('a member cannot list an audience', (await all(`select * from members_in_audience('everyone', null)`)).length === 0);

// ---- D2: starter plans ----
await as(PA);
const g = (await one(`select create_gym('Starter Gym', 'starter-gym-186', null) id`)).id;
await owner();
const plans = await all(`select name, tier::text, price_unset, can_book_classes, can_book_pt, id from membership_plans where gym_id = '${g}' order by name`);
check('a new gym gets Free, Monthly and Premium — not a copy of Gym #1', plans.map((p) => p.name).join() === 'Free,Monthly,Premium', JSON.stringify(plans));
check('…with the paid ones waiting for a price, and no plan called a trial', plans.filter((p) => p.price_unset).map((p) => p.name).join() === 'Monthly,Premium' && !plans.some((p) => p.tier === 'freemium'));
const feat = async (name, key) => (await one(`select pf.enabled from plan_features pf join membership_plans p on p.id = pf.plan_id where p.gym_id = '${g}' and p.name = '${name}' and pf.feature_key = '${key}'`))?.enabled;
check('Free unlocks no paid feature; Monthly adds challenges; Premium adds the AI coach',
  (await feat('Free', 'challenges')) === false && (await feat('Monthly', 'challenges')) === true
  && (await feat('Monthly', 'ai_model')) === false && (await feat('Premium', 'ai_model')) === true);
check('…and only Premium books 1-on-1', plans.find((p) => p.name === 'Premium').can_book_pt && !plans.find((p) => p.name === 'Monthly').can_book_pt);
await db.exec(`set role anon`);
check('a plan with no price is never offered', (await all(`select name from public_plans('${g}')`)).map((r) => r.name).join() === 'Free');
await owner();
await db.exec(`update membership_plans set price = 799 where gym_id = '${g}' and name = 'Monthly'`);
await db.exec(`set role anon`);
check('…until the owner prices it', (await all(`select name from public_plans('${g}')`)).some((r) => r.name === 'Monthly'));

// ---- D4: points off ----
await owner();
await db.exec(`select act_as_gym('${GYM}');
  insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'points', false)
    on conflict (gym_id, feature_key) do update set enabled = false;`);
const before = (await one(`select count(*)::int n from point_ledger where member_id = '${PAID}'`)).n;
const RULE = (await one(`select key from point_rules where gym_id = '${GYM}' order by sort_order limit 1`)).key;
await db.exec(`insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
  values ('${GYM}', '${PAID}', '${RULE}', 10, 'test', gen_random_uuid())`);
check('points off: nothing is earned, wherever it comes from', (await one(`select count(*)::int n from point_ledger where member_id = '${PAID}'`)).n === before);
await db.exec(`insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
  values ('${GYM}', '${PAID}', '${RULE}', -5, 'test', gen_random_uuid())`);
check('…a spend is still honoured', (await one(`select count(*)::int n from point_ledger where member_id = '${PAID}'`)).n === before + 1);
check('…and seasons, which run on points, are off with it', (await one(`select gym_module_on('${GYM}', 'seasons') is_on`)).is_on === false);
check('…while challenges stay on', (await one(`select gym_module_on('${GYM}', 'engagement') is_on`)).is_on === true);
await db.exec(`update gym_modules set enabled = true where gym_id = '${GYM}' and feature_key = 'points'`);
await db.exec(`insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
  values ('${GYM}', '${PAID}', '${RULE}', 10, 'test', gen_random_uuid())`);
check('points back on: earning resumes', (await one(`select count(*)::int n from point_ledger where member_id = '${PAID}'`)).n === before + 2);

await owner();
check('marker', (await one(`select migration_0186_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0186 checks passed');
process.exit(failures ? 1 : 0);
