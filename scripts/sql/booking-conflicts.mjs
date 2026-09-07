/**
 * The booking guards, run as SQL rather than argued about.
 *
 * Docker has never started in this environment, so this uses `@electric-sql/pglite`
 * — real PostgreSQL compiled to WASM, in-process. Migration 0068 is applied
 * *verbatim from the repository*; only the tables it depends on are stubbed, and
 * they are stubbed to the same column types the real ones use (0001, 0015).
 *
 * This is the boundary. `scripts/trainer-scenarios.js` proves the app agrees
 * with these rules and warns the member before the write; this proves the write
 * is actually refused.
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

// ── The fixture ────────────────────────────────────────────────────────────
// Only what 0068 touches. `auth.uid()` reads the same GUC PostgREST sets, so
// setting it is the same lever a real session pulls.
await db.exec(`
-- Supabase's roles, first. A policy or grant naming a role that does not exist
-- fails the whole migration, and \`revoke ... from anon\` is in nearly every file
-- here — so a harness without these is testing a database the gym does not run.
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type booking_status as enum ('pending','approved','rejected','cancelled');

create table profiles (
  id uuid primary key,
  role text not null default 'member',
  first_name text not null default '',
  last_name  text not null default ''
);
create table member_profiles  (profile_id uuid primary key references profiles(id));
create table trainer_profiles (profile_id uuid primary key references profiles(id));

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trainer_id uuid references trainer_profiles(profile_id),
  scheduled_at timestamptz,
  duration_minutes int not null default 60
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  class_id  uuid not null references classes(id) on delete cascade,
  status booking_status not null default 'pending'
);

create table pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id  uuid not null references member_profiles(profile_id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  status booking_status not null default 'pending',
  requested_at timestamptz not null default now()
);

-- 0015's index, because a test that passes only because this is missing is
-- testing a database the gym does not have.
create unique index idx_pt_sessions_trainer_slot
  on pt_sessions(trainer_id, starts_at)
  where status in ('pending', 'approved');

-- Stubbed to a switch, so the front-desk branch of member_commitments can be
-- exercised in both positions.
create or replace function is_front_desk() returns boolean
language sql stable as $$
  select coalesce(current_setting('test.front_desk', true), 'off') = 'on';
$$;
`);

// ── The migration, verbatim ────────────────────────────────────────────────
await db.exec(sqlFile('0068_booking_conflicts.sql'));

// ── Cast ───────────────────────────────────────────────────────────────────
const M1 = '11111111-1111-1111-1111-111111111111';
const M2 = '22222222-2222-2222-2222-222222222222';
const TA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

await db.exec(`
insert into profiles (id, role, first_name, last_name) values
  ('${M1}','member','Lea','Lorenzana'),
  ('${M2}','member','Miguel','Santos'),
  ('${TA}','trainer','Tere','Bautista'),
  ('${TB}','trainer','Marco','Dela Cruz');
insert into member_profiles values ('${M1}'), ('${M2}');
insert into trainer_profiles values ('${TA}'), ('${TB}');

-- Tomorrow, in Manila terms, expressed as an absolute instant.
insert into classes (id, name, trainer_id, scheduled_at, duration_minutes) values
  ('c0000000-0000-0000-0000-000000000001', 'Morning Yoga', null,
   (((current_date + 1)::timestamp + time '10:00') at time zone 'Asia/Manila'), 60),
  ('c0000000-0000-0000-0000-000000000002', 'Spin', null,
   (((current_date + 1)::timestamp + time '10:00') at time zone 'Asia/Manila'), 60),
  ('c0000000-0000-0000-0000-000000000003', 'Strength Circuit', '${TA}',
   (((current_date + 1)::timestamp + time '14:00') at time zone 'Asia/Manila'), 60);
`);

const at = (h, m = 0) =>
  // Parenthesised: `ts + time at time zone Z` binds as `ts + (time at time zone Z)`,
  // which is a type error rather than the instant anyone meant.
  `(((current_date + 1)::timestamp + time '${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}') at time zone 'Asia/Manila')`;

// ── Runner ─────────────────────────────────────────────────────────────────
const results = [];
const record = (id, name, expected, got, pass, detail) =>
  results.push({ id, name, expected, got, pass, ...(detail ? { detail } : {}) });

async function refuses(id, name, sql, expectFragment) {
  try {
    await db.exec(sql);
    record(id, name, 'refused', 'ACCEPTED', false);
  } catch (e) {
    const msg = String(e.message || e);
    const ok = !expectFragment || msg.includes(expectFragment);
    record(id, name, expectFragment ? `refused, naming "${expectFragment}"` : 'refused',
      ok ? 'refused' : `refused, but said: ${msg}`, ok, msg.split('\n')[0]);
  }
}

async function allows(id, name, sql) {
  try {
    await db.exec(sql);
    record(id, name, 'allowed', 'allowed', true);
  } catch (e) {
    record(id, name, 'allowed', 'REFUSED', false, String(e.message || e).split('\n')[0]);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  A member cannot be in two places at once
// ════════════════════════════════════════════════════════════════════════════
await allows('3.1.0', 'Member books the 10:00 class',
  `insert into bookings (id, member_id, class_id, status)
   values ('b0000000-0000-0000-0000-000000000001','${M1}','c0000000-0000-0000-0000-000000000001','approved');`);

await refuses('3.1.1', 'Same member requests PT at the same 10:00',
  `insert into pt_sessions (member_id, trainer_id, starts_at) values ('${M1}','${TA}',${at(10)});`,
  'Morning Yoga');

await refuses('3.1.2', 'Same member books a second class at the same hour',
  `insert into bookings (member_id, class_id) values ('${M1}','c0000000-0000-0000-0000-000000000002');`,
  'Morning Yoga');

await allows('3.1.3', 'PT at 11:00 — the end instant is free, not a clash',
  `insert into pt_sessions (id, member_id, trainer_id, starts_at)
   values ('50000000-0000-0000-0000-000000000001','${M1}','${TA}',${at(11)});`);

await refuses('3.1.4', 'PT at 10:30 — overlap, not equality',
  `insert into pt_sessions (member_id, trainer_id, starts_at) values ('${M1}','${TA}',${at(10, 30)});`,
  'Morning Yoga');

await allows('3.1.6a', 'The member cancels the class',
  `update bookings set status = 'cancelled' where id = 'b0000000-0000-0000-0000-000000000001';`);

await allows('3.1.6b', 'PT at 10:00 now succeeds',
  `insert into pt_sessions (id, member_id, trainer_id, starts_at)
   values ('50000000-0000-0000-0000-000000000002','${M1}','${TA}',${at(10)});`);

// ════════════════════════════════════════════════════════════════════════════
//  Availability is per trainer — the panel's question, at the boundary
// ════════════════════════════════════════════════════════════════════════════
// Trainer A now holds 10:00 and 11:00 for member 1.
await refuses('3.2.1', 'A second member asks Trainer A for the same 10:00',
  `insert into pt_sessions (member_id, trainer_id, starts_at) values ('${M2}','${TA}',${at(10)});`,
  'already booked');

await allows('3.2.2', 'The same member asks Trainer B for that 10:00 — A being full says nothing about B',
  `insert into pt_sessions (id, member_id, trainer_id, starts_at)
   values ('50000000-0000-0000-0000-000000000003','${M2}','${TB}',${at(10)});`);

await refuses('3.2.3', "Trainer A teaches at 14:00, so A cannot take PT at 14:00",
  `insert into pt_sessions (member_id, trainer_id, starts_at) values ('${M2}','${TA}',${at(14)});`,
  'Strength Circuit');

await refuses('3.2.3b', "A's class also blocks the half-hour inside it",
  `insert into pt_sessions (member_id, trainer_id, starts_at) values ('${M2}','${TA}',${at(14, 30)});`,
  'Strength Circuit');

await allows('3.2.4', 'Trainer B at the same 14:00 is unaffected',
  `insert into pt_sessions (id, member_id, trainer_id, starts_at)
   values ('50000000-0000-0000-0000-000000000004','${M2}','${TB}',${at(14)});`);

// ── The report, not a guard ─────────────────────────────────────────────────
{
  const clean = await db.query('select count(*)::int as n from trainer_schedule_conflicts();');
  record('3.2.5', 'trainer_schedule_conflicts() finds nothing on clean data',
    0, clean.rows[0].n, clean.rows[0].n === 0);

  // A class generated on top of a trainer's own PT session is exactly the case
  // the report exists for: the trigger cannot refuse it, so it must be visible.
  await db.exec(`insert into classes (name, trainer_id, scheduled_at, duration_minutes)
                 values ('Generated clash', '${TB}', ${at(10, 30)}, 60);`);
  const dirty = await db.query('select count(*)::int as n from trainer_schedule_conflicts();');
  record('3.2.6', 'A class generated over a trainer\'s own PT session is reported',
    '1 or more', dirty.rows[0].n, dirty.rows[0].n >= 1);
}

// ════════════════════════════════════════════════════════════════════════════
//  member_commitments decides for itself who may ask
// ════════════════════════════════════════════════════════════════════════════
{
  // Signed in as member 2, asking for member 1's diary.
  await db.exec(`set request.jwt.claim.sub = '${M2}';`);
  await refuses('6.5', "A member reads another member's commitments",
    `select * from member_commitments('${M1}');`, 'only read your own');

  await db.exec(`set request.jwt.claim.sub = '${M2}';`);
  const own = await db.query(`select count(*)::int as n from member_commitments('${M2}');`);
  record('6.5b', 'A member reads their own', '2 or more', own.rows[0].n, own.rows[0].n >= 2);

  // The 0055/0062 bug: with no session, `auth.uid()` is NULL and a bare
  // `is distinct from` refuses the one caller entitled to run it.
  await db.exec(`set request.jwt.claim.sub = '';`);
  const noSession = await db.query(`select count(*)::int as n from member_commitments('${M1}');`);
  record('6.5c', 'With no session at all the guard does not lock out its own caller',
    '1 or more', noSession.rows[0].n, noSession.rows[0].n >= 1);

  await db.exec(`set request.jwt.claim.sub = '${M2}'; set test.front_desk = 'on';`);
  const desk = await db.query(`select count(*)::int as n from member_commitments('${M1}');`);
  record('6.5d', 'The front desk may read any member\'s diary', '1 or more', desk.rows[0].n, desk.rows[0].n >= 1);
  await db.exec(`set test.front_desk = 'off';`);
}

// ── Report ─────────────────────────────────────────────────────────────────
const failures = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)} ${r.name}`);
  if (!r.pass) console.log(`         expected ${r.expected}, got ${r.got}`);
  else if (r.detail) console.log(`         ${r.detail}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
