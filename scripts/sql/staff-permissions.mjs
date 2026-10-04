/**
 * 0161: what each front-desk account may do.
 *
 *   - no row = the whole desk, exactly as before;
 *   - an owner narrows one account; the database refuses the rest — by policy
 *     for direct writes and reads, by trigger inside definer functions too;
 *   - members, coaches and the owner are never affected;
 *   - a staff member's own gym_roles row is never gated;
 *   - only the owner sets permissions, and only for their own staff.
 *
 *   node <repo>/scripts/sql/staff-permissions.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const OWN = 'a7000000-0000-4000-8000-000000000001';
const DESK = 'a7000000-0000-4000-8000-000000000002';
const CASHIER = 'a7000000-0000-4000-8000-000000000003';
const M = 'a7000000-0000-4000-8000-000000000004';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await asOwner();
const person = (id, n, role) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@sp-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@sp-test.com', 'active', '${role}')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  ${person(OWN, 'olga', 'admin')} ${person(DESK, 'dina', 'staff')} ${person(CASHIER, 'cora', 'staff')} ${person(M, 'mia', 'member')}
  delete from gym_roles where gym_id = '${GYM_A}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${OWN}', 'admin', 'active'), ('${GYM_A}', '${DESK}', 'staff', 'active'),
    ('${GYM_A}', '${CASHIER}', 'staff', 'active'), ('${GYM_A}', '${M}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${OWN}', '${DESK}', '${CASHIER}', '${M}');
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM_A}', 'QR-SPM') on conflict do nothing;
  insert into shop_products (gym_id, name, category, price, track_stock, stock, low_stock_at) values ('${GYM_A}', 'Water', 'Drinks', 20, false, 0, 0);
`);
const water = (await one(`select id from shop_products where name = 'Water' and gym_id = '${GYM_A}'`)).id;
const checkin = (who) => `insert into attendance (gym_id, member_id, check_in_time) values ('${GYM_A}', '${M}', now() - interval '${who} minutes')`;
const pay = `insert into payments (gym_id, member_id, amount, method, status, paid_on) values ('${GYM_A}', '${M}', 500, 'cash', 'completed', current_date)`;
const sale = `select record_sale('[{"product_id":"${water}","qty":1}]'::jsonb, null)`;

// ---- nobody narrowed: the whole desk ---------------------------------------------------------------
await as(DESK);
check('a staff account with no row checks people in', !(await tryExec(checkin(1))));
check('…takes payments', !(await tryExec(pay)));
check('…rings up the shop', !(await tryExec(sale)));
check('…and reads its own areas as "everything"', (await one(`select my_staff_permissions() as a`)).a === null);

// ---- only the owner sets it, only for staff ----------------------------------------------------------
check('staff cannot set their own permissions', !!(await tryExec(`select set_staff_permissions('${CASHIER}', array['shop','payments','checkins'])`)));
await as(OWN);
check('the owner cannot "narrow" a member', !!(await tryExec(`select set_staff_permissions('${M}', array['shop'])`)));
check('an unknown area is refused', !!(await tryExec(`select set_staff_permissions('${CASHIER}', array['shop','pricing'])`)));
check('the owner narrows the cashier to the shop and check-ins', !(await tryExec(`select set_staff_permissions('${CASHIER}', array['shop','checkins'])`)));

// ---- the cashier ----------------------------------------------------------------------------------------
await as(CASHIER);
check('the cashier sees their areas', JSON.stringify((await one(`select my_staff_permissions() as a`)).a) === JSON.stringify(['checkins', 'shop']));
check('…still checks people in', !(await tryExec(checkin(2))));
check('…still sells', !(await tryExec(sale)));
check('…but cannot record a payment', /not allowed/.test((await tryExec(pay)) ?? ''));
check('…cannot read payments either', (await all(`select id from payments`)).length === 0);
check('…cannot create an event', /not allowed|row-level security/.test((await tryExec(`insert into events (gym_id, title, starts_at, duration_minutes, capacity) values ('${GYM_A}', 'Run', now() + interval '2 days', 60, 20)`)) ?? ''));
check('…cannot send an announcement', /row-level security/.test((await tryExec(`insert into notifications (gym_id, user_id, type, title, message) values ('${GYM_A}', '${M}', 'system', 'Hi', 'Hello')`)) ?? ''));
// RLS filters rows and does not raise: the edit reaches zero rows (the app's assertWrote says so).
const edited = (await db.query(`update member_profiles set address = 'X' where profile_id = '${M}' returning profile_id`)).rows.length;
check('…cannot change a member\'s details (zero rows)', edited === 0, String(edited));
await asOwner();
await db.exec(`update gym_roles set status = 'pending_approval' where user_id = '${M}' and gym_id = '${GYM_A}'`);
await as(CASHIER);
check('…cannot approve a sign-up (set_account_status, a definer function)', /not allowed/.test((await tryExec(`select set_account_status('${M}', 'active')`)) ?? ''));
await asOwner();
check('…the sign-up still waits', (await one(`select status from gym_roles where user_id = '${M}' and gym_id = '${GYM_A}'`)).status === 'pending_approval');
await db.exec(`update gym_roles set status = 'active' where user_id = '${M}' and gym_id = '${GYM_A}'`);
check('…and nothing changed', (await one(`select address from member_profiles where profile_id = '${M}'`)).address !== 'X'
  && (await one(`select status from gym_roles where user_id = '${M}' and gym_id = '${GYM_A}'`)).status === 'active');
await as(CASHIER);
check('…but their own gym_roles row is never gated', !(await tryExec(`update gym_roles set status = status where user_id = '${CASHIER}' and gym_id = '${GYM_A}'`)));

// ---- the rest of the gym is untouched -------------------------------------------------------------------
await as(DESK);
check('the other desk account still takes payments', !(await tryExec(pay)));
await as(OWN);
check('the owner is never narrowed', !(await tryExec(pay)));
await as(M);
check('a member still reads their own payments', (await all(`select id from payments where member_id = '${M}'`)).length >= 3);
await asOwner();
check('maintenance with no session passes', !(await tryExec(`update payments set amount = amount where member_id = '${M}'`)));

// ---- back to the whole desk ---------------------------------------------------------------------------------
await as(OWN);
await db.exec(`select set_staff_permissions('${CASHIER}', null)`);
await as(CASHIER);
check('null puts the cashier back on the whole desk', !(await tryExec(pay)) && (await one(`select my_staff_permissions() as a`)).a === null);

// ---- tenancy ----------------------------------------------------------------------------------------------------
await asOwner();
check('staff_permissions is on the tenancy list', (await one(`select 'staff_permissions' = any(tenancy_gym_tables()) as ok`)).ok);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
