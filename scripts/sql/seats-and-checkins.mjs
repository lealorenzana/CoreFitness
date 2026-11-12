/**
 * 0251: a class never takes more people than it has places, and the database — not only the
 * desk app — refuses a second check-in on the same day and a check-in on a frozen or expired
 * membership. Found by the staging QA run (CAP-APPROVE, ATT-DUP-DB, ATT-EXPIRED-DB).
 *
 *   node <repo>/scripts/sql/seats-and-checkins.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0251 … replays the schema without the fix, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2510000-0000-4000-8000-0000000000${n}`;
const [M1, M2, M3, M4, M5, M6] = ['01', '02', '03', '04', '05', '06'].map(id);
const T = id('0c'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryRun = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = [['m1', M1, 'member'], ['m2', M2, 'member'], ['m3', M3, 'member'], ['frozen', M4, 'member'],
  ['expired', M5, 'member'], ['pass', M6, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']];
await db.exec(`
  ${people.map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@seats-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@seats-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${M1}', '${GYM}', 'QR-S1'), ('${M2}', '${GYM}', 'QR-S2'), ('${M3}', '${GYM}', 'QR-S3'),
    ('${M4}', '${GYM}', 'QR-S4'), ('${M5}', '${GYM}', 'QR-S5'), ('${M6}', '${GYM}', 'QR-S6') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, class_bookings_per_week, is_active)
    values ('${id('f1')}', '${GYM}', 'Unlimited', 900, 30, 'premium', true, true, null, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ('${M1}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
    ('${M2}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
    ('${M3}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
    ('${M4}', '${GYM}', '${id('f1')}', 'frozen', manila_today() - 10, manila_today() + 30, false),
    ('${M5}', '${GYM}', '${id('f1')}', 'active', manila_today() - 40, manila_today() - 1, false),
    ('${M6}', '${GYM}', '${id('f1')}', 'active', manila_today() - 40, manila_today() - 1, false);
  update gym_settings set waiver_required = false where gym_id = '${GYM}';
  insert into day_passes (gym_id, member_id, day) values ('${GYM}', '${M6}', manila_today());`);

let n = 0;
const newClass = async (cap) => (await owner(), await one(`insert into classes (gym_id, name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('${GYM}', 'Seats ${++n}', '${T}', ${cap}, now() + interval '${n + 2} days', 60) returning id`)).id;
const request = async (m, c) => { await as(m); return tryRun(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${m}', '${c}', 'pending')`); };
const approved = async (c) => (await owner(), Number((await one(`select count(*) n from bookings where class_id = '${c}' and status = 'approved'`)).n));
const approve = async (m, c) => { await as(T); return tryRun(`update bookings set status = 'approved' where class_id = '${c}' and member_id = '${m}' and status <> 'approved'`); };

// ---- seats: a member's request ----
let c = await newClass(2);
check('two members ask for a two-place class', (await request(M1, c)) === null && (await request(M2, c)) === null);
const third = await request(M3, c);
check('a third request is refused: the class is full (join the waitlist)', /full/i.test(third ?? ''), third ?? 'stored');

// ---- seats: the coach's approval (the staging run approved 50 on 20) ----
c = await newClass(2);
await owner();   // three requests already there, as on staging (written before 0251 or by the database)
await db.exec(`insert into bookings (gym_id, member_id, class_id, status) values
  ('${GYM}', '${M1}', '${c}', 'pending'), ('${GYM}', '${M2}', '${c}', 'pending'), ('${GYM}', '${M3}', '${c}', 'pending')`);
check('the coach approves the first two', (await approve(M1, c)) === null && (await approve(M2, c)) === null, String(await approved(c)));
const over = await approve(M3, c);
check('approving a third into two places is refused', /full/i.test(over ?? ''), over ?? `approved (${await approved(c)} of 2)`);
check('…and the class holds exactly two', (await approved(c)) === 2, String(await approved(c)));
await as(T);
check('the coach can still reject the extra request', (await tryRun(`update bookings set status = 'rejected' where class_id = '${c}' and member_id = '${M3}'`)) === null);
await owner();
await db.exec(`delete from bookings where class_id = '${c}' and member_id = '${M2}'`);   // a bare 'cancelled' is refused (0081)
check('a place that frees up can be given again', (await approve(M3, c)) === null && (await approved(c)) === 2, String(await approved(c)));
await as(AD);
const desk = await tryRun(`select desk_book_class('${M2}', '${c}')`);
check("the desk's booking still stops at a full class", /full/i.test(desk ?? ''), desk ?? 'booked');

// ---- check-ins ----
const checkIn = async (m) => { await as(ST); return tryRun(`insert into attendance (gym_id, member_id, method, recorded_by) values ('${GYM}', '${m}', 'qr', '${ST}')`); };
const visits = async (m) => (await owner(), Number((await one(`select count(*) n from attendance where member_id = '${m}'`)).n));
check('the desk checks in an active member', (await checkIn(M1)) === null, String(await visits(M1)));
const dup = await checkIn(M1);
check('a second check-in the same day is refused by the database', /already checked in today/.test(dup ?? ''), dup ?? 'stored');
check('…so the member has one visit today', (await visits(M1)) === 1, String(await visits(M1)));
const fr = await checkIn(M4);
check('a frozen membership is refused', /frozen/.test(fr ?? ''), fr ?? 'stored');
const ex = await checkIn(M5);
check('an expired membership is refused', /expired/.test(ex ?? ''), ex ?? 'stored');
check("an expired membership with today's day pass gets in", (await checkIn(M6)) === null);
await owner();
check('the database itself (seeds, sweeps) stands aside', (await tryRun(`insert into attendance (gym_id, member_id, method) values ('${GYM}', '${M1}', 'manual')`)) === null);
await as(ST);
const off = await one(`select record_offline_checkin('${M2}', now(), 'qr', null, 'desk') r`);
check('the offline sync still records a check-in', off?.r === 'recorded', JSON.stringify(off));
check('…and a live scan after it is refused as a repeat', /already checked in today/.test((await checkIn(M2)) ?? ''));

await owner();
check('the helpers are closed to visitors',
  !(await one(`select has_function_privilege('anon', 'checkin_refusal(uuid, uuid, timestamptz)', 'execute')
               or has_function_privilege('anon', 'class_seat_counts(uuid, uuid)', 'execute') x`)).x);
check('marker', (await one(`select migration_0251_applied() ok`).catch(() => ({ ok: false }))).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0251 checks passed');
process.exit(failures ? 1 : 0);
