/**
 * 0128: coaching rooms — who is in a room, who sees it, who may write in it.
 * Since 0220 a room is only a coaching package's: class and group rooms are gone.
 *
 * RLS filters rows and does not raise: a forbidden read is zero rows, a
 * forbidden delete touches zero. Every forbidden write is counted.
 *
 *   node <repo>/scripts/sql/rooms.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  coach: 'a1000000-0000-4000-8000-000000000003', coach2: 'a1000000-0000-4000-8000-000000000005',
  prem: 'a1000000-0000-4000-8000-000000000004', free: 'a1000000-0000-4000-8000-000000000006',
  other: 'a1000000-0000-4000-8000-000000000007',
  coachB: 'b1000000-0000-4000-8000-000000000003', memberB: 'b1000000-0000-4000-8000-000000000004',
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
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Tester', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, last_name = 'Tester', status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@rooms-test.com', k[0].toUpperCase() + k.slice(1))).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_A}', '${P.coach2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.prem}', 'member', 'active'), ('${GYM_A}', '${P.free}', 'member', 'active'),
    ('${GYM_A}', '${P.other}', 'member', 'active'),
    ('${GYM_B}', '${P.coachB}', 'trainer', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.coachB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.coachB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.admin}','${P.staff}','${P.coach}','${P.coach2}','${P.prem}','${P.free}','${P.other}');
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${P.prem}', '${GYM_A}', 'QR-RP'), ('${P.free}', '${GYM_A}', 'QR-RF'), ('${P.other}', '${GYM_A}', 'QR-RO'),
    ('${P.memberB}', '${GYM_B}', 'QR-RB') on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM_A}'), ('${P.coach2}', '${GYM_A}'),
    ('${P.coachB}', '${GYM_B}') on conflict do nothing;
`);
const planOf = async (tier) => (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = '${tier}' limit 1`))?.id;
const free = await planOf('free'); const prem = await planOf('premium');
check('Gym A has a free and a premium plan', !!free && !!prem);
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ('${P.prem}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
    -- On Premium, then moved to Free below: a real downgrade.
    ('${P.free}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
    ('${P.other}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);`);

// Packages (0181), the only thing with a room since 0220: prem's with coach, and free's (who moves
// to the Free plan below, so their room reads but cannot comment). Other has a single session only.
await db.exec(`select act_as_gym('${GYM_A}');
  insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by, starts_on, ends_on) values
    ('${GYM_A}', '${P.prem}', '${P.coach}', 'pt', 3, 'active', 'included', 'member', current_date - 5, current_date + 85),
    ('${GYM_A}', '${P.free}', '${P.coach}', 'pt', 1, 'active', 'included', 'desk', current_date - 5, current_date + 25);
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at) values
    ('${GYM_A}', '${P.prem}', '${P.coach}', now() - interval '2 days'),
    ('${GYM_A}', '${P.other}', '${P.coach}', now() - interval '3 days');
  update memberships set plan_id = '${free}' where member_id = '${P.free}' and gym_id = '${GYM_A}';
  select act_as_gym(null);`);

// ---- 1. the automatic rooms ------------------------------------------------------------
await as(P.coach);
check('the sweep makes a room for each running package', (await one(`select sync_gym_rooms() as n`)).n === 2);
check('running it again makes nothing', (await one(`select sync_gym_rooms() as n`)).n === 0);
check('a single session makes no room', (await all(`select id from rooms where member_id = '${P.other}'`)).length === 0);
const ptRoom = (await one(`select id from rooms where member_id = '${P.prem}'`)).id;
const freeRoom = (await one(`select id from rooms where member_id = '${P.free}'`)).id;
check('a package room: the trainee',
  (await all(`select member_id from room_people('${ptRoom}') where not is_trainer`)).map((r) => r.member_id).join() === P.prem);
check("coach's list is their two rooms", (await all(`select * from my_rooms()`)).length === 2);

// ---- 2. who sees what -----------------------------------------------------------------
await as(P.coach2);
check("another trainer does not see coach's rooms", (await all(`select id from rooms`)).length === 0);
await as(P.other);
check('a member without a package sees no room', (await all(`select id from rooms`)).length === 0);
await as(P.free);
check('a trainee sees their own room', (await all(`select id from rooms where id = '${freeRoom}'`)).length === 1);
check('but not another trainee’s', (await all(`select id from rooms where id = '${ptRoom}'`)).length === 0);
await as(P.memberB);
check('another gym sees none', (await all(`select id from rooms`)).length === 0);
await as(P.admin);
check("the owner's page lists every room", (await all(`select * from all_gym_rooms()`)).length === 2);

// ---- 3. the stream ----------------------------------------------------------------------
await as(P.coach);
check('the trainer posts', !(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${ptRoom}', 'Bring water tomorrow!')`)));
const post = (await one(`select id from room_posts limit 1`)).id;
await asOwner();
check('the trainee is told, once',
  (await one(`select count(*)::int as n from notifications where type = 'coaching' and user_id = '${P.prem}'`)).n === 1);
check('someone not in the room is not told',
  (await one(`select count(*)::int as n from notifications where type = 'coaching' and user_id in ('${P.free}', '${P.other}')`)).n === 0);
await as(P.prem);
check('a member cannot post', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${ptRoom}', 'hi')`)));
check('a premium member comments', !(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'Got it coach!')`)));
const stream = await all(`select * from room_stream('${ptRoom}')`);
check('the stream shows the post with the comment', stream.length === 1 && stream[0].comments.length === 1);
await as(P.coach);
await db.exec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${freeRoom}', 'Week one plan')`);
const freePost = (await one(`select id from room_posts where room_id = '${freeRoom}'`)).id;
await as(P.free);
check('a free member reads their room', (await all(`select * from room_stream('${freeRoom}')`)).length === 1);
check('a free member cannot comment (plan gate)', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${freePost}', 'me too')`)));
check('a member not in the room cannot comment', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'x')`)));
check('nor read the stream', (await all(`select * from room_stream('${ptRoom}')`)).length === 0);
await as(P.coach);
await db.exec(`select update_room('${ptRoom}', null, null, false)`);
await as(P.prem);
check('comments switched off: refused', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'again')`)));
check('members cannot rename a room directly', (await touched(`update rooms set name = 'x' where id = '${ptRoom}'`)) === 0);
await as(P.coach);
await db.exec(`select update_room('${ptRoom}', null, null, true)`);

// ---- 4. moderation ------------------------------------------------------------------------
await as(P.admin);
check('the owner cannot post as the trainer', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${ptRoom}', 'owner here')`)));
check('the owner removes a comment', (await touched(`delete from room_comments where post_id = '${post}'`)) === 1);
await as(P.prem);
check('a member cannot remove the trainer\'s post', (await touched(`delete from room_posts where id = '${post}'`)) === 0);

// ---- 5. (0220) a package that ends keeps its room, read-only ----------------------------------
await asOwner();
await db.exec(`update coachings set status = 'ended', ended_at = now() where member_id = '${P.free}'`);
await as(P.coach);
await db.exec(`select sync_gym_rooms()`);
check('an ended package’s room is archived', (await one(`select archived from my_rooms() where id = '${freeRoom}'`)).archived === true);
check('…not deleted, its posts kept', (await one(`select count(*)::int n from room_posts where room_id = '${freeRoom}'`)).n === 1);
check('an archived room takes no posts', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${freeRoom}', 'late')`)));
await asOwner();
await db.exec(`insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by, starts_on, ends_on)
  values ('${GYM_A}', '${P.free}', '${P.coach}', 'pt', 1, 'active', 'included', 'desk', current_date, current_date + 30)`);
await as(P.coach);
check('a renewed package opens the same room again', (await one(`select sync_gym_rooms() as n`)).n === 0
  && (await one(`select archived from my_rooms() where id = '${freeRoom}'`)).archived === false);

// ---- 6. (0169) leave a room; come back on your own ------------------------------------------
const sees = async (room) => (await all(`select id from my_rooms() where id = '${room}'`)).length === 1;
await as(P.prem);
check('0169: the trainee is in their room', await sees(ptRoom));
await db.exec(`select leave_room('${ptRoom}')`);
check('0169: leaving it takes it off their list', !(await sees(ptRoom)));
check('0169: leaving it twice says they are not in it', /not in that room/.test(await tryExec(`select leave_room('${ptRoom}')`) ?? ''));
await asOwner();
await db.exec(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, created_at)
  values ('${GYM_A}', '${P.prem}', '${P.coach}', now() + interval '3 days', now() + interval '1 minute')`);
await as(P.prem);
check('0169: a new session with that coach brings the room back', await sees(ptRoom));
await db.exec(`select leave_room('${ptRoom}')`);
await asOwner();
await db.exec(`update coachings set status = 'ended', ended_at = now() where member_id = '${P.prem}' and status = 'active';
  insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, started_by, created_at)
  values ('${GYM_A}', '${P.prem}', '${P.coach}', 'pt', 1, 'requested', 'included', 'member', now() + interval '2 minutes')`);
await as(P.prem);
check('0220: asking for the next package brings it back too', await sees(ptRoom));

// ---- 7. (0169) a trainer closes a room of theirs, and the sweep leaves it closed --------------
await as(P.coach2);
check('0169: another trainer cannot close it', !!(await tryExec(`select set_room_archived('${ptRoom}', true)`)));
await as(P.coach);
await db.exec(`select set_room_archived('${ptRoom}', true)`);
await db.exec(`select sync_gym_rooms()`);
check('0169: a room its trainer closed stays closed through the sweep', (await one(`select archived from my_rooms() where id = '${ptRoom}'`)).archived === true);
await db.exec(`select set_room_archived('${ptRoom}', false)`);
check('0169: and reopens', (await one(`select archived from my_rooms() where id = '${ptRoom}'`)).archived === false);

// ---- 8. (0220) a package's room cannot be deleted, only closed -----------------------------------
await as(P.prem);
check('a member cannot delete a room', !!(await tryExec(`select delete_room('${ptRoom}')`)));
await as(P.coach);
check('nor can its coach — close it instead', /close it instead/.test(await tryExec(`select delete_room('${ptRoom}')`) ?? ''));

console.log(failures ? `\n${failures} FAILED` : '\nall 0128 + 0169 + 0220 checks passed');
process.exit(failures ? 1 : 0);
