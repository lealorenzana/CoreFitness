/**
 * 0121: a gym's own photo, video and cues on any exercise — seen only by its members.
 *
 * The shape that makes this hard: the 36 standard exercises are ONE shared
 * library row each (gym_id NULL) that every gym reads. So "gym A adds a video
 * to Back Squat" must not touch that row, or gym B's members watch gym A's
 * coach. The media lives in a per-gym overlay, and this proves the overlay is
 * per gym, that the photo count is enforced by the database rather than the
 * screen, and that only the owner and trainers (a trainer only their own)
 * write it.
 *
 * RLS filters rows and does not raise: every forbidden write is counted.
 *
 *   node <repo>/scripts/sql/content-media.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', staffA: 'a1000000-0000-4000-8000-000000000002',
  trainerA: 'a1000000-0000-4000-8000-000000000003', memberA: 'a1000000-0000-4000-8000-000000000004',
  trainerA2: 'a1000000-0000-4000-8000-000000000005',
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
// An error is NOT a zero — see storage-tenancy.mjs.
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};

await asOwner();
const ready = await one(`select to_regclass('public.gym_exercise_media') is not null as ok`);
check('0121 is applied (gym_exercise_media exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

await db.exec(`grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;`);

const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@media-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'), ('${GYM_A}', '${P.staffA}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainerA}', 'trainer', 'active'), ('${GYM_A}', '${P.trainerA2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.memberA}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.adminA}','${P.staffA}','${P.trainerA}','${P.trainerA2}','${P.memberA}');
  -- A small plan so the limit is reachable in a test.
  insert into platform_plans (key, name, max_photos) values ('tiny', 'Tiny', 2) on conflict (key) do update set max_photos = 2;
  update gyms set plan = 'tiny' where id = '${GYM_A}';
`);

const squat = (await one(`select id from exercises where gym_id is null and name = 'Back Squat'`)).id;
const fly = (await one(`select id from exercises where gym_id is null and name = 'Chest Fly'`)).id;

// ---- the library carries starter text ----------------------------------------------
const starter = await one(`select count(*)::int as n, count(*) filter (where cardinality(cues) > 0 and cardinality(steps) > 0)::int as done
  from exercises where gym_id is null`);
check('every shared exercise has starter cues and steps', starter.n > 0 && starter.n === starter.done,
  `${starter.done} of ${starter.n}`);

// ---- the overlay is per gym --------------------------------------------------------
await as(P.adminA);
check("gym A's owner adds a video and cues to the shared Back Squat",
  !(await tryExec(`insert into gym_exercise_media (gym_id, exercise_id, video_url, cues)
    values ('${GYM_A}', '${squat}', 'https://youtu.be/abc12345678', array['Chest up'])`)));
check('the shared row itself did not change',
  (await one(`select count(*)::int as n from exercises where id = '${squat}' and cues @> array['Chest up']`)).n === 0);

await as(P.memberB);
check("gym B's member sees no overlay for Back Squat",
  (await one(`select count(*)::int as n from gym_exercise_media where exercise_id = '${squat}'`)).n === 0);
check("gym B's member still gets the library's starter cues",
  (await one(`select cardinality(cues) as n from exercises where id = '${squat}'`)).n > 0);
await as(P.memberA);
check("gym A's member sees gym A's video",
  (await one(`select video_url from gym_exercise_media where exercise_id = '${squat}'`))?.video_url === 'https://youtu.be/abc12345678');

// ---- video links -----------------------------------------------------------------
await as(P.adminA);
check('a link that is not YouTube or Vimeo is refused',
  !!(await tryExec(`update gym_exercise_media set video_url = 'https://evil.test/x' where exercise_id = '${squat}'`)));
check('plain http is refused',
  !!(await tryExec(`update gym_exercise_media set video_url = 'http://youtu.be/abc' where exercise_id = '${squat}'`)));
check('a Vimeo link is accepted',
  (await touched(`update gym_exercise_media set video_url = 'https://vimeo.com/76979871' where exercise_id = '${squat}'`)) === 1);

// ---- who writes --------------------------------------------------------------------
await as(P.trainerA);
check('a trainer adds a guide to another exercise',
  !(await tryExec(`insert into gym_exercise_media (gym_id, exercise_id, steps) values ('${GYM_A}', '${fly}', array['Squeeze'])`)));
check('and it is filed as theirs',
  (await one(`select created_by from gym_exercise_media where exercise_id = '${fly}'`)).created_by === P.trainerA);
await as(P.trainerA2);
{ const n = await touched(`update gym_exercise_media set steps = array['Mine now'] where exercise_id = '${fly}'`);
  check("another trainer cannot edit it", n === 0, String(n)); }
await as(P.adminA);
{ const n = await touched(`update gym_exercise_media set hidden = true where exercise_id = '${fly}'`);
  check('the owner can', n === 1, String(n)); }
check('and the author stays the trainer',
  (await one(`select created_by from gym_exercise_media where exercise_id = '${fly}'`)).created_by === P.trainerA);
await as(P.staffA);
check('the front desk cannot write guides',
  !!(await tryExec(`insert into gym_exercise_media (gym_id, exercise_id) values ('${GYM_A}', (select id from exercises where name = 'Deadlift' and gym_id is null))`)));
await as(P.memberA);
check('a member cannot write guides',
  !!(await tryExec(`insert into gym_exercise_media (gym_id, exercise_id) values ('${GYM_A}', (select id from exercises where name = 'Plank' and gym_id is null))`)));
{ const n = await touched(`update gym_exercise_media set hidden = false where exercise_id = '${fly}'`);
  check('nor unhide one', n === 0, String(n)); }

// ---- the shared library is the platform's --------------------------------------------
await as(P.adminA);
{ const n = await touched(`update exercises set name = 'Squat (G)' where id = '${squat}'`);
  check("a gym owner cannot rename a shared exercise for every gym", n === 0, String(n)); }
check("a gym owner's new exercise stays theirs",
  !(await tryExec(`insert into exercises (name, muscle_group, equipment) values ('Sled Push', 'full_body', 'other')`))
  && (await one(`select gym_id from exercises where name = 'Sled Push'`))?.gym_id === GYM_A);
await as(P.memberB);
check("gym B cannot see gym A's own exercise",
  (await one(`select count(*)::int as n from exercises where name = 'Sled Push'`)).n === 0);

await as(P.trainerA);
check('a trainer creates a gym exercise',
  !(await tryExec(`insert into exercises (name, muscle_group, equipment, gym_id) values ('Battle Rope', 'cardio', 'other', '${GYM_A}')`)));
await as(P.trainerA2);
{ const n = await touched(`update exercises set name = 'Rope' where name = 'Battle Rope'`);
  check("another trainer cannot rename it", n === 0, String(n)); }
await as(P.trainerA);
{ const n = await touched(`update exercises set name = 'Battle Ropes' where name = 'Battle Rope'`);
  check('its author can', n === 1, String(n)); }

// The platform is who curates now — proved, so the rule is not "nobody can".
await asOwner();
await db.exec(`insert into platform_admins (user_id) values ('${P.adminB}') on conflict do nothing`);
await as(P.adminB);
check('the platform adds to the shared library',
  !(await tryExec(`insert into exercises (name, muscle_group, equipment) values ('Farmer Carry', 'full_body', 'other')`))
  && (await one(`select gym_id from exercises where name = 'Farmer Carry'`))?.gym_id === null);
{ const n = await touched(`update exercises set cues = array['Stand tall'] where name = 'Farmer Carry'`);
  check('and edits it', n === 1, String(n)); }
await asOwner();
await db.exec(`delete from platform_admins where user_id = '${P.adminB}'`);

// ---- photo slots ---------------------------------------------------------------------
await as(P.adminA);
const p1 = (await one('select reserve_gym_photo() as p')).p;
const p2 = (await one('select reserve_gym_photo() as p')).p;
check('a slot is a path in the gym content folder', p1.startsWith(`gyms/${GYM_A}/content/`), p1);
check('the third photo is refused on a 2-photo plan', !!(await tryExec('select reserve_gym_photo()')));
const use = await one('select * from gym_photo_usage()');
check('usage reads 2 of 2', use.used === 2 && use.cap === 2, JSON.stringify(use));
await db.exec(`select release_gym_photo('${p2}')`);
check('releasing one frees the slot', !(await tryExec('select reserve_gym_photo()')));

check('uploading into a reserved slot is allowed',
  !(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', '${p1}')`)));
check('an unreserved content path is refused',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/content/nope.jpg')`)));
await asOwner();
await db.exec(`update platform_plans set max_photos = 5 where key = 'tiny'`);
await as(P.trainerA);
check('a trainer still cannot upload event pictures (0120 holds)',
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/events/x.jpg')`)));
check('a trainer reserves a photo slot too', !(await tryExec('select reserve_gym_photo()')));
await as(P.trainerA2);
check("another trainer cannot release the owner's photo", !!(await tryExec(`select release_gym_photo('${p1}')`)));
await as(P.memberA);
check('a member cannot reserve a photo', !!(await tryExec('select reserve_gym_photo()')));
await as(P.adminB);
check("gym B cannot upload into gym A's content folder",
  !!(await tryExec(`insert into storage.objects (bucket_id, name) values ('media', 'gyms/${GYM_A}/content/b.jpg')`)));
check("gym B reads none of gym A's photo slots",
  (await one(`select count(*)::int as n from gym_photos where gym_id = '${GYM_A}'`)).n === 0);
await as(P.adminA);
check('the owner releases any photo in the gym', !(await tryExec(`select release_gym_photo('${p1}')`)));

// ---- the rules, as queries -----------------------------------------------------------
const loose = await db.query('select * from storage_policies_without_gym()');
check('no storage policy trusts a role without a gym', loose.rows.length === 0, JSON.stringify(loose.rows));
await asOwner();
const tables = await one(`select tenancy_gym_tables() @> array['gym_exercise_media','gym_photos'] as ok`);
check('both new tables are in the tenancy list', tables.ok);

console.log(failures ? `\n${failures} FAILED` : '\nall 0121 checks passed');
process.exit(failures ? 1 : 0);
