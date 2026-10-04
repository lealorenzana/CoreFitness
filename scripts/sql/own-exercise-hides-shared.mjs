/**
 * 0150: a gym's own exercise hides the shared one of the same name — always.
 *
 *   - adding one named like a shared exercise (any case) hides the shared one
 *     for that gym only;
 *   - renaming it away, or deleting it, brings the shared one back;
 *   - an owner's own "hide" is never undone, and an owner un-hiding by hand
 *     stays un-hidden;
 *   - nobody can call the helpers directly.
 *
 *   node <repo>/scripts/sql/own-exercise-hides-shared.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  adminA: 'a1500000-0000-4000-8000-000000000001',
  adminB: 'b1500000-0000-4000-8000-000000000001', memberB: 'b1500000-0000-4000-8000-000000000004',
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

await asOwner();
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B') on conflict do nothing;
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@dup-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id = '${P.adminA}';
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
`);

const SHARED = 'Hammer Curl';   // seeded in the shared library
const sharedId = (await one(`select id from exercises where gym_id is null and name = '${SHARED}'`))?.id;
check('the shared exercise exists to test against', !!sharedId);

/** What gym B's member sees under that name: 'shared', 'own', or both. */
async function seenByB(name = SHARED) {
  await as(P.memberB);
  const rows = (await db.query(`
    select case when e.gym_id is null then 'shared' else 'own' end as k
      from exercises e
      left join gym_exercise_media m on m.exercise_id = e.id and m.gym_id = '${GYM_B}'
     where lower(e.name) = lower('${name}') and not coalesce(m.hidden, false)
     order by 1`)).rows.map((r) => r.k);
  return rows.join('+') || 'nothing';
}
const sharedHiddenFor = async (gym) => {
  await asOwner();
  return !!(await one(`select hidden from gym_exercise_media where gym_id = '${gym}' and exercise_id = '${sharedId}'`))?.hidden;
};

check('before: gym B sees the shared one', (await seenByB()) === 'shared', await seenByB());

// ---- adding a same-named own exercise ------------------------------------------
await as(P.adminB);
check("gym B's owner adds their own 'hammer curl' (different case)",
  !(await tryExec(`insert into exercises (name, muscle_group, equipment, sort_order) values ('hammer curl', 'arms', 'dumbbell', 900)`)));
check('gym B now sees only its own', (await seenByB()) === 'own', await seenByB());
check('gym A still sees the shared one', !(await sharedHiddenFor(GYM_A)));

// ---- renaming away and back ------------------------------------------------------
await as(P.adminB);
await db.exec(`update exercises set name = 'Hammer Curl (cable)' where gym_id = '${GYM_B}' and name = 'hammer curl'`);
check('renamed away: the shared one is back', (await seenByB()) === 'shared', await seenByB());
await as(P.adminB);
await db.exec(`update exercises set name = 'Hammer Curl' where gym_id = '${GYM_B}' and name = 'Hammer Curl (cable)'`);
check('renamed back: hidden again', (await seenByB()) === 'own', await seenByB());

// ---- deleting it brings the shared one back ----------------------------------------
await as(P.adminB);
await db.exec(`delete from exercises where gym_id = '${GYM_B}' and name = 'Hammer Curl'`);
check('the own row deleted: the shared one is back', (await seenByB()) === 'shared', await seenByB());

// ---- the owner's own choices are kept ----------------------------------------------
await as(P.adminB);
await db.exec(`update gym_exercise_media set hidden = true where gym_id = '${GYM_B}' and exercise_id = '${sharedId}'`);
await db.exec(`insert into exercises (name, muscle_group, equipment, sort_order) values ('Hammer Curl', 'arms', 'other', 902)`);
await db.exec(`delete from exercises where gym_id = '${GYM_B}' and name = 'Hammer Curl'`);
check("an owner's own hide survives adding and deleting a duplicate", await sharedHiddenFor(GYM_B));

await as(P.adminB);
await db.exec(`update gym_exercise_media set hidden = false where gym_id = '${GYM_B}' and exercise_id = '${sharedId}'`);
await db.exec(`insert into exercises (name, muscle_group, equipment, sort_order) values ('Hammer Curl', 'arms', 'other', 903)`);
check('a new duplicate hides it again', await sharedHiddenFor(GYM_B));
await as(P.adminB);
await db.exec(`update gym_exercise_media set hidden = false where gym_id = '${GYM_B}' and exercise_id = '${sharedId}'`);
await db.exec(`delete from exercises where gym_id = '${GYM_B}' and name = 'Hammer Curl'`);
check('an owner who un-hid it by hand keeps it shown', !(await sharedHiddenFor(GYM_B)));

// ---- the helpers are not callable --------------------------------------------------
await as(P.adminB);
check('an owner cannot call hide_shared_duplicate directly',
  !!(await tryExec(`select hide_shared_duplicate('${sharedId}')`)));
check('nor release_shared_duplicate',
  !!(await tryExec(`select release_shared_duplicate('${sharedId}', '${GYM_A}')`)));

// ---- the probe marker --------------------------------------------------------------
await as(P.memberB);
check('migration_0150_applied() answers', (await one(`select migration_0150_applied() as ok`))?.ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0150 checks passed');
process.exit(failures ? 1 : 0);
