/**
 * 0260: repeat bookings, no-shows and late cancels — every rule the owner's. Both switches start off; a repeat books
 * each week as the person who set it would (a refused week is recorded, the caller's identity is restored); the
 * owner chooses who may repeat and for how long; a member's cancel inside the gym's window is blocked or marked late,
 * the desk's never; no-shows judged by a check-in inside the window (never "any check-in that day"), a 1-on-1 waits
 * for its coach, history before the switch is never judged; marks are not the app's to write; the pause and its undo;
 * "counts as used" follows the owner.
 *
 *   node <repo>/scripts/sql/repeats-noshows.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0260 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (s) => `a2600000-0000-4000-8000-0000000000${s}`;
const AD = id('ad'), ST = id('5e'), T = id('c0'), PLAN = id('f1'), TPL = id('71');
const M = [id('01'), id('02'), id('03'), id('04'), id('05')];
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryRun = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = [['own', AD, 'admin'], ['desk', ST, 'staff'], ['coach', T, 'trainer'], ...M.map((u, i) => [`m${i}`, u, 'member'])];
await db.exec(`
  ${people.map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@p4-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@p4-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ${M.map((u, i) => `('${u}', '${GYM}', 'QR-P4${i}')`).join(', ')} on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${PLAN}', '${GYM}', 'Floor', 900, 30, 'premium', true, true, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ${M.map((u) => `('${u}', '${GYM}', '${PLAN}', 'active', manila_today() - 1, manila_today() + 90, false)`).join(', ')};
  update gym_settings set waiver_required = false, class_booking_approval = 'instant', pt_booking_approval = 'instant' where gym_id = '${GYM}';
  -- a weekly class, 10:00 Manila, one seat, with four weeks on the timetable starting next week
  insert into class_templates (id, gym_id, name, trainer_id, capacity, day_of_week, start_time, duration_minutes)
    values ('${TPL}', '${GYM}', 'Lift', '${T}', 1, extract(dow from manila_today() + 7)::int, '10:00', 60);
  insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes, template_id)
    select '${GYM}', 'Lift', '${T}', 1, ((manila_today() + 7 * w) + time '10:00') at time zone 'Asia/Manila', 60, '${TPL}'
      from generate_series(1, 4) w;`);
const classOn = async (w) => (await one(`select id from classes where template_id = '${TPL}'
  and (scheduled_at at time zone 'Asia/Manila')::date = manila_today() + ${7 * w}`)).id;

// 1 — both switches start off; only the owner sets the rules.
await as(AD);
const mods = (await all(`select feature_key from my_gym_modules() where state <> 'on' and feature_key in ('repeats', 'noshows') order by 1`)).map((r) => r.feature_key).join();
check('both switches start off at every gym', mods === 'noshows,repeats', mods);
await as(M[0]);
const b1 = (await one(`insert into bookings (gym_id, member_id, class_id) values ('${GYM}', '${M[0]}', '${await classOn(1)}') returning id`)).id;
check('repeats off: a member cannot repeat a booking', /does not repeat/.test((await tryRun(`select repeat_booking('class', '${b1}', 3)`)) ?? ''));
check('…nor set the rules', /Only the gym owner/.test((await tryRun(`select set_repeat_rules(array['member'], 'weeks', 4, 7)`)) ?? ''));
await as(ST);
check('the desk cannot set the rules either', /Only the gym owner/.test((await tryRun(`select set_noshow_rules('auto', 60, true, true, false, 3, 30, 7)`)) ?? ''));
await as(AD);
await db.exec(`select set_gym_module('repeats', true)`);

// 2 — repeats: a number of weeks, each its own booking, a refused week recorded; the caller stays the caller.
await as(M[0]);
check('more weeks than the owner allows (4) is refused', /2 to 4 weeks/.test((await tryRun(`select repeat_booking('class', '${b1}', 5)`)) ?? ''));
const leak = await tryRun(`do $$ begin perform repeat_booking('class', '${b1}', 3);
  if current_setting('request.jwt.claim.sub', true) is distinct from '${M[0]}' then
    raise exception 'identity leaked: %', current_setting('request.jwt.claim.sub', true); end if; end $$`);
check('a member repeats a class for 3 weeks, and is still themself afterwards', leak === null, String(leak));
await owner();
const weeks = await all(`select w.week_date - manila_today() d, w.outcome, b.repeat_id is not null tagged
  from booking_repeat_weeks w left join bookings b on b.id = w.booking_id order by 1`);
check('…weeks 1, 2 and 3 are booked, each a real booking tagged with the repeat',
  weeks.length === 3 && weeks.every((w) => w.outcome === 'booked' && w.tagged), JSON.stringify(weeks));
await as(M[0]);
check('…and it cannot be repeated twice', /already repeats/.test((await tryRun(`select repeat_booking('class', '${b1}', 2)`)) ?? ''));

// The class has one seat: a repeat that reaches a week someone else holds records why, never skips silently.
await as(M[1]);
const taken = await tryRun(`insert into bookings (gym_id, member_id, class_id) values ('${GYM}', '${M[1]}', '${await classOn(2)}')`);
check('(setup) the class has one seat: week 2 is full for a second member', taken !== null, String(taken));
await db.exec(`insert into bookings (gym_id, member_id, class_id) values ('${GYM}', '${M[1]}', '${await classOn(4)}')`);
await as(AD);
await db.exec(`select set_repeat_rules(array['member', 'desk'], 'weeks', 4, 7)`);
await as(M[0]);
// Member 0's repeat ran to week 3; widen it by a new 2-week repeat from week 3 — week 4 is member 1's seat.
const b3 = (await one(`select id from bookings where member_id = '${M[0]}' and class_id = '${await classOn(3)}'`)).id;
await owner();
await db.exec(`update booking_repeats set stopped_at = now() where member_id = '${M[0]}'`);
await as(M[0]);
await db.exec(`select repeat_booking('class', '${b3}', 2)`);
await owner();
const ref = await one(`select w.outcome, w.message from booking_repeat_weeks w join booking_repeats r on r.id = w.repeat_id
  where r.member_id = '${M[0]}' and r.stopped_at is null and w.week_date = manila_today() + 28`);
check('a week that is full is recorded as refused, with the reason', ref && ref.outcome === 'refused' && /full|seat/i.test(ref.message ?? ''), JSON.stringify(ref));

// Who may repeat: the owner takes it away from members.
await as(AD);
await db.exec(`select set_repeat_rules(array['desk'], 'until_stopped', 4, 14)`);
await as(M[1]);
const b4 = (await one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes)
  values ('${GYM}', '${M[1]}', '${T}', ((manila_today() + 2) + time '15:00') at time zone 'Asia/Manila', 60) returning id`)).id;
check('desk only: a member is told who sets repeats here', /set up by the front desk/.test((await tryRun(`select repeat_booking('pt', '${b4}', null)`)) ?? ''));
await as(ST);
check('…the desk repeats a 1-on-1 until stopped', (await tryRun(`select repeat_booking('pt', '${b4}', null)`)) === null);
await owner();
const pt = await one(`select count(*)::int n from pt_sessions where member_id = '${M[1]}' and repeat_id is not null`);
check('…which books ahead only as far as the owner says (14 days: the first and the next, not the third)', pt.n === 2, JSON.stringify(pt));
await as(M[1]);
const rid = (await one(`select id from booking_repeats_for() limit 1`)).id;
check('the member sees their repeat and can stop it', (await tryRun(`select stop_repeat('${rid}')`)) === null);
await as(M[3]);
check('…another member cannot see it', ((await all(`select * from booking_repeats_for()`)).length) === 0);

// 3 — late cancels: one window per kind, the owner's choice of what happens inside it.
await as(AD);
await db.exec(`select set_cancel_rules(1440, 1440, 0, 'block')`);
await as(M[3]);
const soon = (await one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes)
  values ('${GYM}', '${M[3]}', '${T}', now() + interval '3 hours', 60) returning id`)).id;
check('block: a member cannot cancel inside the window', /at least 1440 minutes before/.test((await tryRun(`select cancel_booking('pt', '${soon}', 'changed_plans')`)) ?? ''));
await as(AD);
await db.exec(`select set_cancel_rules(1440, 1440, 0, 'mark')`);
await as(M[3]);
check('mark: the cancel goes through…', (await tryRun(`select cancel_booking('pt', '${soon}', 'changed_plans')`)) === null);
await owner();
check('…recorded as late', (await one(`select late_cancel, status::text s from pt_sessions where id = '${soon}'`)).late_cancel === true);
await as(M[3]);
const soon2 = (await one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes)
  values ('${GYM}', '${M[3]}', '${T}', now() + interval '5 hours', 60) returning id`)).id;
await as(ST);
await db.exec(`select cancel_booking('pt', '${soon2}', 'schedule_conflict')`);
await owner();
check('the desk cancelling inside the window is never late', (await one(`select late_cancel from pt_sessions where id = '${soon2}'`)).late_cancel === false);
await as(M[0]);
// Members may update their own class booking (0016), so this reaches the row; the guard must refuse the mark.
check('the app cannot write a mark itself', /coach or the front desk/.test((await tryRun(`update bookings set attended = 'came' where id = '${b1}'`)) ?? ''));

// 4 — no-shows: judged only after the owner turned them on, by a check-in inside the window.
await owner();
const past = (h) => `now() - interval '${h} hours'`;
const histClass = (await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Old', '${T}', 10, now() - interval '3 days', 60) returning id`)).id;
await db.exec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${M[0]}', '${histClass}', 'approved')`);
await as(AD);
await db.exec(`select set_gym_module('noshows', true); select set_noshow_rules('auto_coach', 60, true, true, true, 2, 30, 7)`);
await owner();
// Turned on a day ago, so today's ended sessions are judged and the one three days ago is history.
await db.exec(`update gym_settings set noshow_since = now() - interval '1 day' where gym_id = '${GYM}';
  update gym_modules set changed_at = now() - interval '1 day' where gym_id = '${GYM}' and feature_key = 'noshows';`);
const cls = (await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Today', '${T}', 10, ${past(4)}, 60) returning id`)).id;
const [bCame, bMiss] = [M[0], M[4]];
const bk = {};
for (const m of [bCame, bMiss]) {
  bk[m] = (await one(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${m}', '${cls}', 'approved') returning id`)).id;
}
await db.exec(`insert into attendance (gym_id, member_id, method, check_in_time) values
  ('${GYM}', '${bCame}', 'qr', ${past(4.5)}),
  ('${GYM}', '${bMiss}', 'qr', ${past(9)})`);
const ptPast = (await one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status)
  values ('${GYM}', '${M[2]}', '${T}', ${past(3)}, 60, 'approved') returning id`)).id;
await as(M[3]);
await db.exec(`select settle_no_shows()`);
await owner();
const mk = async (m) => (await one(`select attended from bookings where id = '${bk[m]}'`)).attended;
check('checked in 30 minutes before (window 60): came', (await mk(bCame)) === 'came');
check('checked in that day but hours before the class: a no-show — never "any check-in that day"', (await mk(bMiss)) === 'no_show');
check('a class from before the switch is never judged', (await one(`select attended from bookings where class_id = '${histClass}'`)).attended === null);
check('a 1-on-1 under "coach decides" stays unmarked…', (await one(`select attended from pt_sessions where id = '${ptPast}'`)).attended === null);
check('…and the coach is asked once', (await one(`select count(*)::int n from notifications where user_id = '${T}' and title like 'Did % come?'`)).n === 1);
await as(M[3]);
await db.exec(`select settle_no_shows()`);
await owner();
check('running the sweep again asks nothing twice', (await one(`select count(*)::int n from notifications where user_id = '${T}' and title like 'Did % come?'`)).n === 1);
check('the member is told about their no-show', (await one(`select count(*)::int n from notifications where user_id = '${bMiss}' and title = 'Marked as a no-show'`)).n === 1);

// The coach answers; a stranger cannot; a second no-show reaches the owner's pause (2 in 30 days).
await as(M[2]);
check('a member cannot mark their own session', /coach or the front desk/.test((await tryRun(`select mark_attendance('pt', '${ptPast}', true)`)) ?? ''));
const ptMiss = (await one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status)
  values ('${GYM}', '${bMiss}', '${T}', ${past(2)}, 60, 'approved') returning id`).catch(async () => { await owner(); return one(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status)
  values ('${GYM}', '${bMiss}', '${T}', ${past(2)}, 60, 'approved') returning id`); })).id;
await as(T);
check('the coach says the member did not come', (await tryRun(`select mark_attendance('pt', '${ptMiss}', false)`)) === null);
await owner();
check('…two no-shows in 30 days: booking in the app is paused', (await one(`select count(*)::int n from booking_pauses where member_id = '${bMiss}' and lifted_at is null`)).n === 1);
await as(bMiss);
const paused = await tryRun(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes)
  values ('${GYM}', '${bMiss}', '${T}', now() + interval '10 days', 60)`);
check('…the member is told why and until when', /can't book in the app until .* 2 no-shows or late cancels in 30 days/.test(paused ?? ''), String(paused));
await as(ST);
check('…the desk can still book for them', (await tryRun(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status)
  values ('${GYM}', '${bMiss}', '${T}', now() + interval '11 days', 60, 'approved')`)) === null);
check('the desk undoes one no-show ("they were here")', (await tryRun(`select mark_attendance('class', '${bk[bMiss]}', true)`)) === null);
await owner();
check('…and the pause it caused is lifted', (await one(`select count(*)::int n from booking_pauses where member_id = '${bMiss}' and lifted_at is null`)).n === 0);
check('…and the member is told', (await one(`select count(*)::int n from notifications where user_id = '${bMiss}' and title = 'No-show removed'`)).n === 1);
await as(bMiss);
const rec = (await all(`select kind, mark from booking_record('${bMiss}')`)).map((r) => `${r.kind}:${r.mark}`).sort().join();
check('the member sees their own record', rec === 'class:came,pt:no_show', rec);
await as(M[0]);
check('…another member cannot', /not yours to see/.test((await tryRun(`select * from booking_record('${bMiss}')`)) ?? ''));

// 5 — "counts as used": a no-show stops counting against the plan's weekly classes when the owner says so.
await owner();
await db.exec(`update membership_plans set class_bookings_per_week = 1 where id = '${PLAN}';
  insert into classes (id, gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes) values
    ('${id('a1')}', '${GYM}', 'Q1', '${T}', 10, ((manila_today() + 14) + time '07:00') at time zone 'Asia/Manila', 60),
    ('${id('a2')}', '${GYM}', 'Q2', '${T}', 10, ((manila_today() + 14) + time '09:00') at time zone 'Asia/Manila', 60);
  insert into bookings (gym_id, member_id, class_id, status, attended) values ('${GYM}', '${M[3]}', '${id('a1')}', 'approved', 'no_show');`);
await as(M[3]);
check('counts as used (on): the no-show uses the week', /allows 1 class/.test((await tryRun(`insert into bookings (gym_id, member_id, class_id) values ('${GYM}', '${M[3]}', '${id('a2')}')`)) ?? ''));
await as(AD);
await db.exec(`select set_noshow_rules('auto_coach', 60, true, false, true, 2, 30, 7)`);
await as(M[3]);
check('counts as used (off): the member can book that week', (await tryRun(`insert into bookings (gym_id, member_id, class_id) values ('${GYM}', '${M[3]}', '${id('a2')}')`)) === null);

// 6 — closed doors.
await owner();
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${M[0]}', false); set role authenticated;`);
check('no one writes a pause or a repeat directly', (await tryRun(`insert into booking_pauses (gym_id, member_id, since, until, reason) values ('${GYM}', '${M[1]}', now(), now() + interval '1 day', 'x')`)) !== null);
await owner();
check('the inner helpers are closed', !(await one(`select has_function_privilege('authenticated', 'extend_repeat(uuid)', 'execute')
  or has_function_privilege('authenticated', 'settle_no_shows_for(uuid)', 'execute')
  or has_function_privilege('authenticated', 'slot_book_for(uuid, uuid, date, time, boolean)', 'execute')
  or has_function_privilege('authenticated', 'consider_booking_pause(uuid, uuid)', 'execute') x`)).x);
check('the three tables are on the tenancy register', (await one(`select tenancy_gym_tables() @> array['booking_repeats', 'booking_repeat_weeks', 'booking_pauses'] ok`)).ok === true);
check('marker', (await one(`select migration_0260_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0260 checks passed');
process.exit(failures ? 1 : 0);
