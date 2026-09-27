/**
 * 0125: refer a friend.
 *
 * Ways it could pay the wrong people, each checked:
 *   - a member referring themselves, being referred twice, or an existing
 *     paying member "referred" after the fact;
 *   - paying on sign-up, on a free (₱0) payment, or twice for two payments;
 *   - no monthly cap — six friends must earn five rewards;
 *   - a member writing a referral row, or reading someone else's.
 *
 *   node <repo>/scripts/sql/referrals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const R = 'a3000000-0000-4000-8000-000000000001';       // the referrer
const STAFF = 'a3000000-0000-4000-8000-000000000002';
const PAYING = 'a3000000-0000-4000-8000-000000000003';  // already a paying member
const F = [1, 2, 3, 4, 5, 6, 7].map((i) => `f3000000-0000-4000-8000-00000000000${i}`);
const MB = 'b3000000-0000-4000-8000-000000000001';

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
const count = async (sql) => Number((await one(`select count(*)::int as n from (${sql}) x`)).n);

await asOwner();
const ready = await one(`select to_regclass('public.referrals') is not null as ok`);
check('0125 is applied (referrals exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

const person = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@ref-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@ref-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${person(R, 'rita')} ${person(STAFF, 'desk')} ${person(PAYING, 'paula')} ${person(MB, 'bea')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${R}', 'member', 'active'), ('${GYM_A}', '${STAFF}', 'staff', 'active'),
    ('${GYM_A}', '${PAYING}', 'member', 'active'), ('${GYM_B}', '${MB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${MB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${MB}';
  update profiles set active_gym_id = '${GYM_A}' where id in ('${R}', '${STAFF}', '${PAYING}');
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${R}', '${GYM_A}', 'QR-R'), ('${PAYING}', '${GYM_A}', 'QR-P'), ('${MB}', '${GYM_B}', 'QR-MB')
    on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
const member = (id) => `insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
  values ('${id}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);`;
const pay = (id, amount) => `insert into payments (member_id, gym_id, amount, method, status, paid_on)
  values ('${id}', '${GYM_A}', ${amount}, 'cash', 'completed', current_date);`;
await db.exec(member(R) + member(PAYING) + pay(PAYING, 1500));

// ---- the code --------------------------------------------------------------------------------
await as(R);
const code = (await one(`select my_referral_code() as c`)).c;
check('a member gets a 6-letter referral code', /^[A-Z]{6}$/.test(code), code);
check('the same one every time', (await one(`select my_referral_code() as c`)).c === code);
check('a member cannot refer themselves', !!(await tryExec(`select claim_referral('${GYM_A}', '${code}')`)));

// ---- a new account signs up through the link --------------------------------------------------
await asOwner();
const signup = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@ref-test.com',
  '{"signup_source":"member_self_registration","gym_id":"${GYM_A}","first_name":"${n}","last_name":"Friend","referral_code":"${code.toLowerCase()}","terms_accepted":"true"}');`;
await db.exec(signup(F[0], 'fe'));
const r1 = await one(`select status, referrer_id from referrals where referred_id = '${F[0]}'`);
check('signing up through the link records the referral', r1 && r1.referrer_id === R && r1.status === 'pending', JSON.stringify(r1));
check('signing up alone earns nothing', (await count(`select 1 from point_ledger where rule_key in ('referral','referral_welcome')`)) === 0);

// ---- an existing account, in another gym, joins through the link ---------------------------------
await as(MB);
await db.exec(`select request_to_join('${GYM_A}')`);
check('an existing account claims the code after asking to join', !(await tryExec(`select claim_referral('${GYM_A}', '${code}')`)));
check('and only once', !!(await tryExec(`select claim_referral('${GYM_A}', '${code}')`)));
await as(PAYING);
check('a member already paying cannot be referred after the fact', !!(await tryExec(`select claim_referral('${GYM_A}', '${code}')`)));
await as(F[0]);
check('a wrong code is refused', !!(await tryExec(`select claim_referral('${GYM_A}', 'ZZZZZZ')`)));

// ---- the paid moment ------------------------------------------------------------------------------
await asOwner();
await db.exec(member(F[0]) + pay(F[0], 0));
check('a ₱0 payment pays nothing', (await one(`select status from referrals where referred_id = '${F[0]}'`)).status === 'pending');
await db.exec(pay(F[0], 1500));
const paidRow = await one(`select status, referrer_points, friend_points from referrals where referred_id = '${F[0]}'`);
check('the first real payment rewards the referral', paidRow.status === 'rewarded', JSON.stringify(paidRow));
check('the referrer gets the referral points',
  (await one(`select coalesce(sum(points),0)::int as n from point_ledger where member_id = '${R}' and rule_key = 'referral'`)).n === 100);
check('the friend gets the welcome points',
  (await one(`select coalesce(sum(points),0)::int as n from point_ledger where member_id = '${F[0]}' and rule_key = 'referral_welcome'`)).n === 50);
await db.exec(pay(F[0], 1500));
check('a second payment pays nothing more',
  (await count(`select 1 from point_ledger where rule_key in ('referral','referral_welcome')`)) === 2);
check('both are told', (await count(`select 1 from notifications where type = 'referral' and user_id in ('${R}','${F[0]}')`)) === 2);

// ---- the monthly cap: five friends more, one over the limit ------------------------------------------
for (let i = 1; i <= 5; i++) {
  await db.exec(signup(F[i], 'f' + i));
  await db.exec(member(F[i]) + pay(F[i], 1000));
}
const rewarded = await count(`select 1 from referrals where referrer_id = '${R}' and status = 'rewarded'`);
const refPoints = (await one(`select coalesce(sum(points),0)::int as n from point_ledger where member_id = '${R}' and rule_key = 'referral'`)).n;
check('all six paid referrals are recorded as rewarded', rewarded === 6, String(rewarded));
check('but only five earn the referrer points this month', refPoints === 500, String(refPoints));
check('every friend still gets their welcome',
  (await count(`select 1 from point_ledger where rule_key = 'referral_welcome'`)) === 6);

// ---- who reads what ------------------------------------------------------------------------------
await as(R);
check('the referrer sees their referrals', (await count(`select * from my_referrals()`)) === 7);
check('a member cannot write a referral', !!(await tryExec(`insert into referrals (referrer_id, referred_id, code)
  values ('${R}', '${F[6]}', '${code}')`)));
check('nor read the table beyond their own', (await count(`select 1 from referrals where referrer_id <> '${R}' and referred_id <> '${R}'`)) === 0);
check('nor see the gym list', !!(await tryExec(`select * from gym_referrals()`)));
await as(STAFF);
check('the desk sees who brought whom', (await count(`select * from gym_referrals()`)) === 7);

// ---- 0124's sweeps from a caller with no session (what pg_cron is) ------------------------------
await asOwner();
await db.exec(`insert into workout_logs (member_id, gym_id, activity, performed_on)
  values ('${R}', '${GYM_A}', 'Gym', (now() at time zone 'Asia/Manila')::date);
  insert into gym_goals (gym_id, title, metric, target, starts_on, ends_on, reward_points, created_by)
  values ('${GYM_A}', 'Cron goal', 'training_days', 1, current_date - 1, current_date + 1, 20, '${STAFF}');
  select act_as_gym(null);
  select settle_gym_goals();`);
check("a gym goal settled with no session still pays (0124's sweep, fixed in 0125)",
  (await one(`select coalesce(sum(points),0)::int as n from point_ledger where member_id = '${R}' and rule_key = 'gym_goal'`)).n === 20);

// ---- rules as queries ----------------------------------------------------------------------------
await asOwner();
check('both tables are in the tenancy list', (await one(`select tenancy_gym_tables() @> array['referrals','referral_codes'] as ok`)).ok);
check('no write policy on referrals or codes',
  (await count(`select 1 from pg_policies where tablename in ('referrals','referral_codes')
    and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE'`)) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0125 checks passed');
process.exit(failures ? 1 : 0);
