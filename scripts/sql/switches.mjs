/**
 * 0141: the finer feature switches (a child is on only while its parent is),
 * what reaches the phone, and the gym's own colour code; 0142, no plan has holes.
 *
 *   node <repo>/scripts/sql/switches.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const OWNER = 'a1000000-0000-4000-8000-000000000001';
const DESK = 'a1000000-0000-4000-8000-000000000002';
const MEM = 'a1000000-0000-4000-8000-000000000004';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const on = async (k) => (await one(`select gym_module_on('${GYM}', '${k}') as v`)).v;
const phone = async () => (await one(`select modules from my_gym_app()`)).modules;

await db.exec(`reset role;
  ${[['owner', OWNER], ['desk', DESK], ['mem', MEM]].map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@sw-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${id}', '${k}', 'T', '${k}@sw-test.com', 'active', 'member', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;`).join('\n')}
  delete from gym_roles where gym_id = '${GYM}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${OWNER}', 'admin', 'active'), ('${GYM}', '${DESK}', 'staff', 'active'), ('${GYM}', '${MEM}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';`);

// ---- the list --------------------------------------------------------------------------------
await as(OWNER);
const list = await all(`select * from my_gym_modules()`);
const keys = list.map((r) => r.feature_key);
check('ten new switches, each with a parent', ['shop', 'requests', 'chat', 'rooms', 'programs', 'photos', 'squads', 'seasons', 'quests', 'referrals']
  .every((k) => list.find((r) => r.feature_key === k)?.parent_key));
check('children listed right after their parent', keys.indexOf('chat') === keys.indexOf('coaching') + 1 || keys.indexOf('rooms') === keys.indexOf('coaching') + 1, keys.join());
check('everything starts on — nothing was taken away', list.every((r) => r.state === 'on'), JSON.stringify(list.filter((r) => r.state !== 'on')));

// ---- a child on its own ------------------------------------------------------------------------
await db.exec(`select set_gym_module('chat', false)`);
check('the owner turns chat off', (await on('chat')) === false && (await on('rooms')) === true && (await on('coaching')) === true);
check('the phone is told', (await phone()).chat === false && (await phone()).rooms === true);

// ---- a parent takes its children with it -------------------------------------------------------
await db.exec(`select set_gym_module('chat', true); select set_gym_module('coaching', false)`);
check('coaches off: chat and rooms go with it', (await on('chat')) === false && (await on('rooms')) === false);
const st = await all(`select feature_key, state from my_gym_modules() where feature_key in ('coaching', 'chat')`);
check('the owner is told why a child is off', st.find((r) => r.feature_key === 'chat')?.state === 'parent_off' && st.find((r) => r.feature_key === 'coaching')?.state === 'off');
await db.exec(`select set_gym_module('rooms', false); select set_gym_module('coaching', true)`);
check('coaches back on: each child as the owner last left it', (await on('chat')) === true && (await on('rooms')) === false);

// ---- the platform's plan still decides first ----------------------------------------------------
await db.exec(`reset role; insert into platform_plan_features (plan_key, feature_key, enabled)
  select g.plan, 'shop', false from gyms g where g.id = '${GYM}' on conflict (plan_key, feature_key) do update set enabled = false;`);
await as(OWNER);
check('a plan without the shop: not sold, and the owner cannot switch it on',
  (await on('shop')) === false && (await one(`select state from my_gym_modules() where feature_key = 'shop'`)).state === 'not_sold'
  && !!(await tryExec(`select set_gym_module('shop', true)`)));

// ---- who may switch ------------------------------------------------------------------------------
await as(DESK);
check('the desk cannot switch anything', !!(await tryExec(`select set_gym_module('squads', false)`)));
await as(MEM);
check('nor can a member', !!(await tryExec(`select set_gym_module('squads', false)`)));
check('a member\'s phone still reads every switch', Object.keys(await phone()).length >= 19);

// ---- the gym's own colour --------------------------------------------------------------------------
await as(OWNER);
check('a colour code is accepted, stored in one case', !(await tryExec(`select save_gym_look('#1f8a70', '#f4a261', null)`))
  && (await one(`select accent, accent_action from gym_settings where gym_id = '${GYM}'`)).accent === '#1F8A70');
check('the phone gets it', (await one(`select accent from my_gym_app()`)).accent === '#1F8A70');
check('a preset still works', !(await tryExec(`select save_gym_look('teal', null, null)`)));
check('anything else is refused', !!(await tryExec(`select save_gym_look('#12345', null, null)`)) && !!(await tryExec(`select save_gym_look('red; drop table', null, null)`)));
check('an action colour code is checked too', !!(await tryExec(`select save_gym_look('teal', '#GGGGGG', null)`)));

// ---- 0142: no plan has a hole, whichever side grows ------------------------------------------
await db.exec('reset role;');
check('0142: every plan has a row for every feature',
  (await one(`select (select count(*) from platform_plans) * (select count(*) from platform_features)
                   - (select count(*) from platform_plan_features) as n`)).n == 0);
{
  // A plan that does not sell Coaches: a new coaching child arrives not sold there, sold elsewhere.
  const plan = (await one(`select key from platform_plans order by key limit 1`)).key;
  await db.exec(`update platform_plan_features set enabled = false where plan_key = '${plan}' and feature_key = 'coaching';
    insert into platform_features (key, label, description, sort_order, parent_key)
    values ('zz_test_child', 'Test child', 'test', 99, 'coaching');`);
  const rows = await all(`select plan_key, enabled from platform_plan_features where feature_key = 'zz_test_child'`);
  const planCount = (await one(`select count(*)::int as n from platform_plans`)).n;
  check('0142: a new feature arrives on every plan, copying its parent',
    rows.length === planCount && rows.find((r) => r.plan_key === plan)?.enabled === false
      && rows.filter((r) => r.plan_key !== plan).every((r) => r.enabled === true), JSON.stringify(rows));
  await db.exec(`delete from platform_features where key = 'zz_test_child';
    update platform_plan_features set enabled = true where plan_key = '${plan}' and feature_key = 'coaching';`);
}

// The paste-after verify script, run against this same replay: its report must say OK throughout.
{
  const { readFileSync } = await import('node:fs');
  await db.exec('reset role;');
  const report = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0141.sql`, 'utf8'))) ?? '';
  check('verify0141.sql reports OK', /REPORT 0141/.test(report) && !/NOT OK/.test(report), report);
}

console.log(failures ? `\n${failures} FAILED` : '\nall 0141 checks passed');
process.exit(failures ? 1 : 0);
