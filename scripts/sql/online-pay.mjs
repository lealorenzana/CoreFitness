/**
 * 0167: members pay their gym by GCash, Maya or bank transfer — the gym's own
 * accounts, a switch the gym owns, the desk confirms every one.
 *
 *   node <repo>/scripts/sql/online-pay.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const OWN = 'a9000000-0000-4000-8000-000000000001';
const DESK = 'a9000000-0000-4000-8000-000000000002';
const MEM = 'a9000000-0000-4000-8000-000000000003';
const MEM2 = 'a9000000-0000-4000-8000-000000000004';
const OWN_B = 'a9000000-0000-4000-8000-000000000005';
const MEM_B = 'a9000000-0000-4000-8000-000000000006';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = async (uid, gym = GYM_A) => {
  await db.exec(`reset role; update profiles set active_gym_id = '${gym}' where id = '${uid}';
    select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
};
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const QR = 'data:image/png;base64,iVBORw0KGgo=';

await owner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@pay-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Santos', '${n}@pay-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B') on conflict do nothing;
  ${person(OWN, 'olive', 'admin')} ${person(DESK, 'dan', 'staff')} ${person(MEM, 'mia', 'member')}
  ${person(MEM2, 'mark', 'member')} ${person(OWN_B, 'bea', 'admin')} ${person(MEM_B, 'ben', 'member')}
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${DESK}', 'staff', 'active'),
    ('${GYM_A}', '${MEM}', 'member', 'active'), ('${GYM_A}', '${MEM2}', 'member', 'active'),
    ('${GYM_B}', '${OWN_B}', 'admin', 'active'), ('${GYM_B}', '${MEM_B}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${MEM}', '${GYM_A}', 'QR-PAY-1'), ('${MEM2}', '${GYM_A}', 'QR-PAY-2'), ('${MEM_B}', '${GYM_B}', 'QR-PAY-3')
  on conflict do nothing;
`);
const plan = (await one(`select id, price from membership_plans where gym_id = '${GYM_A}' and is_active and price > 0 order by price limit 1`));
const free = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and is_active and coalesce(price, 0) = 0 limit 1`));
check('fixture: the gym has a paid plan', !!plan, 'no paid plan');

// ---- the owner sets the gym's methods up ------------------------------------------------------------
await as(DESK);
check('the desk cannot add a payment method', /owner/.test(await tryExec(`select save_gym_payment_method(null, 'gcash', 'GCash', 'G Fitness', '0917 000 0000', '${QR}', null, true)`) ?? ''));
await as(OWN);
const gcash = (await one(`select save_gym_payment_method(null, 'gcash', 'GCash', 'G Fitness Mamburao', '0917 000 0000', '${QR}', 'Send the exact amount.', true) as id`)).id;
const bank = (await one(`select save_gym_payment_method(null, 'bank', 'BPI', 'G Fitness', '1234-5678-90', null, null, false, 1) as id`)).id;
check('the owner sees both methods, hidden one included', (await one(`select count(*)::int n from gym_payment_methods`)).n === 2);
await owner();
check('saving a method is in the activity log', (await one(`select count(*)::int n from activity_log where action = 'gym.payment_method_saved' and gym_id = '${GYM_A}'`)).n === 2);

// ---- what a member sees --------------------------------------------------------------------------------
await as(MEM);
const seen = (await db.query(`select label, qr_image from gym_payment_methods order by sort_order`)).rows;
check('a member sees only the active method, with its QR code', seen.length === 1 && seen[0].label === 'GCash' && seen[0].qr_image === QR, JSON.stringify(seen));
check('a member cannot write a method directly', !!(await tryExec(`insert into gym_payment_methods (gym_id, kind, label) values ('${GYM_A}', 'gcash', 'Mine')`))
  || (await one(`select count(*)::int n from gym_payment_methods where label = 'Mine'`)).n === 0);
await as(MEM_B, GYM_B);
check('another gym\'s member sees none of this gym\'s methods', (await one(`select count(*)::int n from gym_payment_methods`)).n === 0);

// ---- the switch -----------------------------------------------------------------------------------------
await as(OWN);
await db.exec(`select set_gym_module('online_pay', false)`);
await as(MEM);
check('switched off: members see no methods', (await one(`select count(*)::int n from gym_payment_methods`)).n === 0);
check('…and cannot pay online', /front desk only/.test(await tryExec(`select request_renewal_paid('${plan.id}', '${gcash}', 'GC123456')`) ?? ''));
await as(OWN);
check('switched off: the owner still sees them to set up', (await one(`select count(*)::int n from gym_payment_methods`)).n === 2);
await db.exec(`select set_gym_module('online_pay', true)`);

// ---- paying -------------------------------------------------------------------------------------------
await as(MEM);
check('a hidden method cannot be used', /not offered/.test(await tryExec(`select request_renewal_paid('${plan.id}', '${bank}', 'BPI998877')`) ?? ''));
check('a reference is required', /reference/.test(await tryExec(`select request_renewal_paid('${plan.id}', '${gcash}', ' ')`) ?? ''));
if (free) check('a free plan is not paid online', /free/.test(await tryExec(`select request_renewal_paid('${free.id}', '${gcash}', 'GC000111')`) ?? ''));
check('a date in the future is refused', /last 7 days/.test(await tryExec(`select request_renewal_paid('${plan.id}', '${gcash}', 'GC000222', null, (now() at time zone 'Asia/Manila')::date + 1)`) ?? ''));
const req = (await one(`select request_renewal_paid('${plan.id}', '${gcash}', 'gc 7788 99', '${QR}') as id`)).id;
await owner();
const row = await one(`select status, pay_reference, pay_amount, pay_method_label, pay_proof, note from renewal_requests where id = '${req}'`);
check('the request carries the payment: method, reference, amount from the plan, screenshot',
  row.status === 'open' && row.pay_reference === 'GC 7788 99' && Number(row.pay_amount) === Number(plan.price)
    && row.pay_method_label === 'GCash' && row.pay_proof === QR && row.note === 'Paid by GCash', JSON.stringify(row));
check('the owner and the desk are told', (await one(`select count(*)::int n from notifications where title = 'Online payment to confirm' and user_id in ('${OWN}', '${DESK}')`)).n === 2);
check('it is in the activity log', (await one(`select count(*)::int n from activity_log where action = 'payment.sent_online' and member_id = '${MEM}'`)).n === 1);

await as(MEM2);
check('the same reference cannot be claimed twice', /already been sent/.test(await tryExec(`select request_renewal_paid('${plan.id}', '${gcash}', 'GC 7788 99')`) ?? ''));
await as(DESK);
const vis = (await one(`select count(*)::int n from renewal_requests where id = '${req}' and pay_reference is not null`)).n;
check('the desk sees the payment to confirm', vis === 1);
await db.exec(`select decline_renewal_request('${req}', 'No payment with that reference reached our GCash')`);
await as(MEM2);
check('a declined reference is free again', !(await tryExec(`select request_renewal_paid('${plan.id}', '${gcash}', 'GC 7788 99')`)));

await owner();
await db.exec(`update gym_modules set enabled = true where feature_key = 'online_pay'`);
check('verify0167 runs', !!(await tryExec((await import('node:fs')).readFileSync(`${REPO}/scripts/sql/verify/verify0167.sql`, 'utf8'))));

console.log(failures ? `\n${failures} FAILED` : '\nall 0167 checks passed');
process.exit(failures ? 1 : 0);
