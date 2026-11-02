/**
 * 0233: premium themes — the owner sets one only with the colours unlock, only a
 * known key, never the desk; a direct update cannot skip the rule; everyone in
 * the gym reads the theme their app wears; clearing it is always allowed.
 *
 *   node <repo>/scripts/sql/premium-themes.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);

const AD = 'a2330000-0000-4000-8000-000000000001', ST = 'a2330000-0000-4000-8000-000000000002', MB = 'a2330000-0000-4000-8000-000000000003';
await owner();
const G = (await one(`select gym_one() g`)).g;
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${AD}', 'ad@theme-test.ph', '{}'), ('${ST}', 'st@theme-test.ph', '{}'), ('${MB}', 'mb@theme-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${AD}', 'Ada', 'Owner', 'ad@theme-test.ph', 'active', 'member', '${G}'),
    ('${ST}', 'Sid', 'Desk', 'st@theme-test.ph', 'active', 'member', '${G}'),
    ('${MB}', 'Mia', 'Member', 'mb@theme-test.ph', 'active', 'member', '${G}')
  on conflict (id) do update set active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id in ('${AD}', '${ST}', '${MB}');
  set session_replication_role = replica;
  insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${AD}', 'admin', 'active'), ('${G}', '${ST}', 'staff', 'active'), ('${G}', '${MB}', 'member', 'active');
  set session_replication_role = origin;
  delete from gym_theme_unlocks where gym_id = '${G}';
  update gym_settings set premium_theme = null where gym_id = '${G}';`);

await as(AD);
check('without the unlock the owner is told to buy it', /one-time colours unlock/.test((await tryExec(`select set_premium_theme('ember')`)) ?? ''));
await owner();
check('…and a direct update cannot skip it', /one-time colours unlock/.test((await tryExec(`update gym_settings set premium_theme = 'ember' where gym_id = '${G}'`)) ?? ''));
await db.exec(`insert into gym_theme_unlocks (gym_id, theme_key, how) values ('${G}', 'custom_colours', 'platform') on conflict do nothing`);
await as(AD);
check('with the unlock the owner sets a theme', (await tryExec(`select set_premium_theme('ember')`)) === null);
check('an unknown theme is refused', /no premium theme called/.test((await tryExec(`select set_premium_theme('neon_dream')`)) ?? ''));
await as(ST);
check('the desk cannot change it', /Only the gym's owner/.test((await tryExec(`select set_premium_theme('forest')`)) ?? ''));
await as(MB);
check('a member reads the theme their app wears', (await one(`select my_gym_premium_theme() t`)).t === 'ember');
check('…and cannot set it', /Only the gym's owner/.test((await tryExec(`select set_premium_theme(null)`)) ?? ''));
await as(AD);
check('the owner can go back to no theme', (await tryExec(`select set_premium_theme(null)`)) === null && (await one(`select my_gym_premium_theme() t`)).t === null);
await db.exec(`reset role; set role anon;`);
check('a visitor cannot read a gym\'s theme', !!(await tryExec(`select my_gym_premium_theme()`)));
check('the probe marker answers a visitor', (await one(`select migration_0233_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
