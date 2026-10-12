/**
 * 0197: the rewards catalogue — photo, category, featured, last day, monthly limit.
 *
 *   - a photo must be this gym's own upload; a typed URL or another gym's file is refused;
 *   - a reward past its last day cannot be asked for (the member's own insert);
 *   - the per-member monthly limit holds, and a declined request does not count;
 *   - reward_stats() is the owner's and desk's, never a member's.
 *
 *   node <repo>/scripts/sql/rewards-catalogue.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const OWN = 'a1970000-0000-4000-8000-000000000001';
const DESK = 'a1970000-0000-4000-8000-000000000002';
const M1 = 'a1970000-0000-4000-8000-000000000003';

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

await asOwner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@rc-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@rc-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${person(OWN, 'olga', 'admin')} ${person(DESK, 'dina', 'staff')} ${person(M1, 'mia', 'member')}
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${DESK}', 'staff', 'active'), ('${GYM_A}', '${M1}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${OWN}', '${DESK}', '${M1}');
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M1}', '${GYM_A}', 'QR-RC1') on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ('${M1}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29);
  select act_as_gym('${GYM_A}');
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id) values
    ('${GYM_A}', '${M1}', 'checkin', 1000, 'test', gen_random_uuid());`);

// ---- 1. photos -----------------------------------------------------------------------------------
const OK_URL = `https://x.supabase.co/storage/v1/object/public/media/gyms/${GYM_A}/content/a.jpg`;
await as(OWN);
let err = await tryExec(`insert into rewards (gym_id, name, cost_points, image_url, category, featured)
  values ('${GYM_A}', 'Shake', 50, '${OK_URL}', '  Drinks ', true)`);
check('the owner adds a reward with the gym\'s own photo', !err, err ?? '');
const shake = await one(`select id, category, featured from rewards where name = 'Shake'`);
check('…the category is trimmed and it is featured', shake?.category === 'Drinks' && shake?.featured === true, JSON.stringify(shake));
err = await tryExec(`update rewards set image_url = 'https://evil.example/x.jpg' where id = '${shake.id}'`);
check('a typed URL is refused', !!err && /uploaded from this page/.test(err), err ?? 'no error');
err = await tryExec(`update rewards set image_url = 'https://x.supabase.co/storage/v1/object/public/media/gyms/c0f1e55e-0000-4000-8000-000000000002/content/b.jpg' where id = '${shake.id}'`);
check('another gym\'s file is refused', !!err && /uploaded from this page/.test(err), err ?? 'no error');
err = await tryExec(`update rewards set per_member_monthly = 0 where id = '${shake.id}'`);
check('a monthly limit of 0 is refused', !!err);

// ---- 2. the monthly limit ------------------------------------------------------------------------
await db.exec(`update rewards set per_member_monthly = 2 where id = '${shake.id}'`);
await as(M1);
const ask = () => tryExec(`insert into reward_redemptions (reward_id, member_id) values ('${shake.id}', '${M1}')`);
check('the first request this month', !(await ask()));
check('the second request this month', !(await ask()));
err = await ask();
check('the third is refused — the limit is 2', !!err && /limit is 2/.test(err), err ?? 'no error');
await as(OWN);
const firstId = (await one(`select id from reward_redemptions where reward_id = '${shake.id}' order by requested_at limit 1`)).id;
err = await tryExec(`select decide_redemption('${firstId}', 'rejected', 'Out of shakes today')`);
check('the owner declines one', !err, err ?? '');
await as(M1);
err = await ask();
check('a declined request does not count against the limit', !err, err ?? '');

// ---- 3. the last day -----------------------------------------------------------------------------
await as(OWN);
await db.exec(`insert into rewards (gym_id, name, cost_points, available_until) values
  ('${GYM_A}', 'Old promo', 10, manila_today() - 1), ('${GYM_A}', 'Ends today', 10, manila_today())`);
await as(M1);
const old = (await one(`select id from rewards where name = 'Old promo'`)).id;
const today = (await one(`select id from rewards where name = 'Ends today'`)).id;
err = await tryExec(`insert into reward_redemptions (reward_id, member_id) values ('${old}', '${M1}')`);
check('a reward past its last day cannot be asked for', !!err && /ended on/.test(err), err ?? 'no error');
err = await tryExec(`insert into reward_redemptions (reward_id, member_id) values ('${today}', '${M1}')`);
check('…but on its last day it can', !err, err ?? '');

// ---- 4. stats ------------------------------------------------------------------------------------
await as(DESK);
const st = await one(`select this_month, all_time from reward_stats() where reward_id = '${shake.id}'`);
check('the desk reads the reward\'s numbers (declined left out)', st?.this_month === 2 && st?.all_time === 2, JSON.stringify(st));
await as(M1);
const mine = (await db.query(`select * from reward_stats()`)).rows.length;
check('a member reads none of them', mine === 0, String(mine));

await asOwner();
check('marker', (await one(`select migration_0197_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0197 checks passed');
process.exit(failures ? 1 : 0);
