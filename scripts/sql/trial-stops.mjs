/**
 * 0198: a free trial stops on its last day — 7 days, no grace, every write at
 * the gym refused from the next day, lifted by a payment; a paid gym that is
 * late still gets its grace; Gym #1 never locks; the platform's date is worded
 * as a trial.
 *
 *   node <repo>/scripts/sql/trial-stops.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_1 = 'c0f1e55e-0000-4000-8000-000000000001';
const PA = 'a1000000-0000-4000-8000-000000000009';
const OWNER = 'a1000000-0000-4000-8000-000000000001';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const lock = async (id) => { await db.exec('reset role'); return (await one(`select gym_lock_reason('${id}') as r`)).r; };
const state = async (id) => { await db.exec('reset role'); return (await one(`select gym_state('${id}') as s`)).s; };

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@trial-test.com', '{}'), ('${OWNER}', 'o@trial-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values
    ('${PA}', 'P', 'A', 'pa@trial-test.com', 'active', 'member'), ('${OWNER}', 'O', 'W', 'o@trial-test.com', 'active', 'member') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  update profiles set active_gym_id = '${GYM_1}' where id = '${PA}';`);

check('the trial plan is 7 days', (await one(`select trial_days from platform_plans where key = 'trial'`)).trial_days === 7);

await as(PA);
const gym = (await one(`select create_gym('Iron Temple', 'iron-temple') as id`)).id;
await db.exec(`reset role;
  insert into gym_roles (gym_id, user_id, role, status) values ('${gym}', '${OWNER}', 'admin', 'active') on conflict do nothing;
  update profiles set active_gym_id = '${gym}' where id = '${OWNER}';`);
const left = (await one(`select (paid_until - ${TODAY})::int as d from gyms where id = '${gym}'`)).d;
check('a new gym on the trial has 7 days', left === 7, String(left));
check('…and is open while they last', (await lock(gym)) === null && (await state(gym)) !== 'trial_ended');

// The last day: still open.
await db.exec(`reset role; update gyms set paid_until = ${TODAY} where id = '${gym}';`);
check('on its last day it is still open', (await lock(gym)) === null);

// The day after: locked, no grace.
await db.exec(`reset role; update gyms set paid_until = ${TODAY} - 1 where id = '${gym}';`);
check('the day after, it is locked as trial_ended — no grace days', (await lock(gym)) === 'trial_ended', String(await lock(gym)));
check('gym_state says trial_ended', (await state(gym)) === 'trial_ended', String(await state(gym)));
await as(OWNER);
const sub = await one(`select lock_reason, grace_days, read_only_on = paid_until + 1 as next_day, on_trial from my_gym_subscription()`);
check('the owner’s page: trial_ended, no grace, locked from the next day',
  sub?.lock_reason === 'trial_ended' && sub.grace_days === 0 && sub.next_day && sub.on_trial, JSON.stringify(sub));
check('every write at the gym is refused in SQL (gym_writable)', (await one(`select gym_writable() as w`)).w === false);
const err = await tryExec(`update gym_settings set tagline = 'x' where gym_id = '${gym}'`);
const changed = (await one(`select count(*)::int as n from gym_settings where gym_id = '${gym}' and tagline = 'x'`)).n;
check('…an owner’s settings edit changes nothing', changed === 0, err ?? '');
await as(OWNER);
await db.exec(`select billing_reminders_sweep()`);
await db.exec('reset role');
const note = await one(`select title, message from notifications where user_id = '${OWNER}' and title = 'Your free trial has ended'`);
check('the owner is told the trial ended and the app is paused for everyone', !!note && /paused for everyone/.test(note.message), JSON.stringify(note));

// A payment lifts it.
await db.exec(`reset role; insert into gym_payments (gym_id, amount, covers_until, receipt_no) values ('${gym}', 1499, ${TODAY} + 30, 'CF-TEST-198');
  update gyms set paid_until = ${TODAY} + 30 where id = '${gym}';`);
check('a payment lifts the lock', (await lock(gym)) === null && (await state(gym)) !== 'trial_ended');

// A gym that has paid and is late keeps the grace period.
await db.exec(`reset role; update gyms set paid_until = ${TODAY} - 2 where id = '${gym}';`);
check('a paid gym 2 days late is not locked (grace)', (await lock(gym)) === null, String(await lock(gym)));
await db.exec(`reset role; update gyms set paid_until = ${TODAY} - (platform_grace_days() + 1) where id = '${gym}';`);
check('…past the grace it is overdue, not trial_ended', (await lock(gym)) === 'overdue');

// Gym #1 never locks.
check('Gym #1 is never locked', (await lock(GYM_1)) === null);

// The platform sets a trial's end, worded as a trial.
await as(PA);
const g2 = (await one(`select create_gym('Second Gym', 'second-gym') as id`)).id;
await db.exec(`reset role; insert into gym_roles (gym_id, user_id, role, status) values ('${g2}', '${OWNER}', 'admin', 'active') on conflict do nothing;`);
await as(PA);
await db.exec(`select platform_set_billing('${g2}', ${TODAY} + 3, 'Extended for the demo')`);
await db.exec('reset role');
const left2 = (await one(`select (paid_until - ${TODAY})::int as d from gyms where id = '${g2}'`)).d;
const told = await one(`select title from notifications where user_id = '${OWNER}' and gym_id = '${g2}' and title like 'Your free trial ends%'`);
check('the platform moves a trial’s end, and the owner is told it is the trial', left2 === 3 && !!told, `${left2} ${JSON.stringify(told)}`);
await as(OWNER);
const denied = await tryExec(`select platform_set_billing('${g2}', ${TODAY} + 90, null)`);
check('an owner cannot move their own trial', !!denied);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
