/**
 * 0200: the door — a member's activity pick fills an empty check-in tag (the
 * desk's tag wins, and which one it was is the trigger's to say); coaches
 * check in only when the owner turns it on, once a day, never as a member
 * visit (no points); the switches are the owner's; other gyms see nothing.
 *
 *   node <repo>/scripts/sql/door-checkins.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM2 = 'c0f1e55e-0000-4000-8000-0000000002a0';
const id = (n) => `a2000000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c'), M2 = id('0d'), CO = id('0e'), CO2 = id('0f'), AD2 = id('1a'), M3 = id('1b');
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

await owner();
await db.exec(`
  insert into gyms (id, name, slug) values ('${GYM2}', 'Other Gym', 'other-gym-0200') on conflict do nothing;
  insert into gym_settings (gym_id, gym_name) select '${GYM2}', 'Other Gym' where not exists (select 1 from gym_settings where gym_id = '${GYM2}');
  ${[['own', AD, 'admin', GYM], ['desk', ST, 'staff', GYM], ['mem', M, 'member', GYM], ['mem2', M2, 'member', GYM],
     ['coach', CO, 'trainer', GYM], ['coach2', CO2, 'trainer', GYM], ['own2', AD2, 'admin', GYM2], ['mem3', M3, 'member', GYM2]].map(([k, u, role, g]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@door-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@door-test.com', 'active', '${role}', '${g}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${g}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into member_profiles (profile_id, gym_id) values ('${M}', '${GYM}'), ('${M2}', '${GYM}') on conflict do nothing;
  update gym_settings set activity_options = array['Gym floor','Class','Cardio'] where gym_id = '${GYM}';`);
const checkIn = (member, activity = null) =>
  one(`insert into attendance (member_id, method, recorded_by, activity, activity_by, source)
       values ('${member}', 'qr', '${ST}', ${activity ? `'${activity}'` : 'null'}, 'desk', 'kiosk') returning activity, activity_by, source`);

// ---- the switches ----
const s = await one(`select member_activity_pick, coach_checkin_on from gym_settings where gym_id = '${GYM}'`);
check('members pick their activity by default; coach check-in is off by default', s.member_activity_pick === true && s.coach_checkin_on === false, JSON.stringify(s));
await as(ST);
check('the desk cannot change the switches', (await tryExec(`select set_door_settings(true, true)`)) !== null);
await as(M);
check('a member cannot either', (await tryExec(`select set_door_settings(null, true)`)) !== null);

// ---- a member's pick ----
await as(M);
check('a pick outside the gym\'s activities is refused, in words', /not one of this gym/.test((await tryExec(`select * from set_my_checkin_pick('Zumba', false)`)) ?? ''));
let p = await one(`select * from set_my_checkin_pick('Class', true)`);
check('a member picks Class and makes it their usual', p.today === 'Class' && p.usual === 'Class', JSON.stringify(p));
p = await one(`select * from set_my_checkin_pick('Cardio', null)`);
check('a different pick just for today leaves the usual alone', p.today === 'Cardio' && p.usual === 'Class', JSON.stringify(p));
p = await one(`select * from set_my_checkin_pick('Class', true)`);
await as(M2);
check('another member cannot see that pick', (await all(`select * from checkin_picks`)).length === 0);
await as(CO);
check('a coach cannot see members\' picks', (await all(`select * from checkin_picks`)).length === 0);
await as(ST);
check('the desk sees picks (to show them at the counter)', (await all(`select * from checkin_picks where member_id = '${M}'`)).length === 1);
check('nobody writes a pick directly — no write policy', (await tryExec(`insert into checkin_picks (member_id, today) values ('${M2}', 'Cardio')`)) !== null);

let r = await checkIn(M);
check('a check-in with no desk tag takes the member\'s pick, marked as theirs', r.activity === 'Class' && r.activity_by === 'member', JSON.stringify(r));
check('…whatever the client claimed activity_by was, and the source is kept', r.source === 'kiosk');
await owner(); await db.exec(`delete from attendance where member_id = '${M}'`);
await as(ST);
r = await checkIn(M, 'Cardio');
check('the desk\'s tag wins over the pick, marked as the desk\'s', r.activity === 'Cardio' && r.activity_by === 'desk', JSON.stringify(r));
await owner(); await db.exec(`delete from attendance where member_id = '${M}'`);

await as(M);
p = await one(`select * from set_my_checkin_pick(null, false)`);
check('"nothing today" clears today and, unticked, the usual', p.today === null && p.usual === null, JSON.stringify(p));
await as(ST);
r = await checkIn(M);
check('…and the check-in is left untagged, never a guess', r.activity === null && r.activity_by === null, JSON.stringify(r));
await owner(); await db.exec(`delete from attendance where member_id = '${M}'`);

// A usual from an earlier day fills today; a "nothing" picked today does not fall back to it.
await owner();
await db.exec(`insert into checkin_picks (gym_id, member_id, usual, today, today_on) values ('${GYM}', '${M2}', 'Cardio', 'Class', manila_today() - 3)`);
await as(ST);
r = await checkIn(M2);
check('yesterday\'s pick is stale: the usual fills today', r.activity === 'Cardio' && r.activity_by === 'member', JSON.stringify(r));
await owner();
await db.exec(`delete from attendance where member_id = '${M2}'; update checkin_picks set today = null, today_on = manila_today() where member_id = '${M2}'`);
await as(ST);
r = await checkIn(M2);
check('"nothing today" beats the usual', r.activity === null, JSON.stringify(r));

// The owner turns picking off: the pick is ignored and members cannot set one.
await as(AD);
await db.exec(`select set_door_settings(false, null)`);
await as(M);
check('with picking off, a member is told the desk tags check-ins', /tags check-ins at the desk/.test((await tryExec(`select * from set_my_checkin_pick('Class', true)`)) ?? ''));
await owner(); await db.exec(`delete from attendance where member_id = '${M2}'; update checkin_picks set today = 'Class', today_on = manila_today() where member_id = '${M2}'`);
await as(ST);
r = await checkIn(M2);
check('…and an old pick no longer tags anything', r.activity === null, JSON.stringify(r));
await as(AD);
await db.exec(`select set_door_settings(true, null)`);

// ---- coaches ----
await as(ST);
check('coach check-in is refused while the owner has it off, in words', /Coach check-in is off/.test((await tryExec(`select * from record_coach_checkin('${CO}', 'qr', 'desk')`)) ?? ''));
await as(AD);
await db.exec(`select set_door_settings(null, true)`);
await as(ST);
const before = (await one(`select count(*)::int n from point_ledger`)).n;
const attBefore = (await one(`select count(*)::int n from attendance`)).n;
const c = await one(`select * from record_coach_checkin('${CO}', 'qr', 'kiosk')`);
check('the desk checks a coach in', !!c.id && c.first_name === 'coach', JSON.stringify(c));
check('a coach is never a member visit: no attendance row, no points', (await one(`select count(*)::int n from attendance`)).n === attBefore
  && (await one(`select count(*)::int n from point_ledger`)).n === before);
check('once a day, said with their name', /coach already checked in today/.test((await tryExec(`select * from record_coach_checkin('${CO}', 'qr', 'desk')`)) ?? ''));
check('a member\'s id is not a coach code', /not one of this gym/.test((await tryExec(`select * from record_coach_checkin('${M}', 'manual', 'desk')`)) ?? ''));
const dc = await all(`select * from door_coaches()`);
check('the desk lists the gym\'s coaches with today\'s check-in', dc.length === 2 && dc.find((x) => x.trainer_id === CO)?.checked_in_at && !dc.find((x) => x.trainer_id === CO2)?.checked_in_at, JSON.stringify(dc));
await as(CO);
check('a coach cannot check themselves in', (await tryExec(`select * from record_coach_checkin('${CO}', 'qr', 'desk')`)) !== null);
check('a coach reads their own check-ins', (await all(`select * from coach_checkins`)).length === 1);
check('…and not the door list', (await all(`select * from door_coaches()`)).length === 0);
await as(CO2);
check('another coach sees none of them', (await all(`select * from coach_checkins`)).length === 0);
check('nobody inserts directly', (await tryExec(`insert into coach_checkins (trainer_id) values ('${CO2}')`)) !== null);
await as(M);
check('a member cannot check a coach in', (await tryExec(`select * from record_coach_checkin('${CO2}', 'qr', 'desk')`)) !== null);

// ---- another gym ----
await as(AD2);
check('another gym\'s owner sees no coach check-ins and no picks', (await all(`select * from coach_checkins`)).length === 0 && (await all(`select * from checkin_picks`)).length === 0);
check('…cannot check this gym\'s coach in (coach check-in is off there anyway, and the coach is not theirs)',
  (await tryExec(`select set_door_settings(null, true)`)) === null && /not one of this gym/.test((await tryExec(`select * from record_coach_checkin('${CO}', 'qr', 'desk')`)) ?? ''));
check('…and lists none of this gym\'s coaches', (await all(`select * from door_coaches()`)).length === 0);

// ---- undo ----
await as(ST);
await db.exec(`select undo_coach_checkin('${c.id}')`);
check('the desk undoes a coach check-in today', (await all(`select * from coach_checkins`)).length === 0);
await owner();
await db.exec(`insert into coach_checkins (gym_id, trainer_id, check_in_time, day) values ('${GYM}', '${CO2}', now() - interval '2 days', manila_today() - 2)`);
const old = (await one(`select id from coach_checkins where trainer_id = '${CO2}'`)).id;
await as(ST);
check('…but not an earlier day', /Only today/.test((await tryExec(`select undo_coach_checkin('${old}')`)) ?? ''));

// ---- walk-ins who keep coming ----
await owner();
await db.exec(`update gym_settings set day_pass_on = true, day_pass_price = 150 where gym_id = '${GYM}'`);
await as(ST);
const guest = (await one(`select * from record_guest_visit(null, 'Lyn Soriano', '09175550199', 'day', 'cash')`)).guest_id;
await owner();
await db.exec(`insert into guest_visits (gym_id, guest_id, kind, amount, visit_day) values
  ('${GYM}', '${guest}', 'day', 150, manila_today() - 3), ('${GYM}', '${guest}', 'day', 150, manila_today() - 9),
  ('${GYM}', '${guest}', 'day', 150, manila_today() - 40)`);
await as(ST);
const fg = await all(`select * from frequent_guests(30, 3)`);
check('a guest with 3 visits in 30 days is listed, with what they paid (older visits not counted)',
  fg.length === 1 && fg[0].visits === 3 && Number(fg[0].spent) === 450, JSON.stringify(fg));
await as(M);
check('a member cannot list guests', (await all(`select * from frequent_guests(30, 1)`)).length === 0);

// ---- grants ----
await owner();
const g = await one(`select has_function_privilege('anon', 'record_coach_checkin(uuid, text, text)', 'execute') a,
  has_function_privilege('anon', 'set_my_checkin_pick(text, boolean)', 'execute') b,
  has_function_privilege('authenticated', 'trg_attendance_pick()', 'execute') c,
  has_function_privilege('anon', 'door_coaches()', 'execute') d`);
check('nothing here is callable by a visitor; the trigger by nobody', !g.a && !g.b && !g.c && !g.d, JSON.stringify(g));
check('both tables are on the tenancy list', (await one(`select tenancy_gym_tables() @> array['checkin_picks','coach_checkins'] ok`)).ok === true);
check('marker', (await one(`select migration_0200_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0200 checks passed');
process.exit(failures ? 1 : 0);
