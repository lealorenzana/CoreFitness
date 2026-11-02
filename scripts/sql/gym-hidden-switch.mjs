/**
 * 0231: the platform hides or shows a gym in the gym lists from its page — a
 * platform admin only, logged in Activity; a hidden gym leaves list_gyms().
 *
 *   node <repo>/scripts/sql/gym-hidden-switch.mjs "<repo>"   (from a dir with pglite installed)
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

const PA = 'a2310000-0000-4000-8000-000000000001', X = 'a2310000-0000-4000-8000-000000000002';
const GYM = 'a2310000-0000-4000-8000-0000000000a1';
await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@hide-test.ph', '{}'), ('${X}', 'x@hide-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values
    ('${PA}', 'Pat', 'Admin', 'pa@hide-test.ph', 'active', 'member'), ('${X}', 'Xen', 'Other', 'x@hide-test.ph', 'active', 'member')
  on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gyms (id, name, slug, status, plan) values ('${GYM}', 'Hide Test Gym', 'hide-test-gym', 'active', 'pro') on conflict (id) do nothing;
  insert into gym_settings (gym_id, join_policy) values ('${GYM}', 'open') on conflict (gym_id) do update set join_policy = 'open';`);

const listed = async () => { await db.exec(`reset role; set role anon;`); const r = (await db.query(`select id from list_gyms(null)`)).rows.some((x) => x.id === GYM); await owner(); return r; };
check('an open gym is listed', await listed());
await as(X);
check('someone who is not the platform cannot hide a gym', /Only the platform/.test((await tryExec(`select platform_set_gym_hidden('${GYM}', true)`)) ?? ''));
check('…nor read whether it is hidden', /Only the platform/.test((await tryExec(`select platform_gym_hidden('${GYM}')`)) ?? ''));
await as(PA);
await db.exec(`select platform_set_gym_hidden('${GYM}', true)`);
check('the platform hides it', (await one(`select platform_gym_hidden('${GYM}') h`)).h === true);
check('…and it leaves the gym list', !(await listed()));
await as(PA);
await db.exec(`select platform_set_gym_hidden('${GYM}', false)`);
check('shown again, it is listed', await listed());
check('both acts are in Activity', Number((await one(`select count(*) n from platform_events where gym_id = '${GYM}' and action in ('gym.hidden', 'gym.listed')`)).n) === 2);
check('the probe marker answers a visitor', (await (async () => { await db.exec(`reset role; set role anon;`); return one(`select migration_0231_applied() ok`); })()).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
