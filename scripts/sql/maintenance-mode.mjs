/**
 * 0263: maintenance mode. Only the platform turns it on or off; everyone else (signed in or not) reads it; a
 * platform admin is never shut out; the message has a length; the table is closed to everyone.
 *
 *   node <repo>/scripts/sql/maintenance-mode.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const PA = 'a1000000-0000-4000-8000-000000000219';
const MEM = 'a1000000-0000-4000-8000-000000000214';
const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; };
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); }
async function asAnon() { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`); }
const state = async () => (await one(`select platform_maintenance_state() as s`)).s;

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@mm-test.com', '{}'), ('${MEM}', 'mem@mm-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${PA}', 'P', 'A', 'pa@mm-test.com', 'active', 'member', '${GYM_A}'),
    ('${MEM}', 'M', 'E', 'mem@mm-test.com', 'active', 'member', '${GYM_A}') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_A}', '${MEM}', 'member', 'active') on conflict do nothing;`);

await asAnon();
check('off to start with, for a stranger', (await state()).on === false);
check('a stranger cannot turn it on', !!(await tryExec(`select set_platform_maintenance('Down for an update')`)));
await as(MEM);
check('a gym member cannot turn it on', !!(await tryExec(`select set_platform_maintenance('Down for an update')`)));
check('a gym member cannot read the platform view', (await one(`select platform_maintenance_admin() as s`)).s === null);
const memTable = await tryExec(`select * from platform_maintenance`) ?? ((await db.query(`select * from platform_maintenance`)).rows.length === 0 ? 'no rows' : null);
check('the table is closed to a signed-in user', !!memTable);

await as(PA);
check('a message too short is refused', !!(await tryExec(`select set_platform_maintenance('no')`)));
check('the platform turns it on', (await tryExec(`select set_platform_maintenance('Updating the apps, back by 10pm.')`)) === null);
check('…the platform itself is not shut out', (await state()).on === false);
check('…and sees it on in its own view', (await one(`select platform_maintenance_admin() as s`)).s.on === true);

await as(MEM);
const m = await state();
check('a gym member now reads it on, with the message', m.on === true && m.message === 'Updating the apps, back by 10pm.' && !!m.since, JSON.stringify(m));
await asAnon();
check('a stranger on a sign-in screen reads it on too', (await state()).on === true);

await as(PA);
check('changing the message keeps it on', (await tryExec(`select set_platform_maintenance('Back by 11pm.')`)) === null
  && (await one(`select platform_maintenance_admin() as s`)).s.message === 'Back by 11pm.');
check('an empty message turns it off', (await tryExec(`select set_platform_maintenance('')`)) === null);
await as(MEM);
check('…and a gym member reads it off again', (await state()).on === false);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
