/**
 * 0204: the desk books a member into a class — confirmed, told, never past a
 * full class or a started one; a member cannot use it; the member's plan and
 * quota still apply; a desk booking is never held by the waiver.
 *
 *   node <repo>/scripts/sql/desk-class-booking.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2040000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), M2 = id('0b'), T = id('0c'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['m2', M2, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@deskbook-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@deskbook-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-DB1'), ('${M2}', '${GYM}', 'QR-DB2') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, class_bookings_per_week, is_active)
    values ('${id('f1')}', '${GYM}', 'Two a week', 500, 30, 'premium', true, true, 2, true),
           ('${id('f2')}', '${GYM}', 'No classes', 0, null, 'free', false, false, null, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${M}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
           ('${M2}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, null, true);
  update gym_settings set waiver_required = true where gym_id = '${GYM}';
  insert into gym_waivers (gym_id, version, title, body, published_at) values ('${GYM}', 1, 'Waiver', 'Train at your own risk.', now()) on conflict do nothing;`);

let n = 0;
const newClass = async (cap = 10, at = `now() + interval '${n + 2} days'`) => (await owner(), await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Class ${++n}', '${T}', ${cap}, ${at}, 60) returning id`)).id;

let c = await newClass();
await as(ST);
let r = await tryOne(`select desk_book_class('${M}', '${c}') id`);
check('the desk books a member into a class (waiver unsigned — the desk is never held by it)', r.err === null, r.err ?? '');
await owner();
const b = await one(`select status::text s, decided_by_role r from bookings where member_id = '${M}' and class_id = '${c}'`);
check('…confirmed at once, decided by the front desk', b?.s === 'approved' && b?.r === 'staff', JSON.stringify(b));
check('…and the member is told', !!(await one(`select 1 x from notifications where user_id = '${M}' and title = 'Booked by the gym'`)));
await as(ST);
check('not twice', /already booked/.test((await tryOne(`select desk_book_class('${M}', '${c}')`)).err ?? ''));

const full = await newClass(1);
await as(AD);
await db.exec(`select desk_book_class('${M}', '${full}')`);
check('never past a full class', /full/.test((await tryOne(`select desk_book_class('${M2}', '${full}')`)).err ?? ''));

const past = await newClass(10, `now() - interval '1 hour'`);
await as(AD);
check('never into a class that has started', /already started/.test((await tryOne(`select desk_book_class('${M}', '${past}')`)).err ?? ''));

c = await newClass();
await as(AD);
r = await tryOne(`select desk_book_class('${M2}', '${c}')`);
check("the member's plan still applies (a plan without classes)", /does not include class booking/.test(r.err ?? ''), r.err ?? 'booked');
check("…and the weekly quota (two a week, two already)", /allows 2 class/.test((await tryOne(`select desk_book_class('${M}', '${c}')`)).err ?? ''));

await as(M);
check('a member cannot use it', /Only the gym/.test((await tryOne(`select desk_book_class('${M}', '${await (async () => { const x = await newClass(); await as(M); return x; })()}')`)).err ?? ''));
await as(M);
check("a member's own booking is still held by the unsigned waiver", /waiver/.test((await tryOne(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${M}', '${await (async () => { const x = await newClass(); await as(M); return x; })()}', 'pending') returning id`)).err ?? ''));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'desk_book_class(uuid, uuid)', 'execute') x`)).x);
check('marker', (await one(`select migration_0204_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0204 checks passed');
process.exit(failures ? 1 : 0);
