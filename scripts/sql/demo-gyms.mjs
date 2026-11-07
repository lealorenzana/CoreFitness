/**
 * 0238: fifty demo gyms built and removed from the platform. One gym is built in its six steps and checked —
 * 205 accounts that can sign in (a hash, every token column a string), 200 members, payments, check-ins,
 * packages, chats, points and badges; triggers back on afterwards; a step run twice adds nothing; only a platform
 * admin may build or remove; the public list shows demo gyms after real ones, marked. Then both demo gyms are
 * removed in their two steps and nothing of them is left — while Gym #1 (the Lab, the rules template) is untouched.
 *
 *   node <repo>/scripts/sql/demo-gyms.mjs "<repo>"   (from a dir with pglite installed)
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
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

const PLAT = 'a2380000-0000-4000-8000-0000000000aa';
const MEM = 'a2380000-0000-4000-8000-0000000000bb';
await owner();
// pgcrypto is not in pglite: a stand-in hash, as the live project's extensions.crypt would give one.
await db.exec(`
  create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create or replace function extensions.crypt(text, text) returns text language sql as $$ select '$2a$06$' || md5($1 || $2) $$;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PLAT}', 'plat@corefitness.test', '{}'), ('${MEM}', 'mem@corefitness.test', '{}');
  insert into profiles (id, role, first_name, last_name, email, status) values
    ('${PLAT}', 'admin', 'Plat', 'Form', 'plat@corefitness.test', 'active'),
    ('${MEM}', 'member', 'Mia', 'Member', 'mem@corefitness.test', 'active') on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PLAT}') on conflict do nothing;`);
const labRows = await n(`select count(*) as n from gym_settings where gym_id = gym_one()`);
const labPlans = await n(`select count(*) as n from membership_plans where gym_id = gym_one()`);

await as(MEM);
let err = await tryExec(`select demo_gym_step(1, 1, 'Demo-Pass-2026')`);
check('a member cannot build a demo gym', err !== null && /platform/i.test(err), String(err));
err = await tryExec(`select demo_remove_step(1, 1)`);
check('…nor remove one', err !== null && /platform/i.test(err), String(err));

await as(PLAT);
err = await tryExec(`select demo_gym_step(1, 2, 'Demo-Pass-2026')`);
check('members before the gym is refused', err !== null && /step 1 first/.test(err), String(err));
err = await tryExec(`select demo_gym_step(1, 1, 'short')`);
check('a password under 8 characters is refused', err !== null && /8 characters/.test(err), String(err));

const timings = [];
for (let step = 1; step <= 6; step++) {
  const t0 = Date.now();
  err = await tryExec(`select demo_gym_step(1, ${step}, 'Demo-Pass-2026')`);
  timings.push(Date.now() - t0);
  check(`demo gym 1, step ${step} runs`, err === null, String(err));
}
console.log('      (pglite step times, ms: ' + timings.join(', ') + ')');
// A second gym's first step, to prove removal keeps gyms apart.
err = await tryExec(`select demo_gym_step(2, 1, 'Demo-Pass-2026')`);
check('demo gym 2, step 1 runs', err === null, String(err));

await owner();
const G1 = "demo_uid(1, 0, 0)";
check('the gym exists, marked demo, never billed, on Growth or Pro',
  await n(`select count(*) as n from gyms where id = ${G1} and is_demo and paid_until = '2099-12-31' and plan in ('growth', 'pro') and onboarded_at is not null`) === 1);
check('its name is in a real town', /Mamburao/.test((await one(`select name from gyms where id = ${G1}`)).name));
check('plans are priced', await n(`select count(*) as n from membership_plans where gym_id = ${G1} and price > 0 and not price_unset`) === 2);
check('205 accounts: owner, desk, 3 coaches, 200 members',
  await n(`select count(*) as n from profiles where username like 'gym01.%'`) === 205
  && await n(`select count(*) as n from gym_roles where gym_id = ${G1} and role = 'member'`) === 200
  && await n(`select count(*) as n from gym_roles where gym_id = ${G1} and role = 'trainer'`) === 3
  && await n(`select count(*) as n from gym_roles where gym_id = ${G1} and role = 'staff'`) === 1
  && await n(`select count(*) as n from gym_roles where gym_id = ${G1} and role = 'admin'`) === 1);
check('usernames as promised', await n(`select count(*) as n from profiles where username in ('gym01.owner', 'gym01.desk', 'gym01.coach1', 'gym01.coach3', 'gym01.m001', 'gym01.m200')`) === 6);
check('every sign-in can sign in: a hash, confirmed, token columns strings, an identity',
  await n(`select count(*) as n from auth.users u where u.id::text like 'de3a0001-0001-%' and u.encrypted_password like '$2a$%'
             and u.email_confirmed_at is not null and u.confirmation_token = '' and u.recovery_token = ''
             and u.email like '%@no-email.invalid' and exists (select 1 from auth.identities i where i.user_id = u.id)`) === 205);
const pays = await n(`select count(*) as n from payments where gym_id = ${G1}`);
const visits = await n(`select count(*) as n from attendance where gym_id = ${G1}`);
check('payments history', pays > 300 && pays < 1300, String(pays));
check('check-ins: about one a week each over six months', visits > 2500 && visits < 7000, String(visits));
check('no check-in later today than now', await n(`select count(*) as n from attendance where gym_id = ${G1} and check_in_time > now()`) === 0);
check('memberships: active, expired, frozen and free', await n(`select count(distinct status) as n from memberships where gym_id = ${G1}`) >= 3);
check('24 packages, sessions and chats', await n(`select count(*) as n from coachings where gym_id = ${G1}`) === 24
  && await n(`select count(*) as n from pt_sessions where gym_id = ${G1}`) === 192
  && await n(`select count(*) as n from messages where gym_id = ${G1}`) === 96);
check('points for the last 30 days of check-ins', await n(`select count(*) as n from point_ledger where gym_id = ${G1}`) > 100);
check('badges each member met', await n(`select count(*) as n from achievement_unlocks where gym_id = ${G1}`) > 150);
check('no notification was written while building', await n(`select count(*) as n from notifications where gym_id = ${G1}`) === 0);
check('every user trigger is back on',
  await n(`select count(*) as n from pg_trigger t where not t.tgisinternal and t.tgenabled = 'D'
             and t.tgrelid in ('public.payments'::regclass, 'public.attendance'::regclass, 'public.profiles'::regclass, 'public.messages'::regclass)`) === 0);

await as(PLAT);
await db.exec(`select demo_gym_step(1, 3, 'Demo-Pass-2026')`);
await owner();
check('a step run twice adds nothing', await n(`select count(*) as n from attendance where gym_id = ${G1}`) === visits);

await anon();
const list = (await db.query(`select name, is_demo from list_gyms(null)`)).rows;
check('the public list shows the demo gyms, marked, after real gyms',
  list.some((r) => r.is_demo) && list.findIndex((r) => r.is_demo) >= list.filter((r) => !r.is_demo).length, JSON.stringify(list.slice(0, 4)));

await as(PLAT);
const sum = (await db.query(`select * from demo_summary()`)).rows;
check('the summary: gym 1 done (6 steps, 200 members), gym 2 started',
  sum.length === 2 && sum[0].steps_done === 6 && Number(sum[0].members) === 200 && sum[1].steps_done === 1, JSON.stringify(sum));

for (const g of [1, 2]) for (const s of [1, 2]) {
  err = await tryExec(`select demo_remove_step(${g}, ${s})`);
  check(`remove demo gym ${g}, step ${s}`, err === null, String(err));
}
await owner();
let leftover = 0;
for (const t of (await db.query(`select c.table_name from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
                                   where c.table_schema = 'public' and c.column_name = 'gym_id' and x.table_type = 'BASE TABLE'`)).rows) {
  leftover += await n(`select count(*) as n from public.${t.table_name} where gym_id in (demo_uid(1, 0, 0), demo_uid(2, 0, 0))`);
}
check('nothing of either gym is left in any table', leftover === 0, String(leftover));
check('no demo person or sign-in is left', await n(`select count(*) as n from profiles where id::text like 'de3a%'`) === 0
  && await n(`select count(*) as n from auth.users where id::text like 'de3a%'`) === 0
  && await n(`select count(*) as n from gyms where is_demo`) === 0 && await n(`select count(*) as n from demo_gyms`) === 0);
check('Gym #1 (the Lab, the template) untouched', await n(`select count(*) as n from gym_settings where gym_id = gym_one()`) === labRows
  && await n(`select count(*) as n from membership_plans where gym_id = gym_one()`) === labPlans);
check('the platform admin and the member are untouched', await n(`select count(*) as n from profiles where id in ('${PLAT}', '${MEM}')`) === 2);
check('every user trigger is back on after removal', await n(`select count(*) as n from pg_trigger t where not t.tgisinternal and t.tgenabled = 'D'`) === 0);
await as(PLAT);
err = await tryExec(`select demo_remove_step(1, 1)`);
check('removing what is gone says so, no error', err === null, String(err));

console.log(failures ? `\n${failures} FAILED` : '\nall 0238 checks passed');
process.exit(failures ? 1 : 0);
