/**
 * 0126: the full shared exercise library, and deleting a gym's own exercise.
 *
 *   - 229 shared exercises (0050's 36 + 0126's 193), every one with cues and
 *     steps, no name twice, and every gym's members read them all;
 *   - re-running 0126 adds nothing;
 *   - a gym that already made its own exercise with one of the new names keeps
 *     its own, and the shared one is hidden for that gym only;
 *   - an owner deletes their gym's own unused exercise; not a shared one, not
 *     another gym's, and not one a member has logged (history is kept).
 *
 * RLS filters rows and does not raise: a forbidden delete is zero rows.
 *
 *   node <repo>/scripts/sql/exercise-library.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const MIGRATION = readFileSync(`${REPO}/supabase/migrations/0126_exercise_library.sql`, 'utf8');

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', memberA: 'a1000000-0000-4000-8000-000000000004',
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
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};

await asOwner();
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@lib-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'), ('${GYM_A}', '${P.memberA}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.adminA}', '${P.memberA}');
`);

// ---- the library ------------------------------------------------------------------
const lib = await one(`select count(*)::int as n,
    count(*) filter (where cardinality(cues) > 0 and cardinality(steps) > 0)::int as guided,
    count(distinct lower(name))::int as names
  from exercises where gym_id is null`);
check('229 shared exercises', lib.n === 229, `${lib.n}`);
check('every one has cues and steps', lib.guided === lib.n, `${lib.guided} of ${lib.n}`);
check('no name twice', lib.names === lib.n, `${lib.names} names for ${lib.n} rows`);
const groups = await one(`select count(distinct muscle_group)::int as g,
    count(*) filter (where muscle_group not in ('chest','back','legs','shoulders','arms','core','full_body','cardio'))::int as odd,
    count(*) filter (where equipment not in ('barbell','dumbbell','machine','cable','bodyweight','other'))::int as oddEq
  from exercises where gym_id is null`);
check('only the eight muscle groups and six equipment types the screens offer',
  groups.odd === 0 && groups.oddeq === 0, JSON.stringify(groups));

await as(P.memberB);
check("gym B's member reads all 229",
  (await one(`select count(*)::int as n from exercises where gym_id is null`)).n === 229);
await as(P.memberA);
check("gym A's member reads all 229",
  (await one(`select count(*)::int as n from exercises where gym_id is null`)).n === 229);

// ---- re-running changes nothing ----------------------------------------------------
await asOwner();
await db.exec(MIGRATION);
check('re-running 0126 adds nothing',
  (await one(`select count(*)::int as n from exercises where gym_id is null`)).n === 229);

// ---- a gym's own same-named exercise wins, for that gym -----------------------------
// Pretend gym A had made "Hammer Curl" before 0126 existed: take the shared
// one out, add gym A's own, and run 0126 again.
await db.exec(`delete from exercises where gym_id is null and name = 'Hammer Curl';
  insert into exercises (gym_id, name, muscle_group, equipment) values ('${GYM_A}', 'hammer curl', 'arms', 'dumbbell');`);
await db.exec(MIGRATION);
const shared = (await one(`select id from exercises where gym_id is null and name = 'Hammer Curl'`))?.id;
check('the shared Hammer Curl is back', !!shared);
check("it is hidden for gym A, which has its own",
  (await one(`select count(*)::int as n from gym_exercise_media where gym_id = '${GYM_A}' and exercise_id = '${shared}' and hidden`)).n === 1);
check('and not hidden for gym B',
  (await one(`select count(*)::int as n from gym_exercise_media where gym_id = '${GYM_B}' and exercise_id = '${shared}'`)).n === 0);

// ---- deleting ------------------------------------------------------------------------
await db.exec(`insert into exercises (gym_id, name, muscle_group, equipment) values
  ('${GYM_A}', 'Tyre Drag', 'full_body', 'other'), ('${GYM_A}', 'Logged Thing', 'arms', 'other'),
  ('${GYM_B}', 'Gym B Special', 'core', 'other');`);
const logged = (await one(`select id from exercises where name = 'Logged Thing'`)).id;
await db.exec(`select act_as_gym('${GYM_A}');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${GYM_A}', '${P.memberA}', 'qr-lib-a') on conflict do nothing;`);
const log = (await one(`insert into workout_logs (gym_id, member_id, activity) values ('${GYM_A}', '${P.memberA}', 'Arms') returning id`)).id;
await db.exec(`insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM_A}', '${log}', '${logged}', 1, 10, 20);
  select act_as_gym(null);`);

await as(P.adminA);
check("gym A's owner deletes gym A's own unused exercise",
  (await touched(`delete from exercises where gym_id = '${GYM_A}' and name = 'Tyre Drag'`)) === 1);
check("gym A's owner cannot delete a shared exercise",
  (await touched(`delete from exercises where gym_id is null and name = 'Deadlift'`)) === 0);
check("gym A's owner cannot delete gym B's exercise",
  (await touched(`delete from exercises where name = 'Gym B Special'`)) === 0);
const r = await touched(`delete from exercises where id = '${logged}'`);
check('an exercise a member logged cannot be deleted (their history stays)',
  typeof r === 'string' && /foreign key|violates/i.test(r), String(r));
await as(P.memberA);
check('a member cannot delete anything',
  (await touched(`delete from exercises where gym_id = '${GYM_A}'`)) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
