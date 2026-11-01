/**
 * 0227: switching gyms, members only. A member cannot join a second gym except
 * by switching (with consent); the switch files a cancellation with the old
 * gym; declined at the new gym, nothing moves and the cancellation is
 * withdrawn; accepted (an open gym at once, or the desk), workouts, sets,
 * routines, the plan, body readings, targets, progress photos (file queued to
 * move) and training badges move, visit badges and points start over, the old
 * role ends and the old gym is told; coaches still join several gyms; 0227
 * runs twice.
 *
 *   node <repo>/scripts/sql/switch-gym.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0227' });
const A = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2270000-0000-4000-8000-0000000000${n}`;
const B = id('b0'), C = id('c0');
const OWNER_A = id('01'), DESK_B = id('02'), DESK_C = id('03'), MEM = id('04'), COACH = id('05');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = { [OWNER_A]: 'Olga', [DESK_B]: 'Bea', [DESK_C]: 'Cora', [MEM]: 'Mia', [COACH]: 'Carlo' };
await db.exec(`
  insert into gyms (id, slug, name, plan, status) values ('${B}', 'gym-bee', 'Gym Bee', 'trial', 'active'), ('${C}', 'gym-cee', 'Gym Cee', 'trial', 'active') on conflict do nothing;
  select seed_gym_defaults('${B}'); select seed_gym_defaults('${C}');
  update gyms set onboarded_at = coalesce(onboarded_at, now()) where id in ('${A}', '${B}', '${C}');
  update gym_settings set join_policy = 'open', join_approval = 'auto' where gym_id = '${B}';
  update gym_settings set join_policy = 'open', join_approval = 'desk' where gym_id = '${C}';` +
  Object.entries(people).map(([u, nm]) => `
  insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${nm.toLowerCase()}@sw-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${u}', '${nm}', 'Test', '${nm.toLowerCase()}@sw-test.ph', 'active', 'member', '${A}')
    on conflict (id) do update set first_name = excluded.first_name, active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${u}';`).join('\n') + `
  delete from gym_roles where gym_id = '${A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${A}', '${OWNER_A}', 'admin', 'active'), ('${B}', '${DESK_B}', 'admin', 'active'), ('${C}', '${DESK_C}', 'admin', 'active'),
    ('${A}', '${MEM}', 'member', 'active'), ('${A}', '${COACH}', 'trainer', 'active');
  update profiles set active_gym_id = '${B}' where id = '${DESK_B}';
  update profiles set active_gym_id = '${C}' where id = '${DESK_C}';
  insert into member_profiles (gym_id, profile_id, qr_code, experience_level) values ('${A}', '${MEM}', 'qr-mia-sw', 'intermediate') on conflict do nothing;
  insert into trainer_profiles (gym_id, profile_id) values ('${A}', '${COACH}') on conflict do nothing;
  set session_replication_role = replica;
  insert into memberships (id, member_id, gym_id, plan_id, status, start_date, expiry_date)
    select '${id('e1')}', '${MEM}', '${A}', p.id, 'active', current_date - 10, current_date + 20 from membership_plans p where p.gym_id = '${A}' order by p.price desc limit 1;
  insert into workout_routines (id, gym_id, member_id, name) values ('${id('d1')}', '${A}', '${MEM}', 'Push day');
  insert into workout_logs (id, gym_id, member_id, performed_on, activity, routine_id) values ('${id('a1')}', '${A}', '${MEM}', current_date - 1, 'Strength', '${id('d1')}');
  insert into workout_sets (id, gym_id, log_id, exercise_id, set_number, reps, weight_kg)
    select '${id('a2')}', '${A}', '${id('a1')}', e.id, 1, 8, 40 from exercises e limit 1;
  insert into body_measurements (gym_id, member_id, weight_kg) values ('${A}', '${MEM}', 61.5);
  insert into progress_photos (gym_id, member_id, path, pose) values ('${A}', '${MEM}', '${A}/${MEM}/front-1.jpg', 'front');
  insert into achievement_unlocks (user_id, achievement_key, gym_id) values ('${MEM}', 'days_10', '${A}'), ('${MEM}', 'first_checkin', '${A}'), ('${MEM}', 'level_intermediate', '${A}');
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values ('${A}', '${MEM}', 'visit', 120, 'attendance', gen_random_uuid());
  insert into attendance (gym_id, member_id, check_in_time) values ('${A}', '${MEM}', now() - interval '2 days');
  insert into pt_sessions (id, gym_id, member_id, trainer_id, starts_at, status) values ('${id('f1')}', '${A}', '${MEM}', '${COACH}', now() + interval '3 days', 'approved');
  set session_replication_role = origin;`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0227'); } catch (e) { err = String(e); }
check('0227 applies', err === null, err);

await as(MEM);
check('a member cannot simply join a second gym', /use Switch gym instead/.test(await tryExec(`select request_to_join('${C}', 'list', null, null)`) ?? ''));
check('switching needs their consent', /Agree to your training data moving/.test(await tryExec(`select request_gym_switch('${C}', 'list', null, false)`) ?? ''));
check('…and the refund quote is theirs to read first', !(await tryExec(`select * from refund_quote('${id('e1')}')`)));

// The desk gym (C): asked, then declined — nothing moves.
check('asking a desk-approved gym waits for its desk', (await one(`select request_gym_switch('${C}', 'list', null, true) w`)).w === 'desk');
await owner();
check('…the old gym is asked to cancel', await n(`select count(*) n from membership_requests where gym_id = '${A}' and member_id = '${MEM}' and kind = 'cancel' and status = 'open'`) === 1);
check('…and the new gym\'s desk is told someone is switching in', await n(`select count(*) n from notifications where user_id = '${DESK_C}' and title = 'Switching in from another gym'`) === 1);
await as(DESK_C);
check('…and sees the tag on their request', (await db.query(`select * from gym_switching_in()`)).rows.length === 1);
await owner();
await db.exec(`update gym_roles set status = 'archived' where gym_id = '${C}' and user_id = '${MEM}'`);
check('declined: nothing moved, the old role is untouched', await n(`select count(*) n from workout_logs where member_id = '${MEM}' and gym_id = '${A}'`) === 1
  && (await one(`select status from gym_roles where gym_id = '${A}' and user_id = '${MEM}'`)).status === 'active');
check('…the cancellation is withdrawn and they are told', await n(`select count(*) n from membership_requests where gym_id = '${A}' and member_id = '${MEM}' and status = 'withdrawn'`) === 1
  && await n(`select count(*) n from notifications where user_id = '${MEM}' and title = 'Your switch did not go through'`) === 1);

// The open gym (B): in at once.
await owner();
await db.exec(`delete from gym_roles where gym_id = '${C}' and user_id = '${MEM}'`);
await as(MEM);
check('an open gym takes them at once', (await one(`select request_gym_switch('${B}', 'list', null, true) w`)).w === 'auto');
await owner();
check('workouts and sets moved', await n(`select count(*) n from workout_logs where member_id = '${MEM}' and gym_id = '${B}'`) === 1
  && await n(`select count(*) n from workout_sets where log_id = '${id('a1')}' and gym_id = '${B}'`) === 1);
check('routines and body readings moved', await n(`select count(*) n from workout_routines where member_id = '${MEM}' and gym_id = '${B}'`) === 1
  && await n(`select count(*) n from body_measurements where member_id = '${MEM}' and gym_id = '${B}'`) === 1);
const ph = await one(`select gym_id, path from progress_photos where member_id = '${MEM}'`);
check('the progress photo moved, its file queued to follow', ph.gym_id === B && ph.path === `${B}/${MEM}/front-1.jpg`
  && await n(`select count(*) n from storage_moves where from_path = '${A}/${MEM}/front-1.jpg' and to_path = '${B}/${MEM}/front-1.jpg'`) === 1, JSON.stringify(ph));
check('training badges and the earned level moved', await n(`select count(*) n from achievement_unlocks where user_id = '${MEM}' and gym_id = '${B}' and achievement_key in ('days_10', 'level_intermediate')`) === 2);
check('the visit badge locks again (stays with the old gym)', await n(`select count(*) n from achievement_unlocks where user_id = '${MEM}' and gym_id = '${B}' and achievement_key = 'first_checkin'`) === 0);
check('points start at zero at the new gym; the old ledger stays', Number((await one(`select coalesce(sum(points), 0) s from point_ledger where member_id = '${MEM}' and gym_id = '${B}'`)).s) === 0
  && Number((await one(`select coalesce(sum(points), 0) s from point_ledger where member_id = '${MEM}' and gym_id = '${A}'`)).s) >= 120);
check('visits and payments stay with the old gym', await n(`select count(*) n from attendance where member_id = '${MEM}' and gym_id = '${A}'`) === 1);
check('the old role ended; they are at the new gym', (await one(`select status from gym_roles where gym_id = '${A}' and user_id = '${MEM}'`)).status === 'archived'
  && (await one(`select active_gym_id g from profiles where id = '${MEM}'`)).g === B);
check('their future session at the old gym is cancelled, and the coach told', (await one(`select status::text s, cancellation_reason r from pt_sessions where id = '${id('f1')}'`)).r === 'member_switched'
  && await n(`select count(*) n from notifications where user_id = '${COACH}' and title = 'A booking was cancelled'`) === 1);
check('the old gym is told, and its cancellation request waits', await n(`select count(*) n from notifications where user_id = '${OWNER_A}' and title = 'A member switched gyms'`) === 1
  && await n(`select count(*) n from membership_requests where gym_id = '${A}' and member_id = '${MEM}' and status = 'open'`) === 1);
await as(OWNER_A);
check('…and sees them as switched out', (await db.query(`select * from gym_switched_out()`)).rows.length === 1);
await as(MEM);
check('they read the new gym now', (await one(`select current_gym_id() g`)).g === B);

// Coaches still work at several gyms.
await as(COACH);
check('a coach can still join another gym', (await tryExec(`select request_to_join('${C}', 'list', null, null)`)) === null);

await anon();
check('a visitor can do none of it', !!(await tryExec(`select request_gym_switch('${B}', 'list', null, true)`)) && !!(await tryExec(`select my_gym_switch()`)));
check('the probe marker answers a visitor', (await one(`select migration_0227_applied() ok`)).ok === true);
await owner();
check('0227 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0227_switch_gym.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
