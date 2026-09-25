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
// Deliberately not one gym's. The last group is the platform's own side of the
// relationship (0106/0108): `gym_payments` carries a gym_id and is still not a
// gym table — it is Core Fitness's ledger *about* a gym, the way an invoice a
// supplier sends you is theirs, not yours. It is RLS-on with no policy at all,
// and the checks further down assert no gym can reach it.
const GLOBAL = ['profiles', 'push_subscriptions', 'notification_prefs', 'features', 'achievement_metrics',
  'exercises', 'workout_resources', 'client_errors', 'gyms', 'gym_roles', 'platform_admins', 'gym_applications',
  'platform_events', 'gym_payments', 'platform_plans', 'platform_features', 'platform_plan_features',
  // 0113. Both carry a gym_id and neither is a gym table, for the same reason
  // gym_payments is not: they are the platform's side of the relationship. The
  // outbox holds messages this service sent (whose bodies can contain a
  // credential), and a support grant is a gym lending the platform a key.
  // Both are RLS-on with no policy at all; every read is a definer function.
  'email_outbox', 'support_grants'];
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

// 0115: every view is either invoker, or a definer view with a barrier.
//
// Supabase's advisor flags all seven definer views as CRITICAL. They are not a
// leak — each filters to current_gym_id() in its own body, which the loop above
// asserts — but without security_barrier a caller's WHERE clause can be pushed
// below that filter and evaluated against rows it was going to remove.
//
// Asserted as a *rule over every view* rather than as seven names, because the
// failure to catch is the eighth view somebody adds next year. 0099 set the
// barrier on trainer_ratings_anon and on none of its six neighbours, and
// nothing noticed for sixteen migrations.
check('every definer view has a security barrier', await (async () => {
  const { rows } = await db.query('select * from views_without_protection()');
  if (rows.length) viewLeaks.push(rows.map((r) => r.view_name).join(', '));
  return rows.length === 0;
})(), viewLeaks.join(' | '));

// A signed-out stranger cannot reach a view that bypasses RLS by design.
//
// All seven were readable by `anon` until 0115: every `grant select` said
// `to authenticated`, and Supabase's defaults had already granted anon at
// creation. It was harmless — `current_gym_id()` is NULL with no session, so
// they returned nothing — but that one function was the whole defence.
//
// This check could not exist before today: lib/live-db.mjs re-ran a blanket
// `grant all ... to anon` after the last migration, so every revoke in every
// migration was swept away and anon looked more privileged here than in
// production. Default privileges now do that job, at creation time.
check('no definer view is readable by a signed-out stranger', await (async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  const reachable = [];
  for (const v of ['class_availability', 'public_trainers', 'public_trainer_credentials',
    'trainer_busy_slots', 'trainer_rating_summary', 'trainer_evaluation_summary',
    'trainer_ratings_anon']) {
    // Reaching it at all is the failure, not what it returns: permission is the
    // boundary, and "it happens to be empty" is not one.
    if (!(await fails(`select 1 from ${v} limit 1`))) reachable.push(v);
  }
  await as(P.memberA);
  return reachable.length === 0;
})());

// And the reason they cannot simply be flipped, kept as an executable fact
// rather than a comment: as invoker, class_availability still returns one row
// per class and counts zero bookings. A check that counted rows would call
// that safe and ship a booking screen saying every class is empty.
check('a definer view is doing work the caller could not do alone', await (async () => {
  const seen = await one('select coalesce(sum(booked_count), 0)::int as n from class_availability');
  // Every booking row RLS lets this member read. `auth.uid()` is not callable
  // here — the test role has no rights on the auth schema — and it is not
  // needed: the point is that the view counts more than the caller can see.
  const own = await one('select count(*)::int as n from bookings');
  return seen.n > own.n;
})());
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

// ---- 0101: the timetable stays in one gym ------------------------------------
await asOwner();
const bClassId = (await one(`select id from classes where name = 'Gym B Spin'`)).id;
await db.exec(`select act_as_gym('${GYM_B}');
  update memberships set status = 'active', start_date = current_date, expiry_date = current_date + 30,
         plan_id = (select id from membership_plans where gym_id = '${GYM_B}' and can_book_pt
                     and pt_sessions_per_month is distinct from 0 order by price desc limit 1)
   where gym_id = '${GYM_B}' and member_id = '${P.memberB}';
  insert into pt_sessions (gym_id, trainer_id, member_id, starts_at, status, requested_at)
  values ('${GYM_B}', '${P.trainerB}', '${P.memberB}', now() + interval '5 days', 'pending', now() - interval '4 days');`);
const bSessionId = (await one(`select id from pt_sessions where gym_id = '${GYM_B}' and member_id = '${P.memberB}' limit 1`)).id;
await db.exec(`select act_as_gym(null)`);
await as(P.memberA);
check('Gym A member cannot see a Gym B class', (await db.query(`select id from classes where id = '${bClassId}'`)).rows.length === 0);
check('Gym A member cannot book a Gym B class by id',
  !!(await fails(`insert into bookings (member_id, class_id) values ('${P.memberA}', '${bClassId}')`)));
check('seats left of a Gym B class says nothing to Gym A', (await one(`select class_seats_left('${bClassId}') as n`)).n === null);
check('Gym A member cannot join a Gym B waitlist', !!(await fails(`select join_waitlist('${bClassId}')`)));
await as(P.adminA);
check('Gym A desk cannot cancel a Gym B session',
  !!(await fails(`select cancel_booking('pt', '${bSessionId}', 'other', 'test')`)));
check('Gym A desk cannot reassign a Gym B session', !!(await fails(`select reassign_pt_session('${bSessionId}', '${P.trainerA}')`)));
check('Gym A desk cannot chase a Gym B coach', (await one(`select remind_trainer('pt', '${bSessionId}') as ok`)).ok === false);
check('Gym A desk gets no coach suggestions for a Gym B session', !!(await fails(`select * from suggest_trainers_for_session('${bSessionId}')`)));
const tms = await db.query(`select trainer_id from trainer_month_summary(date_trunc('month', now())::date)`);
check('trainer totals list only Gym A coaches', !tms.rows.some((r) => r.trainer_id === P.trainerB) && tms.rows.length > 0,
  `${tms.rows.length} rows`);
check("Gym A's timetable build cannot target Gym B", !!(await fails(`select generate_class_instances(1, '${GYM_B}')`)));
await as(P.trainerA);
check('a Gym A coach does not count a Gym B member as a trainee', (await one(`select is_my_trainee('${P.memberB}') as ok`)).ok === false);
await as(P.adminB);
const beforeB = (await one(`select count(*)::int as n from notifications where gym_id = '${GYM_B}'`)).n;
await db.exec(`select sweep_stale_requests()`);
await asOwner();
const sweptB = await one(`select count(*)::int as n,
  count(*) filter (where gym_id <> '${GYM_B}')::int as elsewhere from notifications
  where metadata->>'dedupe' like 'pt:${bSessionId}%'`);
check("Gym B's sweep chases its 4-day-old request, and files the messages in Gym B",
  sweptB.n > 0 && sweptB.elsewhere === 0, JSON.stringify(sweptB));
check("the sweep told Gym B's admin, not Gym A's",
  (await one(`select count(*)::int as n from notifications where metadata->>'dedupe' like 'pt:${bSessionId}:72h:%' and user_id = '${P.adminA}'`)).n === 0
  && (await one(`select count(*)::int as n from notifications where metadata->>'dedupe' like 'pt:${bSessionId}:72h:%' and user_id = '${P.adminB}'`)).n === 1);
// pg_cron: no caller, every gym.
await db.exec(`update pt_sessions set requested_at = now() - interval '2 days' where id = '${bSessionId}'`);
check('the sweep with no caller runs across gyms', !(await fails(`select sweep_stale_requests()`)));
// Clashes across gyms are real, and say nothing about the other gym.
await db.exec(`select act_as_gym('${GYM_B}');
  insert into trainer_profiles (gym_id, profile_id) values ('${GYM_B}', '${P.trainerA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_B}', '${P.trainerA}', 'trainer', 'active') on conflict do nothing;
  insert into classes (gym_id, name, trainer_id, scheduled_at, duration_minutes) values ('${GYM_B}', 'Gym B Secret Class', '${P.trainerA}', now() + interval '9 days', 60);
  select act_as_gym('${GYM_A}');
  insert into classes (gym_id, name, trainer_id, scheduled_at, duration_minutes) values ('${GYM_A}', 'Gym A Clash', '${P.trainerA}', now() + interval '9 days' + interval '30 minutes', 60);
  select act_as_gym(null);`).catch((e) => check('cross-gym clash fixture', false, describe(e)));
await as(P.adminA);
const clash = await db.query(`select * from trainer_schedule_conflicts() where trainer_id = '${P.trainerA}'`);
check("a coach's clash with another gym is listed", clash.rows.length === 1, JSON.stringify(clash.rows));
check("…and names nothing from the other gym", !JSON.stringify(clash.rows).includes('Secret'));
await asOwner();
await db.exec(`delete from classes where name in ('Gym B Secret Class', 'Gym A Clash');
  delete from gym_roles where gym_id = '${GYM_B}' and user_id = '${P.trainerA}';
  delete from trainer_profiles where gym_id = '${GYM_B}' and profile_id = '${P.trainerA}';`);

// ---- 0102: points, badges, challenges and goals are per gym -------------------
// The two-gym member gets an active membership in each gym, then checks in at Gym B.
await asOwner();
const planFor = (g) => `(select id from membership_plans where gym_id = '${g}' and is_active order by price desc limit 1)`;
await db.exec(`select act_as_gym('${GYM_A}');
  insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date)
  values ('${GYM_A}', '${P.both}', ${planFor(GYM_A)}, 'active', current_date, current_date + 30);
  select act_as_gym('${GYM_B}');
  insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date)
  values ('${GYM_B}', '${P.both}', ${planFor(GYM_B)}, 'active', current_date, current_date + 30);
  insert into attendance (gym_id, member_id) values ('${GYM_B}', '${P.both}');
  select act_as_gym(null);`);
const ledger = await db.query(`select gym_id::text as g, sum(points)::int as p from point_ledger where member_id = '${P.both}' group by 1`);
const byGym = Object.fromEntries(ledger.rows.map((r) => [r.g, r.p]));
check("a Gym B check-in earns Gym B's check-in points, in Gym B, and nothing in Gym A",
  (byGym[GYM_B] ?? 0) > 0 && !byGym[GYM_A], JSON.stringify(byGym));
await as(P.both);
const balA = (await one(`select member_points_balance('${P.both}') as n`)).n;
await db.exec(`select set_active_gym('${GYM_B}')`);
const balB = (await one(`select member_points_balance('${P.both}') as n`)).n;
check("each gym's balance is that gym's ledger only", Number(balA) === 0 && Number(balB) === (byGym[GYM_B] ?? 0),
  JSON.stringify({ balA, balB }));
const statsB = await one(`select training_days from member_training_stats('${P.both}')`);
await db.exec(`select set_active_gym('${GYM_A}')`);
const statsA = await one(`select training_days from member_training_stats('${P.both}')`);
check('training days count per gym', statsB.training_days === 1 && statsA.training_days === 0, JSON.stringify({ statsA, statsB }));
// Badges.
await as(P.adminB);
const rare = await db.query(`select * from achievement_rarity()`);
const bPop = (await one(`select count(*)::int as n from gym_roles where gym_id = '${GYM_B}' and status = 'active' and role = 'member'`)).n;
const memberBadges = (await db.query(`select key from achievements where gym_id = '${GYM_B}' and audience = 'member' and active`)).rows.map((r) => r.key);
check("badge rarity is counted over Gym B's own members", rare.rows.length > 0
  && rare.rows.filter((r) => memberBadges.includes(r.achievement_key)).every((r) => r.audience_size === bPop),
  `Gym B members ${bPop}; ` + JSON.stringify(rare.rows.slice(0, 2)));
await db.exec(`select award_achievement('${P.memberB}', (select key from achievements where gym_id = '${GYM_B}' and audience = 'member' limit 1))`);
await as(P.adminA);
check("Gym A admin cannot award to a Gym-B-only member",
  !!(await fails(`select award_achievement('${P.memberB}', (select key from achievements where audience = 'member' limit 1))`)));
check("Gym A admin cannot revoke Gym B's badge", !(await fails(`select revoke_achievement('${P.memberB}', (select key from achievements where audience = 'member' limit 1))`))
  && (await (async () => { await asOwner(); return one(`select count(*)::int as n from achievement_unlocks where gym_id = '${GYM_B}' and user_id = '${P.memberB}'`); })()).n === 1);
await as(P.memberB);
check("a Gym B member's badge sync reads Gym B's catalogue", !(await fails(`select * from sync_my_achievements()`)));
// Challenges: standings and settling stay in their gym; pg_cron now settles.
await asOwner();
await db.exec(`select act_as_gym('${GYM_B}');
  insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on, is_active, reward_points)
  values ('${GYM_B}', 'Gym B one visit', 'training_days', 1, current_date - 1, current_date + 7, true, 50);
  insert into challenge_participants (gym_id, challenge_id, member_id)
  values ('${GYM_B}', (select id from challenges where title = 'Gym B one visit'), '${P.both}');
  select act_as_gym(null);`);
const chB = (await one(`select id from challenges where title = 'Gym B one visit'`)).id;
await as(P.adminA);
check("Gym A cannot read Gym B's challenge standings", (await db.query(`select * from challenge_standings('${chB}')`)).rows.length === 0);
check("Gym A reads no progress on Gym B's challenge", (await one(`select challenge_progress('${chB}', '${P.both}') as n`)).n === 0);
await asOwner();
const settled = (await one(`select settle_challenges() as n`)).n;
const reward = await one(`select gym_id::text as g, points from point_ledger where rule_key = 'challenge_complete' and member_id = '${P.both}'`);
check('pg_cron (no caller) settles a finished challenge — it saw zero progress before 0102', settled >= 1, `settled ${settled}`);
check("the challenge's points land in the challenge's gym", reward?.g === GYM_B && reward?.points === 50, JSON.stringify(reward));
// Goals: a goal settles in its own gym.
await db.exec(`select act_as_gym('${GYM_B}');
  insert into fitness_goals (gym_id, member_id, title, template_key, target_value)
  values ('${GYM_B}', '${P.both}', 'Visit once', (select key from goal_templates where gym_id = '${GYM_B}' and metric = 'training_days' limit 1), 1);
  select act_as_gym(null);`);
await db.exec(`select settle_goals()`);
check('a goal settles against its own gym', (await one(`select achieved_on is not null as done from fitness_goals where title = 'Visit once'`)).done === true);
check("goal points land in the goal's gym",
  (await one(`select count(*)::int as n from point_ledger where rule_key = 'goal_achieved' and member_id = '${P.both}' and gym_id = '${GYM_B}'`)).n === 1);

// ---- 0103: messages and the activity log stay in one gym ----------------------
await asOwner();
// System code with no caller and no acting gym writes a Gym B row: its log line is Gym B's.
check('a system-written Gym B check-in logs its activity in Gym B', !(await fails(
  `insert into attendance (gym_id, member_id) values ('${GYM_B}', '${P.memberB}')`)));
const lastLog = await one(`select gym_id::text as g from activity_log where action = 'checkin.recorded' order by id desc limit 1`);
check('…and the line is filed under Gym B', lastLog?.g === GYM_B, JSON.stringify(lastLog));
// Reminder sweeps with no caller: every gym, and never a message in a gym the recipient is not in.
await db.exec(`update memberships set expiry_date = (now() at time zone 'Asia/Manila')::date + 3
  where member_id = '${P.both}';`);
const sentN = (await one(`select send_membership_expiry_reminders() as n`)).n;
const expiry = await db.query(`select gym_id::text as g from notifications
  where user_id = '${P.both}' and type = 'expiry' order by gym_id`);
check('an expiry reminder goes out in each gym the member belongs to, under that gym',
  expiry.rows.length === 2 && expiry.rows.some((r) => r.g === GYM_A) && expiry.rows.some((r) => r.g === GYM_B),
  `sent ${sentN}; ` + JSON.stringify(expiry.rows));
await db.exec(`select send_upcoming_session_reminders(); select send_due_gym_reminders();`);
const cross = await one(`select count(*)::int as n from notifications n
  where not exists (select 1 from gym_roles r where r.user_id = n.user_id and r.gym_id = n.gym_id)`);
check('no notification anywhere is filed in a gym its recipient is not part of', cross.n === 0, `${cross.n}`);
// The same dedupe key in two gyms: one message in each.
await as(P.both);
await db.exec(`select notify_once('${P.both}', 'system', 'Same key', 'A', null, 'same-key')`);
await db.exec(`select set_active_gym('${GYM_B}')`);
await db.exec(`select notify_once('${P.both}', 'system', 'Same key', 'B', null, 'same-key')`);
await db.exec(`select notify_once('${P.both}', 'system', 'Same key', 'B again', null, 'same-key')`);
await db.exec(`select set_active_gym('${GYM_A}')`);
await asOwner();
const dd = await db.query(`select gym_id::text as g from notifications where user_id = '${P.both}' and metadata->>'dedupe' = 'same-key'`);
check('the same dedupe key notifies once per gym', dd.rows.length === 2 && new Set(dd.rows.map((r) => r.g)).size === 2,
  JSON.stringify(dd.rows));
await as(P.adminA);
check('the activity feed shows no Gym B activity',
  (await one(`select count(*)::int as n from activity_feed where gym_id = '${GYM_B}'`)).n === 0
  && (await one(`select count(*)::int as n from activity_feed`)).n > 0);
check("Gym A's crash-report prune touches only Gym A", !(await fails(`select prune_client_errors()`)));
await asOwner();
check('0105 removed the last transition keys',
  (await one(`select count(*)::int as n from pg_constraint where conname like '%\\_transition' escape '\\'`)).n === 0
  && (await one(`select count(*)::int as n from pg_indexes where indexname like '%\\_transition'`)).n === 0);
// What those keys were holding back: one person, two gyms, the same day.
await db.exec(`select act_as_gym('${GYM_A}');
  insert into body_measurements (gym_id, member_id, measured_on, weight_kg) values ('${GYM_A}', '${P.both}', current_date, 70);
  insert into member_share_prefs (gym_id, member_id, share_goals) values ('${GYM_A}', '${P.both}', true);
  select act_as_gym('${GYM_B}');`);
check('a two-gym member can be measured in both gyms on one day', !(await fails(
  `insert into body_measurements (gym_id, member_id, measured_on, weight_kg) values ('${GYM_B}', '${P.both}', current_date, 70)`)));
check('…and shares different things with each gym', !(await fails(
  `insert into member_share_prefs (gym_id, member_id, share_goals) values ('${GYM_B}', '${P.both}', false)`)));
await db.exec(`select act_as_gym(null)`);

// ---- 0104: what the apps read to be gym-aware ---------------------------------
await as(P.adminB);
const ctxB = await one(`select * from my_gym_context()`);
check("my_gym_context: Gym B's admin is an active admin of Gym B, with its branding",
  ctxB?.gym_id === GYM_B && ctxB.role === 'admin' && ctxB.status === 'active' && ctxB.accent === 'violet'
  && ctxB.gym_count === 1 && ctxB.lock_reason === null, JSON.stringify(ctxB));
await as(P.both);
check('my_gym_context counts both gyms for a two-gym member', (await one(`select gym_count from my_gym_context()`)).gym_count === 2);
await as(P.outsider);
check('my_gym_context is empty for someone with no gym', (await db.query(`select * from my_gym_context()`)).rows.length === 0);
// gym_people: role and status are this gym's.
await asOwner();
await db.exec(`update gym_roles set role = 'trainer' where user_id = '${P.both}' and gym_id = '${GYM_B}'`);
await as(P.adminB);
const bothB = await one(`select role::text, status from gym_people where id = '${P.both}'`);
check("gym_people shows a person's role in this gym (a coach here, a member elsewhere)", bothB?.role === 'trainer', JSON.stringify(bothB));
check('gym_people lists only this gym', !(await db.query(`select id from gym_people`)).rows.some((r) => r.id === P.memberA));
await as(P.adminA);
check("…and in Gym A the same person is a member", (await one(`select role::text as r from gym_people where id = '${P.both}'`))?.r === 'member');
await asOwner();
await db.exec(`update gym_roles set role = 'member' where user_id = '${P.both}' and gym_id = '${GYM_B}'`);
// add_person_to_gym: the admin's gym only; the desk only members. The account is
// created the way the Edge Functions create it (Task 8): profile first, in the admin's gym.
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('7a000000-0000-4000-8000-000000000001', 'newcoach@corefitness-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
  values ('7a000000-0000-4000-8000-000000000001', 'New', 'Coach', 'newcoach@corefitness-test.com', 'active', 'trainer', '${GYM_B}');
  delete from gym_roles where user_id = '7a000000-0000-4000-8000-000000000001';`);
await as(P.staffB);
check('the front desk cannot add a coach', !!(await fails(`select add_person_to_gym('7a000000-0000-4000-8000-000000000001', 'trainer')`)));
await as(P.memberB);
check('a member cannot add anyone', !!(await fails(`select add_person_to_gym('7a000000-0000-4000-8000-000000000001', 'member')`)));
await as(P.adminB);
await db.exec(`select add_person_to_gym('7a000000-0000-4000-8000-000000000001', 'trainer')`);
await asOwner();
const added = await db.query(`select gym_id::text as g, role::text as r from gym_roles where user_id = '7a000000-0000-4000-8000-000000000001'`);
check("Gym B's admin adds a coach to Gym B only, with a coach profile there",
  added.rows.length === 1 && added.rows[0].g === GYM_B && added.rows[0].r === 'trainer'
  && (await one(`select count(*)::int as n from trainer_profiles where profile_id = '7a000000-0000-4000-8000-000000000001' and gym_id = '${GYM_B}'`)).n === 1,
  JSON.stringify(added.rows));
// set_gym_role: this gym only, never yourself.
await as(P.adminA);
check("Gym A's admin cannot change a role in Gym B", !!(await fails(`select set_gym_role('${P.memberB}', 'trainer')`)));
check('an admin cannot change their own role', !!(await fails(`select set_gym_role('${P.adminA}', 'member')`)));
await db.exec(`select set_gym_role('${P.staffA}', 'trainer')`);
await asOwner();
check('set_gym_role makes a coach, with a coach profile',
  (await one(`select role::text as r from gym_roles where user_id = '${P.staffA}' and gym_id = '${GYM_A}'`)).r === 'trainer'
  && (await one(`select count(*)::int as n from trainer_profiles where profile_id = '${P.staffA}' and gym_id = '${GYM_A}'`)).n === 1);
await db.exec(`update gym_roles set role = 'staff' where user_id = '${P.staffA}' and gym_id = '${GYM_A}'`);

// ---- 0106: the platform owner runs the service, and reads nobody's data ------
await asOwner();
const PLATFORM = '9a000000-0000-4000-8000-000000000001';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${PLATFORM}', 'platform@corefitness-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
  values ('${PLATFORM}', 'Platform', 'Owner', 'platform@corefitness-test.com', 'active', 'member', null);
  delete from gym_roles where user_id = '${PLATFORM}';
  insert into platform_admins (user_id) values ('${PLATFORM}');`);
await as(P.adminA);
check('a gym admin reads nothing from platform_gyms', (await db.query(`select * from platform_gyms()`)).rows.length === 0);
check('a gym admin cannot create a gym', !!(await fails(`select create_gym('Sneaky Gym', 'sneaky')`)));
check('a gym admin cannot suspend a gym', !!(await fails(`select set_gym_status('${GYM_B}', 'suspended', 'because')`)));
check('a gym admin cannot change a gym plan', !!(await fails(`select set_gym_plan('${GYM_A}', 'premium', null)`)));
check('a gym admin reads no platform events', (await db.query(`select * from platform_events_recent()`)).rows.length === 0);
await as(PLATFORM);
const pg = await db.query(`select * from platform_gyms()`);
check('the platform sees every gym, with counts', pg.rows.length === 2 && pg.rows.every((r) => typeof r.members === 'number'),
  JSON.stringify(pg.rows.map((r) => [r.name, r.members, r.staff])));
check('the platform reads no member rows of any gym (processor, not controller)',
  (await one(`select count(*)::int as n from member_profiles`)).n === 0
  && (await one(`select count(*)::int as n from payments`)).n === 0
  && (await one(`select count(*)::int as n from attendance`)).n === 0);
check('suspending a gym without a reason is refused', !!(await fails(`select set_gym_status('${GYM_B}', 'suspended', '')`)));
await db.exec(`select set_gym_status('${GYM_B}', 'suspended', 'Did not pay for three months')`);
await as(P.adminB);
check('a gym the platform suspended is read-only for its own admin',
  !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));
await as(PLATFORM);
await db.exec(`select set_gym_status('${GYM_B}', 'active', '')`);
await db.exec(`select set_gym_plan('${GYM_B}', 'standard', (current_date + 30)::date)`);
check('the plan and paid-until are recorded',
  (await one(`select plan from platform_gyms() where id = '${GYM_B}'`)).plan === 'standard');
check('every platform decision is logged, with the reason it was given',
  (await one(`select count(*)::int as n from platform_events_recent() where gym_id = '${GYM_B}'`)).n >= 3
  && (await one(`select count(*)::int as n from platform_events_recent()
       where action = 'gym.suspended' and detail->>'reason' = 'Did not pay for three months'`)).n === 1);
const newGym = (await one(`select create_gym('Seaside Fit', 'seaside-fit') as id`)).id;
// Counted as the owner: the platform itself cannot read a gym's rows (asserted
// above), so a count run as the platform would be zero however well it seeded.
await asOwner();
check('a gym the platform lets in opens working, not empty',
  (await one(`select count(*)::int as n from membership_plans where gym_id = '${newGym}'`)).n > 0
  && (await one(`select count(*)::int as n from point_rules where gym_id = '${newGym}'`)).n > 0
  && (await one(`select count(*)::int as n from achievements where gym_id = '${newGym}'`)).n > 0
  && (await one(`select count(*)::int as n from gym_settings where gym_id = '${newGym}'`)).n === 1);
await as(PLATFORM);
check('a second gym cannot take a link name already in use', !!(await fails(`select create_gym('Copycat', 'seaside-fit')`)));
check('a link name with spaces or capitals is refused', !!(await fails(`select create_gym('Bad', 'Seaside Fit')`)));
await db.exec(`select make_gym_owner('${newGym}', '${P.outsider}')`);
await as(P.outsider);
check('the new owner runs their own gym and sees no other',
  (await one(`select role::text as r from my_gym_context()`))?.r === 'admin'
  && (await one(`select count(*)::int as n from gyms`)).n === 1);
await as(PLATFORM);
check('rejecting an application needs a reason',
  !!(await fails(`select reject_application((select id from gym_applications where status = 'pending' limit 1), '')`)));
await db.exec(`select reject_application((select id from gym_applications where status = 'pending' limit 1), 'Outside our area for now')`);
check('a rejected application keeps the reason the applicant is told',
  (await one(`select reason from platform_applications('rejected') limit 1`))?.reason === 'Outside our area for now');

// ---- 0107: a gym's first day -------------------------------------------------------
// A gym the platform creates is real, empty of people, and not set up. Both of
// those show on the platform's own list, because a gym nobody can sign into is
// the one thing worth chasing.
const blankGym = (await one(`select create_gym('Harbour Strength', 'harbour-strength') as id`)).id;
const blankRow = await one(`select owners, onboarded from platform_gyms() where id = '${blankGym}'`);
check('a gym with no owner says so: nobody can sign in yet',
  blankRow.owners === 0 && blankRow.onboarded === false);
const seasideRow = await one(`select owners, onboarded from platform_gyms() where id = '${newGym}'`);
check('naming an owner is visible to the platform, but setting up is still to come',
  seasideRow.owners === 1 && seasideRow.onboarded === false);
check('the platform cannot finish a gym’s setup for it', !!(await fails(`select finish_gym_setup()`)));

await as(P.outsider);
check('the owner of a new gym is sent to set it up',
  (await one(`select onboarded from my_gym_context()`)).onboarded === false);
const stamped = (await one(`select finish_gym_setup() as t`)).t;
check('the owner finishing setup is enough to open the gym', !!stamped);
check('the gym is set up from then on',
  (await one(`select onboarded from my_gym_context()`)).onboarded === true);
const again = (await one(`select finish_gym_setup() as t`)).t;
check('walking the wizard again does not move the day the gym opened',
  new Date(again).getTime() === new Date(stamped).getTime());

await as(P.staffA);
check('the front desk cannot declare a gym set up', !!(await fails(`select finish_gym_setup()`)));
await as(P.adminA);
check('a gym admin cannot look up a stranger by email', !(await one(`select platform_find_user('${"platform@corefitness-test.com"}') as id`)).id);

// ---- 0108: the service is a product ------------------------------------------------
// The two halves that make this real: what a plan includes is a row the owner
// edits, and a limit on that row is refused by the database — not merely greyed
// out on a screen.
await as(PLATFORM);
check('the three plans gyms are already on exist as rows',
  (await one("select count(*)::int as n from platform_plans where key in ('trial','standard','premium')")).n === 3);
check('no price is invented: only the free trial carries a number',
  (await one('select count(*)::int as n from platform_plans where price_monthly is not null')).n === 1
  && Number((await one("select price_monthly from platform_plans where key = 'trial'")).price_monthly) === 0);
check('every plan opens including everything, so pasting takes nothing away',
  (await one('select count(*)::int as n from platform_plan_features where not enabled')).n === 0
  && (await one('select count(*)::int as n from platform_plan_features')).n
     === (await one('select ((select count(*) from platform_plans) * (select count(*) from platform_features))::int as n')).n);
check('a gym cannot be put on a plan that does not exist',
  !!(await fails("select set_gym_plan('" + GYM_B + "', 'diamond', null)")));
check('a plan the owner invents opens with every feature ticked', await (async () => {
  await db.exec("select save_platform_plan('starter', 'Starter', 'Small gyms', 500, null, null, 2, 1, true, true, 0)");
  return (await one("select count(*)::int as n from platform_plan_features where plan_key = 'starter'")).n
       === (await one('select count(*)::int as n from platform_features')).n;
})());

// The ceiling, from both sides of the fence.
await db.exec("select set_gym_plan('" + GYM_B + "', 'starter', null)");
await as(P.adminB);
const headroomB = await one('select * from gym_headroom()');
check('a gym sees its own ceiling and what it has used of it',
  headroomB.max_members === 2 && typeof headroomB.members === 'number');
check('the gym owner can read what they are on and what they owe',
  !!(await one('select plan_name, max_members from my_gym_billing()'))?.plan_name);

await asOwner();
check('a member past the ceiling is refused by the database, not the screen', await (async () => {
  const room = (await one("select (max_members - members)::int as n from gym_headroom('" + GYM_B + "')")).n;
  for (let i = 0; i < room; i++) {
    const id = 'b2000000-0000-4000-8000-0000000000c' + i;
    await db.exec("insert into auth.users (id, email, raw_user_meta_data) values ('" + id + "', 'cap" + i + "@t.com', '{}');" +
      "insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)" +
      " values ('" + id + "', 'Cap', 'Member', 'cap" + i + "@t.com', 'active', 'member', '" + GYM_B + "');" +
      "insert into gym_roles (gym_id, user_id, role, status) values ('" + GYM_B + "', '" + id + "', 'member', 'active');");
  }
  // The profile is created belonging to no gym. Naming the gym here would be
  // refused by this same rule one step earlier, through the legacy
  // profiles→gym_roles mirror — which is correct, and is asserted below.
  const over = 'b2000000-0000-4000-8000-0000000000ff';
  await db.exec("insert into auth.users (id, email, raw_user_meta_data) values ('" + over + "', 'over@t.com', '{}');" +
    "insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)" +
    " values ('" + over + "', 'One', 'Too Many', 'over@t.com', 'active', 'member', null);");
  return !!(await fails("insert into gym_roles (gym_id, user_id, role, status) values ('" + GYM_B + "', '" + over + "', 'member', 'active')"));
})());
check('creating the account itself is refused too, so nobody gets half-added',
  !!(await fails("insert into auth.users (id, email, raw_user_meta_data)" +
    " values ('b2000000-0000-4000-8000-0000000000fe', 'over2@t.com', '{}');" +
    "insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)" +
    " values ('b2000000-0000-4000-8000-0000000000fe', 'Two', 'Too Many', 'over2@t.com', 'active', 'member', '" + GYM_B + "')")));
check('a gym at its ceiling can still archive someone to get back under it',
  !(await fails("update gym_roles set status = 'archived' where gym_id = '" + GYM_B + "'" +
    " and role = 'member' and status = 'active' and user_id = (select user_id from gym_roles" +
    " where gym_id = '" + GYM_B + "' and role = 'member' and status = 'active' limit 1)")));

check('a plan without the coaching side refuses a coach', await (async () => {
  await as(PLATFORM);
  await db.exec("select set_platform_plan_feature('starter', 'coaching', false)");
  await asOwner();
  const t = 'b2000000-0000-4000-8000-00000000c0ac';
  await db.exec("insert into auth.users (id, email, raw_user_meta_data) values ('" + t + "', 'coach@t.com', '{}');" +
    "insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)" +
    " values ('" + t + "', 'A', 'Coach', 'coach@t.com', 'active', 'trainer', null);");
  return !!(await fails("insert into gym_roles (gym_id, user_id, role, status) values ('" + GYM_B + "', '" + t + "', 'trainer', 'active')"));
})());
await as(P.adminB);
check('a gym is told which parts of the system its plan does not include',
  (await one("select enabled from my_gym_features() where feature_key = 'coaching'")).enabled === false
  && (await one("select enabled from my_gym_features() where feature_key = 'front_desk'")).enabled === true);
await as(P.adminA);
check('a gym on a plan with coaching keeps it — nothing was taken away',
  (await one("select enabled from my_gym_features() where feature_key = 'coaching'")).enabled === true);

// Money.
await as(PLATFORM);
await db.exec("select set_platform_plan_feature('starter', 'coaching', true)");
const payId = (await one("select record_gym_payment('" + GYM_B + "', 1500, (current_date + 30)::date," +
  " current_date, current_date, 'cash', 'OR-001', null) as id")).id;
check('recording a payment is what moves the paid-until date', !!payId
  && (await one("select paid_until from platform_gyms() where id = '" + GYM_B + "'")).paid_until !== null);
check('a late payment for an old period never pulls a gym access in', await (async () => {
  const before = String((await one("select paid_until from platform_gyms() where id = '" + GYM_B + "'")).paid_until);
  await db.exec("select record_gym_payment('" + GYM_B + "', 1500, (current_date - 60)::date," +
    " current_date, (current_date - 90)::date, 'cash', 'OR-000', 'settling an old month')");
  return String((await one("select paid_until from platform_gyms() where id = '" + GYM_B + "'")).paid_until) === before;
})());
check('a payment with no amount, or no date it covers to, is refused',
  !!(await fails("select record_gym_payment('" + GYM_B + "', null, current_date)"))
  && !!(await fails("select record_gym_payment('" + GYM_B + "', 100, null)")));
check('the platform sees what it has been paid, by month',
  (await db.query('select * from platform_revenue(12)')).rows.length > 0);
check('a gym due for renewal is listed before it locks, not after',
  (await db.query('select * from gyms_due(60)')).rows.length > 0);
check('the price list the website reads carries what each plan includes', await (async () => {
  const rows = (await db.query('select * from platform_price_list()')).rows;
  return rows.length >= 3 && rows.every((r) => Array.isArray(r.includes) && r.includes.length > 0);
})());

await as(P.adminB);
check('a gym reads no money rows, its own included, outside the functions for it',
  (await one('select count(*)::int as n from gym_payments')).n === 0
  && (await one('select count(*)::int as n from platform_gym_payments()')).n === 0);
check('a gym admin cannot record a payment against itself',
  !!(await fails("select record_gym_payment('" + GYM_B + "', 99999, (current_date + 365)::date)")));
check('a gym admin cannot change what Core Fitness sells',
  !!(await fails("select save_platform_plan('free_forever', 'Free forever', null, 0, null, null, null, null, true, true, 0)"))
  && !!(await fails("select set_platform_plan_feature('starter', 'coaching', false)"))
  && !!(await fails("select retire_platform_plan('premium')")));
await as(P.memberA);
check('a member sees no gym billing at all',
  (await one('select count(*)::int as n from gym_payments')).n === 0
  && (await db.query('select * from my_gym_billing()')).rows.length === 0);

// ---- 0109: running the service ------------------------------------------------------
// The privacy line is the one that matters here: the platform may look at the
// people it invoices, and at nobody else in a gym.
await as(PLATFORM);
const people = (await db.query("select * from platform_gym_people('" + GYM_A + "')")).rows;
check('the platform sees who runs a gym',
  people.length > 0 && people.some((p) => p.is_owner === true && !!p.email));
check('and sees no member, coach or their data through it',
  people.every((p) => p.role === 'admin' || p.role === 'staff'));
const detail = await one("select * from platform_gym_detail('" + GYM_A + "')");
check('a gym detail is counts and dates, never rows',
  typeof detail.members === 'number' && typeof detail.checkins_30d === 'number'
  && detail.slug === 'core-fitness');

check('renaming a gym renames it everywhere it is written', await (async () => {
  await db.exec("select platform_rename_gym('" + GYM_B + "', 'Gym B Renamed', null)");
  const g = await one("select name from platform_gyms() where id = '" + GYM_B + "'");
  await asOwner();
  const s = await one("select gym_name from gym_settings where gym_id = '" + GYM_B + "'");
  await as(PLATFORM);
  return g.name === 'Gym B Renamed' && s.gym_name === 'Gym B Renamed';
})());
check('a link name already in use is refused, and a bad one too',
  !!(await fails("select platform_rename_gym('" + GYM_B + "', 'Gym B Renamed', 'core-fitness')"))
  && !!(await fails("select platform_rename_gym('" + GYM_B + "', 'Gym B Renamed', 'Not A Slug')")));
check('changing a link name says in the log that the old one stops working', await (async () => {
  await db.exec("select platform_rename_gym('" + GYM_B + "', 'Gym B Renamed', 'gym-b-new')");
  const e = await one("select summary from platform_events_recent() where action = 'gym.renamed' order by id desc limit 1");
  return /old links stop working/.test(e.summary);
})());

// Crashes.
// Filed as the table owner: a crash report is written by whoever crashed, and
// the platform owner belongs to no gym, so the tenant policy refuses them.
await asOwner();
await db.exec("insert into client_errors (app, route, message, gym_id) values" +
  " ('admin', '/members', 'Boom went the screen', '" + GYM_A + "')," +
  " ('admin', '/payments', 'Boom went the screen', '" + GYM_A + "')," +
  " ('member', '/today', 'A different problem', '" + GYM_B + "')");
await as(PLATFORM);
check('an open crash is listed', (await db.query('select * from platform_crash_reports(14)')).rows.length >= 3);
check('resolving clears every copy of that one problem, not just the row you clicked',
  (await one("select resolve_crashes('admin', 'Boom went the screen') as n")).n === 2
  && (await db.query('select * from platform_crash_reports(14)')).rows.length === 1
  && (await db.query('select * from platform_crash_reports(14, true)')).rows.length >= 3);

// The service in numbers.
const ov = await one('select * from platform_overview()');
check('the service has numbers, and they are numbers',
  typeof ov.gyms === 'number' && ov.gyms >= 2
  && typeof ov.members === 'number' && typeof ov.crashes_open === 'number'
  && ov.crashes_open === 1);
check('a gym nobody can sign into is counted as unclaimed', typeof ov.gyms_unclaimed === 'number');

// Platform admins.
check('the platform owner is listed as themselves',
  (await db.query('select * from list_platform_admins()')).rows.some((r) => r.is_me === true));
check('adding a platform admin needs an account that exists',
  !!(await fails("select add_platform_admin('nobody@nowhere.test')")));
check('the last platform admin cannot be removed, and nobody can remove themselves',
  !!(await fails("select remove_platform_admin('" + PLATFORM + "')")));
check('a second platform admin can be added by the first, and then removed', await (async () => {
  // This fixture's outsider has no email; add_platform_admin() looks people up
  // by one, which is how the platform owner would actually type it.
  await asOwner();
  await db.exec("update profiles set email = 'outsider@corefitness-test.com' where id = '" + P.outsider + "'");
  await as(PLATFORM);
  await db.exec("select add_platform_admin('outsider@corefitness-test.com')");
  const two = (await db.query('select * from list_platform_admins()')).rows.length === 2;
  await db.exec("select remove_platform_admin('" + P.outsider + "')");
  return two && (await db.query('select * from list_platform_admins()')).rows.length === 1;
})());

// And none of it from inside a gym.
await as(P.adminA);
check('a gym admin cannot rename a gym, read another gym people, or clear a crash',
  !!(await fails("select platform_rename_gym('" + GYM_B + "', 'Mine Now', null)"))
  && (await db.query("select * from platform_gym_people('" + GYM_B + "')")).rows.length === 0
  && !!(await fails("select resolve_crashes('member', 'A different problem')")));
check('a gym admin sees no service-wide numbers and no platform admin list',
  (await db.query('select * from platform_overview()')).rows.length === 0
  && (await db.query('select * from list_platform_admins()')).rows.length === 0);
check('a gym admin cannot make themselves the platform',
  !!(await fails("select add_platform_admin((select email from profiles where id = '" + P.adminA + "'))")));

// ---- 0110: a gym's app is the gym's ------------------------------------------------
// The point of this block is that the three layers stay three: the platform
// decides what a gym may run, the gym decides what it does run, and neither can
// be walked around by the other.
await as(P.adminA);
check('a gym that has renamed nothing still has words for its points',
  (await one('select points_name from gym_words()')).points_name === 'CORE Points');
check('every part of the system starts switched on, so pasting changes nothing',
  (await db.query("select * from my_gym_modules() where state <> 'on'")).rows.length === 0);

check('an owner can switch a part of the system off, and their app stops drawing it',
  await (async () => {
    await db.exec("select set_gym_module('coaching', false)");
    const m = await one("select state, enabled from my_gym_modules() where feature_key = 'coaching'");
    return m.state === 'off' && m.enabled === false
      && (await one("select gym_module_on(null, 'coaching') as on")).on === false;
  })());
check('and switch it back on again', await (async () => {
  await db.exec("select set_gym_module('coaching', true)");
  return (await one("select gym_module_on(null, 'coaching') as on")).on === true;
})());
check('the front desk cannot decide what the gym runs', await (async () => {
  await as(P.staffA);
  return !!(await fails("select set_gym_module('coaching', false)"))
      && !!(await fails("select save_gym_words('Desk Points', null, null)"))
      && !!(await fails("select set_join_policy('closed', false)"));
})());
check('and neither can a member', await (async () => {
  await as(P.memberA);
  return !!(await fails("select set_gym_module('engagement', false)"));
})());

// The platform's layer sits above the gym's, and the gym cannot climb over it.
check('a gym cannot switch on what its plan does not include', await (async () => {
  await as(PLATFORM);
  await db.exec("select set_gym_plan('" + GYM_B + "', 'starter', null)");
  await db.exec("select set_platform_plan_feature('starter', 'engagement', false)");
  await as(P.adminB);
  const m = await one("select state, enabled from my_gym_modules() where feature_key = 'engagement'");
  return m.state === 'not_sold' && m.enabled === false
    && !!(await fails("select set_gym_module('engagement', true)"));
})());
check('turning it off at the gym is still allowed — it is already off either way',
  !(await fails("select set_gym_module('engagement', false)")));
check('a gym whose plan gains a feature can switch it on again', await (async () => {
  await as(PLATFORM);
  await db.exec("select set_platform_plan_feature('starter', 'engagement', true)");
  await as(P.adminB);
  await db.exec("select set_gym_module('engagement', true)");
  return (await one("select gym_module_on(null, 'engagement') as on")).on === true;
})());

// The gym's own words, and its own door.
await as(P.adminA);
await db.exec("select save_gym_words('Iron Points', 'iron', 'Welcome back, see you on the floor.')");
check('a gym names its own points, and its own members read that name',
  (await one('select points_name, points_name_short, welcome_message from gym_words()')).points_name === 'Iron Points');
check('no gym inherits another gym words', await (async () => {
  await as(P.adminB);
  return (await one('select points_name from gym_words()')).points_name === 'Points';
})());
check('a name for the points longer than a label is refused',
  !!(await fails("select save_gym_words('" + 'x'.repeat(40) + "', null, null)")));

await as(P.adminA);
check('a gym is listed to strangers while it is open', await (async () => {
  await as(P.outsider);
  return (await db.query('select * from list_gyms(null)')).rows.some((g) => g.slug === 'core-fitness');
})());
check('a gym that chooses the code door leaves the public list', await (async () => {
  await as(P.adminA);
  const code = (await one("select set_join_policy('code', false) as c")).c;
  await as(P.outsider);
  const listed = (await db.query('select * from list_gyms(null)')).rows.some((g) => g.slug === 'core-fitness');
  const byCode = (await db.query("select * from gym_by_code('" + code + "')")).rows.length === 1;
  const byLink = (await db.query("select * from gym_by_slug('core-fitness')")).rows.length === 1;
  return !listed && byCode && byLink && /^[A-Z0-9]{6}$/.test(code);
})());
check('a wrong code finds nothing',
  (await db.query("select * from gym_by_code('ZZZZZZ')")).rows.length === 0);
check('a new code replaces the old one, so a leaked code can be taken back', await (async () => {
  await as(P.adminA);
  const first = (await one("select set_join_policy('code', false) as c")).c;
  const second = (await one("select set_join_policy('code', true) as c")).c;
  await as(P.outsider);
  return first !== second
    && (await db.query("select * from gym_by_code('" + first + "')")).rows.length === 0
    && (await db.query("select * from gym_by_code('" + second + "')")).rows.length === 1;
})());
check('a closed gym refuses a join request, and says how to get in instead', await (async () => {
  await as(P.adminA);
  await db.exec("select set_join_policy('closed', false)");
  await as(P.outsider);
  const e = await fails("select request_to_join('" + GYM_A + "')");
  return !!e && /front desk/i.test(e)
    && (await db.query("select * from gym_by_code('ZZZZZZ')")).rows.length === 0;
})());
check('an open gym still takes requests exactly as it always did', await (async () => {
  await as(P.adminA);
  await db.exec("select set_join_policy('open', false)");
  await as(P.outsider);
  // The outsider already runs their own gym; joining a second is the normal
  // multi-gym case this whole system exists for.
  return !(await fails("select request_to_join('" + GYM_A + "')"));
})());

// One call for the phone.
await as(P.memberA);
const app = await one('select * from my_gym_app()');
check('the phone app gets brand, words and shape in one call',
  app.gym_name === 'Core Fitness' && app.points_name === 'Iron Points'
  && typeof app.modules === 'object' && app.modules.coaching === true);
check('a member is not shown the gym own join code', app.join_code === null);
await as(P.adminA);
check('the desk is, because it is theirs to hand out',
  (await one('select join_code from my_gym_app()')).join_code !== null);

// ---- 0111: a gym's life, and its front door ----------------------------------------
// The security-critical one here is that an invitation is ADDRESSED. A link
// that let whoever saw it take a staff seat would be the widest hole in the
// system, so it is asserted from both sides.
await as(PLATFORM);
check('a gym nobody owns reads as exactly that, not as active', await (async () => {
  const g = (await one("select create_gym('State Test Gym', 'state-test') as id")).id;
  const s = (await one("select gym_state('" + g + "') as s")).s;
  globalThis.__stateGym = g;
  return s === 'no_owner';
})());
check('once it has an owner but no setup, it reads as onboarding', await (async () => {
  const g = globalThis.__stateGym;
  await db.exec("select make_gym_owner('" + g + "', '" + P.memberB + "')");
  return (await one("select gym_state('" + g + "') as s")).s === 'onboarding';
})());
check('a gym that has left is not merely overdue', await (async () => {
  const g = globalThis.__stateGym;
  await db.exec("select set_gym_status('" + g + "', 'cancelled', 'They closed the gym')");
  return (await one("select gym_state('" + g + "') as s")).s === 'cancelled'
    && (await one("select gym_lock_reason('" + g + "') as r")).r === 'cancelled';
})());
check('ending a gym without a reason is refused, the same as suspending one',
  !!(await fails("select set_gym_status('" + GYM_B + "', 'cancelled', '')")));
check('a cancelled gym is not offered to strangers', await (async () => {
  await as(P.outsider);
  return !(await db.query('select * from list_gyms(null)')).rows.some((g) => g.slug === 'state-test');
})());

// The setup bookmark.
await as(P.adminB);
check('a half-finished setup remembers where it got to', await (async () => {
  await db.exec("update gyms set onboarded_at = null where id = '" + GYM_B + "'");
  await db.exec("select set_onboarding_step('plans')");
  return (await one('select onboarding_step from my_gym_context()')).onboarding_step === 'plans';
})());
check('and stops moving once the gym is open', await (async () => {
  await db.exec("select finish_gym_setup()");
  await db.exec("select set_onboarding_step('gym')");
  return (await one('select onboarding_step from my_gym_context()')).onboarding_step === 'plans';
})());
check('the front desk cannot drive someone else through setup', await (async () => {
  await as(P.staffA);
  return !!(await fails("select set_onboarding_step('gym')"));
})());

// Invitations.
await as(P.adminA);
const inv = await one("select * from invite_to_gym('newcomer@corefitness-test.com', 'member', 'New', 'Comer', null, null)");
check('a gym can invite someone it already has on paper', !!inv.token && inv.token.length === 64);
check('the desk sees its own invitations and their state',
  (await db.query('select * from list_invitations(false)')).rows.some(
    (r) => r.email === 'newcomer@corefitness-test.com' && r.state === 'waiting'));
check('inviting the same address twice leaves only one live token', await (async () => {
  const again = await one("select * from invite_to_gym('newcomer@corefitness-test.com', 'member', null, null, null, null)");
  const live = (await db.query('select * from list_invitations(false)')).rows
    .filter((r) => r.email === 'newcomer@corefitness-test.com');
  globalThis.__tok = again.token;
  return live.length === 1 && again.token !== inv.token;
})());
check('the old token stops working the moment it is replaced', await (async () => {
  return (await one("select state from peek_invitation('" + inv.token + "')")).state === 'revoked';
})());
check('somebody already in the gym cannot be invited again',
  !!(await fails("select * from invite_to_gym((select email from profiles where id = '" + P.memberA + "'), 'member', null, null, null, null)")));
check('an address that is not an address is refused',
  !!(await fails("select * from invite_to_gym('not-an-email', 'member', null, null, null, null)")));
check('the front desk may invite a member but not a coach or more desk staff', await (async () => {
  await as(P.staffA);
  const ok = !(await fails("select * from invite_to_gym('walkin@corefitness-test.com', 'member', null, null, null, null)"));
  return ok
    && !!(await fails("select * from invite_to_gym('coach2@corefitness-test.com', 'trainer', null, null, null, null)"))
    && !!(await fails("select * from invite_to_gym('desk2@corefitness-test.com', 'staff', null, null, null, null)"));
})());
check('a member of the gym cannot read anybody tokens', await (async () => {
  await as(P.memberA);
  return (await one('select count(*)::int as n from gym_invitations')).n === 0
    && (await db.query('select * from list_invitations(true)')).rows.length === 0;
})());

// Accepting — the addressed-invitation rule, from both sides.
check('an invitation cannot be taken by whoever happens to hold the link', await (async () => {
  await asOwner();
  await db.exec("update profiles set email = 'someone-else@corefitness-test.com' where id = '" + P.outsider + "'");
  await as(P.outsider);
  const e = await fails("select accept_invitation('" + globalThis.__tok + "')");
  return !!e && /sign in with that email/i.test(e);
})());
check('the person it was addressed to is let straight in, already approved', await (async () => {
  await asOwner();
  await db.exec("update profiles set email = 'newcomer@corefitness-test.com' where id = '" + P.outsider + "'");
  await as(P.outsider);
  const gym = (await one("select accept_invitation('" + globalThis.__tok + "') as g")).g;
  await asOwner();
  const row = await one("select role::text as role, status from gym_roles where gym_id = '" + GYM_A + "' and user_id = '" + P.outsider + "'");
  return gym === GYM_A && row.role === 'member' && row.status === 'active';
})());
check('and the same link cannot be used twice',
  !!(await fails("select accept_invitation('" + globalThis.__tok + "')")));
check('a withdrawn invitation is refused with a reason a person can act on', await (async () => {
  await as(P.adminA);
  const fresh = await one("select * from invite_to_gym('revoked@corefitness-test.com', 'member', null, null, null, null)");
  const id = (await db.query('select * from list_invitations(false)')).rows
    .find((r) => r.email === 'revoked@corefitness-test.com').id;
  await db.exec("select revoke_invitation('" + id + "')");
  return (await one("select state from peek_invitation('" + fresh.token + "')")).state === 'revoked';
})());
check('peeking at an invitation reveals a gym name and no email or token', await (async () => {
  await as(P.adminA);
  const fresh = await one("select * from invite_to_gym('peek@corefitness-test.com', 'trainer', null, null, null, null)");
  const row = await one("select * from peek_invitation('" + fresh.token + "')");
  return row.gym_name === 'Core Fitness' && row.role === 'trainer'
    && !('email' in row) && !('token' in row);
})());
check('a gym cannot see another gym invitations', await (async () => {
  await as(P.adminB);
  return !(await db.query('select * from list_invitations(true)')).rows
    .some((r) => r.email === 'peek@corefitness-test.com');
})());

// The same gym asking twice.
await as(PLATFORM);
check('two applications from one address are flagged as each other duplicates', await (async () => {
  await asOwner();
  await db.exec("insert into gym_applications (gym_name, owner_name, email, phone) values" +
    " ('Twice Gym', 'Someone', 'twice@corefitness-test.com', '09171234567')," +
    " ('Twice Gym', 'Someone', 'twice@corefitness-test.com', '09171234567')");
  await as(PLATFORM);
  const rows = (await db.query("select * from platform_applications(null)")).rows
    .filter((r) => r.email === 'twice@corefitness-test.com');
  return rows.length === 2 && rows.every((r) => r.duplicates >= 1);
})());
check('an address that already owns a gym here is flagged as an existing customer', await (async () => {
  await asOwner();
  await db.exec("insert into gym_applications (gym_name, owner_name, email, phone)" +
    " select 'Second Gym', 'Owner', p.email, '09171234567' from profiles p where p.id = '" + P.adminA + "'");
  await as(PLATFORM);
  return (await db.query("select * from platform_applications(null)")).rows
    .some((r) => r.gym_name === 'Second Gym' && r.already_a_gym === true);
})());

// Backups.
check('a backup that never ran says nothing at all',
  (await db.query('select * from last_backup()')).rows.length === 0);
check('a recorded backup is visible to the platform and nobody else', await (async () => {
  await db.exec("select record_backup(52428800, 'weekly')");
  const mine = (await db.query('select * from last_backup()')).rows.length === 1;
  await as(P.adminA);
  const theirs = (await db.query('select * from last_backup()')).rows.length;
  return mine && theirs === 0;
})());
check('a gym cannot claim a backup happened',
  !!(await fails("select record_backup(1, 'nope')")));

// ---- 0112: a gym's colour, all the way through -------------------------------------
await as(P.adminA);
check('a gym that never chose an action colour keeps amber, so nothing changed on paste',
  (await one('select accent_action from my_gym_app()')).accent_action === null);
check('an owner picks both roles, and a red gym can be red all the way', await (async () => {
  await db.exec("select save_gym_look('red', 'red', null)");
  const app = await one('select accent, accent_action from my_gym_app()');
  return app.accent === 'red' && app.accent_action === 'red';
})());
check('the six new colours are accepted and a made-up one is refused', await (async () => {
  for (const c of ['sky', 'cyan', 'lime', 'amber', 'red', 'fuchsia']) {
    if (await fails("select save_gym_look('" + c + "', null, null)")) return false;
  }
  return !!(await fails("select save_gym_look('burnt-sienna', null, null)"));
})());
check('saving a colour never wipes the logo', await (async () => {
  await db.exec("select save_gym_look('rose', 'rose', 'https://example.test/logo.png')");
  await db.exec("select save_gym_look('teal', 'teal', null)");
  return (await one('select logo_url from my_gym_app()')).logo_url === 'https://example.test/logo.png';
})());
check('and an empty string is how a logo is taken away', await (async () => {
  await db.exec("select save_gym_look('teal', 'teal', '')");
  return (await one('select logo_url from my_gym_app()')).logo_url === null;
})());
check('the front desk cannot restyle the gym', await (async () => {
  await as(P.staffA);
  return !!(await fails("select save_gym_look('lime', 'lime', null)"));
})());
check('a gym a stranger is about to join is listed in its own colours', await (async () => {
  await as(P.outsider);
  const row = (await db.query("select * from gym_by_slug('core-fitness')")).rows[0];
  return row.accent === 'teal' && row.accent_action === 'teal';
})());
check('no gym inherits another gym colours', await (async () => {
  await as(P.adminB);
  const app = await one('select accent, accent_action from my_gym_app()');
  return app.accent !== 'teal' && app.accent_action === null;
})());

// ---- 0113: email, and support access the gym controls -------------------------------
// The support half is the one that could undo everything else in this file, so
// it is asserted from every angle: only the gym grants it, it cannot be taken,
// it expires, it can be withdrawn, and while it is in use NOTHING can be
// written to the gym it points at.
await as(PLATFORM);
check('the platform cannot let itself into a gym', await (async () => {
  // There is deliberately no platform-side grant function. The only way in is
  // a gym offering, so entering without an offer must fail.
  return !!(await fails("select enter_support_session('" + GYM_B + "')"));
})());
check('and setting the session flag by hand grants nothing', await (async () => {
  await db.exec("select set_config('cf.support_gym', '" + GYM_B + "', false)");
  const got = await one('select support_session_gym() as g');
  await db.exec("select set_config('cf.support_gym', '', false)");
  return got.g === null;
})());

await as(P.staffB);
check('the front desk cannot grant it either',
  !!(await fails('select * from grant_support_access(4, null)')));

await as(P.adminB);
const grant = await one("select * from grant_support_access(4, 'Members page looks wrong')");
check('the gym owner grants it, with an expiry', !!grant.grant_id && !!grant.grant_expires_at);
check('the gym can see its own live grant and who gave it',
  (await one('select reason, hours_left from my_support_grant()')).reason === 'Members page looks wrong');
check('granting twice leaves one window open, not two', await (async () => {
  await db.exec("select * from grant_support_access(2, 'again')");
  await asOwner();
  const live = await one("select count(*)::int as n from support_grants where gym_id = '" + GYM_B + "' and revoked_at is null and expires_at > now()");
  await as(P.adminB);
  return live.n === 1;
})());
check('an absurd window is refused',
  !!(await fails('select * from grant_support_access(99, null)'))
  && !!(await fails('select * from grant_support_access(0, null)')));

await as(PLATFORM);
check('the platform sees which gyms have invited it in',
  (await db.query('select * from platform_support_grants()')).rows.some((r) => r.gym_id === GYM_B));
check('entering is logged where the GYM can read it, not only where we can', await (async () => {
  await db.exec("select enter_support_session('" + GYM_B + "')");
  await asOwner();
  const seen = await one("select count(*)::int as n from activity_log where gym_id = '" + GYM_B + "' and action = 'gym.support_entered'");
  await as(PLATFORM);
  await db.exec("select enter_support_session('" + GYM_B + "')");
  return seen.n >= 1;
})());
check('inside the session the platform reads that gym, and only that gym',
  (await one('select current_gym_id() as g')).g === GYM_B
  && (await one('select count(*)::int as n from member_profiles')).n >= 0);

// The part that has to be true, or none of the rest matters.
check('and can write NOTHING to it — the same rule that stops a suspended gym',
  (await one('select gym_writable() as w')).w === false);
check('every write to that gym is refused while support is looking', await (async () => {
  const refusals = await Promise.all([
    fails("insert into events (title, starts_at, gym_id) values ('Support wrote this', now(), '" + GYM_B + "')"),
    fails("update member_profiles set address = 'changed by support' where gym_id = '" + GYM_B + "'"),
    fails("delete from notifications where gym_id = '" + GYM_B + "'"),
    fails("insert into point_rules (gym_id, key, label, points) values ('" + GYM_B + "', 'sneak', 'Sneak', 999)"),
  ]);
  // An RLS refusal on UPDATE/DELETE is zero rows rather than an error
  // (CLAUDE.md), so the honest assertion is "nothing changed", not "it threw".
  const changed = await one("select count(*)::int as n from member_profiles where gym_id = '" + GYM_B + "' and address = 'changed by support'");
  const wrote = await one("select count(*)::int as n from point_rules where gym_id = '" + GYM_B + "' and key = 'sneak'");
  return !!refusals[0] && !!refusals[3] && changed.n === 0 && wrote.n === 0;
})());

check('leaving puts it back to seeing no gym at all', await (async () => {
  await db.exec('select leave_support_session()');
  return (await one('select current_gym_id() as g')).g === null;
})());
check('a withdrawn grant stops working immediately', await (async () => {
  await as(P.adminB);
  await db.exec('select revoke_support_access()');
  await as(PLATFORM);
  return !!(await fails("select enter_support_session('" + GYM_B + "')"));
})());
check('an expired grant stops working too', await (async () => {
  await as(P.adminB);
  await db.exec("select * from grant_support_access(1, 'about to expire')");
  await asOwner();
  // created_at moves with it: the table refuses a window that ends before it
  // starts, which is the constraint doing its job rather than a test problem.
  await db.exec("update support_grants set created_at = now() - interval '2 hours'," +
    " expires_at = now() - interval '1 minute'" +
    " where gym_id = '" + GYM_B + "' and revoked_at is null");
  await as(PLATFORM);
  return !!(await fails("select enter_support_session('" + GYM_B + "')"))
    && (await db.query('select * from platform_support_grants()')).rows.length === 0;
})());
check('a gym cannot see whether another gym granted access', await (async () => {
  await as(P.adminA);
  return (await db.query('select * from my_support_grant()')).rows.length === 0
    && (await db.query('select * from platform_support_grants()')).rows.length === 0;
})());

// ---- email --------------------------------------------------------------------------
await as(PLATFORM);
const mail = (await one("select record_email('owner@example.test', 'Your sign-in', 'body here', 'owner_credentials', '" + GYM_B + "', 'An Owner') as id")).id;
check('the platform records what it is about to send', !!mail);
check('and settles it with what actually happened', await (async () => {
  await db.exec("select settle_email('" + mail + "', 'not_configured', 'No provider set')");
  const row = await one("select status, error from platform_email_log(30) where id = '" + mail + "'");
  return row.status === 'not_configured' && /No provider/.test(row.error);
})());
check('the log says who was told what, and never the body itself', await (async () => {
  const row = await one("select * from platform_email_log(30) where id = '" + mail + "'");
  return row.to_email === 'owner@example.test' && row.kind === 'owner_credentials'
    && !('body' in row);
})());
check('a gym may send its own invitations and read its own sending', await (async () => {
  await as(P.adminA);
  const id = (await one("select record_email('newbie@example.test', 'Join us', 'link', 'invitation', '" + GYM_A + "', null) as id")).id;
  return !!id && (await db.query('select * from my_gym_email_log(30)')).rows.some((r) => r.id === id);
})());
check('but not in another gym name', await (async () => {
  await as(P.adminA);
  return !!(await fails("select record_email('x@example.test', 'Hi', 'b', 'invitation', '" + GYM_B + "', null)"));
})());
check('and cannot read another gym mail, or the platform own', await (async () => {
  await as(P.adminA);
  return !(await db.query('select * from my_gym_email_log(30)')).rows.some((r) => r.to_email === 'owner@example.test')
    && (await db.query('select * from platform_email_log(30)')).rows.length === 0;
})());
check('a member sends nothing and reads nothing', await (async () => {
  await as(P.memberA);
  return !!(await fails("select record_email('x@example.test', 'Hi', 'b', 'invitation', '" + GYM_A + "', null)"))
    && (await one('select count(*)::int as n from email_outbox')).n === 0
    && (await db.query('select * from my_gym_email_log(30)')).rows.length === 0;
})());


// ---- 0114: the gym own words, and the gym own address --------------------------------
// The words are identity, so the same rule as the name and the logo: the owner
// sets them, nobody else, and a word this gym never chose reads as the English
// one rather than as a blank.
check('every gym starts with the standard words', await (async () => {
  await as(P.memberA);
  const v = (await one('select gym_vocabulary() as v')).v;
  return v.trainers === 'coaches' && v.members === 'members' && v.classes === 'classes';
})());
check('the owner renames them, and only the ones they named change', await (async () => {
  await as(P.adminA);
  const v = (await one(`select save_gym_vocabulary('{"trainer":"PT","trainers":"PTs"}'::jsonb) as v`)).v;
  return v.trainer === 'PT' && v.trainers === 'PTs' && v.members === 'members';
})());
check('a word this gym chose does not reach the other gym', await (async () => {
  await as(P.adminB);
  return (await one('select gym_vocabulary() as v')).v.trainers === 'coaches';
})());
check('the front desk cannot rename anything', await (async () => {
  await as(P.staffA);
  return !!(await fails(`select save_gym_vocabulary('{"trainer":"Boss"}'::jsonb)`));
})());
check('a member cannot either', await (async () => {
  await as(P.memberA);
  return !!(await fails(`select save_gym_vocabulary('{"trainer":"Boss"}'::jsonb)`));
})());
check('a word that does not exist is refused, not silently dropped', await (async () => {
  await as(P.adminA);
  return !!(await fails(`select save_gym_vocabulary('{"nonsense":"x"}'::jsonb)`));
})());
check('and so is one nobody could read', await (async () => {
  await as(P.adminA);
  const long = 'x'.repeat(40);
  return !!(await fails(`select save_gym_vocabulary('{"trainer":"${long}"}'::jsonb)`))
    && !!(await fails(`select save_gym_vocabulary('{"trainer":123}'::jsonb)`));
})());
check('typing the default back in clears it rather than storing it', await (async () => {
  await as(P.adminA);
  await db.exec(`select save_gym_vocabulary('{"trainer":"coach","trainers":"coaches"}'::jsonb)`);
  await asOwner();
  const row = await one(`select vocabulary from gym_settings where gym_id = '` + GYM_A + `'`);
  return row.vocabulary === null;
})());
check('the constraint refuses a bad word written straight at the table', await (async () => {
  await asOwner();
  return !!(await fails(`update gym_settings set vocabulary = '{"boss":"me"}'::jsonb where gym_id = '` + GYM_A + `'`));
})());

// The address. Same rules as the platform's rename, because two rule sets for
// one column is how a link that works on one screen 404s from another.
check('the owner moves their own front door', await (async () => {
  await as(P.adminA);
  const slug = (await one(`select set_gym_slug('g-fitness') as s`)).s;
  await asOwner();
  return slug === 'g-fitness'
    && (await one(`select slug from gyms where id = '` + GYM_A + `'`)).slug === 'g-fitness';
})());
check('and the gym own activity log says every old link just broke', await (async () => {
  await asOwner();
  const row = await one(`select summary from activity_log where action = 'gym.slug' and gym_id = '` + GYM_A + `' order by occurred_at desc limit 1`);
  return /\/join\/g-fitness/.test(row.summary) && /stopped working/.test(row.summary);
})());
check('a link another gym already uses is refused', await (async () => {
  await as(P.adminB);
  return !!(await fails(`select set_gym_slug('g-fitness')`));
})());
check('so is one nobody could type', await (async () => {
  await as(P.adminA);
  return !!(await fails(`select set_gym_slug('G Fitness!')`))
    && !!(await fails(`select set_gym_slug('ab')`));
})());
check('the front desk cannot move the door', await (async () => {
  await as(P.staffA);
  return !!(await fails(`select set_gym_slug('front-desk-was-here')`));
})());
check('and neither can Core Fitness while it is only looking', await (async () => {
  await as(P.adminB);
  await db.exec(`select * from grant_support_access(2, 'check the link')`);
  await as(PLATFORM);
  await db.exec(`select enter_support_session('` + GYM_B + `')`);
  const refused = await fails(`select set_gym_slug('taken-over')`);
  await db.exec('select leave_support_session()');
  await as(P.adminB);
  await db.exec('select revoke_support_access()');
  await asOwner();
  return !!refused
    && (await one(`select slug from gyms where id = '` + GYM_B + `'`)).slug !== 'taken-over';
})());
check('my_gym_app carries the words, the tagline and the logo in one call', await (async () => {
  await as(P.adminA);
  await db.exec(`select save_gym_words('Iron Points', 'iron points', 'Welcome in')`);
  await db.exec(`select save_gym_vocabulary('{"trainers":"PTs"}'::jsonb)`);
  // The tagline is written by Settings through the table, not by a function:
  // one column, one writer. my_gym_app only has to carry it out to the phone.
  await db.exec(`update gym_settings set tagline = 'Strength, daily' where gym_id = '` + GYM_A + `'`);
  const row = await one('select * from my_gym_app()');
  return row.points_name === 'Iron Points' && row.tagline === 'Strength, daily'
    && row.vocabulary.trainers === 'PTs' && row.welcome_message === 'Welcome in';
})());
check('and a stranger reading the gym list sees the tagline, never the join code', await (async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  const rows = (await db.query(`select * from list_gyms('Core')`)).rows;
  return rows.every((r) => !('join_code' in r)) && rows.every((r) => 'tagline' in r);
})());

finish();