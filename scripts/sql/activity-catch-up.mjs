/**
 * 0165: the Activity log records what was built after 0037 — written by triggers,
 * filed under the row's own gym, with a sentence a person can read.
 *
 *   node <repo>/scripts/sql/activity-catch-up.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const DESK = 'a7000000-0000-4000-8000-000000000002';
const MEM = 'a7000000-0000-4000-8000-000000000003';
const COACH = 'a7000000-0000-4000-8000-000000000004';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
/** The newest log line for an action, as the owner reads it. */
const last = async (action) => {
  await owner();
  return one(`select summary, gym_id, member_id from activity_log where action = '${action}' order by id desc limit 1`);
};

await owner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@act-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Cruz', '${n}@act-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, last_name = 'Cruz', status = 'active';`;
await db.exec(`
  ${person(DESK, 'Dina', 'staff')} ${person(MEM, 'Mara', 'member')} ${person(COACH, 'Carlo', 'trainer')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${DESK}', 'staff', 'active'), ('${GYM_A}', '${MEM}', 'member', 'active'), ('${GYM_A}', '${COACH}', 'trainer', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${DESK}', '${MEM}', '${COACH}');
  insert into trainer_profiles (profile_id, gym_id) values ('${COACH}', '${GYM_A}') on conflict do nothing;
`);

// ---- the shop -----------------------------------------------------------------------------------------
const prod = (await one(`insert into shop_products (gym_id, name, category, price, track_stock, stock)
  values ('${GYM_A}', 'Whey sachet', 'supplements', 75, true, 0) returning id`)).id;
await db.exec(`insert into stock_moves (gym_id, product_id, change, reason, note) values ('${GYM_A}', '${prod}', 24, 'delivery', 'Box from supplier')`);
let r = await last('shop.stock_delivery');
check('a delivery is logged with the product and the count', /Whey sachet: \+24 \(delivery\)/.test(r?.summary ?? ''), r?.summary);
check('…under the row\'s own gym, even with no session', r?.gym_id === GYM_A, r?.gym_id);
const sale = (await one(`insert into shop_sales (gym_id, sale_day, total, member_id, sold_by)
  values ('${GYM_A}', current_date, 150, '${MEM}', '${DESK}') returning id`)).id;
r = await last('shop.sale');
check('a sale is logged with the amount and the buyer', /Sold ₱150\.00 to Mara Cruz/.test(r?.summary ?? '') && r.member_id === MEM, r?.summary);
await db.exec(`update shop_sales set voided_at = now(), voided_by = '${DESK}', void_reason = 'Rang up twice' where id = '${sale}'`);
r = await last('shop.sale_voided');
check('a void is logged with its reason', /Voided a ₱150\.00 sale: Rang up twice/.test(r?.summary ?? ''), r?.summary);
const sales = (await one(`select count(*)::int n from activity_log where action like 'shop.stock_%' and summary like '%Whey%'`)).n;
await db.exec(`insert into stock_moves (gym_id, product_id, change, reason, sale_id) values ('${GYM_A}', '${prod}', -2, 'sale', '${sale}')`);
check('a sale\'s own stock move is not logged twice', (await one(`select count(*)::int n from activity_log where action like 'shop.stock_%' and summary like '%Whey%'`)).n === sales);

// ---- requests and refunds -------------------------------------------------------------------------------
const req = (await one(`insert into membership_requests (gym_id, member_id, kind, reason, requested_days)
  values ('${GYM_A}', '${MEM}', 'freeze', 'Out of town for work', 14) returning id`)).id;
r = await last('membership.request_freeze');
check('a freeze request is logged with the days and the reason', /Mara Cruz asked to freeze for 14 days: Out of town for work/.test(r?.summary ?? ''), r?.summary);
await db.exec(`update membership_requests set status = 'declined', closed_at = now(), closed_by = '${DESK}', close_note = 'Talk to the owner' where id = '${req}'`);
r = await last('membership.request_declined');
check('closing it is logged', /Declined Mara Cruz's request to freeze — Talk to the owner/.test(r?.summary ?? ''), r?.summary);

// ---- credentials ------------------------------------------------------------------------------------------
const cred = (await one(`insert into trainer_credentials (gym_id, trainer_id, title, file_path)
  values ('${GYM_A}', '${COACH}', 'First Aid', 'creds/x.pdf') returning id`)).id;
r = await last('credential.submitted');
check('a credential upload is logged', /Carlo Cruz submitted the credential "First Aid"/.test(r?.summary ?? ''), r?.summary);
await db.exec(`update trainer_credentials set status = 'rejected', reviewed_at = now(), review_note = 'The photo is blurred' where id = '${cred}'`);
r = await last('credential.rejected');
check('a rejection is logged with the note', /Rejected Carlo Cruz's "First Aid" — The photo is blurred/.test(r?.summary ?? ''), r?.summary);

// ---- engagement -------------------------------------------------------------------------------------------
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into member_profiles (profile_id, gym_id, qr_code) values ('${MEM}', '${GYM_A}', 'QR-ACT') on conflict do nothing;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
  values ('${MEM}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values ('${GYM_A}', '${MEM}', 'checkin', 500, 'test', gen_random_uuid());`);
const reward = (await one(`insert into rewards (gym_id, name, cost_points, stock) values ('${GYM_A}', 'Gym towel', 100, 5) returning id`)).id;
const red = (await one(`insert into reward_redemptions (gym_id, member_id, reward_id, cost_points) values ('${GYM_A}', '${MEM}', '${reward}', 100) returning id`)).id;
r = await last('reward.requested');
check('a reward request is logged', /Mara Cruz asked for Gym towel \(100 points\)/.test(r?.summary ?? ''), r?.summary);
await db.exec(`update reward_redemptions set fulfilled_at = now(), status = 'fulfilled' where id = '${red}'`);
r = await last('reward.handed_over');
check('handing it over is logged', /Handed Gym towel to Mara Cruz/.test(r?.summary ?? ''), r?.summary);
await db.exec(`insert into streak_milestones (gym_id, member_id, weeks) values ('${GYM_A}', '${MEM}', 12)`);
r = await last('streak.milestone');
check('a streak milestone is logged', /Mara Cruz reached a 12-week streak/.test(r?.summary ?? ''), r?.summary);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM_A}', '${MEM}', 'gone_quiet', '2026-10')`);
r = await last('winback.sent');
check('a win-back message is logged', /Sent Mara Cruz a win-back message \(gone quiet\)/.test(r?.summary ?? ''), r?.summary);

// ---- nobody writes the log by hand -------------------------------------------------------------------------
await as(DESK);
let refused = false;
try { await db.exec(`select log_stock_activity()`); } catch { refused = true; }
check('a trigger body cannot be called directly', refused);
try { await db.exec(`insert into activity_log (gym_id, action, subject_type, summary) values ('${GYM_A}', 'shop.sale', 'x', 'fake')`); refused = false; } catch { refused = true; }
await owner();
check('…and the log still has no insert path for a person', refused || (await one(`select count(*)::int n from activity_log where summary = 'fake'`)).n === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0165 checks passed');
process.exit(failures ? 1 : 0);
