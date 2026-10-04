/**
 * 0158: the website's price list advertises only what a plan really gives,
 * and a price change is logged in full.
 *
 *   node <repo>/scripts/sql/price-list.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const PA = 'a7000000-0000-4000-8000-000000000009';
const OWNER = 'a7000000-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
async function asAnon() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
}

await db.exec(`reset role;
  ${[['pa', PA], ['owner', OWNER]].map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@price-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@price-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);

const kids = await all(`select key, parent_key, label from platform_features where parent_key is not null order by key`);
check('0141 children exist to test against', kids.length > 0, JSON.stringify(kids));
const child = kids.find((k) => k.parent_key === 'coaching') ?? kids[0];
const parent = (await one(`select label from platform_features where key = '${child.parent_key}'`)).label;

// ---- 1. pricing is the platform's alone ---------------------------------------------------------
await as(OWNER);
check('a gym owner cannot set a price', !!(await tryExec(`select save_platform_plan('standard', 'Standard', null, 1, null)`)));
await asAnon();
check('anon cannot set a price', !!(await tryExec(`select save_platform_plan('standard', 'Standard', null, 1, null)`)));

// ---- 2. prices round-trip, and the whole change is logged ----------------------------------------
await as(PA);
await db.exec(`select save_platform_plan('standard', 'Standard', 'One gym', 499.50, 4990, null, 300, 3, true, true, 2)`);
await asAnon();
const std = (await all(`select * from platform_price_list()`)).find((r) => r.key === 'standard');
check('the website reads the exact price, centavos kept', std && Number(std.price_monthly) === 499.5 && Number(std.price_yearly) === 4990, JSON.stringify(std));
await db.exec('reset role;');
const anyLog = (await one(`select detail from platform_events where action = 'plan.changed' order by created_at desc limit 1`))?.detail;
check('the log records the yearly price and trial, not only the monthly one',
  anyLog && Number(anyLog.price_yearly) === 4990 && 'trial_days' in anyLog && anyLog.is_active === true, JSON.stringify(anyLog));

// ---- 3. a child is advertised only with its part --------------------------------------------------
await as(PA);
await db.exec(`select set_platform_plan_feature('standard', '${child.parent_key}', false);
               select set_platform_plan_feature('standard', '${child.key}', true);`);
await asAnon();
let inc = (await all(`select includes from platform_price_list() where key = 'standard'`))[0].includes;
check(`"${child.label}" is not advertised while "${parent}" is off`, !inc.includes(child.label) && !inc.includes(parent), JSON.stringify(inc));
await as(PA);
await db.exec(`select set_platform_plan_feature('standard', '${child.parent_key}', true);`);
await asAnon();
inc = (await all(`select includes from platform_price_list() where key = 'standard'`))[0].includes;
check(`and returns with "${parent}"`, inc.includes(child.label) && inc.includes(parent), JSON.stringify(inc));
const prem = (await all(`select includes from platform_price_list() where key = 'premium'`))[0]?.includes ?? [];
check('another plan is untouched', prem.includes(child.label), JSON.stringify(prem));

// ---- 4. retired and hidden plans stay off the website, and come back --------------------------------
await as(PA);
await db.exec(`select save_platform_plan('standard', 'Standard', 'One gym', 499.50, 4990, null, 300, 3, true, false, 2)`);
await asAnon();
check('a retired plan is not on the website', !(await all(`select key from platform_price_list()`)).some((r) => r.key === 'standard'));
await as(PA);
await db.exec(`select save_platform_plan('standard', 'Standard', 'One gym', 499.50, 4990, null, 300, 3, true, true, 2)`);
await asAnon();
check('saving it as on sale brings it back', (await all(`select key from platform_price_list()`)).some((r) => r.key === 'standard'));
await db.exec('reset role;');
check('the marker answers', (await one(`select migration_0158_applied() as ok`)).ok === true);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall price-list checks passed');
process.exit(failures ? 1 : 0);
