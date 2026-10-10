/**
 * 0175: squads are called teams in every word the database says out loud;
 * the tables, keys and routes keep "squad".
 *
 *   node <repo>/scripts/sql/teams-wording.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const M = 'a1750000-0000-4000-8000-000000000001';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${M}', 'tw@tw-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${M}', 'Tia', 'W', 'tw@tw-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${M}', 'member', 'active') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-TW') on conflict do nothing;`);

check('the switch reads Teams', (await one(`select label from platform_features where key = 'squads'`)).label === 'Teams and gym goal');
const src = (await one(`select string_agg(prosrc, ' ') s from pg_proc where proname in ('create_squad','join_squad')`)).s;
check('the refusals say team', /already in a team/.test(src) && /No team here has that code/.test(src) && !/already in a squad/.test(src));
check('…while the tables keep their names', /squad_members/.test(src));

await db.exec(`select set_config('request.jwt.claim.sub', '${M}', false); set role authenticated;`);
let msg = '';
try { await db.exec(`select join_squad('ZZZZZZ')`); } catch (e) { msg = describe(e); }
check('a member trying a wrong code is told "No team here has that code."', /No team here has that code/.test(msg), msg);

await db.exec(`reset role`);
check('marker', (await one(`select migration_0175_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0175 checks passed');
process.exit(failures ? 1 : 0);
