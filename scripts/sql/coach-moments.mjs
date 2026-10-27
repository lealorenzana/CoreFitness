/**
 * 0218: the coach's moments. Milestones are counted from what happened (sessions run, people coached,
 * ratings), each tier plays once — the newest tier only — and a coach cannot move the markers by hand;
 * the first open of the day is once a day; a trainee's win reaches the coaches they train with now, and
 * only what the member shares with coaches (records follow "workouts").
 *
 *   node <repo>/scripts/sql/coach-moments.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2180000-0000-4000-8000-0000000000${n}`;
const T = id('0a'), A = id('0b'), B = id('0c'), C = id('0d'), T2 = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const wins = async (coach) => (await all(`select title, message, metadata from notifications where user_id = '${coach}' and type = 'trainee_win' order by created_at`));

await owner();
await db.exec(`
  ${[['tess', T, 'trainer'], ['ana', A, 'member'], ['ben', B, 'member'], ['cy', C, 'member'], ['tom', T2, 'trainer']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@cm-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k[0].toUpperCase() + k.slice(1)}', 'Test', '${k}@cm-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id) values ('${T}', '${GYM}'), ('${T2}', '${GYM}') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${A}', '${GYM}', 'QR-CM-A'), ('${B}', '${GYM}', 'QR-CM-B'), ('${C}', '${GYM}', 'QR-CM-C') on conflict do nothing;`);

// Ten 1-on-1s with Ana that have happened, one a day; one ahead (not run yet).
// Seed rows with the gym's booking rules off (entitlement, clashes): what is under test is the counting.
let err = await tryExec(`
  set session_replication_role = replica;
  insert into pt_sessions (gym_id, trainer_id, member_id, starts_at, duration_minutes, status)
  select '${GYM}', '${T}', '${A}', date_trunc('hour', now()) - make_interval(days => d), 60, 'approved' from generate_series(2, 11) d;
  insert into pt_sessions (gym_id, trainer_id, member_id, starts_at, duration_minutes, status)
  values ('${GYM}', '${T}', '${A}', date_trunc('hour', now()) + interval '3 days', 60, 'approved');
  -- A class she taught that happened, with Ben booked; and an empty one, which was not run.
  insert into classes (id, gym_id, name, trainer_id, level, capacity, scheduled_at, duration_minutes) values
    ('${id('c1')}', '${GYM}', 'CM HIIT', '${T}', 'beginner', 10, now() - interval '1 day 3 hours', 45),
    ('${id('c2')}', '${GYM}', 'CM Empty', '${T}', 'beginner', 10, now() - interval '2 days 3 hours', 45);
  insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${B}', '${id('c1')}', 'approved');
  insert into challenges (id, gym_id, title, metric_key, target, starts_on, ends_on) values ('${id('e1')}', '${GYM}', 'CM 10 visits', 'visits', 10, current_date - 7, current_date + 7);
  set session_replication_role = origin;`);
check('setup: sessions, classes and a booking', err === null, err ?? '');

await as(T);
const st = await one(`select celebrate_coach_moments() m`);
const kinds = (m) => (m ?? []).map((x) => `${x.kind}:${x.value}`).join(',');
check('11 sessions run (10 1-on-1s + the class with people) → the 10 moment; 2 people → the 1 moment',
  kinds(st.m) === 'sessions:10,people:1' && st.m[0].total === 11 && st.m[0].next === 25 && st.m[1].total === 2, JSON.stringify(st.m));
check('…played once: asking again gives nothing', ((await one(`select celebrate_coach_moments() m`)).m ?? []).length === 0);
err = await tryExec(`update trainer_profiles set celebrated_sessions = 0 where profile_id = '${T}'`);
check('…and the coach cannot reset a marker by hand', /set by the app/.test(err ?? ''), err ?? 'no error');
err = await tryExec(`update trainer_profiles set bio = 'Coach' where profile_id = '${T}'`);
check('…while editing their own profile still works', err === null, err ?? '');
err = await tryExec(`select * from coach_stats('${GYM}', '${T}')`);
check('coach_stats is not callable by anyone signed in', err !== null, 'it ran');

// Ratings: three, averaging 4.7 → the 4.5★ moment alone (the first rating is folded into it).
await owner();
err = await tryExec(`
  set session_replication_role = replica;
  insert into trainer_ratings (gym_id, member_id, trainer_id, stars, period) values
    ('${GYM}', '${A}', '${T}', 5, date_trunc('month', current_date)), ('${GYM}', '${B}', '${T}', 5, date_trunc('month', current_date)),
    ('${GYM}', '${C}', '${T}', 4, date_trunc('month', current_date));
  set session_replication_role = origin;`);
check('setup: three ratings', err === null, err ?? '');
await as(T);
const r = await one(`select celebrate_coach_moments() m`);
check('three ratings averaging 4.7 → one moment, the 4.5★ average', kinds(r.m) === 'top_rating:4.7', JSON.stringify(r.m));
check('…once', ((await one(`select celebrate_coach_moments() m`)).m ?? []).length === 0);

// Tom: one rating → the first-rating moment.
await owner();
await db.exec(`set session_replication_role = replica; insert into trainer_ratings (gym_id, member_id, trainer_id, stars, period) values ('${GYM}', '${A}', '${T2}', 3, date_trunc('month', current_date)); set session_replication_role = origin;`);
await as(T2);
check('a coach\'s first rating has its own moment', kinds((await one(`select celebrate_coach_moments() m`)).m) === 'first_rating:1');

// The first open of the day.
await as(T);
check('the first open today plays', (await one(`select coach_arrival() a`)).a === true);
check('…the second does not', (await one(`select coach_arrival() a`)).a === false);
await as(A);
check('a member has no coach arrival', (await one(`select coach_arrival() a`)).a === false);
check('…nor coach moments', ((await one(`select celebrate_coach_moments() m`)).m ?? []).length === 0);

// A trainee's win reaches the coach.
await owner();
const ex = await one(`select id from exercises limit 1`);
await db.exec(`
  insert into workout_logs (id, gym_id, member_id, activity, performed_on, completed_at) values
    ('${id('71')}', '${GYM}', '${A}', 'Legs', current_date - 3, now() - interval '3 days'),
    ('${id('72')}', '${GYM}', '${A}', 'Legs', current_date, now());
  insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${id('71')}', '${ex.id}', 1, 5, 75);
  insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${id('72')}', '${ex.id}', 1, 5, 80);`);
let w = await wins(T);
const rec = w.find((x) => x.metadata.kind === 'record');
check('Ana\'s record reaches her coach, in words', !!rec && rec.title === 'Ana set a new record' && /80 kg — best was 75 kg/.test(rec.message) && rec.metadata.member_id === A, JSON.stringify(w));
check('…not a coach she does not train with', (await wins(T2)).length === 0);

await db.exec(`insert into member_share_prefs (gym_id, member_id, share_workouts) values ('${GYM}', '${A}', false)
  on conflict (gym_id, member_id) do update set share_workouts = false`);
await db.exec(`
  insert into workout_logs (id, gym_id, member_id, activity, performed_on, completed_at) values ('${id('73')}', '${GYM}', '${A}', 'Legs', current_date, now());
  insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg) values ('${GYM}', '${id('73')}', '${ex.id}', 1, 5, 85);`);
check('she stops sharing workouts: her next record is not sent', (await wins(T)).filter((x) => x.metadata.kind === 'record').length === 1);

await db.exec(`insert into streak_milestones (gym_id, member_id, weeks) values ('${GYM}', '${A}', 4)`);
w = await wins(T);
check('a streak milestone is sent whatever she shares', w.some((x) => x.title === 'Ana made a 4-week streak'), JSON.stringify(w.map((x) => x.title)));

await db.exec(`insert into streak_milestones (gym_id, member_id, weeks) values ('${GYM}', '${C}', 4)`);
check('Cy, who trains with no one, tells no coach', !(await wins(T)).some((x) => x.metadata.member_id === C));

// A challenge Ben finishes (he took her class yesterday).
const ch = { id: id('e1') };
if (ch) {
  await db.exec(`insert into challenge_participants (gym_id, challenge_id, member_id) values ('${GYM}', '${ch.id}', '${B}') on conflict do nothing;
    update challenge_participants set completed_on = current_date where challenge_id = '${ch.id}' and member_id = '${B}';`);
  check('Ben finishing a challenge reaches the coach of his class', (await wins(T)).some((x) => x.title === 'Ben finished a challenge'));
  await db.exec(`update challenge_participants set completed_on = current_date where challenge_id = '${ch.id}' and member_id = '${B}';`);
  check('…once', (await wins(T)).filter((x) => x.title === 'Ben finished a challenge').length === 1);
} else {
  console.log('skip  no challenge in the fixtures');
}

await as(T);
check('the coach reads their own win alerts', (await all(`select id from notifications where type = 'trainee_win'`)).length >= 2);
await as(A);
check('…the member cannot read them', (await all(`select id from notifications where type = 'trainee_win'`)).length === 0);

await owner();
check('the coaches\' note is there, once', (await one(`select count(*)::int n from app_releases where title = 'Today does more, and your milestones'`)).n === 1);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
