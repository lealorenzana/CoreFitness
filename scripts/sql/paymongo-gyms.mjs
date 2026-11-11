/**
 * 0192: a gym (and a directly-paid coach) connects its own PayMongo account —
 * the keys in the Vault, never readable by a screen; a member's renewal and
 * coaching are priced by the database and charged to the right account; the
 * webhook settles them as the desk would (a payment, the term extended from
 * its end if still running), once.
 *
 *   node <repo>/scripts/sql/paymongo-gyms.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1920000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), DESK = id('02'), MEM = id('03'), COACH = id('04'), OTHER = id('05');
const P_PLAN = id('f1'), P_BIG = id('f2');
const ACC_GYM = id('a1'), ACC_COACH = id('a2');
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
// Supabase Vault, stubbed: a secret is stored and read back by id (the real one encrypts it).
await db.exec(`
  create schema if not exists vault;
  create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
  create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default null)
    returns uuid language sql as $$ insert into vault.secrets (secret, name) values (new_secret, new_name) returning id $$;
  create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  revoke all on schema vault from public, authenticated, anon;
  ${[['owner', OWNER, 'admin'], ['desk', DESK, 'staff'], ['mem', MEM, 'member'], ['coach', COACH, 'trainer'], ['other', OTHER, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@pm2-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@pm2-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active')
      on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${MEM}', '${GYM}', 'QPM1') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, tier, price, duration_days, is_active) values
    ('${P_PLAN}', '${GYM}', 'Monthly Test', 'premium', 800, 30, true),
    ('${P_BIG}', '${GYM}', 'Quarter Test', 'premium', 2100, 90, true);
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    values ('${MEM}', '${GYM}', '${P_PLAN}', 'active', manila_today() - 20, manila_today() + 10);
  grant execute on function payment_account_store(uuid, uuid, text, uuid, text, text, text, text, uuid), payment_account_secret(uuid),
    paymongo_settle(text, text, int, text), paymongo_attach(uuid, text, text) to service_role;`);

// ---- connecting accounts ----
await as(DESK);
check('the desk cannot connect the gym\'s account', !!(await tryExec(`select may_connect_payment_account('gym')`)));
await as(MEM);
check('nor a member', !!(await tryExec(`select may_connect_payment_account('gym')`)));
await as(OWNER);
check('the owner may connect the gym\'s', (await one(`select may_connect_payment_account('gym') r`)).r.gym_id === GYM);
check('a member cannot store a key directly', !!(await tryExec(`select payment_account_store('${ACC_GYM}', '${GYM}', 'gym', null, null, 'sk_test_x', null, null, null)`)));
await service();
await db.exec(`select payment_account_store('${ACC_GYM}', '${GYM}', 'gym', null, 'pk_test_abc', 'sk_test_gymsecret1234', 'hook_1', 'whsk_gymhook', '${OWNER}');
  select payment_account_store('${ACC_COACH}', '${GYM}', 'trainer', '${COACH}', null, 'sk_test_coachkey9876', 'hook_2', 'whsk_coachhook', '${COACH}');`);
check('the Edge Function reads the keys back out of the Vault', (await one(`select payment_account_secret('${ACC_GYM}') s`)).s.secret === 'sk_test_gymsecret1234'
  && (await one(`select payment_account_secret('${ACC_GYM}') s`)).s.webhook_secret === 'whsk_gymhook');
await owner();
check('the table holds no key, only the Vault\'s id', (await one(`select count(*)::int n from payment_accounts where id = '${ACC_GYM}' and secret_id is not null and key_last4 = '1234'`)).n === 1);
await as(OWNER);
const mine = (await one(`select my_payment_account('gym') a`)).a;
check('the owner sees connected, test mode and the last four — never the key', mine.connected && mine.live === false && mine.key_last4 === '1234'
  && !JSON.stringify(mine).includes('sk_test'));
check('a signed-in owner cannot read the keys', !!(await tryExec(`select payment_account_secret('${ACC_GYM}')`)));
check('…nor the table', (await all(`select * from payment_accounts`)).length === 0);
await as(MEM);
check('a member is told the gym takes online payments, and which coaches do', (await one(`select gym_online_pay() p`)).p.gym === true
  && (await one(`select gym_online_pay() p`)).p.trainers.includes(COACH));

// ---- a renewal ----
await as(MEM);
check('a plan with no price, or not on sale, is refused', !!(await tryExec(`select paymongo_prepare_member('membership', '{"plan_id":"${id('ff')}"}')`)));
const ren = (await one(`select paymongo_prepare_member('membership') p`)).p;
check('the renewal is the plan\'s price', Number(ren.amount) === 800 && /Monthly Test/.test(ren.description));
await owner();
check('…charged to the gym\'s own account', (await one(`select account from paymongo_checkouts where id = '${ren.id}'`)).account === ACC_GYM);
const before = (await one(`select expiry_date from memberships where member_id = '${MEM}'`)).expiry_date;
await service();
await db.exec(`select paymongo_attach('${ren.id}', 'cs_ren', 'https://x')`);
check('paid: settled', (await one(`select paymongo_settle('cs_ren', 'pay_ren', 80000, 'gcash') r`)).r === 'settled');
await owner();
const after = (await one(`select expiry_date, status::text st from memberships where member_id = '${MEM}'`));
check('…the term runs on from its end, not from today', Math.round((new Date(after.expiry_date) - new Date(before)) / 86400000) === 30 && after.st === 'active',
  JSON.stringify([before, after]));
const pay = await one(`select amount, method, status, plan_name, invoice_number from payments where member_id = '${MEM}' order by created_at desc limit 1`);
check('…as an ordinary completed payment with a receipt number', pay && Number(pay.amount) === 800 && pay.status === 'completed' && pay.method === 'PayMongo · gcash'
  && pay.plan_name === 'Monthly Test' && !!pay.invoice_number, JSON.stringify(pay));
check('…the member is told, and the desk', (await one(`select count(*)::int n from notifications where user_id = '${MEM}' and title = 'Payment received'`)).n === 1
  && (await one(`select count(*)::int n from notifications where user_id = '${DESK}' and title = 'Paid online'`)).n === 1);
await service();
check('the same webhook twice records nothing more', (await one(`select paymongo_settle('cs_ren', 'pay_ren', 80000) r`)).r === 'already settled');

// 0193: a different plan while a paid one still runs is the desk's — refused online. Since 0243 that is the
// owner's 'desk' rule (the default is keep_days), so this part sets it.
await owner();
await db.exec(`update gym_settings set plan_switch_mode = 'desk' where gym_id = '${GYM}'`);
await as(MEM);
check('a switch mid-term is refused online, with the reason and the way', /You are on Monthly Test until .* switch plans at the desk/.test(
  await tryExec(`select paymongo_prepare_member('membership', '{"plan_id":"${P_BIG}"}')`) ?? ''));
// A checkout opened before that rule, and paid: the money is recorded, the plan is not changed.
await owner();
const legacy = (await one(`insert into paymongo_checkouts (account, gym_id, member_id, purpose, details, amount, description, checkout_session_id)
  values ('${ACC_GYM}', '${GYM}', '${MEM}', 'membership', '{"plan_id":"${P_BIG}"}', 2100, 'Quarter Test', 'cs_legacy') returning id`)).id;
await service();
check('a mid-term switch paid anyway: recorded, left to the desk', /left to the desk/.test((await one(`select paymongo_settle('cs_legacy', 'pay_legacy', 210000, 'qrph') r`)).r));
await owner();
check('…the plan stays, the money is on record, and the desk is told', (await one(`select plan_id from memberships where member_id = '${MEM}'`)).plan_id === P_PLAN
  && (await one(`select count(*)::int n from payments where notes like '%pay_legacy%' and notes like '%not applied%'`)).n === 1
  && (await one(`select count(*)::int n from notifications where user_id = '${DESK}' and title = 'Plan switch paid online'`)).n === 1);
// ---- 0243: the owner's rule for a switch online, mid-term ----
const mem = async () => one(`select plan_id, expiry_date::text e, status::text st from memberships where member_id = '${MEM}' order by created_at desc limit 1`);
const daysFromToday = async (d) => (await one(`select ('${d}'::date - manila_today())::int n`)).n;
await owner();
await db.exec(`update memberships set plan_id = '${P_PLAN}', status = 'active', expiry_date = manila_today() + 26 where member_id = '${MEM}';
  update gym_settings set plan_switch_mode = 'keep_days' where gym_id = '${GYM}'`);
await as(DESK);
await db.exec(`update gym_settings set plan_switch_mode = 'start_now' where gym_id = '${GYM}'`);
await owner();
check('0243: the desk cannot change the rule (only the owner)', (await one(`select plan_switch_mode m from gym_settings where gym_id = '${GYM}'`)).m === 'keep_days');
await owner();
let bad = await tryExec(`update gym_settings set plan_switch_mode = 'anything' where gym_id = '${GYM}'`);
check('…and it is one of the three', !!bad, String(bad));

// keep_days: the new term starts when the current one ends — nothing paid is lost
await as(MEM);
const kd = (await one(`select paymongo_prepare_member('membership', '{"plan_id":"${P_BIG}"}') p`)).p;
check('keep_days: a mid-term switch can be paid online, at the new plan\'s price', Number(kd.amount) === 2100 && /switch from Monthly Test/.test(kd.description), JSON.stringify(kd));
await owner();
check('…the rule is stored on the checkout', (await one(`select details->>'switch' s from paymongo_checkouts where id = '${kd.id}'`)).s === 'keep_days');
await service();
await db.exec(`select paymongo_attach('${kd.id}', 'cs_zkeep', 'https://x')`);
check('…paid: settled', (await one(`select paymongo_settle('cs_zkeep', 'pay_zkeep', 210000, 'qrph') r`)).r === 'settled');
await owner();
let mm = await mem();
check('…switched to the new plan, and its 90 days start after the 26 left (26 + 90 = 116)', mm.plan_id === P_BIG && mm.st === 'active' && (await daysFromToday(mm.e)) === 116, JSON.stringify(mm));
check('…the payment says so', (await one(`select count(*)::int n from payments where notes like '%pay_zkeep%' and notes like '%days kept%' and plan_name = 'Quarter Test' and status = 'completed'`)).n === 1);
check('…recorded once, not twice', (await one(`select count(*)::int n from payments where member_id = '${MEM}' and created_at >= (select paid_at from paymongo_checkouts where checkout_session_id = 'cs_zkeep')`)).n === 1);

// start_now: it starts today and the days left end — even if the owner changes the rule after the checkout opened
await db.exec(`update memberships set plan_id = '${P_PLAN}', status = 'active', expiry_date = manila_today() + 26 where member_id = '${MEM}';
  update gym_settings set plan_switch_mode = 'start_now' where gym_id = '${GYM}'`);
await as(MEM);
const sn = (await one(`select paymongo_prepare_member('membership', '{"plan_id":"${P_BIG}"}') p`)).p;
await owner();
await db.exec(`update gym_settings set plan_switch_mode = 'desk' where gym_id = '${GYM}'`);
await service();
await db.exec(`select paymongo_attach('${sn.id}', 'cs_znow', 'https://x')`);
await db.exec(`select paymongo_settle('cs_znow', 'pay_znow', 210000, 'qrph')`);
await owner();
mm = await mem();
check('start_now: the new plan\'s 90 days start today (the 26 left end) — by the rule the member was shown', mm.plan_id === P_BIG && (await daysFromToday(mm.e)) === 90, JSON.stringify(mm));
check('…the payment says the days left ended, and it is recorded once', (await one(`select count(*)::int n from payments where notes like '%pay_znow%' and notes like '%days left ended%'`)).n === 1
  && (await one(`select count(*)::int n from payments where member_id = '${MEM}' and amount = 2100 and paid_on = manila_today() and created_at >= (select paid_at from paymongo_checkouts where checkout_session_id = 'cs_zkeep')`)).n === 2);

// desk: refused online again (the rule now)
await db.exec(`update memberships set plan_id = '${P_PLAN}', status = 'active', expiry_date = manila_today() + 26 where member_id = '${MEM}'`);
await as(MEM);
check('desk: a mid-term switch is refused online again', /switch plans at the desk/.test(await tryExec(`select paymongo_prepare_member('membership', '{"plan_id":"${P_BIG}"}')`) ?? ''));
check('…a same-plan renewal is still fine under every rule', Number((await one(`select paymongo_prepare_member('membership') p`)).p.amount) === 800);
await owner();
await db.exec(`update memberships set plan_id = '${P_PLAN}' where member_id = '${MEM}'`);

// Once the plan has ended, a different plan is fine online.
await db.exec(`update memberships set status = 'expired', expiry_date = manila_today() - 1 where member_id = '${MEM}'`);
await as(MEM);
const up = (await one(`select paymongo_prepare_member('membership', '{"plan_id":"${P_BIG}"}') p`)).p;
await service();
await db.exec(`select paymongo_attach('${up.id}', 'cs_up', 'https://x')`);
await db.exec(`select paymongo_settle('cs_up', 'pay_up', 210000, 'card')`);
await owner();
check('after it ends, a different plan is bought online and applied', (await one(`select plan_id from memberships where member_id = '${MEM}'`)).plan_id === P_BIG);

// ---- coaching ----
await owner();
const k1 = (await one(`insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, price, started_by)
  values ('${GYM}', '${MEM}', '${COACH}', 'pt', 1, 'awaiting_payment', 'trainer_direct', 1500, 'member') returning id`)).id;
await as(OTHER);
check('another member cannot pay for it', !!(await tryExec(`select paymongo_prepare_member('coaching', '{"coaching_id":"${k1}"}')`)));
await as(MEM);
const kc = (await one(`select paymongo_prepare_member('coaching', '{"coaching_id":"${k1}"}') p`)).p;
await owner();
check('a coach paid directly: charged to the coach\'s own account', (await one(`select account from paymongo_checkouts where id = '${kc.id}'`)).account === ACC_COACH
  && Number(kc.amount) === 1500);
await service();
await db.exec(`select paymongo_attach('${kc.id}', 'cs_k', 'https://x')`);
check('paid: settled', (await one(`select paymongo_settle('cs_k', 'pay_k', 150000, 'gcash') r`)).r === 'settled');
await owner();
const kk = await one(`select status, paid_at is not null paid from coachings where id = '${k1}'`);
check('…the coaching starts, and the gym records no money it never held', kk.status === 'active' && kk.paid
  && (await one(`select count(*)::int n from payments where notes like '%pay_k%'`)).n === 0, JSON.stringify(kk));

// ---- disconnecting ----
await as(OWNER);
await db.exec(`select disconnect_payment_account('gym')`);
check('disconnected: nothing shows as connected', (await one(`select my_payment_account('gym') a`)).a === null);
await as(MEM);
check('…and a renewal online is refused, plainly', /not set up/.test(await tryExec(`select paymongo_prepare_member('membership')`) ?? ''));

await owner();
check('marker', (await one(`select migration_0192_applied() ok`)).ok === true && (await one(`select migration_0193_applied() ok`)).ok === true
  && (await one(`select migration_0243_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0192 checks passed');
process.exit(failures ? 1 : 0);
