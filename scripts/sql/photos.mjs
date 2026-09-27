/**
 * 0132: progress photos — private by default; shared with the member's coaches
 * only when they switch it on; never the owner or the desk; a photo check-in
 * shows that one photo to that room's coach; files only into reserved slots.
 *
 *   node <repo>/scripts/sql/photos.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  coach: 'a1000000-0000-4000-8000-000000000003', coach2: 'a1000000-0000-4000-8000-000000000005',
  mem: 'a1000000-0000-4000-8000-000000000004', other: 'a1000000-0000-4000-8000-000000000006',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
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
await db.exec(`grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on all functions in schema storage to authenticated;`);
const person = (id, name) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${name}@ph-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${name}', 'Tester', '${name}@ph-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${Object.entries(P).map(([k, v]) => person(v, k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_A}', '${P.coach2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.mem}', 'member', 'active'), ('${GYM_A}', '${P.other}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where email like '%@ph-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mem}', '${GYM_A}', 'QR-PM'), ('${P.other}', '${GYM_A}', 'QR-PO') on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM_A}'), ('${P.coach2}', '${GYM_A}') on conflict do nothing;
  select act_as_gym('${GYM_A}');
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select '${P.mem}', '${GYM_A}', id, 'active', current_date - 1, current_date + 29
      from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1;
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at) values ('${GYM_A}', '${P.mem}', '${P.coach}', now() - interval '2 days');
  select act_as_gym(null);
`);

const upload = (path) => `insert into storage.objects (bucket_id, name) values ('progress', '${path}')`;
const seesRow = async (id) => (await all(`select id from progress_photos where id = '${id}'`)).length === 1;
const seesFile = async (path) => (await all(`select name from storage.objects where bucket_id = 'progress' and name = '${path}'`)).length === 1;

await asOwner();
check('the bucket is private', (await one(`select public from storage.buckets where id = 'progress'`)).public === false);

// ---- 1. a member's own album ----------------------------------------------------------------
await as(P.coach);
check('a coach cannot reserve a slot (members keep albums)', !!(await tryExec(`select * from reserve_progress_photo()`)));
await as(P.mem);
const s1 = await one(`select * from reserve_progress_photo('front', null, 'Week 1')`);
check('a member reserves a slot under their own folder', s1.path.startsWith(`${GYM_A}/${P.mem}/`), s1.path);
check('and uploads into it', !(await tryExec(upload(s1.path))));
check('not into a path nobody reserved', !!(await tryExec(upload(`${GYM_A}/${P.mem}/made-up.jpg`))));
check('the member sees the photo and the file', (await seesRow(s1.photo_id)) && (await seesFile(s1.path)));
const s2 = await one(`select * from reserve_progress_photo('side')`);
await db.exec(upload(s2.path));
await as(P.other);
check('another member cannot upload into my slot', !!(await tryExec(upload(s2.path))) || !(await seesFile(s2.path)));

// ---- 2. private until shared, and never the gym ------------------------------------------------
for (const [who, label] of [[P.coach, 'their coach (not shared yet)'], [P.coach2, 'another coach'], [P.other, 'another member'],
                            [P.admin, 'the owner'], [P.staff, 'the desk']]) {
  await as(who);
  check(`${label} cannot see the photo`, !(await seesRow(s1.photo_id)) && !(await seesFile(s1.path)));
}
await as(P.mem);
await db.exec(`select set_share_photos(true)`);
await as(P.coach);
check('shared: their coach sees the album', (await all(`select * from trainee_progress_photos('${P.mem}')`)).length === 2);
check('and can open the file', await seesFile(s1.path));
for (const [who, label] of [[P.coach2, 'a coach they do not train with'], [P.admin, 'the owner'], [P.staff, 'the desk']]) {
  await as(who);
  check(`shared: ${label} still cannot`, !(await seesRow(s1.photo_id)) && !(await seesFile(s1.path)));
}
await as(P.mem);
await db.exec(`select set_share_photos(false)`);
await as(P.coach);
check('unshared: the coach loses it again', !(await seesRow(s1.photo_id)));

// ---- 3. a photo check-in shows that one photo to that coach ---------------------------------------
await as(P.coach);
await db.exec(`select sync_gym_rooms()`);
const room = (await one(`select id from rooms where kind = 'pt'`)).id;
const a = (await one(`select create_assignment('${room}', 'checkin', null, 'photo', 'Front photo, week 4', null, (now() at time zone 'Asia/Manila')::date + 3) as id`)).id;
await as(P.mem);
check('a photo check-in refuses text', !!(await tryExec(`select submit_checkin('${a}', 'here', null)`)));
check('it refuses someone else\'s photo', !!(await tryExec(`select submit_checkin_photo('${a}', gen_random_uuid())`)));
check('the member hands in one photo', !(await tryExec(`select submit_checkin_photo('${a}', '${s1.photo_id}')`)));
await as(P.coach);
check('the coach sees the photo handed in', (await seesRow(s1.photo_id)) && (await seesFile(s1.path)));
check('but not the one that was not handed in', !(await seesRow(s2.photo_id)));
await as(P.staff);
check('the desk still cannot see the handed-in photo', !(await seesRow(s1.photo_id)) && !(await seesFile(s1.path)));

// ---- 4. deleting ------------------------------------------------------------------------------------
await as(P.other);
check('another member cannot delete my photo', !!(await tryExec(`select delete_progress_photo('${s2.photo_id}')`)));
check('nor its file', (await touched(`delete from storage.objects where name = '${s2.path}'`)) === 0);
await as(P.mem);
check('the member deletes the file', (await touched(`delete from storage.objects where name = '${s2.path}'`)) === 1);
check('and the photo', (await one(`select delete_progress_photo('${s2.photo_id}') as p`)).p === s2.path);

// ---- 5. the limit is the database's -----------------------------------------------------------------
await asOwner();
await db.exec(`insert into progress_photos (gym_id, member_id, path)
  select '${GYM_A}', '${P.mem}', '${GYM_A}/${P.mem}/' || g || '.jpg' from generate_series(1, 199) g`);
await as(P.mem);
check('photo 201 is refused', !!(await tryExec(`select * from reserve_progress_photo()`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0132 checks passed');
process.exit(failures ? 1 : 0);
