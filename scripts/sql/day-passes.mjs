/**
 * 0194: a day pass bought in the app — only by someone without a running
 * membership, at the gym's own price, to the gym's own PayMongo account; for
 * that Manila day the desk lets them in and (where the owner allows it) they
 * book a class held that day; the money is an ordinary payment.
 *
 *   node <repo>/scripts/sql/day-passes.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1940000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), DESK = id('02'), GUEST = id('03'), MEMBER = id('04');
const ACC = id('a1'), P_PAID = id('f1'), C_TODAY = id('c1'), C_TOMORROW = id('c2');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const service = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  create schema if not exists vault;
  create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
  create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default null)
    returns uuid language sql as $$ insert into vault.secrets (secret, name) values (new_secret, new_name) returning id $$;
  create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  ${[['owner', OWNER, 'admin'], ['desk', DESK, 'staff'], ['guest', GUEST, 'member'], ['member', MEMBER, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@dp-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@dp-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active')
      on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${GUEST}', '${GYM}', 'QDP1'), ('${MEMBER}', '${GYM}', 'QDP2') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, tier, price, duration_days, is_active, can_book_classes)
    values ('${P_PAID}', '${GYM}', 'Monthly DP', 'premium', 800, 30, true, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    values ('${MEMBER}', '${GYM}', '${P_PAID}', 'active', manila_today() - 3, manila_today() + 27),
           ('${GUEST}', '${GYM}', '${P_PAID}', 'expired', manila_today() - 60, manila_today() - 30);
  update gym_settings set day_pass_on = true, day_pass_price = 150, day_pass_classes = false where gym_id = '${GYM}';
  insert into classes (id, gym_id, name, scheduled_at, duration_minutes, capacity)
    values ('${C_TODAY}', '${GYM}', 'Evening HIIT', ((manila_today()::timestamp + interval '23 hours 30 minutes') at time zone 'Asia/Manila'), 30, 20),
           ('${C_TOMORROW}', '${GYM}', 'Morning Yoga', ((manila_today()::timestamp + interval '1 day 7 hours') at time zone 'Asia/Manila'), 60, 20);
  grant execute on function payment_account_store(uuid, uuid, text, uuid, text, text, text, text, uuid), paymongo_settle(text, text, int, text),
    paymongo_attach(uuid, text, text) to service_role;`);
await service();
await db.exec(`select payment_account_store('${ACC}', '${GYM}', 'gym', null, null, 'sk_test_daypass0001', 'hook_dp', 'whsk_dp', '${OWNER}')`);

// ---- who may buy, at what price ----
await as(MEMBER);
check('a member with a running plan is told no pass is needed', /no day pass needed/.test(await tryExec(`select paymongo_prepare_member('day_pass')`) ?? ''));
await as(GUEST);
const dp = (await one(`select my_day_pass() d`)).d;
check('a lapsed member is offered a day pass at the gym\'s price', dp.on && dp.needed && Number(dp.price) === 150 && dp.online && dp.today === false, JSON.stringify(dp));
const co = (await one(`select paymongo_prepare_member('day_pass') p`)).p;
check('the pass is the gym\'s price, to the gym\'s own account', Number(co.amount) === 150);
await owner();
check('…charged to the gym\'s account', (await one(`select account from paymongo_checkouts where id = '${co.id}'`)).account === ACC);

// ---- before paying ----
await as(DESK);
check('before paying, the desk sees no pass', (await one(`select member_has_day_pass('${GUEST}') ok`)).ok === false);

// ---- paid ----
await service();
await db.exec(`select paymongo_attach('${co.id}', 'cs_dp', 'https://x')`);
check('paid: settled', (await one(`select paymongo_settle('cs_dp', 'pay_dp', 15000, 'qrph') r`)).r === 'settled');
await owner();
check('…as an ordinary payment', (await one(`select count(*)::int n from payments where member_id = '${GUEST}' and amount = 150 and notes like 'Day pass%' and status = 'completed'`)).n === 1);
await as(DESK);
check('the desk sees today\'s pass', (await one(`select member_has_day_pass('${GUEST}') ok`)).ok === true);
await as(GUEST);
check('the member sees it too', (await one(`select my_day_pass() d`)).d.today === true);
check('…and cannot buy a second for the same day', /already have today/.test(await tryExec(`select paymongo_prepare_member('day_pass')`) ?? ''));
check('…nor read the table', (await all(`select * from day_passes`)).length === 0);

// ---- a class that day ----
check('booking a class with a day pass is refused while the owner has not allowed it',
  !!(await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${GUEST}', '${C_TODAY}', 'pending')`)));
await as(DESK);
check('the desk cannot change that rule', !!(await tryExec(`select set_day_pass_classes(true)`)));
await as(OWNER);
await db.exec(`select set_day_pass_classes(true)`);
await as(GUEST);
check('allowed: a class held today can be booked', !(await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${GUEST}', '${C_TODAY}', 'pending')`)));
check('…but not tomorrow\'s', !!(await tryExec(`insert into bookings (gym_id, member_id, class_id, status) values ('${GYM}', '${GUEST}', '${C_TOMORROW}', 'pending')`)));

// ---- the gym has not switched day passes on ----
await owner();
await db.exec(`update gym_settings set day_pass_on = false where gym_id = '${GYM}'`);
await owner();
await db.exec(`delete from day_passes where member_id = '${GUEST}'`);
await as(GUEST);
check('a gym not selling day passes refuses one', /does not sell day passes/.test(await tryExec(`select paymongo_prepare_member('day_pass')`) ?? ''));

await owner();
check('marker', (await one(`select migration_0194_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0194 checks passed');
process.exit(failures ? 1 : 0);
