/**
 * 0122: a gym's own workouts and programs, the Premium lock, and assigning.
 *
 * The rules under test, each one a way the feature could lie:
 *   - a draft is invisible to members; a published program is seen only in its gym;
 *   - a Premium program's *row* is readable by a free member (so the lock can
 *     explain itself) but its days and workouts are not, and it cannot be started;
 *   - a day is done because a finished workout_logs row points at it — computed;
 *   - trainers build workouts (their own), only the owner builds programs, and a
 *     trainer assigns only to their own trainees;
 *   - enrolments have no write policy: only the RPCs write them.
 *
 * RLS filters rows and does not raise: every forbidden write is counted.
 *
 *   node <repo>/scripts/sql/programs.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  trainer: 'a1000000-0000-4000-8000-000000000003', trainer2: 'a1000000-0000-4000-8000-000000000005',
  free: 'a1000000-0000-4000-8000-000000000004', premium: 'a1000000-0000-4000-8000-000000000006',
  adminB: 'b1000000-0000-4000-8000-000000000001', memberB: 'b1000000-0000-4000-8000-000000000004',
};

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
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};
const count = async (sql) => Number((await one(`select count(*)::int as n from (${sql}) x`)).n);

await asOwner();
const ready = await one(`select to_regclass('public.gym_programs') is not null as ok`);
check('0122 is applied (gym_programs exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@programs-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainer}', 'trainer', 'active'), ('${GYM_A}', '${P.trainer2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.free}', 'member', 'active'), ('${GYM_A}', '${P.premium}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.admin}','${P.staff}','${P.trainer}','${P.trainer2}','${P.free}','${P.premium}');
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${P.free}', '${GYM_A}', 'QR-PF'), ('${P.premium}', '${GYM_A}', 'QR-PP'), ('${P.memberB}', '${GYM_B}', 'QR-PB')
    on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.trainer}', '${GYM_A}'), ('${P.trainer2}', '${GYM_A}')
    on conflict do nothing;
`);
// Memberships on Gym A's own seeded plans, so plan_allows answers as it would live.
const freePlan = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'free' limit 1`))?.id;
const premPlan = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`))?.id;
check('Gym A has a free and a premium plan to test with', !!freePlan && !!premPlan, `${freePlan} / ${premPlan}`);
await db.exec(`
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ('${P.free}', '${GYM_A}', '${freePlan}', 'active', current_date - 1, current_date + 29),
    ('${P.premium}', '${GYM_A}', '${premPlan}', 'active', current_date - 1, current_date + 29);
`);

const ex = async (name) => (await one(`select id from exercises where gym_id is null and name = '${name}'`)).id;
const squat = await ex('Back Squat');
const plank = await ex('Plank');

// ---- 1-3: drafts, publishing, gyms --------------------------------------------------
await as(P.admin);
const w1 = (await one(`insert into gym_workouts (name) values ('Leg Day A') returning id`)).id;
await db.exec(`insert into gym_workout_items (workout_id, position, exercise_id, target_sets, target_reps, rest_seconds)
  values ('${w1}', 0, '${squat}', 3, 8, 90), ('${w1}', 1, '${plank}', 2, null, 45)`);
const prog = (await one(`insert into gym_programs (name, weeks) values ('Starter Strength', 2) returning id`)).id;
const d1 = (await one(`insert into gym_program_days (program_id, week, day, workout_id) values ('${prog}', 1, 1, '${w1}') returning id`)).id;
await db.exec(`insert into gym_program_days (program_id, week, day, workout_id) values ('${prog}', 1, 3, '${w1}')`);

await as(P.free);
check('a draft program is invisible to members', (await count(`select 1 from gym_programs where id = '${prog}'`)) === 0);
check('and so is its workout', (await count(`select 1 from gym_workouts where id = '${w1}'`)) === 0);

await as(P.admin);
await db.exec(`update gym_programs set published = true where id = '${prog}'; update gym_workouts set published = true where id = '${w1}'`);
await as(P.free);
check('published: the member sees the program', (await count(`select 1 from gym_programs where id = '${prog}'`)) === 1);
check('its days', (await count(`select 1 from gym_program_days where program_id = '${prog}'`)) === 2);
check("and the workout's exercises", (await count(`select 1 from gym_workout_items where workout_id = '${w1}'`)) === 2);
await as(P.memberB);
check("gym B's member sees none of gym A's programs", (await count(`select 1 from gym_programs`)) === 0);
await as(P.adminB);
check("gym B's owner cannot edit gym A's program",
  (await touched(`update gym_programs set name = 'x' where id = '${prog}'`)) === 0);

// ---- 4-5: the Premium lock ------------------------------------------------------------
await as(P.admin);
const w2 = (await one(`insert into gym_workouts (name, published) values ('Heavy Day', true) returning id`)).id;
await db.exec(`insert into gym_workout_items (workout_id, position, exercise_id, target_sets, target_reps) values ('${w2}', 0, '${squat}', 5, 5)`);
const prem = (await one(`insert into gym_programs (name, weeks, premium, published) values ('Advanced Block', 1, true, true) returning id`)).id;
await db.exec(`insert into gym_program_days (program_id, week, day, workout_id) values ('${prem}', 1, 1, '${w2}')`);

await as(P.free);
check('a free member still sees the Premium program (the lock explains itself)',
  (await count(`select 1 from gym_programs where id = '${prem}'`)) === 1);
check('but not its days', (await count(`select 1 from gym_program_days where program_id = '${prem}'`)) === 0);
check('nor the workout used only there', (await count(`select 1 from gym_workout_items where workout_id = '${w2}'`)) === 0);
check('and cannot start it', !!(await tryExec(`select start_program('${prem}')`)));
await as(P.premium);
check('a Premium member sees its days', (await count(`select 1 from gym_program_days where program_id = '${prem}'`)) === 1);
check('and can start it', !(await tryExec(`select start_program('${prem}')`)));

// ---- 5-7: following, running a day, progress -----------------------------------------
await as(P.free);
check('running a day without starting the program is refused', !!(await tryExec(`select start_program_day('${d1}')`)));
const enr = (await one(`select start_program('${prog}') as id`)).id;
check('a free member starts a free program', !!enr);
const log = (await one(`select start_program_day('${d1}') as id`)).id;
const lg = await one(`select gym_workout_id, program_day_id, member_id, activity from workout_logs where id = '${log}'`);
check('a day runs as an ordinary workout log', lg.gym_workout_id === w1 && lg.program_day_id === d1 && lg.member_id === P.free,
  JSON.stringify(lg));
check('named after the workout', lg.activity === 'Leg Day A', lg.activity);
let prog1 = await db.query(`select * from program_progress('${P.free}') order by week, day`);
check('progress lists the two days, neither done', prog1.rows.length === 2 && prog1.rows.every((r) => !r.done),
  JSON.stringify(prog1.rows.map((r) => [r.week, r.day, r.done])));
await db.exec(`update workout_logs set completed_at = now() where id = '${log}'`);
prog1 = await db.query(`select * from program_progress('${P.free}') order by week, day`);
check('finishing the log ticks that day', prog1.rows[0].done === true && prog1.rows[1].done === false,
  JSON.stringify(prog1.rows.map((r) => r.done)));

await as(P.premium);
await db.exec(`select start_program('${prog}')`);
check('starting another program ends the first',
  (await count(`select 1 from program_enrolments where member_id = '${P.premium}' and status = 'active'`)) === 1
  && (await one(`select program_id from program_enrolments where member_id = '${P.premium}' and status = 'active'`)).program_id === prog);
check('a member cannot write enrolments directly',
  !!(await tryExec(`insert into program_enrolments (program_id, member_id) values ('${prem}', '${P.premium}')`)));
await as(P.free);
check("a member cannot read another member's progress", !!(await tryExec(`select * from program_progress('${P.premium}')`)));

// ---- 8-9: who builds what --------------------------------------------------------------
await as(P.trainer);
const tw = await one(`insert into gym_workouts (name) values ('Coach Circuit') returning id, created_by`);
check('a trainer builds a workout, filed as theirs', tw.created_by === P.trainer);
check('a trainer cannot build a program', !!(await tryExec(`insert into gym_programs (name, weeks) values ('Mine', 1)`)));
await as(P.trainer2);
check("another trainer cannot edit it", (await touched(`update gym_workouts set name = 'x' where id = '${tw.id}'`)) === 0);
await as(P.admin);
check('the owner can', (await touched(`update gym_workouts set notes = 'ok' where id = '${tw.id}'`)) === 1);
await as(P.staff);
check('the front desk cannot build workouts', !!(await tryExec(`insert into gym_workouts (name) values ('Desk')`)));
check('nor edit programs', (await touched(`update gym_programs set name = 'x' where id = '${prog}'`)) === 0);

// ---- 10: assigning ---------------------------------------------------------------------
await as(P.trainer);
check('a trainer cannot assign to someone who is not their trainee',
  !!(await tryExec(`select assign_program('${P.free}', '${prog}')`)));
await asOwner();
await db.exec(`insert into pt_sessions (member_id, trainer_id, starts_at, gym_id)
  values ('${P.premium}', '${P.trainer}', now() - interval '3 days', '${GYM_A}')`);
await as(P.trainer);
const assigned = await tryExec(`select assign_program('${P.premium}', '${prog}')`);
check('a trainer assigns a program to their trainee', !assigned, assigned ?? '');
await asOwner();
check('the member is told, once',
  (await count(`select 1 from notifications where user_id = '${P.premium}' and type = 'program'`)) === 1);

// ---- 11: the starter pack --------------------------------------------------------------
await as(P.admin);
const ppl = (await one(`select copy_starter_program('push_pull_legs') as id`)).id;
const pplRow = await one(`select published, weeks, (select count(*)::int from gym_program_days where program_id = '${ppl}') as days from gym_programs where id = '${ppl}'`);
check('the starter pack arrives as a draft to review', pplRow.published === false, JSON.stringify(pplRow));
check('with 4 weeks of 3 days', pplRow.weeks === 4 && pplRow.days === 12, JSON.stringify(pplRow));
check('built from the shared exercises',
  (await count(`select 1 from gym_workout_items i join gym_program_days d on d.workout_id = i.workout_id
     join exercises e on e.id = i.exercise_id where d.program_id = '${ppl}' and e.gym_id is null`)) > 0);
const ppl2 = (await one(`select copy_starter_program('push_pull_legs') as id`)).id;
check('copying twice makes two independent programs', ppl2 !== ppl);
check('an unknown pack is refused', !!(await tryExec(`select copy_starter_program('nope')`)));
await as(P.trainer);
check('only the owner copies a starter pack', !!(await tryExec(`select copy_starter_program('beginner_full_body')`)));

// ---- 12: the rules, as queries -----------------------------------------------------------
await asOwner();
check('all five tables are in the tenancy list',
  (await one(`select tenancy_gym_tables() @> array['gym_workouts','gym_workout_items','gym_programs','gym_program_days','program_enrolments'] as ok`)).ok);
check('no write policy on enrolments',
  (await count(`select 1 from pg_policies where tablename = 'program_enrolments' and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE'`)) === 0);
check('the premium_programs feature is on Premium plans and off Free',
  (await one(`select bool_and(pf.enabled) filter (where p.tier = 'premium') and not bool_or(pf.enabled) filter (where p.tier = 'free') as ok
     from plan_features pf join membership_plans p on p.id = pf.plan_id where pf.feature_key = 'premium_programs'`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0122 checks passed');
process.exit(failures ? 1 : 0);
