/**
 * Tenancy: two gyms, every role, nothing crosses. Built on the real migrations
 * (lib/live-db.mjs) plus both demo seeds, acting as the real `authenticated`
 * role — an owner bypasses RLS, so `current_user` is asserted before any
 * result is believed. RLS filters rows and does not raise: a forbidden read is
 * zero rows, a forbidden update or delete touches zero rows, a forbidden insert
 * raises.
 *
 *   node <repo>/scripts/sql/tenancy-isolation.mjs "<repo>"   (from a dir with pglite installed)
 *
 * Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md
 */
import { liveDb, describe } from './lib/live-db.mjs';

// A statement that throws where no check expected it: one readable line, not pglite's dump.
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, (e) => {
  console.log(`\nCRASH  ${describe(e)}${e.query ? '\n   query: ' + String(e.query).slice(0, 300) : ''}`);
  process.exit(2);
});

const REPO = process.argv[2];
const db = await liveDb(REPO, { seeds: ['seed-demo-data.sql', 'seed-demo-data-2.sql'] });

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';   // Gym #1: today's data
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
// People. `both` is a member of both gyms; `outsider` belongs to none.
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', staffA: 'a1000000-0000-4000-8000-000000000002',
  trainerA: 'a1000000-0000-4000-8000-000000000003', memberA: 'a1000000-0000-4000-8000-000000000004',
  adminB: 'b1000000-0000-4000-8000-000000000001', staffB: 'b1000000-0000-4000-8000-000000000002',
  trainerB: 'b1000000-0000-4000-8000-000000000003', memberB: 'b1000000-0000-4000-8000-000000000004',
  both: 'ab000000-0000-4000-8000-000000000005', outsider: '0c000000-0000-4000-8000-000000000006',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const finish = () => {
  console.log(failures ? `\n${failures} FAILED` : '\nall tenancy checks passed');
  process.exit(failures ? 1 : 0);
};
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  const { rows } = await db.query('select current_user as u');
  if (rows[0].u !== 'authenticated') throw new Error('not running as authenticated');
}
const one = async (sql) => (await db.query(sql)).rows[0];
const fails = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

// ---- 0097: the tenancy core exists -------------------------------------------
await asOwner();
const core = await one(`select to_regclass('public.gyms') is not null as gyms,
  to_regclass('public.gym_roles') is not null as roles,
  to_regprocedure('public.current_gym_id()') is not null as cur`);
check('0097 tables and current_gym_id exist', core.gyms && core.roles && core.cur, JSON.stringify(core));
if (!core.gyms) finish();

// Gym B, its people, and one person in both gyms. Inserted as owner.
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member');`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@corefitness-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'), ('${GYM_A}', '${P.staffA}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainerA}', 'trainer', 'active'), ('${GYM_A}', '${P.memberA}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.staffB}', 'staff', 'active'),
    ('${GYM_B}', '${P.trainerB}', 'trainer', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active'),
    ('${GYM_A}', '${P.both}', 'member', 'active'), ('${GYM_B}', '${P.both}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  -- The transition mirror filed every new profile under Gym #1; the B-only people are not there.
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in
    ('${P.adminB}', '${P.staffB}', '${P.trainerB}', '${P.memberB}', '${P.outsider}');
  delete from gym_roles where user_id = '${P.outsider}';
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}','${P.staffB}','${P.trainerB}','${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.adminA}','${P.staffA}','${P.trainerA}','${P.memberA}','${P.both}');
  update profiles set active_gym_id = null where id = '${P.outsider}';`);

// ---- 0097: roles per gym, the current gym -----------------------------------
const fixtureIds = `array['${Object.values(P).join("','")}']::uuid[]`;
const gym1 = await one(`select count(*)::int as missing from profiles p
  where p.id <> all(${fixtureIds})
    and not exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = '${GYM_A}' and r.role = p.role)`);
check('every existing account has its role in Gym #1', gym1.missing === 0, `${gym1.missing} missing`);
const nogym = await one(`select count(*)::int as n from profiles where id <> all(${fixtureIds}) and active_gym_id is distinct from '${GYM_A}'`);
check('every existing account is signed in to Gym #1', nogym.n === 0, `${nogym.n} not`);

await as(P.adminB);
check('get_my_role() is the role in the current gym', (await one('select get_my_role()::text as r')).r === 'admin');
check('current_gym_id() is the active gym', (await one('select current_gym_id() as g')).g === GYM_B);
await as(P.memberA);
check('a member of Gym A only is a member', (await one('select get_my_role()::text as r')).r === 'member');
check('set_active_gym refuses a gym with no role', !!(await fails(`select set_active_gym('${GYM_B}')`)));
await as(P.both);
await db.exec(`select set_active_gym('${GYM_B}')`);
check('set_active_gym switches a two-gym member', (await one('select current_gym_id() as g')).g === GYM_B);
check('my_gyms lists both gyms', (await one('select count(*)::int as n from my_gyms()')).n === 2);
await db.exec(`select set_active_gym('${GYM_A}')`);
await as(P.outsider);
check('someone with no gym has no role and no current gym',
  (await one('select get_my_role() as r, current_gym_id() as g')).r === null);
await as(P.adminA);
check('a gym admin reads no platform_admins rows', (await one('select count(*)::int as n from platform_admins')).n === 0);
check('a gym admin cannot make themself platform admin',
  !!(await fails(`insert into platform_admins (user_id) values ('${P.adminA}')`)));
check('a gym admin cannot grant themself a role in Gym B',
  !!(await fails(`insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_B}', '${P.adminA}', 'admin', 'active')`)));
check('a gym admin sees only their own gym in gyms', (await one('select count(*)::int as n from gyms')).n === 1);
check('a gym admin cannot rename a gym directly',
  (await db.query(`update gyms set name = 'x' where id = '${GYM_A}'`)).affectedRows === 0);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
check('anon lists active gyms', (await one(`select count(*)::int as n from list_gyms('gym')`)).n >= 1);
check('anon may apply', !(await fails(`insert into gym_applications (gym_name, owner_name, email, phone)
  values ('New Gym', 'Owner', 'owner@corefitness-test.com', '09170000000')`)));
check('anon cannot approve its own application', !!(await fails(`insert into gym_applications (gym_name, owner_name, email, phone, status)
  values ('New Gym', 'Owner', 'owner@corefitness-test.com', '09170000000', 'approved')`)));
check('anon cannot read applications', (await one('select count(*)::int as n from gym_applications')).n === 0);
// A role change made the old way — today's admin app updating profiles.role —
// takes effect in the admin's gym.
await as(P.adminA);
await db.exec(`update profiles set role = 'trainer' where id = '${P.memberA}'`);
await asOwner();
check('the transition mirror copies a profiles.role change into the current gym',
  (await one(`select role::text as r from gym_roles where user_id = '${P.memberA}' and gym_id = '${GYM_A}'`)).r === 'trainer');
await as(P.adminA);
await db.exec(`update profiles set role = 'member' where id = '${P.memberA}'`);

// ---- 0098: every gym table carries gym_id; keys and references are per gym --
await asOwner();
const gymTables = (await db.query('select unnest(tenancy_gym_tables()) as t')).rows.map((r) => r.t);
// Every public table is either one gym's, or deliberately global.
const GLOBAL = ['profiles', 'push_subscriptions', 'notification_prefs', 'features', 'achievement_metrics',
  'exercises', 'workout_resources', 'client_errors', 'gyms', 'gym_roles', 'platform_admins', 'gym_applications'];
const unclassified = await db.query(`select tablename from pg_tables where schemaname = 'public'
  and tablename <> all(tenancy_gym_tables()) and tablename <> all(array['${GLOBAL.join("','")}'])`);
check('every table is either one gym\'s or deliberately global', unclassified.rows.length === 0,
  unclassified.rows.map((r) => r.tablename).join(', '));
const untagged = await db.query(`select t from unnest(tenancy_gym_tables()) t
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
    and c.table_name = t and c.column_name = 'gym_id' and c.is_nullable = 'NO')`);
check('every gym table has gym_id not null', untagged.rows.length === 0, untagged.rows.map((r) => r.t).join(', '));
const notGym1 = [];
for (const t of gymTables) {
  const n = (await one(`select count(*)::int as n from ${t} where gym_id is distinct from '${GYM_A}'`)).n;
  if (n) notGym1.push(`${t}=${n}`);
}
check('every existing row is Gym #1', notGym1.length === 0, notGym1.join(', '));
const narrow = await db.query(`select c.conrelid::regclass::text as src, pg_get_constraintdef(c.oid) as def
  from pg_constraint c where c.contype = 'f'
    and c.conrelid::regclass::text = any(tenancy_gym_tables())
    and c.confrelid::regclass::text = any(tenancy_gym_tables())
    and pg_get_constraintdef(c.oid) not like 'FOREIGN KEY (gym_id,%'`);
check('every gym-to-gym foreign key includes gym_id', narrow.rows.length === 0,
  narrow.rows.map((r) => r.src + ' ' + r.def).join(' | '));
// An owner insert that names no gym and sets no acting gym fails loudly.
check('an insert with no gym and no caller fails', !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));

// Gym B gets Gym #1's rules, then the rows later checks read.
await db.exec(`select seed_gym_defaults('${GYM_B}')`);
for (const t of ['point_rules', 'cancellation_reasons', 'goal_templates', 'achievements', 'refund_rules', 'membership_plans']) {
  const [a, b] = [(await one(`select count(*)::int as n from ${t} where gym_id = '${GYM_A}'${t === 'membership_plans' ? ' and is_active' : ''}`)).n,
    (await one(`select count(*)::int as n from ${t} where gym_id = '${GYM_B}'`)).n];
  check(`Gym B starts with Gym #1's ${t} (${b} of ${a})`, a > 0 && a === b, `${b} of ${a}`);
}
check('Gym B has its own settings row, named after the gym',
  (await one(`select gym_name from gym_settings where gym_id = '${GYM_B}'`))?.gym_name === 'Gym B');
const pfDiff = await one(`select count(*)::int as n from plan_features f join membership_plans p on p.id = f.plan_id
  where p.gym_id = '${GYM_B}' and f.gym_id <> '${GYM_B}'`);
check("Gym B's plan features are filed under Gym B", pfDiff.n === 0);
check('seeding twice adds nothing', !(await fails(`select seed_gym_defaults('${GYM_B}')`)) &&
  (await one(`select count(*)::int as n from membership_plans where gym_id = '${GYM_B}'`)).n ===
  (await one(`select count(*)::int as n from membership_plans where gym_id = '${GYM_A}' and is_active`)).n);
// Fixture rows are system writes: they name their gym, as system code must once
// two gyms exist (a trigger's side rows then land there too).
await db.exec(`
  select act_as_gym('${GYM_A}');
  insert into member_profiles (gym_id, profile_id, qr_code) values
    ('${GYM_A}', '${P.memberA}', '${P.memberA}'), ('${GYM_B}', '${P.memberB}', '${P.memberB}'),
    ('${GYM_A}', '${P.both}', '${P.both}')
    on conflict do nothing;
  insert into trainer_profiles (gym_id, profile_id) values ('${GYM_A}', '${P.trainerA}'), ('${GYM_B}', '${P.trainerB}')
    on conflict do nothing;
  insert into attendance (gym_id, member_id) values ('${GYM_A}', '${P.memberA}');
  select act_as_gym('${GYM_B}');
  insert into attendance (gym_id, member_id) values ('${GYM_B}', '${P.memberB}');
  insert into notifications (gym_id, user_id, type, title, message) values
    ('${GYM_B}', '${P.memberB}', 'system', 'B only', 'B only');
  insert into events (gym_id, title, starts_at) values ('${GYM_B}', 'Gym B open day', now() + interval '3 days');
  insert into rewards (gym_id, name, cost_points) values ('${GYM_B}', 'Gym B towel', 100);`);
const bPlan = await one(`select id from membership_plans where gym_id = '${GYM_B}' limit 1`);
await db.exec(`select act_as_gym('${GYM_B}');
  insert into memberships (gym_id, member_id, plan_id) values ('${GYM_B}', '${P.memberB}', '${bPlan.id}');
  insert into payments (gym_id, member_id, amount, method, invoice_number) values ('${GYM_B}', '${P.memberB}', 999, 'cash', 'B-0001');
  insert into classes (gym_id, name, trainer_id, scheduled_at) values ('${GYM_B}', 'Gym B Spin', '${P.trainerB}', now() + interval '2 days');`);
const aClass = await one(`select id from classes where gym_id = '${GYM_A}' limit 1`);
check('the database refuses a Gym B booking of a Gym A class',
  !!(await fails(`insert into bookings (gym_id, member_id, class_id) values ('${GYM_B}', '${P.memberB}', '${aClass.id}')`)));
check('the database refuses a Gym B membership on a Gym A plan',
  !!(await fails(`insert into memberships (gym_id, member_id, plan_id) values ('${GYM_B}', '${P.memberB}',
    (select id from membership_plans where gym_id = '${GYM_A}' limit 1))`)));
check('the database refuses a Gym A class run by a Gym B trainer',
  !!(await fails(`insert into classes (gym_id, name, trainer_id) values ('${GYM_A}', 'x', '${P.trainerB}')`)));
check('list_gyms shows branding', (await one(`select accent from list_gyms('gym b')`))?.accent === 'violet');
await db.exec(`select act_as_gym('${GYM_B}');
  insert into notifications (gym_id, user_id, type, title, message) values ('${GYM_B}', '${P.both}', 'system', 'B for both', 'B');
  insert into exercises (gym_id, name) values ('${GYM_B}', 'Gym B Secret Move');
  select act_as_gym(null);`);

// ---- 0099: nothing crosses, for every table and every role ------------------
const crossed = [];
for (const who of ['adminA', 'staffA', 'trainerA', 'memberA']) {
  await as(P[who]);
  for (const t of gymTables) {
    const seen = (await one(`select count(*)::int as n from ${t} where gym_id = '${GYM_B}'`)).n;
    // Each write in its own rolled-back transaction. A guard trigger raising is
    // still a crossing — it means the row was reachable.
    const touched = async (sql) => {
      await db.exec('begin');
      try { return (await db.query(sql)).affectedRows; } catch { return 'raised'; } finally { await db.exec('rollback'); }
    };
    const upd = await touched(`update ${t} set gym_id = gym_id where gym_id = '${GYM_B}'`);
    const del = await touched(`delete from ${t} where gym_id = '${GYM_B}'`);
    if (seen || upd || del) crossed.push(`${who}:${t} read ${seen} upd ${upd} del ${del}`);
  }
}
check('no Gym A role reads, updates or deletes a Gym B row, in any of the 51 tables', crossed.length === 0, crossed.slice(0, 8).join(' | '));
await as(P.adminA);
check('Gym A admin still sees Gym A rows', (await one('select count(*)::int as n from memberships')).n > 0);
check('Gym A admin cannot insert into Gym B',
  !!(await fails(`insert into events (gym_id, title, starts_at) values ('${GYM_B}', 'x', now())`)));
const moved = await fails(`update events set gym_id = '${GYM_B}' where gym_id = '${GYM_A}'`);
check('Gym A admin cannot move a row into Gym B', !!moved, 'the update went through');
check('an insert that names no gym lands in my gym',
  (await one(`insert into events (title, starts_at) values ('A event', now()) returning gym_id`)).gym_id === GYM_A);
check('the shared library is readable; Gym B additions are not',
  (await one(`select count(*) filter (where gym_id is null)::int as lib, count(*) filter (where gym_id = '${GYM_B}')::int as b from exercises`)).b === 0);
check("Gym A admin cannot edit Gym B's own exercise",
  (await db.query(`update exercises set name = 'x' where name = 'Gym B Secret Move'`)).affectedRows === 0);
await as(P.adminB);
check('Gym B admin cannot edit the shared library',
  (await db.query(`update exercises set name = name where gym_id is null`)).affectedRows === 0);
await as(P.adminA);
check("Gym #1's admin still curates the shared library (today's Exercises page)",
  (await db.query(`update exercises set name = name where id = (select id from exercises where gym_id is null limit 1)`)).affectedRows === 1);
await as(P.both);
check('a two-gym member sees only the current gym (in A: no B notification)',
  (await one(`select count(*)::int as n from notifications where title = 'B for both'`)).n === 0);
await db.exec(`select set_active_gym('${GYM_B}')`);
check('after switching to B, the B notification shows',
  (await one(`select count(*)::int as n from notifications where title = 'B for both'`)).n === 1);
await db.exec(`select set_active_gym('${GYM_A}')`);
// People: a gym sees its own people and nobody else's.
await as(P.adminA);
check('Gym A admin cannot read a Gym-B-only profile',
  (await one(`select count(*)::int as n from profiles where id = '${P.memberB}'`)).n === 0);
check('Gym A admin cannot edit a Gym-B-only profile',
  (await db.query(`update profiles set first_name = 'x' where id = '${P.memberB}'`)).affectedRows === 0);
check('Gym A admin reads the member of both gyms', (await one(`select count(*)::int as n from profiles where id = '${P.both}'`)).n === 1);
check('Gym A admin reads no Gym B role rows', (await one(`select count(*)::int as n from gym_roles where gym_id = '${GYM_B}'`)).n === 0);
await as(P.outsider);
check('someone with no gym reads only their own profile', (await one('select count(*)::int as n from profiles')).n === 1);
// Views: each stops at the gym edge.
await as(P.memberA);
const viewLeaks = [];
for (const v of ['activity_feed', 'bookings_needing_attention', 'class_availability', 'my_trainer_members',
  'public_trainer_credentials', 'public_trainers', 'trainer_evaluation_months', 'trainer_evaluation_summary',
  'trainer_rating_summary', 'trainer_ratings_anon']) {
  const r = await db.query(`select * from ${v}`).catch((e) => ({ err: describe(e) }));
  if (r.err) { viewLeaks.push(`${v}: ${r.err}`); continue; }
  if (r.rows.length && !('gym_id' in r.rows[0])) viewLeaks.push(`${v}: no gym_id column`);
  const n = r.rows.filter((x) => x.gym_id && x.gym_id !== GYM_A).length;
  if (n) viewLeaks.push(`${v}: ${n} rows of another gym`);
}
check('every view shows only the current gym', viewLeaks.length === 0, viewLeaks.join(' | '));
const busy = await db.query(`select distinct trainer_id from trainer_busy_slots`);
check("trainer_busy_slots names only my gym's coaches (their sessions anywhere: one body)",
  !busy.rows.some((r) => r.trainer_id === P.trainerB));
check('public_trainers lists Gym A coaches and no Gym B coach',
  !(await db.query(`select id from public_trainers`)).rows.some((r) => r.id === P.trainerB));
// Suspended / overdue: read-only.
const setGymB = async (sql) => { await asOwner(); await db.exec(`update gyms set ${sql} where id = '${GYM_B}'`); await as(P.adminB); };
await setGymB(`status = 'suspended'`);
check('a suspended gym can still read', (await one('select count(*)::int as n from memberships')).n > 0);
check('a suspended gym cannot write', !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));
check('a suspended gym cannot edit', (await db.query(`update events set title = 'x'`)).affectedRows === 0);
check('the lock reason says suspended', (await one('select gym_lock_reason() as r')).r === 'suspended');
await setGymB(`status = 'active', paid_until = current_date - 8`);
check('8 days past paid-until is read-only', !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));
check('the lock reason says overdue', (await one('select gym_lock_reason() as r')).r === 'overdue');
await setGymB(`paid_until = current_date - 6`);
check('6 days past still writes (7-day grace)', !(await fails(`insert into events (title, starts_at) values ('grace', now())`)));
await setGymB(`paid_until = null`);
check('an unlocked gym has no lock reason', (await one('select gym_lock_reason() as r')).r === null);
// No rule reads the global role; every one means "in my current gym".
await asOwner();
const direct = await db.query(`select tablename, policyname from pg_policies
  where schemaname = 'public' and (coalesce(qual, '') ~ 'profiles' or coalesce(with_check, '') ~ 'profiles')
    and (coalesce(qual, '') ~ '\\mrole\\M' or coalesce(with_check, '') ~ '\\mrole\\M')`);
check('no policy reads profiles.role directly', direct.rows.length === 0,
  direct.rows.map((r) => r.tablename + '.' + r.policyname).join(', '));
const rlsOff = await db.query(`select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r' and not c.relrowsecurity`);
check('RLS is on for every table', rlsOff.rows.length === 0, rlsOff.rows.map((r) => r.relname).join(', '));

// ---- 0100: accounts and money stay in one gym --------------------------------
await asOwner();
check('a person can hold a member profile in each of two gyms', !(await fails(`select act_as_gym('${GYM_B}');
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${GYM_B}', '${P.both}', '${P.both}');`)));
await as(P.adminB);
const cashB = await one(`select * from cash_day_summary((now() at time zone 'Asia/Manila')::date)`);
check('Gym B cash drawer counts only Gym B cash', Number(cashB.cash_in) === 999 && cashB.payment_count === 1,
  JSON.stringify({ cash_in: cashB.cash_in, n: cashB.payment_count }));
const invB = (await one(`select next_invoice_number(extract(year from now())::int) as n`)).n;
check('invoice numbers run per gym (Gym B is on its second)', /-0002$/.test(invB), invB);
await as(P.adminA);
const cashA = await one(`select * from cash_day_summary((now() at time zone 'Asia/Manila')::date)`);
await asOwner();
const cashAExpected = (await one(`select coalesce(sum(amount), 0) as s from payments where gym_id = '${GYM_A}'
  and status = 'completed' and lower(method) = 'cash'
  and coalesce(paid_on, (created_at at time zone 'Asia/Manila')::date) = (now() at time zone 'Asia/Manila')::date`)).s;
check("Gym A's drawer is Gym A's cash only", Number(cashA.cash_in) === Number(cashAExpected), `${cashA.cash_in} vs ${cashAExpected}`);
await as(P.adminA);
check('Gym A admin cannot change a Gym-B-only account',
  !!(await fails(`select set_account_status('${P.memberB}', 'suspended', 'test')`)));
await db.exec(`select set_account_status('${P.both}', 'suspended', 'tenancy test')`);
await asOwner();
const bothRoles = await db.query(`select gym_id::text as g, status from gym_roles where user_id = '${P.both}'`);
const st = Object.fromEntries(bothRoles.rows.map((r) => [r.g, r.status]));
check('suspending in Gym A suspends there and leaves Gym B untouched', st[GYM_A] === 'suspended' && st[GYM_B] === 'active', JSON.stringify(st));
await db.exec(`update gym_roles set status = 'active' where user_id = '${P.both}'`);
const bPlanId = (await one(`select id from membership_plans where gym_id = '${GYM_B}' and tier = 'premium' limit 1`)).id;
await as(P.adminA);
check('Gym A admin cannot retire a Gym B plan', !!(await fails(`select * from retire_plan('${bPlanId}')`)));
const bMembership = (await (async () => { await asOwner(); return one(`select id from memberships where gym_id = '${GYM_B}' limit 1`); })()).id;
await as(P.adminA);
check('Gym A desk cannot quote a Gym B refund', !!(await fails(`select * from refund_quote('${bMembership}')`)));
await as(P.adminB);
check('Gym B desk quotes its own refund', !(await fails(`select * from refund_quote('${bMembership}')`)));
// Sign-up into a chosen gym; today's sign-up (no gym) goes to Gym #1.
await asOwner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('5a000000-0000-4000-8000-000000000001', 'joinb@corefitness-test.com',
   '{"signup_source":"member_self_registration","first_name":"Join","last_name":"B","gym_id":"${GYM_B}"}'),
  ('5a000000-0000-4000-8000-000000000002', 'oldapp@corefitness-test.com',
   '{"signup_source":"member_self_registration","first_name":"Old","last_name":"App"}')`);
const joined = await db.query(`select user_id::text as u, gym_id::text as g, status from gym_roles where user_id::text like '5a000000%' order by 1`);
check('sign-up lands in the chosen gym, pending', joined.rows[0]?.g === GYM_B && joined.rows[0]?.status === 'pending_approval'
  && joined.rows.filter((r) => r.u.endsWith('1')).length === 1, JSON.stringify(joined.rows));
check("today's sign-up (no gym sent) lands in Gym #1", joined.rows.find((r) => r.u.endsWith('2'))?.g === GYM_A);
check('the chosen gym has the pending registration and member row',
  (await one(`select count(*)::int as n from pending_registrations where gym_id = '${GYM_B}' and email = 'joinb@corefitness-test.com'`)).n === 1 &&
  (await one(`select count(*)::int as n from member_profiles where gym_id = '${GYM_B}' and profile_id = '5a000000-0000-4000-8000-000000000001'`)).n === 1);
check('sign-up to a suspended gym is refused', !!(await fails(`update gyms set status = 'suspended' where id = '${GYM_B}';
  insert into auth.users (id, email, raw_user_meta_data) values ('5a000000-0000-4000-8000-000000000003', 'late@corefitness-test.com',
   '{"signup_source":"member_self_registration","gym_id":"${GYM_B}"}')`)));
await db.exec(`update gyms set status = 'active' where id = '${GYM_B}'`);
await as(P.memberA);
await db.exec(`select request_to_join('${GYM_B}')`);
await asOwner();
check('asking to join another gym is pending there',
  (await one(`select status from gym_roles where user_id = '${P.memberA}' and gym_id = '${GYM_B}'`))?.status === 'pending_approval');
check("that gym's desk is told", (await one(`select count(*)::int as n from notifications
  where gym_id = '${GYM_B}' and user_id = '${P.adminB}' and title = 'New member request'`)).n === 1);
await as(P.adminB);
await db.exec(`select set_account_status('${P.memberA}', 'active')`);
await asOwner();
check('Gym B approves them; Gym A is unchanged',
  (await one(`select string_agg(gym_id::text || '=' || status, ',' order by gym_id) as s from gym_roles where user_id = '${P.memberA}'`)).s
    === `${GYM_B}=active,${GYM_A}=active`.split(',').sort().join(','));
await db.exec(`delete from gym_roles where user_id = '${P.memberA}' and gym_id = '${GYM_B}';
  delete from member_profiles where profile_id = '${P.memberA}' and gym_id = '${GYM_B}';`);

finish();
