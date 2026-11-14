/**
 * 0259: time slots and a crowd limit, every rule the owner's. The grid cut from the opening hours (and edited by
 * hand, no overlaps); members book within the gym's days-ahead and per-day limits; a full slot refuses the next;
 * at the door a booking keeps a place, walk-ins come in while there is room ('reserve'), or only bookers ('required');
 * the desk's "Let in anyway" only past a slot reason and only when the owner allows it; cancelling follows the
 * owner's cut-off; "Time slots" is a gym style; only the owner sets any of it.
 *
 *   node <repo>/scripts/sql/time-slots.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0259 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (s) => `a2590000-0000-4000-8000-0000000000${s}`;
const AD = id('ad'), ST = id('5e'), M = [id('01'), id('02'), id('03'), id('04'), id('05')];
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
const people = [['own', AD, 'admin'], ['desk', ST, 'staff'], ...M.map((u, i) => [`m${i}`, u, 'member'])];
await db.exec(`
  ${people.map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@slots-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@slots-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ${M.map((u, i) => `('${u}', '${GYM}', 'QR-SL${i}')`).join(', ')} on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Floor', 900, 30, 'premium', true, true, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ${M.map((u) => `('${u}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false)`).join(', ')};
  update gym_settings set opening_time = '06:00', closing_time = '22:00', closed_days = '{}', waiver_required = false where gym_id = '${GYM}';`);

const today = (await one(`select manila_today()::text d`)).d;
const tomorrow = (await one(`select (manila_today() + 1)::text d`)).d;
const dowToday = (await one(`select extract(dow from manila_today())::int d`)).d;
const dowTomorrow = (dowToday + 1) % 7;

// 1 — the owner sets it up.
await as(ST);
check('the desk cannot switch slots on', (await tryRun(`select set_gym_module('slots', true)`)) !== null);
await as(AD);
check('the owner switches slots on', (await tryRun(`select set_gym_module('slots', true)`)) === null);
const made = (await one(`select fill_slots_from_hours(90, 2) n`)).n;
check('cut from the opening hours: 11 slots a day (6 AM – 10 PM, 90 min, the last one shorter) × 7', made === 77, String(made));
const last = await one(`select starts::text s, ends::text e from slot_template_list() where day_of_week = 1 order by starts desc limit 1`);
check('…the last slot ends at closing time', last.s === '21:00:00' && last.e === '22:00:00', JSON.stringify(last));
check('a slot that overlaps another on the same day is refused', /overlaps/.test((await tryRun(`select save_slot_template(null, 1::smallint, '06:30', '07:00', 5)`)) ?? ''));
await as(M[0]);
check('a member cannot change the grid', /Only the gym owner/.test((await tryRun(`select fill_slots_from_hours(60, 10)`)) ?? ''));
check('…nor the rules', /Only the gym owner/.test((await tryRun(`select set_slot_settings('required', 7, 1, 0, true)`)) ?? ''));

// Today: one slot covering the whole day, room for 2 — so the door rules can be tested at any hour.
await as(AD);
await db.exec(`delete from slot_templates where gym_id = '${GYM}' and day_of_week = ${dowToday}`.replace('delete', 'select 1; delete'));
await owner();
await db.exec(`delete from slot_templates where gym_id = '${GYM}' and day_of_week = ${dowToday}`);
await as(AD);
await db.exec(`select save_slot_template(null, ${dowToday}::smallint, '00:00', '23:59', 2)`);

// 2 — members book; a full slot refuses the next.
await as(M[0]);
check('a member books today’s slot', (await tryRun(`select book_slot('${today}', '00:00')`)) === null);
await as(M[1]);
await db.exec(`select book_slot('${today}', '00:00')`);
await as(M[2]);
check('…the third is told it is full', /full/.test((await tryRun(`select book_slot('${today}', '00:00')`)) ?? ''));
await as(M[0]);
const seen = await one(`select booked, my_booking is not null mine from gym_slots('${today}'::date, 0) where starts = '00:00'`);
check('the member sees how full it is and their own place', seen && seen.booked === 2 && seen.mine === true, JSON.stringify(seen));

// 3 — the door, 'reserve': bookers in; a walk-in only while there is room.
const checkIn = async (m) => { await as(ST); return tryRun(`insert into attendance (gym_id, member_id, method, recorded_by, source) values ('${GYM}', '${m}', 'qr', '${ST}', 'desk')`); };
check('a member who booked gets in', (await checkIn(M[0])) === null);
check('a walk-in is refused while the slot is full of bookings', /full — only members who booked it/.test((await checkIn(M[2])) ?? ''));
await as(ST);
check('…the desk can let them in anyway (the owner allows it)', (await tryRun(`select desk_let_in('${M[2]}')`)) === null);
await owner();
check('…and that is in the activity log', ((await one(`select count(*)::int n from activity_log where action = 'checkin.override' and gym_id = '${GYM}'`)).n) === 1);

// 4 — 'required', with the desk override off.
await as(AD);
await db.exec(`select set_slot_settings('required', 7, 1, 0, false)`);
check('required: someone who did not book is refused', /for members who booked it/.test((await checkIn(M[3])) ?? ''));
await as(ST);
check('…and the desk cannot let them in when the owner says the slots are firm', /slots are firm/.test((await tryRun(`select desk_let_in('${M[3]}')`)) ?? ''));
check('the desk’s override never skips another rule (already in today)', !!(await tryRun(`select desk_let_in('${M[0]}')`)));

// 5 — the owner's booking rules: per day, days ahead, cancelling.
await as(AD);
await db.exec(`select set_slot_settings('reserve', 7, 1, 0, true)`);
const t1 = (await one(`select starts::text s from slot_template_list() where day_of_week = ${dowTomorrow} order by starts limit 1`)).s;
const t2 = (await one(`select starts::text s from slot_template_list() where day_of_week = ${dowTomorrow} order by starts offset 1 limit 1`)).s;
await as(M[4]);
check('a member books tomorrow', (await tryRun(`select book_slot('${tomorrow}', '${t1}')`)) === null);
check('…but not a second slot that day (one a day here)', /already have a slot that day/.test((await tryRun(`select book_slot('${tomorrow}', '${t2}')`)) ?? ''));
await as(AD);
await db.exec(`select set_slot_settings('reserve', 7, 2, 0, true)`);
await as(M[4]);
check('…two a day once the owner allows it', (await tryRun(`select book_slot('${tomorrow}', '${t2}')`)) === null);
await as(AD);
await db.exec(`select set_slot_settings('reserve', 0, 2, 0, true)`);
await as(M[3]);
check('today only: tomorrow is refused', /today's slots only/.test((await tryRun(`select book_slot('${tomorrow}', '${t1}')`)) ?? ''));
// A slot at midnight tonight is always less than 24 hours away, whatever time the test runs.
await as(AD);
await db.exec(`select save_slot_template(null, ${dowTomorrow}::smallint, '00:00', '00:30', 5); select set_slot_settings('reserve', 7, 2, 1440, true)`);
await as(M[3]);
const late = (await one(`select book_slot('${tomorrow}', '00:00') b`)).b;
check('the owner’s cut-off (24 hours): a member can no longer cancel a slot starting sooner', /at least 1440 minutes before/.test((await tryRun(`select cancel_slot('${late}')`)) ?? ''));
await as(ST);
check('…the desk still can', (await tryRun(`select cancel_slot('${late}')`)) === null);
await as(AD);
await db.exec(`select set_slot_settings('reserve', 7, 2, 0, true)`);
await as(M[4]);
const bid2 = (await one(`select my_booking b from gym_slots('${tomorrow}'::date, 0) where my_booking is not null order by starts limit 1`)).b;
check('with no cut-off, a member cancels their own before it starts', (await tryRun(`select cancel_slot('${bid2}')`)) === null);
await owner();
const theirs = (await one(`select id from slot_bookings where member_id = '${M[1]}' and cancelled_at is null limit 1`)).id;
await as(M[0]);
check('…but never someone else’s', /not yours/.test((await tryRun(`select cancel_slot('${theirs}')`)) ?? ''));

// 6 — the desk sees who booked; a member does not.
await as(ST);
check('the desk sees who booked today', ((await all(`select * from gym_slot_bookings('${today}'::date)`)).length) === 2);
await as(M[0]);
check('a member cannot list other people’s bookings', /Only the owner or the front desk/.test((await tryRun(`select * from gym_slot_bookings('${today}'::date)`)) ?? ''));

// 7 — a gym style, and the tables are closed.
await as(AD);
const ch = (await all(`select setting from gym_style_changes(array['open_gym'])`)).map((r) => r.setting);
check('"Time slots" is a gym style: without it the switch goes off', ch.includes('slots'), JSON.stringify(ch));
await owner();
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${M[0]}', false); set role authenticated;`);
const direct = await tryRun(`insert into slot_bookings (gym_id, member_id, slot_date, starts, ends) values ('${GYM}', '${M[0]}', '${tomorrow}', '06:00', '07:30')`);
check('no one writes a booking past the rules (no insert policy)', direct !== null, String(direct));
await owner();
check('the inner helpers are closed', !(await one(`select has_function_privilege('authenticated', 'slot_refusal(uuid, uuid, timestamptz)', 'execute')
  or has_function_privilege('authenticated', 'slot_occupancy(uuid, date, time, time)', 'execute') x`)).x);
check('both tables are on the tenancy register', (await one(`select tenancy_gym_tables() @> array['slot_templates', 'slot_bookings'] ok`)).ok === true);
check('marker', (await one(`select migration_0259_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0259 checks passed');
process.exit(failures ? 1 : 0);
