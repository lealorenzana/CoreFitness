/**
 * 0180: who approves a booking — instant / coach / desk / coach then desk / off,
 * chosen per kind (classes, 1-on-1) by the owner; and a member can no longer
 * insert their own booking already approved.
 *
 *   node <repo>/scripts/sql/booking-approvals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const M = 'a1800000-0000-4000-8000-00000000000a';
const T = 'a1800000-0000-4000-8000-00000000000c';
const AD = 'a1800000-0000-4000-8000-00000000000d';
const ST = 'a1800000-0000-4000-8000-00000000000e';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, id, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@appr-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k}', 'T', '${k}@appr-test.com', 'active', '${role}', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-APPR') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('a1800000-0000-4000-8000-0000000000f1', '${GYM}', 'Booker', 500, 30, 'premium', true, true, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    values ('${M}', '${GYM}', 'a1800000-0000-4000-8000-0000000000f1', 'active', manila_today() - 1, manila_today() + 30);`);

let n = 0;
const newClass = async () => (await owner(), await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Class ${++n}', '${T}', 10, now() + interval '${n} days', 60) returning id`)).id;
const setModes = async (c, p) => { await as(AD); await db.exec(`select set_booking_approval('${c}', '${p}')`); };
const book = async (classId, status = 'pending') => {
  await as(M);
  const err = await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${M}', '${classId}', '${status}')`);
  await owner();
  const row = err ? null : await one(`select id, status::text s, decided_by_role, coach_ok_by from bookings where member_id = '${M}' and class_id = '${classId}'`);
  return { err, row };
};
let h = 9;
const pt = async () => {
  await as(M);
  const at = `date_trunc('day', now()) + interval '20 days' + interval '${h++} hours'`;
  const err = await tryExec(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status) values ('${GYM}', '${M}', '${T}', ${at}, 60, 'approved')`);
  await owner();
  const row = err ? null : await one(`select id, status::text s from pt_sessions where member_id = '${M}' order by created_at desc nulls last, starts_at desc limit 1`);
  return { err, row };
};

// ---- the default is what every gym has today: the coach decides ----
await as(M);
check('a gym that chose nothing: the coach decides (0071)', (await one(`select * from my_booking_modes()`)).class_mode === 'coach');
let b = await book(await newClass(), 'approved');
check('a member cannot insert their own booking already approved — it is pending', b.row?.s === 'pending', b.err ?? JSON.stringify(b.row));
await as(T);
await db.exec(`update bookings set status = 'approved' where id = '${b.row.id}'`);
await owner();
check('…and the coach approves it', (await one(`select status::text s from bookings where id = '${b.row.id}'`)).s === 'approved');

// ---- instant ----
await setModes('instant', 'instant');
b = await book(await newClass());
check('instant: a class booking is confirmed at once', b.row?.s === 'approved' && b.row.decided_by_role === 'system', b.err ?? JSON.stringify(b.row));
let p = await pt();
check('instant: so is a 1-on-1', p.row?.s === 'approved', p.err ?? JSON.stringify(p.row));
await owner();
check("…and the coach's alert says booked, not requested",
  !!(await one(`select 1 x from notifications where user_id = '${T}' and title = 'New 1-on-1 booked'`)));

// ---- desk ----
await setModes('desk', 'desk');
b = await book(await newClass());
check('desk: a booking waits', b.row?.s === 'pending');
await as(T);
check('desk: the coach cannot decide it', (await tryExec(`update bookings set status = 'approved' where id = '${b.row.id}'`)) !== null);
await as(AD);
await db.exec(`update bookings set status = 'approved' where id = '${b.row.id}'`);
await owner();
check('desk: the gym (the owner, for classes) can', (await one(`select status::text s from bookings where id = '${b.row.id}'`)).s === 'approved');

p = await pt();
await as(T);
check('desk: the coach cannot decide a 1-on-1 either', (await tryExec(`update pt_sessions set status = 'approved' where id = '${p.row.id}'`)) !== null);
await as(ST);
await db.exec(`update pt_sessions set status = 'approved' where id = '${p.row.id}'`);
await owner();
check('desk: the front desk decides a 1-on-1', (await one(`select status::text s from pt_sessions where id = '${p.row.id}'`)).s === 'approved');

// ---- coach then desk ----
await setModes('coach_desk', 'coach_desk');
b = await book(await newClass());
await as(T);
await db.exec(`update bookings set status = 'approved', approved_at = now(), approved_by = '${T}' where id = '${b.row.id}'`);
await owner();
let r = await one(`select status::text s, coach_ok_by, approved_at from bookings where id = '${b.row.id}'`);
check("coach then desk: the coach's yes is recorded and the booking still waits (no approval time on it)", r.s === 'pending' && r.coach_ok_by === T && r.approved_at === null, JSON.stringify(r));
check('…and the owner is asked', !!(await one(`select 1 x from notifications where user_id = '${AD}' and title = 'Coach accepted — your turn'`)));
check('…not the front desk, who cannot confirm a class booking', !(await one(`select 1 x from notifications where user_id = '${ST}' and title = 'Coach accepted — your turn'`)));
await as(AD);
await db.exec(`update bookings set status = 'approved' where id = '${b.row.id}'`);
await owner();
check('…then the desk confirms it', (await one(`select status::text s from bookings where id = '${b.row.id}'`)).s === 'approved');
b = await book(await newClass());
await as(T);
await db.exec(`update bookings set status = 'rejected' where id = '${b.row.id}'`);
await owner();
check("coach then desk: the coach's no is final", (await one(`select status::text s from bookings where id = '${b.row.id}'`)).s === 'rejected');

// ---- off ----
await setModes('off', 'coach');
b = await book(await newClass());
check('off: a member cannot book classes in the app, and is told why', b.err !== null && /front desk/.test(b.err), b.err ?? '');
await setModes('coach', 'off');
await as(M);
check('off for 1-on-1: a member cannot book one in the app', (await tryExec(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes) values ('${GYM}', '${M}', '${T}', now() + interval '30 days', 60)`)) !== null);
await as(ST);
check('…but the front desk can book it for them', (await tryExec(`insert into pt_sessions (gym_id, member_id, trainer_id, starts_at, duration_minutes, status) values ('${GYM}', '${M}', '${T}', now() + interval '31 days', 60, 'approved')`)) === null);
await setModes('off', 'coach');
p = await pt();
check('off for classes leaves 1-on-1 alone (coach decides, pending)', p.row?.s === 'pending', p.err ?? JSON.stringify(p.row));

// ---- who may change it ----
await as(ST);
check('only the owner chooses', (await tryExec(`select set_booking_approval('instant', 'instant')`)) !== null);
await as(AD);
check('a made-up choice is refused', (await tryExec(`select set_booking_approval('maybe', 'coach')`)) !== null);
await owner();
check('marker', (await one(`select migration_0180_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0180 checks passed');
process.exit(failures ? 1 : 0);
