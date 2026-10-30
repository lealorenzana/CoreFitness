/**
 * 0219: no way for a member to earn what they did not do. A workout pays only when it is real — 3+ sets, 10+
 * minutes, finished on the day it says — and only the first such workout a day; an empty, quick or backdated
 * log is not a training day either (streaks, levels, challenges and badges all count only real workouts).
 * Deleting what paid takes the points back. A record must be believable. A target pays only after a week, at
 * most twice in 30 days. A member's reward request always starts as pending. Programs are deleted if unused,
 * otherwise retired; staff record a reason.
 *
 *   node <repo>/scripts/sql/fair-points.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2190000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const pts = async (rule) => Number((await one(`select coalesce(sum(points), 0)::int p from point_ledger where member_id = '${M}' and rule_key = '${rule}'`)).p);
const days = async () => Number((await one(`select training_days_between('${M}', '${GYM}', manila_today() - 40, manila_today()) n`)).n);

await owner();
await db.exec(`
  ${[['fp', M, 'member'], ['fpdesk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@fp-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@fp-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-FP1') on conflict do nothing;
  select act_as_gym('${GYM}');
  update point_rules set is_active = true, points = greatest(points, 5)
   where gym_id = '${GYM}' and key in ('workout_logged', 'personal_record', 'goal_achieved');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'FP Premium', 900, 30, 'premium', true, true, true);
  insert into plan_features (plan_id, feature_key, enabled) values ('${id('f1')}', 'points_earn', true), ('${id('f1')}', 'workout_tracker', true),
    ('${id('f1')}', 'points_redeem', true)
    on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 60, manila_today() + 30, false);
  select act_as_gym(null);`);
const ex = (await one(`select id from exercises limit 1`)).id;
const ex2 = (await all(`select id from exercises limit 2`))[1].id;

/** A workout as the member: insert, its sets, then finish. `startedMinAgo` is what the phone says. */
const workout = async (logId, { sets = 0, startedMinAgo = 0, performedOn = 'manila_today()', weights = [] } = {}) => {
  await as(M);
  let e = await tryExec(`insert into workout_logs (id, gym_id, member_id, activity, performed_on, started_at)
    values ('${logId}', '${GYM}', '${M}', 'Legs', ${performedOn}, now() - interval '${startedMinAgo} minutes')`);
  for (let i = 0; i < sets && !e; i++) {
    e = await tryExec(`insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg)
      values ('${GYM}', '${logId}', '${ex}', ${i + 1}, 5, ${weights[i] ?? 20})`);
  }
  if (!e) e = await tryExec(`update workout_logs set completed_at = now() where id = '${logId}'`);
  await owner();
  return e;
};

// 1. An empty workout, finished: no points, no training day.
let err = await workout(id('71'));
check('setup: an empty workout can be started and finished', err === null, err ?? '');
check('an empty workout pays nothing', (await pts('workout_logged')) === 0);
check('…and is not a training day', (await days()) === 0);

// 2. Three sets, finished at once: still nothing.
await workout(id('72'), { sets: 3, startedMinAgo: 0 });
check('three sets finished in under 10 minutes pay nothing', (await pts('workout_logged')) === 0);

// 3. A real workout: 3 sets, started 15 minutes ago.
await workout(id('73'), { sets: 3, startedMinAgo: 15 });
const first = await pts('workout_logged');
check('a real workout (3 sets, 15 minutes) pays', first > 0, String(first));
check('…and is a training day', (await days()) === 1);

// 4. A second real workout the same day: no more.
await workout(id('74'), { sets: 3, startedMinAgo: 20 });
check('a second real workout the same day pays nothing more', (await pts('workout_logged')) === first);

// 5. A member cannot mark a workout as counting, or move its finish.
await as(M);
await tryExec(`update workout_logs set counts = true where id = '${id('71')}'`);
await tryExec(`update workout_logs set completed_at = now() + interval '2 hours' where id = '${id('72')}'`);
await owner();
const w71 = await one(`select counts from workout_logs where id = '${id('71')}'`);
const w72 = await one(`select completed_at <= now() + interval '1 minute' ok from workout_logs where id = '${id('72')}'`);
check('a member cannot set "counts" on a workout', w71.counts === false);
check('…nor move a finished workout’s finish time', w72.ok === true);

// 6. Backdated workouts are not training days.
for (let i = 0; i < 5; i++) await workout(`a2190000-0000-4000-8000-00000000009${i}`, { sets: 3, startedMinAgo: 30, performedOn: `manila_today() - ${10 + i}` });
check('workouts dated 10–14 days back add no training days', (await days()) === 1, String(await days()));
check('…nor streak weeks', Number((await one(`select current_run c from streak_weeks('${M}', '${GYM}')`)).c) <= 1);

// 7. Deleting the paid workout takes its points back.
await as(M);
err = await tryExec(`delete from workout_logs where id = '${id('73')}'`);
await owner();
check('the member can delete their workout', err === null, err ?? '');
check('…and its points are taken back', (await pts('workout_logged')) === 0, String(await pts('workout_logged')));

// 8. Records: believable only.
await workout(id('81'), { sets: 1, weights: [60], startedMinAgo: 5 });
await workout(id('82'), { sets: 1, weights: [80], startedMinAgo: 5 });
check('60 → 80 kg is a record', (await one(`select count(*)::int n from personal_records where member_id = '${M}' and value = 80`)).n === 1);
const before400 = await pts('personal_record');
await workout(id('83'), { sets: 1, weights: [400], startedMinAgo: 5 });
const r400 = await one(`select points_awarded from personal_records where member_id = '${M}' and value = 400`);
check('80 → 400 kg is recorded but pays nothing (not believable)', r400?.points_awarded === 0 && (await pts('personal_record')) === before400, JSON.stringify(r400));
const prPts = await pts('personal_record');
await as(M);
await tryExec(`delete from workout_sets where log_id = '${id('82')}'`);
await owner();
check('deleting the record’s set takes its points back', (await pts('personal_record')) === Math.max(0, prPts - 5) || (await pts('personal_record')) < prPts, `${prPts} → ${await pts('personal_record')}`);

// 9. Targets: a week old at least, at most two paid in 30 days.
await owner();
await db.exec(`select act_as_gym('${GYM}');
  insert into fitness_goals (id, gym_id, member_id, title, metric, start_value, target_value, created_at) values
    ('${id('b1')}', '${GYM}', '${M}', 'New today', 'lift_kg', 50, 60, now()),
    ('${id('b2')}', '${GYM}', '${M}', 'Old 1', 'lift_kg', 50, 60, now() - interval '10 days'),
    ('${id('b3')}', '${GYM}', '${M}', 'Old 2', 'lift_kg', 50, 60, now() - interval '10 days'),
    ('${id('b4')}', '${GYM}', '${M}', 'Old 3', 'lift_kg', 50, 60, now() - interval '10 days');
  select set_config('app.goal_settling', 'on', true);
  update fitness_goals set achieved_on = manila_today() where id in ('${id('b1')}', '${id('b2')}', '${id('b3')}', '${id('b4')}');
  select act_as_gym(null);`);
const goalRows = Number((await one(`select count(*)::int n from point_ledger where member_id = '${M}' and rule_key = 'goal_achieved' and points > 0`)).n);
check('a target made today and reached today pays nothing; older ones pay, at most two in 30 days', goalRows === 2, String(goalRows));

// 10. A reward request always starts as pending.
await owner();
await db.exec(`select act_as_gym('${GYM}');
  insert into rewards (id, gym_id, name, cost_points, is_active) values ('${id('c1')}', '${GYM}', 'FP Shake', 1, true) on conflict do nothing;
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values ('${GYM}', '${M}', 'checkin', 50, 'attendance', '${id('a1')}');
  select act_as_gym(null);`);
await as(M);
err = await tryExec(`insert into reward_redemptions (gym_id, member_id, reward_id, cost_points, status) values ('${GYM}', '${M}', '${id('c1')}', 0, 'approved')`);
await owner();
const red = await one(`select status, cost_points from reward_redemptions where member_id = '${M}' order by requested_at desc limit 1`);
check('a member’s reward request is stored as pending at the reward’s price', err === null && red?.status === 'pending' && red?.cost_points === 1, `${err} ${JSON.stringify(red)}`);

// 11. Programs: deleted when unused, retired when someone is on it.
await db.exec(`insert into gym_programs (id, gym_id, name, weeks, level, created_by) values ('${id('d1')}', '${GYM}', 'FP unused', 4, 'beginner', '${ST}'), ('${id('d2')}', '${GYM}', 'FP used', 4, 'beginner', '${ST}');
  insert into program_enrolments (gym_id, program_id, member_id, status) values ('${GYM}', '${id('d2')}', '${M}', 'active');`);
await as(M);
err = await tryExec(`select delete_or_retire_program('${id('d1')}', 'Not needed any more')`);
check('a member cannot delete a program', err !== null, 'it ran');
await as(ST);
const d1 = await one(`select delete_or_retire_program('${id('d1')}', 'Not needed any more') r`);
const d2 = await one(`select delete_or_retire_program('${id('d2')}', 'Replaced by a new one') r`);
err = await tryExec(`select delete_or_retire_program('${id('d2')}', 'x')`);
await owner();
check('an unused program is deleted', d1.r === 'deleted' && (await one(`select count(*)::int n from gym_programs where id = '${id('d1')}'`)).n === 0);
check('a program someone is on is retired, not deleted', d2.r === 'retired' && (await one(`select hidden from gym_programs where id = '${id('d2')}'`)).hidden === true);
check('…and the member on it keeps it', (await one(`select count(*)::int n from program_enrolments where program_id = '${id('d2')}'`)).n === 1);
check('a one-letter reason is refused', err !== null && /reason/i.test(err), err ?? 'no error');
check('…and the reason is in the activity log', (await one(`select count(*)::int n from activity_log where detail ->> 'reason' = 'Replaced by a new one'`)).n === 1);

// 12. record_reason: staff only.
await as(ST);
err = await tryExec(`select record_reason('membership.frozen', 'member', '${M}', '${M}', 'Froze FP', 'Injured, doctor''s note')`);
await as(M);
const err2 = await tryExec(`select record_reason('membership.frozen', 'member', '${M}', '${M}', 'Froze FP', 'Because I can')`);
await owner();
check('the desk records a reason with an action', err === null, err ?? '');
check('…a member cannot', err2 !== null, 'it ran');

// 13. Walk-ins: a pack needs a phone; the guest stays on the list until their last visit.
await owner();
await db.exec(`update gym_settings set day_pass_on = true, day_pass_price = 100, pack5_price = 400 where gym_id = '${GYM}'`);
await as(ST);
err = await tryExec(`select * from record_guest_visit(null, 'No Phone', null, 'pack5', 'cash')`);
check('a pack cannot be sold without a phone', /phone/i.test(err ?? ''), err ?? 'it was sold');
const bought = await one(`select * from record_guest_visit(null, 'Pack Guest', '0917 555 1212', 'pack5', 'cash')`);
check('with a phone, a 5-visit pack leaves 4 visits', bought.visits_left === 4, JSON.stringify(bought));
let left = 4, stillListed = true;
for (let i = 0; i < 4; i++) {
  const listed = (await all(`select * from guests_with_visits()`)).some((g) => g.id === bought.guest_id && g.visits_left === left);
  stillListed = stillListed && listed;
  left = (await one(`select * from record_guest_visit('${bought.guest_id}', null, null, 'pack_visit', 'cash')`)).visits_left;
}
check('the guest is on the list to pick, visit after visit, until 0', stillListed && left === 0, `${stillListed} ${left}`);
check('…and off it at 0', !(await all(`select * from guests_with_visits()`)).some((g) => g.id === bought.guest_id));
err = await tryExec(`select * from record_guest_visit('${bought.guest_id}', null, null, 'pack_visit', 'cash')`);
check('a fifth pack visit is refused', /no visits left/i.test(err ?? ''), err ?? 'it went through');
await as(M);
check('a member sees no guest list', (await all(`select * from guests_with_visits()`)).length === 0);
await owner();

check('the marker answers', (await one(`select migration_0219_applied() a`)).a === true);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
