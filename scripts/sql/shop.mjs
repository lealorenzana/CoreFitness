/**
 * 0133: the shop — the owner sets products, prices and stock; the desk sells
 * and voids (same day, before the drawer closes); stock moves only through
 * moves; members see a menu without counts; the drawer counts the counter.
 *
 *   node <repo>/scripts/sql/shop.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  coach: 'a1000000-0000-4000-8000-000000000003', mem: 'a1000000-0000-4000-8000-000000000004',
  adminB: 'b1000000-0000-4000-8000-000000000001',
};

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
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};

await asOwner();
const person = (id, name) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${name}@shop-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${name}', 'Tester', '${name}@shop-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, v]) => person(v, k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_A}', '${P.mem}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${P.adminB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.adminB}';
  update profiles set active_gym_id = '${GYM_A}' where id <> '${P.adminB}' and email like '%@shop-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mem}', '${GYM_A}', 'QR-SM') on conflict do nothing;
`);
const today = (await one(`select (now() at time zone 'Asia/Manila')::date::text as d`)).d;
const cashIn = async () => Number((await one(`select cash_in from cash_day_summary('${today}')`)).cash_in);

// ---- 1. the owner sets up the shop -------------------------------------------------------------
await as(P.staff);
check('the desk cannot add a product', !!(await tryExec(`select save_product(null, 'Water', 'Drinks', 20)`)));
await as(P.admin);
const water = (await one(`select save_product(null, 'Water 500ml', 'Drinks', 20, null, null, true, 5) as id`)).id;
const whey = (await one(`select save_product(null, 'Whey scoop', 'Supplements', 60, null, null, true, 3) as id`)).id;
const towel = (await one(`select save_product(null, 'Towel rental', 'Other', 15, null, null, false) as id`)).id;
const secret = (await one(`select save_product(null, 'Staff snack', 'Drinks', 10, null, null, true, 5, false) as id`)).id;
check('the owner adds products', !!water && !!whey && !!towel);
check('the owner records a delivery', (await one(`select move_stock('${water}', 'delivery', 24, 'Supplier Monday') as n`)).n === 24);
await db.exec(`select move_stock('${whey}', 'delivery', 5, null)`);
check('a count that differs needs a reason', !!(await tryExec(`select move_stock('${water}', 'count', 22, null)`)));
check('nobody edits the stock number directly', (await touched(`update shop_products set stock = 999 where id = '${water}'`)) !== 1
  && (await one(`select stock from shop_products where id = '${water}'`)).stock === 24);
await asOwner();
check('not even the database owner, outside a move', !!(await tryExec(`update shop_products set stock = 999 where id = '${water}'`)));
await as(P.staff);
check('the desk cannot record stock', !!(await tryExec(`select move_stock('${water}', 'delivery', 5, null)`)));

// ---- 2. the member's menu --------------------------------------------------------------------------
await as(P.mem);
check('a member cannot read the products table', (await all(`select id from shop_products`)).length === 0);
const menu = await all(`select * from shop_catalog()`);
check('the menu lists what is shown in the app', menu.length === 3 && !menu.some((m) => m.id === secret), JSON.stringify(menu.map((m) => m.name)));
check('with availability, never a count', menu.find((m) => m.id === water).availability === 'in_stock' && !('stock' in menu[0]));
check('a member cannot ring up a sale', !!(await tryExec(`select record_sale('[{"product_id":"${water}","qty":1}]'::jsonb)`)));
await as(P.coach);
check('a coach cannot either', !!(await tryExec(`select record_sale('[{"product_id":"${water}","qty":1}]'::jsonb)`)));

// ---- 3. the desk sells --------------------------------------------------------------------------------
await as(P.staff);
const before = await cashIn();
const sale = (await one(`select record_sale('[{"product_id":"${water}","qty":2},{"product_id":"${towel}","qty":1}]'::jsonb, '${P.mem}') as id`)).id;
check('a sale is recorded at the database price', Number((await one(`select total from shop_sales where id = '${sale}'`)).total) === 55);
check('stock goes down by what was sold', (await one(`select stock from shop_products where id = '${water}'`)).stock === 22);
check('an untracked item needs no stock', (await one(`select stock from shop_products where id = '${towel}'`)).stock === 0);
check('the drawer expects the sale', (await cashIn()) === before + 55);
check('more than is on the shelf is refused', !!(await tryExec(`select record_sale('[{"product_id":"${whey}","qty":6}]'::jsonb)`)));
await db.exec(`select record_sale('[{"product_id":"${whey}","qty":3}]'::jsonb)`);
await asOwner();
check('running low tells the owner, once',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.admin}' and title = 'Running low: Whey scoop'`)).n === 1);
await as(P.mem);
check('the menu says Low', (await one(`select availability from shop_catalog() where id = '${whey}'`)).availability === 'low');

// ---- 4. voiding ----------------------------------------------------------------------------------------
await as(P.staff);
check('a void needs a reason', !!(await tryExec(`select void_sale('${sale}', ' ')`)));
check('the desk voids today\'s sale', !(await tryExec(`select void_sale('${sale}', 'Rang up twice')`)));
check('the stock comes back', (await one(`select stock from shop_products where id = '${water}'`)).stock === 24);
check('the drawer stops expecting it', (await cashIn()) === before + 180);
check('it cannot be voided twice', !!(await tryExec(`select void_sale('${sale}', 'again')`)));
const report = await all(`select * from shop_report('${today}', '${today}')`);
check('the report counts sales, not voids', report.length === 1 && report[0].qty === 3 && Number(report[0].revenue) === 180, JSON.stringify(report));
const s2 = (await one(`select record_sale('[{"product_id":"${water}","qty":1}]'::jsonb) as id`)).id;
await db.exec(`select close_cash_day('${today}', ${before + 200}, null)`);
check('after the drawer closes, no voids', !!(await tryExec(`select void_sale('${s2}', 'late')`)));

// ---- 5. another gym ------------------------------------------------------------------------------------
await as(P.adminB);
check("another gym sees none of it", (await all(`select id from shop_products`)).length === 0
  && (await all(`select * from shop_catalog()`)).length === 0 && (await all(`select id from shop_sales`)).length === 0);
check("and cannot sell Gym A's product", !!(await tryExec(`select record_sale('[{"product_id":"${water}","qty":1}]'::jsonb)`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0133 checks passed');
process.exit(failures ? 1 : 0);
