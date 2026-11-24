/**
 * 0124's gym-wide goal, and 0273/0274: squads and members' own goals removed
 * while the gym goal stays.
 *
 * Ways it could go wrong, each checked:
 *   - a gym goal paid twice, or paid to someone who did nothing toward it;
 *   - anyone but the owner setting a gym goal;
 *   - 0273 leaving a squad table, function, policy, switch or points rule behind, or
 *     breaking a shared function it edited in place.
 *
 *   node <repo>/scripts/sql/gym-goal.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const M = [1, 2, 3, 4, 5, 6].map((i) => `a2000000-0000-4000-8000-00000000000${i}`);
const ADMIN = 'a2000000-0000-4000-8000-0000000000a1';
const STAFF = 'a2000000-0000-4000-8000-0000000000a2';
const MB = 'b2000000-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const count = async (sql) => Number((await one(`select count(*)::int as n from (${sql}) x`)).n);

await asOwner();
const ready = await one(`select to_regclass('public.gym_goals') is not null as ok`);
check('0124 is applied (gym_goals exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

const person = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@goal-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@goal-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${M.map((id, i) => person(id, 'm' + (i + 1))).join('\n')}
  ${person(ADMIN, 'owner')} ${person(STAFF, 'desk')} ${person(MB, 'mb')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ${M.map((id) => `('${GYM_A}', '${id}', 'member', 'active')`).join(', ')},
    ('${GYM_A}', '${ADMIN}', 'admin', 'active'), ('${GYM_A}', '${STAFF}', 'staff', 'active'),
    ('${GYM_B}', '${MB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${MB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${MB}';
  update profiles set active_gym_id = '${GYM_A}' where id in (${[...M, ADMIN, STAFF].map((x) => `'${x}'`).join(',')});
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ${M.map((id, i) => `('${id}', '${GYM_A}', 'QR-S${i}')`).join(', ')}, ('${MB}', '${GYM_B}', 'QR-SB')
    on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ${M.map((id) => `('${id}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29)`).join(', ')}`);

// ---- the gym-wide goal ---------------------------------------------------------------------------
// Three members train today.
await asOwner();
await db.exec(`insert into workout_logs (member_id, gym_id, activity, performed_on) values
  ${[M[0], M[1], M[2]].map((m) => `('${m}', '${GYM_A}', 'Gym', (now() at time zone 'Asia/Manila')::date)`).join(', ')};
  select set_config('app.workout_counting', 'on', false); update workout_logs set counts = true where not counts; select set_config('app.workout_counting', '', false);`);

await as(M[0]);
check('a member cannot set a gym goal', !!(await tryExec(`insert into gym_goals (title, metric, target, starts_on, ends_on, reward_points)
  values ('x', 'training_days', 1, current_date, current_date + 1, 10)`)));
await as(ADMIN);
check('an owner cannot start a gym goal in the past (0171)', !!(await tryExec(`insert into gym_goals (title, metric, target, starts_on, ends_on, reward_points)
  values ('Backdated', 'training_days', 3, current_date - 1, current_date + 5, 40)`)));
// Started yesterday, so yesterday's training counts — written as the database would.
await asOwner();
const goal = (await one(`insert into gym_goals (gym_id, created_by, title, metric, target, starts_on, ends_on, reward_points)
  values ('${GYM_A}', '${ADMIN}', '100 days in October', 'training_days', 3, current_date - 1, current_date + 5, 40) returning id`)).id;
await as(ADMIN);
await as(M[0]);
const g = await one(`select * from current_gym_goal()`);
check('members see the goal with its progress', g && g.title === '100 days in October' && Number(g.progress) === 3, JSON.stringify(g));
check('and their own contribution', Number(g.mine) === 1, JSON.stringify(g));
await as(ADMIN);
await db.exec(`select settle_gym_goals(); select settle_gym_goals();`);
check('reached once', (await one(`select reached_at is not null as r from gym_goals where id = '${goal}'`)).r);
await asOwner();
const paid = (await db.query(`select member_id, points from point_ledger where rule_key = 'gym_goal' and source_id = '${goal}'`)).rows;
check('every contributor is paid the goal points once', paid.length === 3 && paid.every((p) => p.points === 40), JSON.stringify(paid));
check('nobody who did nothing is paid', !paid.some((p) => [M[3], M[4], M[5]].includes(p.member_id)));
await as(MB);
check("gym B sees none of gym A's goals", (await count(`select 1 from gym_goals`)) === 0);

// ---- 0273: squads removed --------------------------------------------------------------------
await asOwner();
check('the goal table is in the tenancy list, the squad tables are not',
  (await one(`select tenancy_gym_tables() @> array['gym_goals'] and not tenancy_gym_tables() && array['squads','squad_members','squad_weeks'] as ok`)).ok);
check('no squad table is left', (await count(`select 1 from pg_class where relnamespace = 'public'::regnamespace and relname ilike '%squad%'`)) === 0);
const left = (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace and (proname ilike '%squad%' or prosrc ilike '%squad%')`)).rows;
check('no function names or mentions a squad', left.length === 0, JSON.stringify(left));
check('the shared functions it edited are still there',
  (await count(`select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('tenancy_gym_tables','remove_demo_data','streak_nudge_sweep','trg_tv_design','platform_feature_adoption','platform_gym_features','platform_gym_usage')`)) === 7);
check('the streak sweep still nudges members', /streak_card\(r\.id, v_gym\)/.test((await one(`select prosrc from pg_proc where proname = 'streak_nudge_sweep'`)).prosrc));
check('the Teams switch and the squad points rule are gone',
  (await count(`select 1 from platform_features where key = 'squads'`)) === 0
  && (await count(`select 1 from gym_modules where feature_key = 'squads'`)) === 0
  && (await count(`select 1 from point_rules where key = 'squad_week'`)) === 0);
check('the TV refuses a squads panel', !!(await tryExec(`update gym_settings set tv_design = '{"panels":["squads"]}' where gym_id = '${GYM_A}'`)));
check('…and still takes the others', !(await tryExec(`update gym_settings set tv_design = '{"panels":["goal","season","classes"]}' where gym_id = '${GYM_A}'`)));

// ---- 0274: members' own goals removed ------------------------------------------------------------
await asOwner();
check('no goal table is left', (await one(`select to_regclass('public.fitness_goals') is null and to_regclass('public.goal_templates') is null as ok`)).ok);
check('the tenancy list names neither',
  (await one(`select not tenancy_gym_tables() && array['fitness_goals','goal_templates'] as ok`)).ok);
const goalLeft = (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
  and prosrc ~ '(fitness_goals|goal_templates|goals_achieved|goal\\.create|share_goals|goal_value_of|settle_goals|settle_my_goals)'`)).rows;
check('no function names a goal table, column or kind', goalLeft.length === 0, JSON.stringify(goalLeft));
check('the functions it cut are still there',
  (await count(`select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('ai_coach_context','ai_coach_progress','challenge_progress','complete_gym_switch','erase_account','exercise_used_outside',
     'member_training_stats','seed_gym_defaults','trainer_may_see','notify_coaches_of_win',
     'ai_proposal_check_v1','apply_ai_proposal_v1','undo_ai_proposal_v1')`)) === 13);
check('member_training_stats has no goals column, and still counts',
  !(await one(`select pg_get_function_result('member_training_stats(uuid)'::regprocedure) r`)).r.includes('goals_achieved')
  && !(await tryExec(`select * from member_training_stats('${M[0]}')`)));
check('…and anon still may not call it', !(await one(`select has_function_privilege('anon', 'member_training_stats(uuid)', 'execute') x`)).x);
check('a gym goal still counts', !(await tryExec(`select * from gym_goal_progress('${goal}')`)));
check('the coach can no longer propose a goal', !!(await tryExec(`insert into ai_proposals (gym_id, member_id, kind, payload, summary)
  values ('${GYM_A}', '${M[0]}', 'goal.create', '{}', 'x')`)));
check('the goal badges, metric, points rule and switch are gone',
  (await count(`select 1 from achievements where metric = 'goals_achieved' or metric2 = 'goals_achieved'`)) === 0
  && (await count(`select 1 from achievement_metrics where key = 'goals_achieved'`)) === 0
  && (await count(`select 1 from point_rules where key = 'goal_achieved'`)) === 0
  && (await count(`select 1 from platform_features where key = 'targets'`)) === 0);
check('sharing has no goals switch', (await count(`select 1 from information_schema.columns where table_name = 'member_share_prefs' and column_name = 'share_goals'`)) === 0);
check('a trainer is still told about workouts the member shares',
  /share_workouts/.test((await one(`select prosrc from pg_proc where proname = 'trainer_may_see'`)).prosrc));

console.log(failures ? `\n${failures} FAILED` : '\nall gym goal, 0273 and 0274 checks passed');
process.exit(failures ? 1 : 0);
