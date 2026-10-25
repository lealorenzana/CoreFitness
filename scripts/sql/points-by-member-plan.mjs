/**
 * 0210: the payouts the desk sets off pay by the member's plan, never by the
 * desk's role. With the desk as the signed-in caller (auth.uid() = the desk),
 * a check-in, a membership payment, a shop sale and a referral's first payment
 * each pay the member whose plan earns points — and not the one whose plan has
 * points_earn off. Before 0210 plan_allows() said yes to the desk, so both were paid.
 *
 *   node <repo>/scripts/sql/points-by-member-plan.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2100000-0000-4000-8000-0000000000${n}`;
const MP = id('0a'), MF = id('0b'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
/** The desk is the caller (its id in the JWT), as when it uses the screens; RLS is not what is under test. */
const asDesk = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ST}', false);`);
const paid = async (rule) => (await db.query(
  `select member_id, sum(points)::int points from point_ledger where rule_key = '${rule}' and member_id in ('${MP}', '${MF}') group by member_id`)).rows;
const got = (rows, m) => rows.find((r) => r.member_id === m)?.points ?? 0;

await owner();
await db.exec(`
  ${[['mp', MP, 'member'], ['mf', MF, 'member'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@pts-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@pts-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${MP}', '${GYM}', 'QR-PT1'), ('${MF}', '${GYM}', 'QR-PT2') on conflict do nothing;
  select act_as_gym('${GYM}');
  update point_rules set is_active = true, points = greatest(points, 5)
   where gym_id = '${GYM}' and key in ('checkin', 'membership_paid', 'shop_purchase', 'referral', 'referral_welcome');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Pts Premium', 900, 30, 'premium', true, true, true),
           ('${id('f2')}', '${GYM}', 'Pts No Points', 500, 30, 'premium', true, true, true);
  insert into plan_features (plan_id, feature_key, enabled) values ('${id('f1')}', 'points_earn', true), ('${id('f2')}', 'points_earn', false)
    on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${MP}', '${GYM}', '${id('f1')}', 'active', manila_today() - 1, manila_today() + 30, false),
           ('${MF}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, manila_today() + 30, false);
  select act_as_gym(null);`);

await asDesk();
check('the trap is real: plan_allows says yes to the desk for a plan with points off',
  (await one(`select plan_allows('${MF}', 'points_earn') a`)).a === true);

// A check-in at the desk (award_points, which every trigger goes through).
let err = await tryExec(`insert into attendance (member_id, gym_id, check_in_time) values ('${MP}', '${GYM}', now()), ('${MF}', '${GYM}', now());`);
check('the desk checks both members in', err === null, err ?? '');
let rows = await paid('checkin');
check('a check-in pays the member whose plan earns points', got(rows, MP) > 0, JSON.stringify(rows));
check('…and not the one whose plan has points off', got(rows, MF) === 0, JSON.stringify(rows));

// A membership payment recorded at the desk.
err = await tryExec(`insert into payments (gym_id, member_id, amount, method, invoice_number, paid_on, status)
  values ('${GYM}', '${MP}', 900, 'cash', 'PT-1', manila_today(), 'completed'), ('${GYM}', '${MF}', 500, 'cash', 'PT-2', manila_today(), 'completed');`);
check('the desk records both payments', err === null, err ?? '');
rows = await paid('membership_paid');
check('a payment pays the member whose plan earns points', got(rows, MP) > 0, JSON.stringify(rows));
check('…and not the one whose plan has points off', got(rows, MF) === 0, JSON.stringify(rows));

// A counter sale naming each member (writes the ledger directly).
// The till opens a sale at ₱0 and sets its total once the lines are in — the trigger fires on that update (0159).
err = await tryExec(`insert into shop_sales (id, gym_id, sale_day, total, member_id, sold_by)
  values ('${id('51')}', '${GYM}', manila_today(), 0, '${MP}', '${ST}'), ('${id('52')}', '${GYM}', manila_today(), 0, '${MF}', '${ST}');
  update shop_sales set total = 300 where id in ('${id('51')}', '${id('52')}');`);
check('the desk rings up a sale for each', err === null, err ?? '');
rows = await paid('shop_purchase');
check('a sale pays the member whose plan earns points', got(rows, MP) > 0, JSON.stringify(rows));
check('…and not the one whose plan has points off', got(rows, MF) === 0, JSON.stringify(rows));

// A referral: MP brought a friend on the no-points plan; the friend's first payment, at the desk.
const FR = id('0c');
await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${FR}', 'fr@pts-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${FR}', 'fr', 'T', 'fr@pts-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${FR}';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${FR}', 'member', 'active');
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${FR}', '${GYM}', 'QR-PT3') on conflict do nothing;
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires)
    values ('${FR}', '${GYM}', '${id('f2')}', 'active', manila_today() - 1, manila_today() + 30, false);
  insert into referrals (gym_id, referrer_id, referred_id, code, status) values ('${GYM}', '${MP}', '${FR}', 'PTREF', 'pending');`);
await asDesk();
err = await tryExec(`insert into payments (gym_id, member_id, amount, method, invoice_number, paid_on, status)
  values ('${GYM}', '${FR}', 500, 'cash', 'PT-3', manila_today(), 'completed');`);
check('the desk records the friend\'s first payment', err === null, err ?? '');
await owner();
const ref = await one(`select referrer_points, friend_points from referrals where referred_id = '${FR}'`);
check('the referrer, whose plan earns points, is paid', ref && ref.referrer_points > 0, JSON.stringify(ref));
check('…and the friend, on a plan with points off, gets no welcome points', ref && ref.friend_points === 0, JSON.stringify(ref));

await owner();
check('marker', (await one(`select migration_0210_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0210 checks passed');
process.exit(failures ? 1 : 0);
