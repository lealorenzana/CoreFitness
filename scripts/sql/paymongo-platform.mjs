/**
 * 0191: a gym pays Core Fitness through PayMongo — the price always the
 * database's, the webhook's settle recorded once and only for the amount asked
 * (plan → gym_payments + paid_until; top-up → ai_topups + credits; custom
 * colours → the unlock); custom colour codes need the unlock, presets never,
 * and a gym already on its own code keeps it.
 *
 *   node <repo>/scripts/sql/paymongo-platform.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1910000-0000-4000-8000-0000000000${n}`;
const OWNER = id('01'), DESK = id('02'), PA = id('03');
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
  ${[['owner', OWNER, 'admin'], ['desk', DESK, 'staff'], ['pa', PA, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@pm-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@pm-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active')
      on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`).join('\n')}
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into platform_billing (grace_days) select 7 where not exists (select 1 from platform_billing);
  update gyms set plan = 'starter', paid_until = manila_today() + 5 where id = '${GYM}';
  update gym_settings set accent = 'violet', accent_action = null where gym_id = '${GYM}';
  delete from gym_theme_unlocks where gym_id = '${GYM}';
  grant execute on function paymongo_settle(text, text, int, text), paymongo_attach(uuid, text, text), paymongo_checkout_for(uuid) to service_role;`);

// ---- preparing: the price is the database's ----
await as(DESK);
check('the desk cannot pay Core Fitness', !!(await tryExec(`select paymongo_prepare_platform('gym_subscription', '{"months":1}')`)));
await as(OWNER);
const sub = (await one(`select paymongo_prepare_platform('gym_subscription', '{"months":1}') p`)).p;
check('a month of Starter is the plan\'s price', Number(sub.amount) === 1499 && /Starter plan, 1 month/.test(sub.description), JSON.stringify(sub));
const yr = (await one(`select paymongo_prepare_platform('gym_subscription', '{"months":12}') p`)).p;
check('twelve months is the yearly price', Number(yr.amount) === 14990);
const top = (await one(`select paymongo_prepare_platform('ai_topup', '{"packs":2}') p`)).p;
check('two top-up packs at the platform\'s price', Number(top.amount) === 1398 && /1000 AI coach messages/.test(top.description));
const col = (await one(`select paymongo_prepare_platform('custom_colours') p`)).p;
check('custom colours at the platform\'s price', Number(col.amount) === 499);
check('an unknown purchase is refused', !!(await tryExec(`select paymongo_prepare_platform('free_money')`)));
check('the checkouts table is closed', (await all(`select * from paymongo_checkouts`)).length === 0);

// ---- the Edge Function's side ----
await as(OWNER);
check('a signed-in owner cannot settle a payment', !!(await tryExec(`select paymongo_settle('cs_x', 'pay_x', 149900)`)));
await service();
check('the function reads what to open, in centavos', (await one(`select paymongo_checkout_for('${sub.id}') c`)).c.amount_centavos === 149900);
await db.exec(`select paymongo_attach('${sub.id}', 'cs_sub', 'https://checkout.paymongo.com/cs_sub');
  select paymongo_attach('${top.id}', 'cs_top', 'https://checkout.paymongo.com/cs_top');
  select paymongo_attach('${col.id}', 'cs_col', 'https://checkout.paymongo.com/cs_col');`);
check('a wrong amount is not recorded', (await one(`select paymongo_settle('cs_sub', 'pay_bad', 100) r`)).r === 'amount mismatch');
await owner();
await db.exec(`update paymongo_checkouts set status = 'pending' where id = '${sub.id}'`);
const before = (await one(`select paid_until from gyms where id = '${GYM}'`)).paid_until;
await service();
check('the plan is settled', (await one(`select paymongo_settle('cs_sub', 'pay_sub', 149900, 'gcash') r`)).r === 'settled');
check('…once: the same webhook again records nothing', (await one(`select paymongo_settle('cs_sub', 'pay_sub', 149900, 'gcash') r`)).r === 'already settled');
await owner();
const gp = await one(`select amount, covers_from, covers_until, method, reference from gym_payments where reference = 'pay_sub'`);
const pu = (await one(`select paid_until from gyms where id = '${GYM}'`)).paid_until;
check('…as a gym payment that extends paid_until by a month from where it was', gp && Number(gp.amount) === 1499 && gp.method === 'PayMongo · gcash'
  && new Date(pu) > new Date(before) && Math.round((new Date(pu) - new Date(before)) / 86400000) >= 28, JSON.stringify([gp, before, pu]));
check('…and the owner is told', (await one(`select count(*)::int n from notifications where user_id = '${OWNER}' and title = 'Payment received'`)).n >= 1);
await service();
check('the top-up is settled', (await one(`select paymongo_settle('cs_top', 'pay_top', 139800, 'paymaya') r`)).r === 'settled');
check('a payment id is used once, whichever session claims it', (await one(`select paymongo_settle('cs_col', 'pay_top', 49900) r`)).r === 'payment already used');
await owner();
check('…as 1,000 credits and a paid top-up', (await one(`select balance from gym_ai_credits where gym_id = '${GYM}'`)).balance >= 1000
  && (await one(`select status from ai_topups where reference = 'pay_top'`)).status === 'paid');

// ---- custom colours ----
await as(OWNER);
check('a preset is always free', !(await tryExec(`update gym_settings set accent = 'teal' where gym_id = '${GYM}'`)));
check('a colour code needs the unlock', /one-time purchase/.test(await tryExec(`update gym_settings set accent = '#1F8A70' where gym_id = '${GYM}'`) ?? ''));
await service();
check('paid: unlocked', (await one(`select paymongo_settle('cs_col', 'pay_col', 49900, 'card') r`)).r === 'settled');
await as(OWNER);
check('…and now a colour code saves', !(await tryExec(`update gym_settings set accent = '#1F8A70' where gym_id = '${GYM}'`)));
check('…and colours cannot be bought twice', !!(await tryExec(`select paymongo_prepare_platform('custom_colours')`)));
check('the owner sees what was paid', (await all(`select * from my_paymongo_checkouts() where status = 'paid'`)).length === 3);
await as(PA);
check('the platform sees the online payments', (await all(`select * from platform_paymongo_checkouts()`)).length >= 3);

check('the platform reads and sets the colours price', Number((await one(`select platform_custom_colours_price() p`)).p) === 499
  && !(await tryExec(`select platform_set_custom_colours_price(599)`)) && Number((await one(`select platform_custom_colours_price() p`)).p) === 599);
await as(OWNER);
check('a gym cannot set it', !!(await tryExec(`select platform_set_custom_colours_price(1)`)));
await owner();
check('marker', (await one(`select migration_0191_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0191 checks passed');
process.exit(failures ? 1 : 0);
