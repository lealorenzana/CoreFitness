/**
 * 0229 + Part G: a hidden gym is left out of both gym lists but its code still
 * finds it; scripts/demo-data/lab-switch-members.sql makes Core Fitness Lab 2
 * (hidden, paid until 2099, joined with LABTWO at the desk), gives it the Lab's
 * owner, completes one made-up member's switch (their workouts move) and leaves
 * one waiting; the Lab 2 owner sees the "switching in" mark; pasting it twice
 * changes nothing; Remove demo data takes the made-up members away.
 *
 *   node <repo>/scripts/sql/lab-two.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const TWO = 'c0f1e55e-0000-4000-8000-000000000002';
const OWNER = 'a2290000-0000-4000-8000-000000000001', PA = 'a2290000-0000-4000-8000-000000000002';
const D1 = '5eed0000-0000-4000-8000-0000000229a1', D2 = '5eed0000-0000-4000-8000-0000000229a2';
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
const G = (await one(`select gym_one() g`)).g;
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${OWNER}', 'mf.jgabrielle+owner@gmail.com', '{}'), ('${PA}', 'pa@lab-two-test.ph', '{}'),
    ('${D1}', 'demo.one@seed.corefitness-test.com', '{}'), ('${D2}', 'demo.two@seed.corefitness-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${OWNER}', 'Lab', 'Owner', 'mf.jgabrielle+owner@gmail.com', 'active', 'member', '${G}'),
    ('${PA}', 'Pat', 'Admin', 'pa@lab-two-test.ph', 'active', 'member', '${G}'),
    ('${D1}', 'Dina', 'Demo', 'demo.one@seed.corefitness-test.com', 'active', 'member', '${G}'),
    ('${D2}', 'Dodo', 'Demo', 'demo.two@seed.corefitness-test.com', 'active', 'member', '${G}')
  on conflict (id) do update set email = excluded.email, active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id in ('${OWNER}', '${PA}', '${D1}', '${D2}');
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${G}', '${OWNER}', 'admin', 'active'),
    ('${G}', '${D1}', 'member', 'active'), ('${G}', '${D2}', 'member', 'active');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${G}', '${D1}', 'qr-d1'), ('${G}', '${D2}', 'qr-d2') on conflict do nothing;
  set session_replication_role = replica;
  insert into workout_logs (id, gym_id, member_id, performed_on, activity) values ('5eed3000-0000-4000-8000-0000000229b1', '${G}', '${D1}', current_date - 2, 'Run');
  set session_replication_role = origin;`);

// Remove every other made-up Lab member from the choice, so the script picks these two.
await db.exec(`update gym_roles set status = 'archived' where gym_id = '${G}' and role = 'member' and user_id::text like '5eed%' and user_id not in ('${D1}', '${D2}')`);

const SCRIPT = readFileSync(join(REPO, 'scripts', 'demo-data', 'lab-switch-members.sql'), 'utf-8');
let err = await tryExec(SCRIPT);
check('the script runs', err === null, err);
const g = await one(`select g.hidden, g.paid_until::text p, g.plan, s.join_policy, s.join_code, s.join_approval from gyms g join gym_settings s on s.gym_id = g.id where g.id = '${TWO}'`);
check('Lab 2: hidden, paid until 2099, Pro, joined with LABTWO at the desk', g && g.hidden && g.p === '2099-12-31' && g.plan === 'pro'
  && g.join_policy === 'code' && g.join_code === 'LABTWO' && g.join_approval === 'desk', JSON.stringify(g));
check('the Lab owner owns Lab 2 too', (await one(`select status from gym_roles where gym_id = '${TWO}' and user_id = '${OWNER}' and role = 'admin'`))?.status === 'active');
check('one made-up member switched: their workout moved', await n(`select count(*) n from workout_logs where member_id = '${D1}' and gym_id = '${TWO}'`) === 1
  && (await one(`select status from gym_roles where gym_id = '${G}' and user_id = '${D1}'`)).status === 'archived');
check('one waits at the Lab 2 desk', (await one(`select status from gym_roles where gym_id = '${TWO}' and user_id = '${D2}'`))?.status === 'pending_approval'
  && await n(`select count(*) n from gym_switches where member = '${D2}' and status = 'pending'`) === 1);
check('the desk guard is back on', (await one(`select tgenabled from pg_trigger where tgname = 'staff_area_guard'`)).tgenabled !== 'D');

await owner();
await db.exec(`update profiles set active_gym_id = '${TWO}' where id = '${OWNER}'`);
await as(OWNER);
check('the Lab 2 owner sees who is switching in', (await db.query(`select * from gym_switching_in()`)).rows.length === 1);
await anon();
check('Lab 2 is in neither gym list', (await db.query(`select * from list_gyms(null)`)).rows.every((r) => r.id !== TWO)
  && (await db.query(`select * from gym_finder(null)`)).rows.every((r) => r.id !== TWO));
await owner();
check('…but its code finds it', !!(await one(`select gym_id from gym_settings where upper(join_code) = 'LABTWO'`)));

err = await tryExec(SCRIPT);
check('pasting it twice changes nothing', err === null && await n(`select count(*) n from gym_switches where to_gym = '${TWO}'`) === 2, err);

await as(PA);
await db.exec(`select remove_demo_data()`);
await owner();
check('Remove demo data takes the made-up members away', await n(`select count(*) n from profiles where id in ('${D1}', '${D2}')`) === 0
  && await n(`select count(*) n from gym_switches where member in ('${D1}', '${D2}')`) === 0);
check('the probe marker answers a visitor', (await (async () => { await anon(); return one(`select migration_0229_applied() ok`); })()).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
