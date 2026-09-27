/**
 * 0127: what a gym adds is the gym's — always.
 *
 *   - an owner who is ALSO the platform admin adds an exercise and a link in
 *     their gym: both are that gym's, not the shared library's (the bug);
 *   - rows the old trigger misfiled go back to Gym #1 — but not the seeded
 *     library, and not one another gym has used (their history stays);
 *   - another gym's "hide" on a row that moved is removed;
 *   - after the move, Gym #1's owner can delete it and Gym B cannot see it.
 *
 *   node <repo>/scripts/sql/gym-additions.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const MIGRATION = readFileSync(`${REPO}/supabase/migrations/0127_gym_additions_stay_the_gyms.sql`, 'utf8');

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';   // Gym #1
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  ownerA: 'a1000000-0000-4000-8000-000000000001',   // G Fitness's owner AND the platform admin
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

await asOwner();
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@adds-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id = '${P.ownerA}';
  insert into platform_admins (user_id) values ('${P.ownerA}') on conflict do nothing;
`);

// ---- 1. the bug: a platform admin adding in their gym ---------------------------------
await as(P.ownerA);
check('the owner (also platform admin) adds an exercise in G Fitness',
  !(await tryExec(`insert into exercises (name, muscle_group, equipment, sort_order) values ('Gabby Special', 'arms', 'other', 900)`)));
check("it is G Fitness's own, not the shared library's",
  (await one(`select gym_id from exercises where name = 'Gabby Special'`))?.gym_id === GYM_A);
check('and adds a training link',
  !(await tryExec(`insert into workout_resources (title, provider, url, created_by) values ('Our warm-up', 'G Fitness', 'https://youtu.be/gfwarmup01', '${P.ownerA}')`)));
check("the link is G Fitness's own too",
  (await one(`select gym_id from workout_resources where url = 'https://youtu.be/gfwarmup01'`))?.gym_id === GYM_A);
check('the owner can delete that exercise',
  (await touched(`delete from exercises where name = 'Gabby Special'`)) === 1);

// ---- 2. rows the old trigger misfiled go home -----------------------------------------
await asOwner();
await db.exec(`
  insert into exercises (gym_id, name, muscle_group, equipment, sort_order) values
    (null, 'Old Misfiled', 'arms', 'other', 900),
    (null, 'Used By Gym B', 'arms', 'other', 900);
  insert into exercises (gym_id, name, muscle_group, equipment, sort_order, created_by) values
    (null, 'Added After 0121', 'core', 'other', 10, '${P.ownerA}');
  insert into workout_resources (gym_id, title, provider, url, created_by) values
    (null, 'Misfiled link', 'G Fitness', 'https://youtu.be/gfmisfile1', '${P.ownerA}');
  insert into gym_exercise_media (gym_id, exercise_id, hidden, created_by)
    select '${GYM_B}', id, true, '${P.adminB}' from exercises where name = 'Old Misfiled';
  select act_as_gym('${GYM_B}');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${GYM_B}', '${P.memberB}', 'qr-adds-b') on conflict do nothing;
`);
const logB = (await one(`insert into workout_logs (gym_id, member_id, activity) values ('${GYM_B}', '${P.memberB}', 'Arms') returning id`)).id;
await db.exec(`insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg)
    select '${GYM_B}', '${logB}', id, 1, 8, 10 from exercises where name = 'Used By Gym B';
  select act_as_gym(null);`);

await db.exec(MIGRATION);
const gymOf = async (name) => (await one(`select coalesce(gym_id::text, 'shared') as g from exercises where name = '${name}'`))?.g;
check('a misfiled exercise goes back to G Fitness', (await gymOf('Old Misfiled')) === GYM_A, await gymOf('Old Misfiled'));
check('one added after 0121 (created_by) too', (await gymOf('Added After 0121')) === GYM_A, await gymOf('Added After 0121'));
check('one Gym B has logged stays shared (their history keeps working)', (await gymOf('Used By Gym B')) === 'shared');
check('the seeded library stays shared', (await gymOf('Back Squat')) === 'shared' && (await gymOf('Hammer Curl')) === 'shared');
check('the shared library still has its 229',
  (await one(`select count(*)::int as n from exercises where gym_id is null and sort_order < 900 and created_by is null`)).n === 229);
check('a misfiled link goes back to G Fitness',
  (await one(`select gym_id from workout_resources where url = 'https://youtu.be/gfmisfile1'`))?.gym_id === GYM_A);
check('the seeded links stay shared',
  (await one(`select count(*)::int as n from workout_resources where gym_id is null`)).n > 0);
check("Gym B's hide on the moved exercise is removed",
  (await one(`select count(*)::int as n from gym_exercise_media m join exercises e on e.id = m.exercise_id
    where e.name = 'Old Misfiled' and m.gym_id = '${GYM_B}'`)).n === 0);

await as(P.memberB);
check('Gym B no longer sees the moved exercise',
  (await one(`select count(*)::int as n from exercises where name = 'Old Misfiled'`)).n === 0);
check('Gym B no longer sees the moved link',
  (await one(`select count(*)::int as n from workout_resources where url = 'https://youtu.be/gfmisfile1'`)).n === 0);
await as(P.ownerA);
check("G Fitness's owner can now delete the moved exercise",
  (await touched(`delete from exercises where name = 'Old Misfiled'`)) === 1);

await asOwner();
await db.exec(MIGRATION);
check('re-running 0127 moves nothing more', (await gymOf('Used By Gym B')) === 'shared');

console.log(failures ? `\n${failures} FAILED` : '\nall 0127 checks passed');
process.exit(failures ? 1 : 0);
