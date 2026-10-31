/**
 * 0226: the platform suspends an account. Only a platform admin suspends (with
 * a reason) and lifts; a platform admin cannot be suspended; the suspended
 * person loses every gym-scoped read at once (current_gym_id, get_my_role),
 * my_gym_context says 'platform_suspended', and they can read their own reason;
 * the gym's owner is told and sees the mark, never the reason; lifting gives
 * everything back; strangers can do none of it; 0226 runs twice.
 *
 *   node <repo>/scripts/sql/platform-suspension.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0226' });
const G = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2260000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), OWNER = id('02'), MEM = id('03'), OTHER = id('04');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = { [PA]: 'Pat', [OWNER]: 'Olga', [MEM]: 'Mia', [OTHER]: 'Otto' };
await db.exec(Object.entries(people).map(([u, nm]) => `
  insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${nm.toLowerCase()}@sus-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${u}', '${nm}', 'Test', '${nm.toLowerCase()}@sus-test.ph', 'active', 'member', '${G}')
    on conflict (id) do update set first_name = excluded.first_name, active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${u}';`).join('\n') + `
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  delete from gym_roles where gym_id = '${G}' and role = 'admin';
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${G}', '${OWNER}', 'admin', 'active'), ('${G}', '${MEM}', 'member', 'active'), ('${G}', '${OTHER}', 'member', 'active');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${G}', '${MEM}', 'qr-mia-s'), ('${G}', '${OTHER}', 'qr-otto-s') on conflict do nothing;
  update gyms set onboarded_at = coalesce(onboarded_at, now()) where id = '${G}';`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0226'); } catch (e) { err = String(e); }
check('0226 applies', err === null, err);

await as(MEM);
check('before: the member reads their own gym', (await one(`select current_gym_id() g`)).g === G
  && await n(`select count(*) n from member_profiles where profile_id = '${MEM}'`) === 1);

await as(OWNER);
check('a gym owner cannot suspend', !!(await tryExec(`select platform_suspend('${MEM}', 'Abuse at the desk')`)));
await as(PA);
check('a reason is needed', /Say why/.test(await tryExec(`select platform_suspend('${MEM}', '')`) ?? ''));
check('a platform admin cannot be suspended', /cannot be suspended/.test(await tryExec(`select platform_suspend('${PA}', 'Testing')`) ?? ''));
const found = (await db.query(`select * from platform_search_people('mia@sus')`)).rows;
check('the platform finds anyone by email, with their gyms', found.length === 1 && found[0].gyms.length === 1 && found[0].suspended_reason === null, JSON.stringify(found));
await db.exec(`select platform_suspend('${MEM}', 'Fraudulent payments reported by two gyms.')`);
check('suspending twice is refused', /already suspended/.test(await tryExec(`select platform_suspend('${MEM}', 'Again')`) ?? ''));
check('…and the search shows it, with the reason', (await one(`select suspended_reason r from platform_search_people('Mia')`)).r === 'Fraudulent payments reported by two gyms.');

await as(MEM);
check('suspended: no gym answers them', (await one(`select current_gym_id() g`)).g === null && (await one(`select get_my_role()::text r`)).r === null);
check('…their gym\'s rows are refused at once', await n(`select count(*) n from member_profiles where profile_id = '${MEM}'`) === 0);
check('…the app is told why', (await one(`select lock_reason from my_gym_context()`)).lock_reason === 'platform_suspended');
check('…and they can read their own reason', (await one(`select my_platform_suspension() s`)).s.reason === 'Fraudulent payments reported by two gyms.');

await as(OWNER);
check('the gym\'s owner is told, without the reason', await n(`select count(*) n from notifications where user_id = '${OWNER}' and title = 'Suspended by Core Fitness' and message not like '%Fraudulent%'`) === 1);
const marks = (await db.query(`select * from gym_suspended_people() p`)).rows.map((r) => Object.values(r)[0]);
check('…and sees the mark on them', marks.length === 1 && marks[0] === MEM, JSON.stringify(marks));
check('…but cannot read the reason', (await db.query(`select * from platform_suspended_people()`)).rows.length === 0
  && !!(await tryExec(`select * from platform_suspensions`)) === false && (await db.query(`select * from platform_suspensions`)).rows.length === 0);
await as(OTHER);
check('another member sees nothing', (await db.query(`select * from gym_suspended_people()`)).rows.length === 0
  && (await one(`select my_platform_suspension() s`)).s === null);

await as(OWNER);
check('only the platform lifts it', !!(await tryExec(`select platform_lift_suspension('${MEM}')`)));
await as(PA);
await db.exec(`select platform_lift_suspension('${MEM}')`);
await as(MEM);
check('lifted: everything is back', (await one(`select current_gym_id() g`)).g === G
  && (await one(`select lock_reason from my_gym_context()`)).lock_reason !== 'platform_suspended'
  && await n(`select count(*) n from member_profiles where profile_id = '${MEM}'`) === 1);
await owner();
check('…and the gym is told', await n(`select count(*) n from notifications where user_id = '${OWNER}' and title = 'Suspension lifted'`) === 1);
check('the suspension email kind is allowed', (await tryExec(`insert into email_outbox (to_email, subject, body, kind) values ('mia@sus-test.ph', 'x', 'y', 'account_suspended')`)) === null);

await anon();
check('a visitor can do none of it', !!(await tryExec(`select platform_suspend('${MEM}', 'xxx')`)) && !!(await tryExec(`select my_platform_suspension()`)));
check('the probe marker answers a visitor', (await one(`select migration_0226_applied() ok`)).ok === true);
await owner();
check('0226 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0226_platform_suspension.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
