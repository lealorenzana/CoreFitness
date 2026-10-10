/**
 * 0174: the 1-on-1 room is the one place (coach_timeline), and coaches write and
 * edit their trainees' routines, keeping the earlier version for the member.
 *
 *   node <repo>/scripts/sql/coach-place.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1740000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const P = { coach: id(1), coach2: id(2), mine: id(3), private: id(4), stranger: id(5) };

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const rows = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await asOwner();
const person = (pid, name, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${pid}', '${name}@cp-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${pid}', '${name}', 'T', '${name}@cp-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${pid}', '${role}', 'active') on conflict (gym_id, user_id) do update set role = excluded.role;`;
await db.exec(`
  ${person(P.coach, 'Ben', 'trainer')} ${person(P.coach2, 'Cara', 'trainer')}
  ${person(P.mine, 'Lea', 'member')} ${person(P.private, 'Pia', 'member')} ${person(P.stranger, 'Sam', 'member')}
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM}'), ('${P.coach2}', '${GYM}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mine}', '${GYM}', 'QR-C1'), ('${P.private}', '${GYM}', 'QR-C2'), ('${P.stranger}', '${GYM}', 'QR-C3') on conflict do nothing;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select m, '${GYM}', (select id from membership_plans where gym_id = '${GYM}' and tier = 'premium' limit 1), 'active', current_date - 1, current_date + 29
      from unnest(array['${P.mine}'::uuid, '${P.private}'::uuid, '${P.stranger}'::uuid]) m;
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status) values
    ('${GYM}', '${P.mine}', '${P.coach}', now() + interval '2 days', 60, 'approved'),
    ('${GYM}', '${P.private}', '${P.coach}', now() + interval '3 days', 60, 'approved');
  insert into member_share_prefs (gym_id, member_id, share_workouts) values ('${GYM}', '${P.private}', false)
    on conflict do nothing;
`);
const squat = (await one(`select id from exercises where gym_id is null and name = 'Back Squat'`)).id;
const ex = (sets, kg) => JSON.stringify([{ exercise_id: squat, target_sets: sets, target_reps: 8, target_weight_kg: kg, rest_seconds: 90 }]);

// The AI coach's routine for Lea (0145's 'coach' source), and Pia's own.
await db.exec(`insert into workout_routines (id, gym_id, member_id, name, source) values
  ('d1740000-0000-4000-8000-000000000001', '${GYM}', '${P.mine}', 'Home circuit', 'coach'),
  ('d1740000-0000-4000-8000-000000000002', '${GYM}', '${P.private}', 'Pia legs', 'member');
  insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, target_sets, target_reps, rest_seconds) values
  ('${GYM}', 'd1740000-0000-4000-8000-000000000001', 0, '${squat}', 3, 10, 60);`);
const AI = 'd1740000-0000-4000-8000-000000000001';

// ---- a coach writes and edits ----
await as(P.coach);
const made = (await one(`select coach_save_routine('${P.mine}', null, 'Leg day v2', null, '${ex(3, 40)}') as id`)).id;
await asOwner();
const mr = await one(`select source, author_id from workout_routines where id = '${made}'`);
check("a coach's routine for their trainee is 'trainer', theirs", mr.source === 'trainer' && mr.author_id === P.coach, JSON.stringify(mr));
check('…and the member is told', Number((await one(`select count(*) n from notifications where user_id = '${P.mine}' and title like 'Ben wrote you a routine'`)).n) === 1);

await as(P.coach);
const edited = await tryExec(`select coach_save_routine('${P.mine}', '${AI}', 'Home circuit', 'Heavier', '${ex(4, 50)}')`);
check("a coach edits the AI coach's routine of a member who shares", edited === null, edited ?? '');
await asOwner();
const after = await one(`select edited_by, (select target_sets from workout_routine_exercises where routine_id = '${AI}') sets from workout_routines where id = '${AI}'`);
check('…it changes, marked edited by the coach', after.edited_by === P.coach && after.sets === 4, JSON.stringify(after));
check('…the earlier version is kept', Number((await one(`select count(*) n from workout_routine_versions where routine_id = '${AI}'`)).n) === 1);

await as(P.coach);
check("…but not the routine of a member who keeps workouts private",
  (await tryExec(`select coach_save_routine('${P.private}', 'd1740000-0000-4000-8000-000000000002', 'X', null, '${ex(3, 40)}')`)) !== null);
check("…and not for someone they don't coach",
  (await tryExec(`select coach_save_routine('${P.stranger}', null, 'X', null, '${ex(3, 40)}')`)) !== null);
await as(P.coach2);
check("another coach cannot edit Lea's routine", (await tryExec(`select coach_save_routine('${P.mine}', '${AI}', 'X', null, '${ex(3, 40)}')`)) !== null);
await as(P.mine);
check('a member cannot call it', (await tryExec(`select coach_save_routine('${P.mine}', null, 'X', null, '${ex(3, 40)}')`)) !== null);

// ---- the member puts the earlier version back ----
await as(P.mine);
const versions = await rows(`select id from workout_routine_versions where routine_id = '${AI}'`);
check('the member sees the versions of their routine', versions.length === 1);
await db.exec(`select restore_routine_version('${versions[0].id}')`);
await asOwner();
const restored = await one(`select edited_by, (select target_sets from workout_routine_exercises where routine_id = '${AI}') sets from workout_routines where id = '${AI}'`);
check("…restores it (3 sets, no coach's edit)", restored.sets === 3 && restored.edited_by === null, JSON.stringify(restored));
check('…and that restore can be undone (another version kept)', Number((await one(`select count(*) n from workout_routine_versions where routine_id = '${AI}'`)).n) === 2);
await as(P.stranger);
check("another member cannot restore Lea's routine", (await tryExec(`select restore_routine_version('${versions[0].id}')`)) !== null);

// ---- the timeline ----
await asOwner();
const room = (await one(`insert into rooms (gym_id, kind, trainer_id, member_id, name) values ('${GYM}', 'pt', '${P.coach}', '${P.mine}', 'Ben · Lea') returning id`)).id;
const conv = (await one(`insert into conversations (gym_id, member_id, trainer_id) values ('${GYM}', '${P.mine}', '${P.coach}') returning id`)).id;
await db.exec(`insert into messages (gym_id, conversation_id, sender_id, body, created_at) values ('${GYM}', '${conv}', '${P.mine}', 'See you Friday', now() - interval '3 hours');
  insert into trainer_feedback (gym_id, trainer_id, member_id, note, created_at) values ('${GYM}', '${P.coach}', '${P.mine}', 'Great depth on squats', now() - interval '2 hours');`);
await as(P.mine);
const tl = await rows(`select kind, body from coach_timeline('${room}')`);
const kinds = tl.map((r) => r.kind);
check('the member sees chat, notes and the coach\'s routines in one list',
  kinds.includes('message') && kinds.includes('note') && kinds.includes('routine'), JSON.stringify(kinds));
check('…newest first', tl[0].kind === 'routine', JSON.stringify(tl.slice(0, 3)));
await as(P.coach);
check('the coach sees the same list', (await rows(`select 1 from coach_timeline('${room}')`)).length === tl.length);
await as(P.mine);
check('the member finds the room with their coach', (await one(`select pt_room_with('${P.coach}') r`)).r === room);
await as(P.coach);
check('…and the coach finds it from the member', (await one(`select pt_room_with('${P.mine}') r`)).r === room);
await as(P.stranger);
check("someone else finds no room with them", (await one(`select pt_room_with('${P.coach}') r`)).r === null);
check('nobody else can read it', (await tryExec(`select * from coach_timeline('${room}')`)) !== null);
await as(P.coach2);
check('…not even another coach', (await tryExec(`select * from coach_timeline('${room}')`)) !== null);

await asOwner();
check('versions are a gym table (tenancy)', (await one(`select tenancy_gym_tables() @> array['workout_routine_versions'] ok`)).ok);
check('marker', (await one(`select migration_0174_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0174 checks passed');
process.exit(failures ? 1 : 0);
