/**
 * Demo data part 3 (scripts/demo-data/part3) runs on a database shaped like
 * production — every migration, then parts 1 and 2 of the demo seed — and its
 * rows come back out with remove_demo_data() (0168), leaving the member's own
 * real rows untouched.
 *
 *   node <repo>/scripts/sql/demo-part3.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const run = async (label, file) => {
  try { await db.exec(readFileSync(file, 'utf8')); return true; }
  catch (e) { check(`${label} runs`, false, describe(e)); return false; }
};

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const LEA = '0e4caf37-0f2a-4b11-9c22-1234567890ab';
await db.exec(`reset role;
  update gyms set name = 'G Fitness' where id = '${GYM}';
  insert into auth.users (id, email, raw_user_meta_data) values ('${LEA}', 'lealorenzanaa@gmail.com', '{}') on conflict do nothing;
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${LEA}', 'Lea', 'Lorenzana', 'lealorenzanaa@gmail.com', 'active', 'member', '${GYM}') on conflict (id) do update set status = 'active';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${LEA}', 'member', 'active') on conflict (gym_id, user_id) do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${LEA}', '${GYM}', '${LEA}') on conflict do nothing;`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM}' and is_active and price > 0 order by price limit 1`)).id;
await db.exec(`insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date)
  values ('${GYM}', '${LEA}', '${prem}', 'active', current_date - 29, current_date)`);
// Her own real rows, which removal must leave alone.
await db.exec(`insert into attendance (gym_id, member_id, method) values ('${GYM}', '${LEA}', 'qr')`);

const DD = `${REPO}/scripts/demo-data`;
// Parts 1 and 2 ran on production long ago and no longer load on today's schema,
// so this builds the slice of them part 3 leans on: a demo coach, demo members,
// past and upcoming classes, events, challenges, rewards and a program.
const COACH = '5eed0002-0000-4000-8000-000000000001';
const MATES = [1, 2, 3, 4, 5].map((i) => `5eed0001-0000-4000-8000-00000000000${i}`);
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@seed.corefitness-test.com', '{}') on conflict do nothing;
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${id}', '${n}', 'Demo', '${n}@seed.corefitness-test.com', 'active', '${role}', '${GYM}')
    on conflict (id) do update set status = 'active';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict (gym_id, user_id) do update set role = excluded.role;`;
await db.exec(`reset role;
  ${person(COACH, 'marco', 'trainer')}
  insert into trainer_profiles (profile_id, gym_id) values ('${COACH}', '${GYM}') on conflict do nothing;
  ${MATES.map((m, i) => person(m, 'mate' + i, 'member') + ` insert into member_profiles (profile_id, gym_id, qr_code) values ('${m}', '${GYM}', '${m}') on conflict do nothing;`).join('\n')}
  insert into classes (id, gym_id, name, trainer_id, level, capacity, scheduled_at, duration_minutes)
    select ('5eed0020-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'HIIT', '${COACH}', 'beginner', 20,
           now() + (i - 50) * interval '2 days', 45 from generate_series(1, 55) i;
  insert into events (id, gym_id, title, starts_at, duration_minutes, capacity, cancelled)
    select ('5eed0010-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Event ' || i, now() + (i - 4) * interval '20 days', 60, 30, false from generate_series(1, 6) i;
  insert into challenges (id, gym_id, title, metric_key, target, starts_on, ends_on, reward_points, is_active)
    select ('5eed0030-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Challenge ' || i, (select key from achievement_metrics limit 1), 12, current_date - 60 * i, current_date - 60 * i + 30 + (case when i = 1 then 60 else 0 end), 100, true
      from generate_series(1, 3) i;
  insert into rewards (id, gym_id, name, cost_points, stock, is_active)
    select ('5eed0040-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '${GYM}', 'Reward ' || i, 100 * i, 20, true from generate_series(1, 4) i;
  insert into gym_workouts (id, gym_id, name, level, published, hidden, created_by)
    values ('5eed0050-0000-4000-8000-000000000001', '${GYM}', 'Full body A', 'beginner', true, false, '${LEA}');
  insert into gym_programs (id, gym_id, name, level, weeks, premium, published, hidden, created_by)
    values ('5eed0051-0000-4000-8000-000000000001', '${GYM}', 'Starter Strength', 'beginner', 4, false, true, false, '${LEA}');
  insert into gym_program_days (id, gym_id, program_id, week, day, workout_id)
    select ('5eed0052-0000-4000-8000-' || lpad(d::text, 12, '0'))::uuid, '${GYM}', '5eed0051-0000-4000-8000-000000000001', 1, d, '5eed0050-0000-4000-8000-000000000001'
      from generate_series(1, 3) d;`);
// What production has that 0117 never knew: rooms run by demo coaches, their posts, a chat.
await db.exec(`reset role;
  insert into rooms (id, gym_id, kind, trainer_id, name, join_code, comments_on) values ('5eed0060-0000-4000-8000-000000000001', '${GYM}', 'group', '${COACH}', 'Morning crew', 'MORNIN', true);
  insert into room_posts (gym_id, room_id, author_id, body) values ('${GYM}', '5eed0060-0000-4000-8000-000000000001', '${COACH}', 'Welcome!');
  insert into conversations (id, gym_id, member_id, trainer_id) values ('5eed0061-0000-4000-8000-000000000001', '${GYM}', '${MATES[0]}', '${COACH}');
  insert into messages (gym_id, conversation_id, sender_id, body) values ('${GYM}', '5eed0061-0000-4000-8000-000000000001', '${MATES[0]}', 'Hi coach');`);

// Production has several gyms, each with its own copy of every badge (0098) —
// the seed once picked a badge from every gym and broke the unique key.
await db.exec(`reset role; insert into gyms (id, slug, name) values ('b0000000-0000-4000-8000-00000000000b', 'gym-b', 'Gym B') on conflict do nothing;
  insert into achievements select (jsonb_populate_record(null::achievements, to_jsonb(a) || jsonb_build_object('gym_id', 'b0000000-0000-4000-8000-00000000000b'))).*
    from achievements a where a.gym_id = '${GYM}' on conflict do nothing;`);
const before = (await one(`select count(*)::int n from attendance where member_id = '${LEA}'`)).n;
for (const f of readdirSync(`${DD}/part3`).sort()) {
  const fine = await run(`part 3 ${f}`, `${DD}/part3/${f}`);
  if (fine) check(`part 3 ${f} runs`, true);
}
// Twice: it must be re-runnable.
for (const f of readdirSync(`${DD}/part3`).sort()) await run(`part 3 ${f} (again)`, `${DD}/part3/${f}`);

const c = async (t, where = `member_id = '${LEA}'`) => (await one(`select count(*)::int n from ${t} where ${where}`)).n;
const visits = await c('attendance');
check('about three visits a week for two years', visits > 250 && visits < 400, String(visits));
check('22 earlier terms with receipts', (await c('payments')) >= 22 && (await c('memberships')) >= 23);
check('a weigh-in every month', (await c('body_measurements')) >= 22);
check('workouts with sets that get heavier', (await c('workout_logs')) > 120 && (await c('workout_sets', `log_id in (select id from workout_logs where member_id = '${LEA}')`)) > 1000);
check('points and badges', (await c('point_ledger')) > 300 && (await c('achievement_unlocks', `user_id = '${LEA}'`)) > 5);
check('re-running added nothing twice', (await c('attendance')) === visits);
check('classes booked, past and coming up', (await c('bookings')) >= 40);
check('1-on-1 sessions with a note after each', (await c('pt_sessions')) >= 19 && (await c('trainer_feedback')) >= 19);
check('a room, a check-in turned in, a chat', (await c('room_submissions')) === 1 && (await c('messages', `sender_id = '${LEA}'`)) >= 3);
check('a program, two days in', (await c('program_enrolments')) === 1 && (await c('workout_logs', `member_id = '${LEA}' and program_day_id is not null`)) === 2);
check('the shop sold for three months, stock adds up', (await c('shop_sales', `gym_id = '${GYM}'`)) >= 140
  && (await one(`select bool_and(stock = (select sum(change) from stock_moves m where m.product_id = p.id)) ok from shop_products p where id::text like '5eed3138-%'`)).ok);
check('season tiers and the member\'s claims', (await c('season_tiers', `gym_id = '${GYM}'`)) >= 3 && (await c('season_claims')) === 3);
check('a squad of four, eight weeks', (await c('squad_members', `squad_id = '5eed3147-0000-4000-8000-000000000001'`)) === 4 && (await c('squad_weeks', `gym_id = '${GYM}'`)) === 8);
check('challenges, events, rewards, streaks, an inbox', (await c('challenge_participants')) === 3 && (await c('event_registrations')) >= 6
  && (await c('reward_redemptions')) === 3 && (await c('streak_milestones')) === 4 && (await c('notifications', `user_id = '${LEA}'`)) >= 12);

// ---- Remove demo data (0168) takes part 3 out and leaves her real rows ----
const PA = '5eed9999-0000-4000-8000-000000000099';
await db.exec(`reset role; insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@corefitness.test', '{}') on conflict do nothing;
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'Admin', 'pa@corefitness.test', 'active', 'admin') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);
await db.exec(`select set_config('request.jwt.claim.sub', '${LEA}', false); set role authenticated;`);
let refused = false;
try { await db.exec(`select remove_demo_data()`); } catch { refused = true; }
check('a member cannot remove demo data', refused);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${PA}', false); set role authenticated;`);
const said = (await one(`select remove_demo_data() as m`)).m;
await db.exec(`reset role;`);
const left = (await one(`select (select count(*) from attendance where id::text like '5eed3%') + (select count(*) from workout_logs where id::text like '5eed3%')
  + (select count(*) from shop_sales where id::text like '5eed3%') + (select count(*) from notifications where id::text like '5eed3%')
  + (select count(*) from messages where id::text like '5eed3%') + (select count(*) from squads where id::text like '5eed3%') as n`)).n;
check('remove_demo_data() takes every part 3 row out', Number(left) === 0 && /member history demo/.test(said ?? ''), `${left} left; said: ${said}`);
check('the demo coach and members are gone, rooms and chats with them', (await one(`select count(*)::int n from profiles where id::text like '5eed000%'`)).n === 0
  && (await one(`select count(*)::int n from rooms where trainer_id = '${COACH}'`)).n === 0, said);
check('...and leaves her real check-in and membership', (await c('attendance')) === before && (await c('memberships')) === 1,
  `${await c('attendance')} visits, ${await c('memberships')} memberships`);
let report = null;
try { await db.exec(readFileSync(`${REPO}/scripts/sql/verify/verify0168.sql`, 'utf8')); } catch (e) { report = describe(e); }
check('verify0168 reports all true', /REPORT 0168: wrapper=t(rue)? | base_kept=t(rue)? | base_hidden=t(rue)? | marker=t(rue)?\| base_kept=true \| base_hidden=true \| marker=true/.test(report ?? ''), report ?? 'no report');

console.log(failures ? `\n${failures} FAILED` : '\nall demo part 3 checks passed');
process.exit(failures ? 1 : 0);
