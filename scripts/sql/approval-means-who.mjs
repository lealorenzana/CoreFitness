/**
 * 0203: "who approves" means who approves. With "Coach approves" the owner and
 * desk cannot decide or reverse a booking; with "Coach, then desk" they confirm
 * only what the coach accepted; with no active coach to decide, the gym may;
 * cancelling is untouched.
 *
 *   node <repo>/scripts/sql/approval-means-who.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2030000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), T = id('0c'), AD = id('0d'), ST = id('0e'), T2 = id('0f');
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
  ${[['m', M, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff'], ['coach2', T2, 'trainer']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@who-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@who-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength'), ('${T2}', '${GYM}', 'Boxing') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-WHO') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Booker', 500, 30, 'premium', true, true, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    values ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30);`);

let n = 0;
const newClass = async (coach = T) => (await owner(), await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Class ${++n}', ${coach ? `'${coach}'` : 'null'}, 10, now() + interval '${n} days', 60) returning id`)).id;
const setModes = async (c, p) => { await as(AD); await db.exec(`select set_booking_approval('${c}', '${p}')`); };
const book = async (classId) => {
  await as(M);
  await db.exec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${M}', '${classId}', 'pending')`);
  await owner();
  return (await one(`select id from bookings where member_id = '${M}' and class_id = '${classId}'`)).id;
};
const status = async (b) => (await owner(), (await one(`select status::text s from bookings where id = '${b}'`)).s);
const decideAs = async (who, b, s) => { await as(who); return tryExec(`update bookings set status = '${s}' where id = '${b}'`); };

// ---- Coach approves ----
await setModes('coach', 'coach');
let b = await book(await newClass());
let err = await decideAs(AD, b, 'approved');
check('coach mode: the owner cannot approve a request', err !== null && /coach decides/.test(err) && (await status(b)) === 'pending', err ?? 'no error');
check('…nor decline it', (await decideAs(AD, b, 'rejected')) !== null && (await status(b)) === 'pending');
check('…the coach can', (await decideAs(T, b, 'approved')) === null && (await status(b)) === 'approved');
check('…and the owner cannot reverse the coach', (await decideAs(AD, b, 'rejected')) !== null && (await status(b)) === 'approved');
await as(AD);
const reason = (await one(`select key from cancellation_reasons where applies_to in ('any', 'staff') and not needs_note and is_active order by sort_order limit 1`))?.key ?? 'other';
await as(AD);
err = await tryExec(`select cancel_booking('class', '${b}', '${reason}', 'Member asked at the desk')`);
check('…but the gym can still cancel it for the member (cancel_booking)', err === null && (await status(b)) === 'cancelled', err ?? '');

// ---- no active coach: nothing is stranded ----
b = await book(await newClass(null));
check('a class with no coach: the owner may decide', (await decideAs(AD, b, 'approved')) === null && (await status(b)) === 'approved');
b = await book(await newClass(T2));
await owner(); await db.exec(`update gym_roles set status = 'suspended' where user_id = '${T2}'`);
check('a suspended coach: the owner may decide their requests', (await decideAs(AD, b, 'approved')) === null && (await status(b)) === 'approved');
await owner(); await db.exec(`update gym_roles set status = 'active' where user_id = '${T2}'`);

// ---- Coach, then desk ----
await setModes('coach_desk', 'coach_desk');
b = await book(await newClass());
check('coach then desk: the owner cannot confirm before the coach accepts', (await decideAs(AD, b, 'approved')) !== null && (await status(b)) === 'pending');
check('…nor decline in the coach\'s place', (await decideAs(AD, b, 'rejected')) !== null && (await status(b)) === 'pending');
await decideAs(T, b, 'approved');
check('…the coach accepts (still pending, waiting for the desk)', (await status(b)) === 'pending');
check('…then the owner confirms', (await decideAs(AD, b, 'approved')) === null && (await status(b)) === 'approved');

// ---- Desk approves: unchanged ----
await setModes('desk', 'desk');
b = await book(await newClass());
check('desk mode: the coach cannot decide', (await decideAs(T, b, 'approved')) !== null && (await status(b)) === 'pending');
check('…the owner decides', (await decideAs(AD, b, 'approved')) === null && (await status(b)) === 'approved');
check('…and may reverse', (await decideAs(AD, b, 'rejected')) === null && (await status(b)) === 'rejected');

// ---- a sweep (no signed-in user) is never held back ----
await setModes('coach', 'coach');
b = await book(await newClass());
await owner();
check('a sweep with no user may still settle a request', (await tryExec(`update bookings set status = 'rejected' where id = '${b}'`)) === null && (await status(b)) === 'rejected');

check('the helper is not callable from the app', !(await one(`select has_function_privilege('authenticated', 'booking_coach_can_decide(uuid, uuid)', 'execute') x`)).x);
check('marker', (await one(`select migration_0203_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0203 checks passed');
process.exit(failures ? 1 : 0);
