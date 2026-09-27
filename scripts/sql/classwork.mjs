/**
 * 0129: classwork — set, turned in (by the database for a workout), returned,
 * points only when the owner switched them on, and the grade book's flags.
 *
 *   node <repo>/scripts/sql/classwork.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  coach: 'a1000000-0000-4000-8000-000000000003', coach2: 'a1000000-0000-4000-8000-000000000005',
  prem: 'a1000000-0000-4000-8000-000000000004', prem2: 'a1000000-0000-4000-8000-000000000008',
  free: 'a1000000-0000-4000-8000-000000000006', memberB: 'b1000000-0000-4000-8000-000000000004',
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

await asOwner();
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Tester', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, last_name = 'Tester', status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@cw-test.com', k[0].toUpperCase() + k.slice(1))).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_A}', '${P.coach2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.prem}', 'member', 'active'), ('${GYM_A}', '${P.prem2}', 'member', 'active'),
    ('${GYM_A}', '${P.free}', 'member', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${P.memberB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.memberB}';
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.admin}','${P.staff}','${P.coach}','${P.coach2}','${P.prem}','${P.prem2}','${P.free}');
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${P.prem}', '${GYM_A}', 'QR-CP'), ('${P.prem2}', '${GYM_A}', 'QR-CQ'), ('${P.free}', '${GYM_A}', 'QR-CF'),
    ('${P.memberB}', '${GYM_B}', 'QR-CB') on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM_A}'), ('${P.coach2}', '${GYM_A}') on conflict do nothing;
`);
const planOf = async (tier) => (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = '${tier}' limit 1`))?.id;
const free = await planOf('free'); const prem = await planOf('premium');
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ('${P.prem}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
    ('${P.prem2}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
    ('${P.free}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);`);
await db.exec(`select act_as_gym('${GYM_A}');
  insert into class_templates (id, gym_id, name, trainer_id, day_of_week, start_time)
    values ('d0000000-0000-4000-8000-000000000001', '${GYM_A}', 'Morning HIIT', '${P.coach}', 1, '07:00');
  insert into classes (id, gym_id, name, trainer_id, scheduled_at, duration_minutes, template_id) values
    ('d1000000-0000-4000-8000-000000000001', '${GYM_A}', 'Morning HIIT', '${P.coach}', now() - interval '7 days', 60, 'd0000000-0000-4000-8000-000000000001');
  insert into bookings (gym_id, member_id, class_id, status) values
    ('${GYM_A}', '${P.prem}',  'd1000000-0000-4000-8000-000000000001', 'approved'),
    ('${GYM_A}', '${P.prem2}', 'd1000000-0000-4000-8000-000000000001', 'approved'),
    ('${GYM_A}', '${P.free}',  'd1000000-0000-4000-8000-000000000001', 'approved');
  update memberships set plan_id = '${free}' where member_id = '${P.free}' and gym_id = '${GYM_A}';
  select act_as_gym(null);`);

await as(P.admin);
const wk = (await one(`insert into gym_workouts (name, published) values ('Leg Day A', true) returning id`)).id;
await as(P.coach);
await db.exec(`select sync_gym_rooms()`);
const room = (await one(`select id from rooms where kind = 'class'`)).id;

// ---- 1. setting classwork ------------------------------------------------------------------
await as(P.prem);
check('a member cannot set classwork',
  !!(await tryExec(`select create_assignment('${room}', 'workout', '${wk}', null, 'Leg day', null, current_date + 3)`)));
await as(P.coach2);
check("another trainer cannot set classwork in coach's room",
  !!(await tryExec(`select create_assignment('${room}', 'workout', '${wk}', null, 'Leg day', null, current_date + 3)`)));
await as(P.coach);
check('a due date in the past is refused',
  !!(await tryExec(`select create_assignment('${room}', 'workout', '${wk}', null, 'Leg day', null, current_date - 3)`)));
const a1 = (await one(`select create_assignment('${room}', 'workout', '${wk}', null, 'Leg day', 'Go heavy', (now() at time zone 'Asia/Manila')::date + 3) as id`)).id;
check('the trainer sets a workout for the room', !!a1);
check('targets: the two with the plan, not the free member',
  (await one(`select targets from room_classwork('${room}') where id = '${a1}'`)).targets === 2);
await asOwner();
check('the targets are told; the free member is not',
  (await one(`select count(*)::int as n from notifications where title like 'New classwork%' and user_id in ('${P.prem}', '${P.prem2}')`)).n === 2
  && (await one(`select count(*)::int as n from notifications where title like 'New classwork%' and user_id = '${P.free}'`)).n === 0);

// ---- 2. who reads what ------------------------------------------------------------------------
await as(P.free);
check('the free member does not see the classwork', (await all(`select id from room_assignments`)).length === 0);
await as(P.prem);
check('the member can open the workout their coach set', (await all(`select id from gym_workouts where id = '${wk}'`)).length === 1);
await as(P.memberB);
check('another gym sees nothing', (await all(`select id from room_assignments`)).length === 0);

// ---- 3. a workout turns itself in ----------------------------------------------------------
await as(P.prem);
const log = (await one(`select start_assignment('${a1}') as id`)).id;
check('the member starts it in the player', !!log);
check('not turned in until finished', (await one(`select my_status from room_classwork('${room}') where id = '${a1}'`)).my_status === 'assigned');
await db.exec(`update workout_logs set completed_at = now() where id = '${log}'`);
check('finishing the log turns it in, on time',
  (await one(`select my_status from room_classwork('${room}') where id = '${a1}'`)).my_status === 'turned_in');
check('the rule is off: no points', (await one(`select my_points from room_classwork('${room}') where id = '${a1}'`)).my_points === 0);
check('members cannot write a submission themselves',
  !!(await tryExec(`insert into room_submissions (gym_id, assignment_id, member_id) values ('${GYM_A}', '${a1}', '${P.prem}')`)));
await asOwner();
check('the trainer is told there is one to review',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.coach}' and title like 'Leg day: 1 to review'`)).n === 1);
await as(P.prem2);
check("a member cannot read another member's hand-in", (await all(`select id from room_submissions`)).length === 0);
await as(P.coach2);
check("another trainer cannot read the hand-ins", (await all(`select id from room_submissions`)).length === 0);
await as(P.staff);
check('the desk can', (await all(`select id from room_submissions`)).length === 1);
await as(P.coach);
const det = await all(`select * from assignment_detail('${a1}')`);
check('the trainer sees each member: one turned in, one assigned',
  det.filter((d) => d.status === 'turned_in').length === 1 && det.filter((d) => d.status === 'assigned').length === 1);
check('the review queue has it', (await all(`select * from trainer_review_queue()`)).length === 1);

// ---- 4. check-ins, and points once the owner switches them on -------------------------------
await as(P.admin);
await db.exec(`update point_rules set is_active = true where key = 'classwork_on_time'`);
await as(P.coach);
const a2 = (await one(`select create_assignment('${room}', 'checkin', null, 'weight', 'Weigh-in', null, (now() at time zone 'Asia/Manila')::date + 1) as id`)).id;
const a3 = (await one(`select create_assignment('${room}', 'checkin', null, 'question', 'How did the week feel?', null, (now() at time zone 'Asia/Manila')::date + 1, array['${P.prem}']::uuid[]) as id`)).id;
await as(P.prem2);
check('a question set for one member is not set for another', (await all(`select id from room_assignments where id = '${a3}'`)).length === 0);
await as(P.prem);
check('a weight of 5 kg is refused', !!(await tryExec(`select submit_checkin('${a2}', null, 5)`)));
check('an empty answer is refused', !!(await tryExec(`select submit_checkin('${a3}', '  ', null)`)));
check('a weight check-in is turned in', !(await tryExec(`select submit_checkin('${a2}', null, 72.5)`)));
check('rule on + on time: 10 points', (await one(`select my_points from room_classwork('${room}') where id = '${a2}'`)).my_points === 10);
await db.exec(`select submit_checkin('${a2}', null, 72)`);
await asOwner();
check('changing the answer pays nothing more',
  (await one(`select coalesce(sum(points), 0)::int as n from point_ledger where member_id = '${P.prem}' and rule_key = 'classwork_on_time'`)).n === 10);
await as(P.free);
check('the free member cannot check in', !!(await tryExec(`select submit_checkin('${a2}', null, 70)`)));

// ---- 5. returning ---------------------------------------------------------------------------
await as(P.coach2);
const sub = (await one(`select s.id from room_submissions s where false`))?.id; // coach2 sees none
await as(P.coach);
const subA2 = (await one(`select submission_id from assignment_detail('${a2}') where member_id = '${P.prem}'`)).submission_id;
await as(P.coach2);
check('another trainer cannot return it', !!(await tryExec(`select return_submission('${subA2}', 'Nice')`)));
await as(P.coach);
check('a return needs a comment', !!(await tryExec(`select return_submission('${subA2}', ' ')`)));
check('the trainer returns it with a comment', !(await tryExec(`select return_submission('${subA2}', 'Great, down 0.5 kg!')`)));
await as(P.prem);
const mine = await one(`select my_status, my_return_comment from room_classwork('${room}') where id = '${a2}'`);
check('the member sees it returned, with the comment', mine.my_status === 'returned' && mine.my_return_comment === 'Great, down 0.5 kg!');
check('a returned check-in cannot be changed', !!(await tryExec(`select submit_checkin('${a2}', null, 70)`)));

// ---- 6. late, missing, the grade book ---------------------------------------------------------
await asOwner();
await db.exec(`select act_as_gym('${GYM_A}');
  insert into room_assignments (gym_id, room_id, kind, checkin_type, title, due_on, created_by, created_at) values
    ('${GYM_A}', '${room}', 'checkin', 'note', 'Old note 1', current_date - 5, '${P.coach}', now() - interval '9 days'),
    ('${GYM_A}', '${room}', 'checkin', 'note', 'Old note 2', current_date - 4, '${P.coach}', now() - interval '9 days');
  select act_as_gym(null);`);
const old1 = (await one(`select id from room_assignments where title = 'Old note 1'`)).id;
await as(P.prem);
await db.exec(`select submit_checkin('${old1}', 'Sorry, late!', null)`);
const late = await one(`select my_status, my_points from room_classwork('${room}') where id = '${old1}'`);
check('turned in after the due date: late, no points', late.my_status === 'late' && late.my_points === 0, JSON.stringify(late));
await as(P.coach);
const prog = await all(`select * from room_progress('${room}')`);
const p2 = prog.find((r) => r.member_id === P.prem2);
check('prem2 has two missing and is flagged', p2?.missing === 2 && p2.flags.includes('missing_work'), JSON.stringify(p2));
check('prem is not flagged for missing work', !prog.find((r) => r.member_id === P.prem).flags.includes('missing_work'));
check('the latest check-in weight shows', Number(prog.find((r) => r.member_id === P.prem).latest_weight) === 72);
await as(P.coach2);
check("another trainer cannot read coach's grade book", (await all(`select * from room_progress('${room}')`)).length === 0);

// ---- 7. reminders --------------------------------------------------------------------------
await as(P.prem2);
check('the Today strip lists what is due this week', (await all(`select * from my_due_classwork()`)).length >= 2);
check('the sweep reminds prem2 of the weigh-in due tomorrow', (await one(`select classwork_due_sweep() as n`)).n >= 1);
check('and not twice', (await one(`select classwork_due_sweep() as n`)).n === 0);
await asOwner();
check('prem, who turned it in, is not reminded',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.prem}' and title = 'Due tomorrow: Weigh-in'`)).n === 0);

// ---- 8. removing -------------------------------------------------------------------------------
await as(P.coach2);
check('another trainer cannot remove classwork', !!(await tryExec(`select delete_assignment('${a3}')`)));
await as(P.coach);
check('the trainer removes classwork', !(await tryExec(`select delete_assignment('${a3}')`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0129 checks passed');
process.exit(failures ? 1 : 0);
