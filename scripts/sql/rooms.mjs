/**
 * 0128: coaching rooms — who is in a room, who sees it, who may write in it.
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
    -- Books on Premium, then moves to Free below: a real downgrade.
    ('${P.free}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
    ('${P.other}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);`);

// A recurring class run by coach, booked by prem and free; a 1-on-1 for prem with coach.
await db.exec(`select act_as_gym('${GYM_A}');
  insert into class_templates (id, gym_id, name, trainer_id, day_of_week, start_time)
    values ('d0000000-0000-4000-8000-000000000001', '${GYM_A}', 'Morning HIIT', '${P.coach}', 1, '07:00');
  insert into classes (id, gym_id, name, trainer_id, scheduled_at, duration_minutes, template_id) values
    ('d1000000-0000-4000-8000-000000000001', '${GYM_A}', 'Morning HIIT', '${P.coach}', now() - interval '7 days', 60, 'd0000000-0000-4000-8000-000000000001'),
    ('d1000000-0000-4000-8000-000000000002', '${GYM_A}', 'Morning HIIT', '${P.coach}', now() - interval '90 days', 60, 'd0000000-0000-4000-8000-000000000001');
  insert into bookings (gym_id, member_id, class_id, status) values
    ('${GYM_A}', '${P.prem}', 'd1000000-0000-4000-8000-000000000001', 'approved'),
    ('${GYM_A}', '${P.free}', 'd1000000-0000-4000-8000-000000000001', 'approved'),
    ('${GYM_A}', '${P.other}', 'd1000000-0000-4000-8000-000000000002', 'approved');
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at) values ('${GYM_A}', '${P.prem}', '${P.coach}', now() - interval '2 days');
  update memberships set plan_id = '${free}' where member_id = '${P.free}' and gym_id = '${GYM_A}';
  select act_as_gym(null);`);

// ---- 1. the automatic rooms ------------------------------------------------------------
await as(P.coach);
check('the sweep makes the class room and the 1-on-1 room', (await one(`select sync_gym_rooms() as n`)).n === 2);
check('running it again makes nothing', (await one(`select sync_gym_rooms() as n`)).n === 0);
const classRoom = (await one(`select id from rooms where kind = 'class'`)).id;
const ptRoom = (await one(`select id from rooms where kind = 'pt'`)).id;
const cls = await all(`select member_id from room_people('${classRoom}') where not is_trainer`);
check('class room: the two who booked in the last 60 days', cls.length === 2, JSON.stringify(cls));
check('a booking from 90 days ago does not count',
  !cls.some((r) => r.member_id === P.other));
check('1-on-1 room: the trainee',
  (await all(`select member_id from room_people('${ptRoom}') where not is_trainer`)).map((r) => r.member_id).join() === P.prem);
check("coach's list is their two rooms", (await all(`select * from my_rooms()`)).length === 2);

// ---- 2. who sees what -----------------------------------------------------------------
await as(P.coach2);
check("another trainer does not see coach's rooms", (await all(`select id from rooms`)).length === 0);
await as(P.other);
check('a member not in the room does not see it', (await all(`select id from rooms`)).length === 0);
await as(P.free);
check('the free member sees the class room', (await all(`select id from rooms where id = '${classRoom}'`)).length === 1);
check('but not the 1-on-1 room of someone else', (await all(`select id from rooms where id = '${ptRoom}'`)).length === 0);
await as(P.memberB);
check('another gym sees none', (await all(`select id from rooms`)).length === 0);
await as(P.admin);
check("the owner's page lists every room", (await all(`select * from all_gym_rooms()`)).length === 2);

// ---- 3. the stream ----------------------------------------------------------------------
await as(P.coach);
check('the trainer posts', !(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${classRoom}', 'Bring water tomorrow!')`)));
const post = (await one(`select id from room_posts limit 1`)).id;
await asOwner();
check('the room is told, once each',
  (await one(`select count(*)::int as n from notifications where type = 'coaching' and user_id in ('${P.prem}', '${P.free}')`)).n === 2);
check('someone not in the room is not told',
  (await one(`select count(*)::int as n from notifications where type = 'coaching' and user_id = '${P.other}'`)).n === 0);
await as(P.prem);
check('a member cannot post', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${classRoom}', 'hi')`)));
check('a premium member comments', !(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'Got it coach!')`)));
const stream = await all(`select * from room_stream('${classRoom}')`);
check('the stream shows the post with the comment', stream.length === 1 && stream[0].comments.length === 1);
await as(P.free);
check('a free member reads the stream', (await all(`select * from room_stream('${classRoom}')`)).length === 1);
check('a free member cannot comment (plan gate)', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'me too')`)));
check('the comment shows as first name + initial to another member',
  (await one(`select comments->0->>'author' as a from room_stream('${classRoom}')`)).a === 'Prem T.');
await as(P.other);
check('a member not in the room cannot comment', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'x')`)));
check('nor read the stream', (await all(`select * from room_stream('${classRoom}')`)).length === 0);
await as(P.coach);
await db.exec(`select update_room('${classRoom}', null, null, false)`);
await as(P.prem);
check('comments switched off: refused', !!(await tryExec(`insert into room_comments (gym_id, post_id, body) values ('${GYM_A}', '${post}', 'again')`)));
await as(P.coach);
await db.exec(`select update_room('${classRoom}', null, null, true)`);

// ---- 4. moderation ------------------------------------------------------------------------
await as(P.admin);
check('the owner cannot post as the trainer', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${classRoom}', 'owner here')`)));
check('the owner removes a comment', (await touched(`delete from room_comments where post_id = '${post}'`)) === 1);
await as(P.free);
check('a member cannot remove the trainer\'s post', (await touched(`delete from room_posts where id = '${post}'`)) === 0);

// ---- 5. coaching groups --------------------------------------------------------------------
await as(P.prem);
check('a member cannot start a group', !!(await tryExec(`select create_group_room('Mine')`)));
await as(P.coach);
const grp = (await one(`select create_group_room('8-week fat loss', 'Two check-ins a week') as id`)).id;
const code = (await one(`select join_code from my_rooms() where id = '${grp}'`)).join_code;
check('a group gets a 6-letter code', /^[A-Z]{6}$/.test(code ?? ''), code);
await as(P.free);
check('a free member cannot join (plan gate)', !!(await tryExec(`select join_room('${code}')`)));
await as(P.memberB);
check('another gym cannot join with the code', !!(await tryExec(`select join_room('${code}')`)));
await as(P.prem);
check('a premium member joins with the code', !(await tryExec(`select join_room('${code.toLowerCase()}')`)));
check('and sees the group', (await all(`select id from rooms where id = '${grp}'`)).length === 1);
check('a member never sees the code', (await one(`select join_code from my_rooms() where id = '${grp}'`)).join_code === null);
await as(P.coach2);
check('another trainer cannot remove members', !!(await tryExec(`select remove_from_room('${grp}', '${P.prem}')`)));
check('another trainer cannot reset the code', !!(await tryExec(`select reset_room_code('${grp}')`)));
await as(P.prem);
check('members cannot write room_members directly',
  !!(await tryExec(`insert into room_members (gym_id, room_id, member_id) values ('${GYM_A}', '${grp}', '${P.other}')`)));
check('members cannot rename a room directly', (await touched(`update rooms set name = 'x' where id = '${grp}'`)) === 0);
await as(P.coach);
const newCode = (await one(`select reset_room_code('${grp}') as c`)).c;
check('the trainer resets the code', newCode !== code);
await db.exec(`select set_room_archived('${grp}', true)`);
check('a closed group takes no posts', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${grp}', 'still here?')`)));
await as(P.other);
check('and no joins', !!(await tryExec(`select join_room('${newCode}')`)));
await as(P.coach);
await db.exec(`select set_room_archived('${grp}', false); select remove_from_room('${grp}', '${P.prem}')`);
await as(P.prem);
check('removed: the group is gone from their list', (await all(`select id from rooms where id = '${grp}'`)).length === 0);

// ---- 6. the class follows its template ---------------------------------------------------
await asOwner();
await db.exec(`update class_templates set active = false where id = 'd0000000-0000-4000-8000-000000000001'`);
await as(P.coach);
await db.exec(`select sync_gym_rooms()`);
check('a retired class archives its room', (await one(`select archived from my_rooms() where id = '${classRoom}'`)).archived === true);
check('an archived room takes no posts', !!(await tryExec(`insert into room_posts (gym_id, room_id, body) values ('${GYM_A}', '${classRoom}', 'late')`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0128 checks passed');
process.exit(failures ? 1 : 0);
