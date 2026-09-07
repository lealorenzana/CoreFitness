/**
 * "Say why" — the freeze, cancel and suspension reasons, as SQL.
 *
 * The panel's first ask was a reason field. A field is a form; this checks the
 * *rule*, which is the only version that survives somebody writing to the API
 * directly. Applies 0057 and 0069 verbatim.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolved from the working directory, not from this file. These scripts live
// in the repository, which is not an npm project, so a bare specifier would
// never find pglite however it was installed — run them from wherever you ran
// `npm install @electric-sql/pglite` and pass the repo path as argv[2].
const requireFromCwd = createRequire(pathToFileURL(process.cwd() + '/'));
let PGlite;
try {
  ({ PGlite } = await import(pathToFileURL(requireFromCwd.resolve('@electric-sql/pglite')).href));
} catch {
  console.error('Could not load @electric-sql/pglite from ' + process.cwd() +
    '\n  npm install @electric-sql/pglite   # then run this again from that directory');
  process.exit(2);
}

const REPO = process.argv[2];
const sqlFile = (n) => readFileSync(`${REPO}/supabase/migrations/${n}`, 'utf8');
const db = await PGlite.create();

const M1 = '11111111-1111-1111-1111-111111111111';
const AD = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ST = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type membership_status as enum ('active','expired','frozen','cancelled','pending');
create type plan_tier as enum ('free','freemium','premium','pro');

create table profiles (
  id uuid primary key, role text not null default 'member',
  status text not null default 'active',
  -- account_lockout_reason(email) is looked up by address, because the person
  -- who cannot sign in has no session to identify them with.
  email text unique,
  first_name text not null default '', last_name text not null default '',
  created_at timestamptz not null default now()
);
create table member_profiles (profile_id uuid primary key references profiles(id));

create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, tier plan_tier not null default 'premium',
  price numeric(10,2) not null default 0, duration_days int,
  description text, is_active boolean not null default true,
  -- 0017's four booking columns. 0057 rewrites the seeded plans and touches
  -- them, so a fixture without these fails the whole file.
  can_book_classes boolean not null default true,
  can_book_pt boolean not null default true,
  class_bookings_per_week int,
  pt_sessions_per_month int
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  plan_id uuid not null references membership_plans(id),
  status membership_status not null default 'active',
  start_date date, expiry_date date, freeze_count int not null default 0
);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, location text, capacity int,
  starts_at timestamptz, duration_minutes int
);

-- 0049's two tables, because 0057 re-creates sync_plan_features() over them.
create table features (
  key text primary key, label text not null, description text,
  default_free boolean not null default false,
  default_freemium boolean not null default false,
  default_premium boolean not null default true,
  sort_order int not null default 0
);
create table plan_features (
  plan_id uuid not null references membership_plans(id) on delete cascade,
  feature_key text not null references features(key) on delete cascade,
  enabled boolean not null, quota int,
  primary key (plan_id, feature_key)
);

-- SECURITY DEFINER, exactly as 0002/0006 define it. Without that word the
-- policies that call it are evaluated with the caller own rights on the
-- profiles table, and the first RLS assertion fails with 42501 for a reason that
-- has nothing to do with the rule being tested.
create or replace function get_my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
`);

await db.exec(sqlFile('0057_plans_freeze_events.sql'));
await db.exec(sqlFile('0069_account_status_events.sql'));
// 0074 also repairs one sentence in set_account_status. Applied on top, as live.
await db.exec(sqlFile('0074_decision_guard_runs_first.sql'));

await db.exec(`
insert into profiles (id, role, email, first_name, last_name) values
  ('${M1}','member','lea@corefitness-test.com','Lea','Lorenzana'),
  ('${AD}','admin','admin@corefitness-test.com','Gabrielle','Facalarin'),
  ('${ST}','staff','desk@corefitness-test.com','Front','Desk');
insert into member_profiles values ('${M1}');
insert into membership_plans (id, name, tier, price, duration_days)
  values ('90000000-0000-0000-0000-000000000001','Premium','premium',1500,30);
insert into memberships (id, member_id, plan_id, status, start_date, expiry_date)
  values ('a0000000-0000-0000-0000-000000000001','${M1}','90000000-0000-0000-0000-000000000001',
          'active', current_date - 10, current_date + 20);
-- grants again, for the tables 0057 created
grant select, insert, update, delete on all tables in schema public to authenticated;
`);

const results = [];
const rec = (id, name, expected, got, pass, detail) => results.push({ id, name, expected, got, pass, detail });
async function as(uid) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  const who = await db.query('select current_user as u;');
  if (who.rows[0].u !== 'authenticated') throw new Error('SET ROLE did not take');
}
const asOwner = () => db.exec('reset role;');
async function refuses(id, name, sql, fragment) {
  try { await db.exec(sql); rec(id, name, 'refused', 'ACCEPTED', false); }
  catch (e) {
    const msg = String(e.message || e);
    const ok = !fragment || msg.includes(fragment);
    rec(id, name, fragment ? `refused, naming "${fragment}"` : 'refused',
      ok ? 'refused' : `refused, but said: ${msg}`, ok, msg.split('\n')[0]);
  }
}
async function allows(id, name, sql) {
  try { await db.exec(sql); rec(id, name, 'allowed', 'allowed', true); }
  catch (e) { rec(id, name, 'allowed', 'REFUSED', false, String(e.message || e).split('\n')[0]); }
}
// `?? {}` so a query that returned nothing fails its own assertion instead of
// throwing a TypeError and hiding every result before it.
const one = async (sql) => (await db.query(sql)).rows[0] ?? {};

const freeze = (reason) => `insert into membership_events (membership_id, member_id, kind, reason)
  values ('a0000000-0000-0000-0000-000000000001','${M1}','freeze', ${reason === null ? 'null' : `'${reason}'`});`;

// ════════════════════════════════════════════════════════════════════════════
//  4.1 — a freeze or a cancellation has to say why
// ════════════════════════════════════════════════════════════════════════════
await as(ST);
await refuses('4.1.1', 'The desk freezes a membership with no reason at all',
  freeze(null), 'A reason is required');

await as(ST);
await refuses('4.1.2', 'and with a reason of nothing but spaces',
  freeze('    '), 'A reason is required');

await as(ST);
await refuses('4.1.3', 'A cancellation with no reason',
  `insert into membership_events (membership_id, member_id, kind, reason)
   values ('a0000000-0000-0000-0000-000000000001','${M1}','cancel', null);`,
  'A reason is required');

await as(ST);
await allows('4.1.4', 'An unfreeze needs no justification',
  `insert into membership_events (membership_id, member_id, kind)
   values ('a0000000-0000-0000-0000-000000000001','${M1}','unfreeze');`);

await as(ST);
await allows('4.1.5', 'A freeze with a reason goes through', freeze('Travelling for work'));

{
  // The client does not get to say who was at the desk.
  await asOwner();
  const r = await one(`select recorded_by::text as by from membership_events
                        where kind = 'freeze' order by created_at desc limit 1;`);
  rec('4.1.6', 'and the desk operator is stamped server-side, not accepted from the client',
    ST, r.by, r.by === ST);
}

// ── The limit, and who may pass it ──────────────────────────────────────────
await as(ST);
await allows('4.2.0', 'A second freeze in the same month is still allowed', freeze('Injury'));

await as(ST);
await refuses('4.2.1', 'A third, at the front desk',
  freeze('Travelling again'), 'already been frozen twice this month');

await as(AD);
await allows('4.2.2', 'The same third freeze, by an admin — the override is real',
  freeze('Medical, cleared with the owner'));

{
  await asOwner();
  const r = await one(`select freezes_this_month('${M1}')::int as n;`);
  rec('4.2.3', 'and the counter the dialog reads agrees', 3, r.n, r.n === 3);
}

// ── The record cannot be rewritten ──────────────────────────────────────────
{
  await as(AD);
  const upd = await db.query(`update membership_events set reason = 'something else' returning id;`);
  rec('4.3.1', 'An admin edits a freeze reason after the fact',
    '0 rows — there is no UPDATE policy for anyone', `${upd.rows.length} rows`, upd.rows.length === 0);
  const del = await db.query(`delete from membership_events returning id;`);
  rec('4.3.2', 'or deletes the record', '0 rows', `${del.rows.length} rows`, del.rows.length === 0);
}

{
  // A member reads their own history — "why is my account frozen" should not
  // need a phone call — and nobody else's.
  await as(M1);
  const mine = await one(`select count(*)::int as n from membership_events;`);
  rec('4.3.3', 'The member can read their own freeze history', '4 or more', mine.n, mine.n >= 4);
}

// ════════════════════════════════════════════════════════════════════════════
//  4.4 — a suspension has to say why, and only an admin may impose one
// ════════════════════════════════════════════════════════════════════════════
await as(AD);
await refuses('4.4.1', 'An admin suspends an account with no reason',
  `select set_account_status('${M1}', 'suspended', null);`, 'A reason is required to set an account to suspended.');

await as(AD);
await refuses('4.4.2', 'and with whitespace',
  `select set_account_status('${M1}', 'suspended', '   ');`, 'A reason is required');

await as(ST);
await refuses('4.4.3', 'The front desk suspends an account',
  `select set_account_status('${M1}', 'suspended', 'Unpaid dues');`,
  'Only an admin');

await as(M1);
await refuses('4.4.4', 'The member suspends their own account to dodge a rule',
  `select set_account_status('${M1}', 'suspended', 'nope');`, 'Only an admin');

await as(AD);
await allows('4.4.5', 'An admin suspends with a reason',
  `select set_account_status('${M1}', 'suspended', 'Unpaid dues since August. Spoke to them on the 3rd.');`);

{
  await asOwner();
  const r = await one(`select p.status, e.reason, e.previous_status, e.recorded_by::text as by
                         from profiles p
                         join account_status_events e on e.profile_id = p.id
                        where p.id = '${M1}' order by e.created_at desc limit 1;`);
  rec('4.4.6', 'The account is suspended and the reason is on the record',
    'suspended, reason kept, previous status kept, admin stamped',
    `${r.status}, ${r.reason ? 'kept' : 'LOST'}, ${r.previous_status}, ${r.by === AD ? 'admin' : r.by}`,
    r.status === 'suspended' && !!r.reason && r.previous_status === 'active' && r.by === AD);
}

{
  // The reason has to reach the person it is about, or it is a note to
  // ourselves. It must not become a way to ask "is this email registered".
  await asOwner();
  await db.exec(`set request.jwt.claim.sub = '';`);
  const known = await one(`select account_lockout_reason((select 'lea@corefitness.test'))::text as r;`);
  rec('4.4.7', 'A lookup for an unknown address returns NULL rather than "no such account"',
    null, known.r, known.r === null);
}

await as(AD);
await allows('4.4.8', 'Reinstating needs no reason — it takes nothing away',
  `select set_account_status('${M1}', 'active');`);

{
  await as(AD);
  await allows('4.4.9', 'Setting the status it already has is quiet, not an error',
    `select set_account_status('${M1}', 'active');`);
  await asOwner();
  const n = await one(`select count(*)::int as n from account_status_events where profile_id = '${M1}';`);
  rec('4.4.10', 'and records no second event', 2, n.n, n.n === 2);
}

await as(AD);
await refuses('4.4.11', 'A status the system does not have',
  `select set_account_status('${M1}', 'banned', 'because');`, 'Unknown account status');

await asOwner();
const failures = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(r.id).padEnd(8)} ${r.name}`);
  if (!r.pass) console.log(`          expected ${r.expected}, got ${r.got}${r.detail ? ' — ' + r.detail : ''}`);
  else if (r.detail) console.log(`          ${r.detail}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
