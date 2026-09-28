/**
 * 0138: the grace period, reminders before a lock, receipt numbers, capacity.
 *
 *   node <repo>/scripts/sql/platform-billing.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  pa: 'a1000000-0000-4000-8000-000000000009', ownerA: 'a1000000-0000-4000-8000-000000000001',
  deskA: 'a1000000-0000-4000-8000-000000000002', memA: 'a1000000-0000-4000-8000-000000000004',
  ownerB: 'b1000000-0000-4000-8000-000000000001',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const setPaid = (gym, offset) => db.exec(`reset role; update gyms set paid_until = ${TODAY} + (${offset}) where id = '${gym}';`);
const notes = async (uid) => (await all(`select title from notifications where user_id = '${uid}' and (metadata ->> 'dedupe') like 'billing:%' order by created_at`)).map((r) => r.title);

await db.exec(`reset role;
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b', 'Gym B', 'trial');
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@bill-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@bill-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'),
    ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.pa}', '${P.ownerA}', '${P.deskA}', '${P.memA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';
  update gyms set onboarded_at = now();`);

// ---- 1. the grace period --------------------------------------------------------------------
await setPaid(GYM_A, -8);
await as(P.ownerA);
check('default grace 7: 8 days late is read-only', (await one(`select gym_lock_reason() as r`)).r === 'overdue');
check('an owner cannot change the grace period', !!(await tryExec(`select set_billing_settings(30, '{7}', 'X', null, null, null, null)`)));
check('an owner cannot read the platform settings', (await all(`select * from billing_settings()`)).length === 0);
await as(P.pa);
check('the grace period is 0 to 60', !!(await tryExec(`select set_billing_settings(90, '{7}', 'Core Fitness', null, null, null, null)`)));
await db.exec(`select set_billing_settings(10, '{3,7,7,14}', 'Core Fitness', 'Mamburao, Occidental Mindoro', 'billing@corefitness.test', null, 'Thank you.')`);
const bs = await one(`select * from billing_settings()`);
check('saved, reminder days de-duplicated', bs.grace_days === 10 && JSON.stringify(bs.reminder_days) === '[14,7,3]', JSON.stringify(bs));
await as(P.ownerA);
check('grace 10: 8 days late is not locked yet', (await one(`select gym_lock_reason() as r`)).r === null);
const st = (await one(`select gym_state() as s`)).s;
check('and gym_state says due, not overdue', st === 'due', st);
const sub = await one(`select * from my_gym_subscription()`);
check('the owner is shown the read-only date', sub.grace_days === 10 && sub.days_left === -8, JSON.stringify(sub));
await setPaid(GYM_A, -11);
await as(P.ownerA);
check('grace 10: 11 days late is read-only', (await one(`select gym_lock_reason() as r`)).r === 'overdue'
  && (await one(`select gym_state() as s`)).s === 'overdue');
await as(P.deskA);
check('the desk is not shown the bill', (await all(`select * from my_gym_subscription()`)).length === 0);

// ---- 2. reminders ---------------------------------------------------------------------------
await setPaid(GYM_A, 7);
await as(P.ownerA);
check('7 days out: one reminder', (await one(`select billing_reminders_sweep() as n`)).n === 1);
check('the sweep again: nothing new', (await one(`select billing_reminders_sweep() as n`)).n === 0);
await db.exec('reset role');
check('the owner has it, worded', (await notes(P.ownerA)).join() === 'Your Core Fitness plan runs out in 7 days');
check('the desk and members do not', (await notes(P.deskA)).length === 0 && (await notes(P.memA)).length === 0);
await setPaid(GYM_A, 5);
await as(P.ownerA);
check('5 days is not a reminder day', (await one(`select billing_reminders_sweep() as n`)).n === 0);
await setPaid(GYM_A, 0);
await as(P.memA);
check('any page load in the gym sweeps it: due today', (await one(`select billing_reminders_sweep() as n`)).n === 1);
await setPaid(GYM_A, 7);
await as(P.ownerB);
check('another gym\'s owner sweeps only their own', (await one(`select billing_reminders_sweep() as n`)).n === 0);
await setPaid(GYM_A, -12);
await as(P.pa);
check('the platform sweeps every gym: read-only told', (await one(`select billing_reminders_sweep() as n`)).n === 1);
await db.exec('reset role');
check('the read-only message', (await notes(P.ownerA)).includes('Your gym is read-only'));

// ---- 3. receipts ----------------------------------------------------------------------------
await as(P.pa);
const p1 = (await one(`select record_gym_payment('${GYM_A}', 1999, ${TODAY} + 30) as id`)).id;
const p2 = (await one(`select record_gym_payment('${GYM_B}', 999, ${TODAY} + 30) as id`)).id;
await db.exec('reset role');
const nos = await all(`select receipt_no from gym_payments order by receipt_no`);
const yr = (await one(`select extract(year from ${TODAY})::int as y`)).y;
check('receipt numbers in order', nos.map((r) => r.receipt_no).join() === `CF-${yr}-00001,CF-${yr}-00002`, JSON.stringify(nos));
check('a caller cannot choose the number', !(await tryExec(`insert into gym_payments (gym_id, amount, covers_until, receipt_no) values ('${GYM_B}', 1, ${TODAY}, 'CF-${yr}-00001')`))
  && (await one(`select count(distinct receipt_no)::int as n, count(*)::int as c from gym_payments`)).n === 3);
check('another year starts at 1', !(await tryExec(`insert into gym_payments (gym_id, amount, paid_on, covers_until) values ('${GYM_B}', 1, '2030-01-05', '2030-02-05')`))
  && !!(await one(`select 1 as x from gym_payments where receipt_no = 'CF-2030-00001'`)));
check('a receipt number never changes', !!(await tryExec(`update gym_payments set receipt_no = 'CF-X' where id = '${p1}'`)));
await as(P.ownerA);
const r = await one(`select * from gym_payment_receipt('${p1}')`);
check('the owner prints their own receipt, with our details', r?.receipt_no === `CF-${yr}-00001` && r.business_address === 'Mamburao, Occidental Mindoro' && r.gym_name, JSON.stringify(r));
check('but not another gym\'s', (await all(`select * from gym_payment_receipt('${p2}')`)).length === 0);
check('their list is theirs', (await all(`select * from my_gym_payments()`)).map((x) => x.id).join() === p1);
await as(P.deskA);
check('the desk gets no receipts', (await all(`select * from gym_payment_receipt('${p1}')`)).length === 0
  && (await all(`select * from my_gym_payments()`)).length === 0);

// ---- 4. capacity ----------------------------------------------------------------------------
await db.exec(`reset role;
  insert into storage.buckets (id, name) values ('media', 'media') on conflict do nothing;
  insert into storage.objects (bucket_id, name, metadata) values
    ('media', 'gyms/${GYM_A}/logos/a.png', '{"size": 300000}'), ('media', 'gyms/${GYM_A}/events/b.jpg', '{"size": 200000}'),
    ('media', 'gyms/${GYM_B}/logos/c.png', '{"size": 1000}');`);
await as(P.pa);
const cap = await all(`select * from platform_capacity()`);
const k = (kind, key) => cap.find((x) => x.kind === kind && (!key || x.key === key));
check('database size against 500 MB', Number(k('database')?.used) > 0 && Number(k('database').cap) === 500 * 1024 * 1024);
check('storage by bucket, and in all', Number(k('bucket', 'media')?.used) === 501000 && Number(k('storage')?.used) === 501000);
check('each gym\'s own folder', Number(k('gym', GYM_A)?.used) === 500000 && Number(k('gym', GYM_B)?.used) === 1000);
check('the biggest tables', cap.filter((x) => x.kind === 'table').length === 8);
check('a small project rings no capacity bell', !(await all(`select kind from platform_bell()`)).some((x) => x.kind === 'capacity'));
await as(P.ownerA);
check('a gym owner sees no capacity', (await all(`select * from platform_capacity()`)).length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0138 checks passed');
process.exit(failures ? 1 : 0);
