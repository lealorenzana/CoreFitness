/**
 * 0159: rewards that cannot run out silently, two new ways to earn, the season overview.
 *
 *   - approving the last reward twice says "out of stock", and changes nothing;
 *   - declining still needs a reason the member reads;
 *   - shop_purchase and membership_paid ship OFF, pay nothing until turned on,
 *     pay once, and a void takes the shop points back;
 *   - season_overview() is the owner's and desk's, never a member's.
 *
 *   node <repo>/scripts/sql/rewards-earning.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const OWN = 'a5000000-0000-4000-8000-000000000001';
const DESK = 'a5000000-0000-4000-8000-000000000002';
const M1 = 'a5000000-0000-4000-8000-000000000003';
const M2 = 'a5000000-0000-4000-8000-000000000004';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const pts = async (id, rule) => Number((await one(`select coalesce(sum(points), 0)::int as n from point_ledger where member_id = '${id}' and rule_key = '${rule}'`)).n);

await asOwner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@rw-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@rw-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${person(OWN, 'olga', 'admin')} ${person(DESK, 'dina', 'staff')} ${person(M1, 'mia', 'member')} ${person(M2, 'mon', 'member')}
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${DESK}', 'staff', 'active'),
    ('${GYM_A}', '${M1}', 'member', 'active'), ('${GYM_A}', '${M2}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${OWN}', '${DESK}', '${M1}', '${M2}');
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M1}', '${GYM_A}', 'QR-M1'), ('${M2}', '${GYM_A}', 'QR-M2') on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ('${M1}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29),
  ('${M2}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);`);

// ---- 1. the last one, approved twice ---------------------------------------------------------------
await db.exec(`
  select act_as_gym('${GYM_A}');
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values
    ('${GYM_A}', '${M1}', 'checkin', 500, 'test', gen_random_uuid()), ('${GYM_A}', '${M2}', 'checkin', 500, 'test', gen_random_uuid());
  insert into rewards (gym_id, name, cost_points, stock) values ('${GYM_A}', 'Last shake', 100, 1);`);
const reward = (await one(`select id from rewards where name = 'Last shake'`)).id;
for (const m of [M1, M2]) {
  await as(m);
  const err = await tryExec(`insert into reward_redemptions (reward_id, member_id) values ('${reward}', '${m}')`);
  check(`member ${m === M1 ? 1 : 2} asks for the last shake`, !err, err ?? '');
}
await asOwner();
const [q1, q2] = (await db.query(`select id from reward_redemptions where reward_id = '${reward}' order by member_id`)).rows.map((r) => r.id);
await as(OWN);
check('the first approval goes through', !(await tryExec(`select decide_redemption('${q1}', 'approved')`)));
const second = await tryExec(`select decide_redemption('${q2}', 'approved')`);
check('the second says out of stock, not a constraint error', /out of stock/i.test(second ?? '') && !/check constraint/i.test(second ?? ''), second ?? 'no error');
await asOwner();
check('…and changed nothing', (await one(`select status from reward_redemptions where id = '${q2}'`)).status === 'pending'
  && (await one(`select stock from rewards where id = '${reward}'`)).stock === 0);
await as(OWN);
check('declining still needs a reason', !!(await tryExec(`select decide_redemption('${q2}', 'rejected', '  ')`)));
check('declining with one works', !(await tryExec(`select decide_redemption('${q2}', 'rejected', 'Sold out this month')`)));

// ---- 2. points at the counter ------------------------------------------------------------------------
await asOwner();
await db.exec(`insert into shop_products (gym_id, name, category, price, track_stock, stock, low_stock_at) values ('${GYM_A}', 'Whey', 'Supplements', 125, false, 0, 0)`);
const whey = (await one(`select id from shop_products where name = 'Whey' and gym_id = '${GYM_A}'`)).id;
const sale = async () => {
  await as(DESK);
  return (await one(`select record_sale('[{"product_id":"${whey}","qty":2}]'::jsonb, '${M1}') as id`)).id;
};
const s1 = await sale();
check('shop points ship off: a ₱250 sale pays nothing', (await pts(M1, 'shop_purchase')) === 0);
await asOwner();
await db.exec(`update point_rules set is_active = true, points = 5 where gym_id = '${GYM_A}' and key = 'shop_purchase'`);
const s2 = await sale();
check('turned on: ₱250 is two whole ₱100s, 10 points', (await pts(M1, 'shop_purchase')) === 10, String(await pts(M1, 'shop_purchase')));
await as(DESK);
await db.exec(`select void_sale('${s2}', 'Rang up twice')`);
check('a void takes them back', (await pts(M1, 'shop_purchase')) === 0, String(await pts(M1, 'shop_purchase')));
await db.exec(`select void_sale('${s1}', 'Test')`);
check('voiding a sale that paid nothing takes nothing', (await pts(M1, 'shop_purchase')) === 0);
await as(DESK);
check('a walk-in sale (no member) is fine', !(await tryExec(`select record_sale('[{"product_id":"${whey}","qty":1}]'::jsonb, null)`)));

// ---- 3. points for a paid membership ------------------------------------------------------------------
await asOwner();
const pay = (amount, status = 'completed') => db.exec(`insert into payments (member_id, gym_id, amount, method, status, paid_on)
  values ('${M2}', '${GYM_A}', ${amount}, 'cash', '${status}', current_date)`);
await pay(1500);
check('membership points ship off', (await pts(M2, 'membership_paid')) === 0);
await db.exec(`update point_rules set is_active = true where gym_id = '${GYM_A}' and key = 'membership_paid'`);
await pay(0);
check('a ₱0 payment pays nothing', (await pts(M2, 'membership_paid')) === 0);
await pay(1500, 'pending');
check('a pending payment pays nothing yet', (await pts(M2, 'membership_paid')) === 0);
await db.exec(`update payments set status = 'completed' where member_id = '${M2}' and status = 'pending'`);
check('completing it pays the rule once', (await pts(M2, 'membership_paid')) === 50, String(await pts(M2, 'membership_paid')));
await db.exec(`update payments set status = 'completed' where member_id = '${M2}' and amount = 1500`);
check('touching it again pays nothing more', (await pts(M2, 'membership_paid')) === 50);

// ---- 4. the season overview -------------------------------------------------------------------------------
await asOwner();
await db.exec(`insert into season_tiers (gym_id, name, points_needed) values ('${GYM_A}', 'Bronze', 100), ('${GYM_A}', 'Gold', 10000)`);
await as(M1);
check('a member cannot read the overview', !!(await tryExec(`select season_overview()`)));
await as(DESK);
const ov = (await one(`select season_overview() as v`)).v;
const bronze = ov.tiers.find((t) => t.name === 'Bronze');
const gold = ov.tiers.find((t) => t.name === 'Gold');
check('the desk reads it: tiers with who reached them', bronze && gold && Number(bronze.reached) >= 2 && Number(gold.reached) === 0, JSON.stringify(ov.tiers));
check('and the top of the month, by name', ov.top.length >= 2 && ov.top.some((t) => /mia/.test(t.name)), JSON.stringify(ov.top));

// ---- 5. a challenge settles from a member's own screen ----------------------------------------------------
await asOwner();
await db.exec(`insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on, reward_points, is_active)
  values ('${GYM_A}', 'Three days', 'training_days', 3, current_date - 5, current_date + 5, 40, true)`);
const ch = (await one(`select id from challenges where title = 'Three days'`)).id;
await db.exec(`insert into challenge_participants (gym_id, challenge_id, member_id) values ('${GYM_A}', '${ch}', '${M1}');
  insert into attendance (gym_id, member_id, check_in_time) values
    ('${GYM_A}', '${M1}', now() - interval '1 day'), ('${GYM_A}', '${M1}', now() - interval '2 days'), ('${GYM_A}', '${M1}', now() - interval '3 days');`);
await as(M1);
check('a member can settle challenges from their screen', !(await tryExec(`select settle_challenges()`)));
await asOwner();
check('…which marks them done and pays once', !!(await one(`select completed_on from challenge_participants where challenge_id = '${ch}' and member_id = '${M1}'`)).completed_on
  && (await pts(M1, 'challenge_complete')) === 40, String(await pts(M1, 'challenge_complete')));
await as(M1);
await db.exec(`select settle_challenges()`);
check('running it again pays nothing more', (await pts(M1, 'challenge_complete')) === 40);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
