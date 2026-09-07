/**
 * Trainers decide, admin oversees, and nobody waits forever — as SQL.
 *
 * Applies 0053's dedupe index and migration 0071 verbatim onto a minimal
 * fixture, then acts as a **real `authenticated` role**, not as the owner. A
 * table owner bypasses RLS entirely, so an assertion run as `postgres` passes
 * whether or not the policy works; `current_user` is asserted before anything
 * that follows is believed.
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
const M2 = '22222222-2222-2222-2222-222222222222';
const TA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AD = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

await db.exec(`
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type booking_status as enum ('pending','approved','rejected','cancelled');

create table profiles (
  id uuid primary key, role text not null default 'member',
  -- The sweep escalates to "every admin whose account is active". Without this
  -- column the whole function fails at runtime rather than at creation, which
  -- is exactly the class of bug a green migration hides.
  status text not null default 'active',
  first_name text not null default '', last_name text not null default ''
);
create table member_profiles  (profile_id uuid primary key references profiles(id));
create table trainer_profiles (profile_id uuid primary key references profiles(id));

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trainer_id uuid references trainer_profiles(profile_id),
  scheduled_at timestamptz,
  duration_minutes int not null default 60,
  capacity int not null default 20,
  location text
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  class_id  uuid not null references classes(id) on delete cascade,
  status booking_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz, rejected_at timestamptz,
  approved_by uuid references profiles(id)
);

create table pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id  uuid not null references member_profiles(profile_id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  status booking_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz, rejected_at timestamptz,
  approved_by uuid references profiles(id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, message text not null,
  action_url text, metadata jsonb, read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 0053, verbatim: the dedupe key behind a partial unique index. Without this a
-- second reminder is merely unlikely rather than impossible, and the repeat
-- test below would pass for the wrong reason.
create unique index notifications_dedupe_unique
  on notifications (user_id, (metadata ->> 'dedupe'))
  where metadata ? 'dedupe';

create or replace function notify_once(
  p_user uuid, p_type text, p_title text, p_message text,
  p_action_url text, p_dedupe text
) returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  insert into notifications (user_id, type, title, message, action_url, metadata)
  values (p_user, p_type, p_title, p_message, p_action_url,
          jsonb_build_object('dedupe', p_dedupe))
  on conflict do nothing;
  return found;
end;
$fn$;

create or replace function is_front_desk() returns boolean language sql stable as $$
  select coalesce((select role from profiles where id = auth.uid()), '') in ('admin','staff');
$$;

-- RLS on, because 0071 asserts it and because a policy on a table whose RLS is
-- off reads exactly like protection and is none.
alter table bookings    enable row level security;
alter table pt_sessions enable row level security;
alter table classes     enable row level security;

-- Baseline reads, so a trainer can see the rows their update policy filters.
create policy classes_select     on classes     for select using (true);
create policy bookings_select    on bookings    for select using (true);
create policy pt_select          on pt_sessions for select using (true);

-- The admin's own update policy, so "admin reverses it" is testable.
create policy bookings_update_admin on bookings for update
  using ((select role from profiles where id = auth.uid()) in ('admin','staff'))
  with check ((select role from profiles where id = auth.uid()) in ('admin','staff'));
create policy pt_update_admin on pt_sessions for update
  using ((select role from profiles where id = auth.uid()) in ('admin','staff'))
  with check ((select role from profiles where id = auth.uid()) in ('admin','staff'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
`);

await db.exec(sqlFile('0071_trainer_decisions.sql'));
// 0074 reorders the two stamp triggers so the column pins run before the
// "nothing to stamp" early return. Applied on top, exactly as it will be live.
await db.exec(sqlFile('0074_decision_guard_runs_first.sql'));

await db.exec(`
insert into profiles (id, role, first_name, last_name) values
  ('${M1}','member','Lea','Lorenzana'),
  ('${M2}','member','Miguel','Santos'),
  ('${TA}','trainer','Tere','Bautista'),
  ('${TB}','trainer','Marco','Dela Cruz'),
  ('${AD}','admin','Gabrielle','Facalarin');
insert into member_profiles values ('${M1}'), ('${M2}');
insert into trainer_profiles values ('${TA}'), ('${TB}');

insert into classes (id, name, trainer_id, scheduled_at, capacity) values
  ('c0000000-0000-0000-0000-00000000000a', 'Morning Yoga',  '${TA}', now() + interval '3 days', 12),
  ('c0000000-0000-0000-0000-00000000000b', 'Strength Basics','${TB}', now() + interval '4 days', 8);

insert into bookings (id, member_id, class_id, status) values
  ('b0000000-0000-0000-0000-00000000000a','${M1}','c0000000-0000-0000-0000-00000000000a','pending'),
  ('b0000000-0000-0000-0000-00000000000b','${M2}','c0000000-0000-0000-0000-00000000000b','pending');
`);

// ── Runner ─────────────────────────────────────────────────────────────────
const results = [];
const rec = (id, name, expected, got, pass, detail) =>
  results.push({ id, name, expected, got, pass, detail });

/** Become a signed-in user of the given role, for real. */
async function as(uid) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  const who = await db.query('select current_user as u;');
  if (who.rows[0].u !== 'authenticated') {
    throw new Error(`SET ROLE did not take — still ${who.rows[0].u}. Every RLS assertion after this would pass for the wrong reason.`);
  }
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
const one = async (sql) => (await db.query(sql)).rows[0];

// ════════════════════════════════════════════════════════════════════════════
//  3.3 — a trainer decides their own classes, and only their own
// ════════════════════════════════════════════════════════════════════════════
await as(TA);
await allows('3.3.1', "Trainer A accepts a request for A's own class",
  `update bookings set status = 'approved' where id = 'b0000000-0000-0000-0000-00000000000a';`);

{
  await asOwner();
  const r = await one(`select decided_by_role, decided_by::text, approved_at is not null as stamped
                         from bookings where id = 'b0000000-0000-0000-0000-00000000000a';`);
  rec('3.3.3', "The row says a trainer decided it, not the desk", 'trainer', r.decided_by_role,
    r.decided_by_role === 'trainer');
  rec('3.3.3b', 'and names which trainer, and keeps approved_at in step', `${TA} + stamped`,
    `${r.decided_by} + ${r.stamped ? 'stamped' : 'NOT stamped'}`,
    r.decided_by === TA && r.stamped === true);
}

{
  // The panel's oversight question: a trainer must not be able to decide
  // another trainer's class. RLS **filters rows** — it does not raise — so the
  // honest failure here is zero rows, which the app's assertWrote() surfaces.
  await as(TA);
  const res = await db.query(
    `update bookings set status = 'approved' where id = 'b0000000-0000-0000-0000-00000000000b' returning id;`);
  rec('3.3.2', "Trainer A accepts a request on Trainer B's class",
    '0 rows updated (RLS filters, it does not raise)', `${res.rows.length} rows`,
    res.rows.length === 0);
}

await as(TA);
await refuses('3.3.5', "Trainer A tries to hand the seat to somebody else",
  `update bookings set member_id = '${M2}' where id = 'b0000000-0000-0000-0000-00000000000a';`,
  'not reassign it');

{
  await as(AD);
  await allows('3.3.4', 'The admin reverses the trainer\'s decision',
    `update bookings set status = 'rejected' where id = 'b0000000-0000-0000-0000-00000000000a';`);
  await asOwner();
  const r = await one(`select decided_by_role, rejected_at is not null as stamped
                         from bookings where id = 'b0000000-0000-0000-0000-00000000000a';`);
  rec('3.3.4b', 'and the row now says the admin did', 'admin + rejected_at set',
    `${r.decided_by_role} + ${r.stamped ? 'set' : 'NOT set'}`,
    r.decided_by_role === 'admin' && r.stamped === true);
}

// ── The class-size control the panel asked both roles to have ───────────────
await as(TA);
await allows('3.3.6a', 'Trainer A sets the size of their own class',
  `update classes set capacity = 10 where id = 'c0000000-0000-0000-0000-00000000000a';`);

{
  await asOwner();
  await db.exec(`insert into bookings (member_id, class_id, status)
                 values ('${M2}','c0000000-0000-0000-0000-00000000000a','approved');`);
  await as(TA);
  await refuses('3.3.6', 'Trainer A sets the size below the seats already taken',
    `update classes set capacity = 0 where id = 'c0000000-0000-0000-0000-00000000000a';`,
    'already has more members booked');
}

await as(TA);
await refuses('3.3.7', 'Trainer A tries to move the class in the timetable',
  `update classes set scheduled_at = now() + interval '9 days'
     where id = 'c0000000-0000-0000-0000-00000000000a';`,
  'timetable itself is set by the gym');

{
  await as(TB);
  const res = await db.query(
    `update classes set capacity = 4 where id = 'c0000000-0000-0000-0000-00000000000a' returning id;`);
  rec('3.3.8', "Trainer B sets the size of Trainer A's class", '0 rows',
    `${res.rows.length} rows`, res.rows.length === 0);
}

{
  // The same shape on pt_sessions, where the reachable column is `starts_at`:
  // a trainer moving somebody's session without a decision and without telling
  // them. 0068's conflict trigger fires on this update and would catch a
  // clash — it has nothing to say about consent.
  await asOwner();
  await db.exec(`insert into pt_sessions (id, trainer_id, member_id, starts_at, status)
                 values ('50000000-0000-0000-0000-0000000000ff','${TA}','${M1}', now() + interval '6 days', 'approved');`);
  await as(TA);
  await refuses('3.3.9', "Trainer A moves a member's session two hours later, silently",
    `update pt_sessions set starts_at = starts_at + interval '2 hours'
       where id = '50000000-0000-0000-0000-0000000000ff';`,
    'not move it');
}

// ════════════════════════════════════════════════════════════════════════════
//  3.4 — the escalation ladder
// ════════════════════════════════════════════════════════════════════════════
await asOwner();
await db.exec(`
delete from notifications;
insert into pt_sessions (id, trainer_id, member_id, starts_at, status, requested_at) values
  -- 25h waited, session comfortably ahead: rung one, the trainer is reminded.
  ('50000000-0000-0000-0000-00000000001a','${TA}','${M1}', now() + interval '10 days', 'pending', now() - interval '25 hours'),
  -- 49h waited: the member is told, and told they may pick another coach.
  ('50000000-0000-0000-0000-00000000002a','${TB}','${M2}', now() + interval '11 days', 'pending', now() - interval '49 hours'),
  -- Its start has passed and nobody ever decided: auto-declined.
  ('50000000-0000-0000-0000-00000000003a','${TA}','${M2}', now() - interval '2 hours', 'pending', now() - interval '4 days');
`);

{
  // No session at all — pg_cron and the SQL Editor are the intended automatic
  // callers, and 0055/0062 both shipped the guard that locked them out.
  await db.exec(`set request.jwt.claim.sub = '';`);
  await allows('3.4.0', 'The sweep runs with no session, as pg_cron would',
    `select sweep_stale_requests();`);

  const trainerNudge = await one(`select count(*)::int as n from notifications
    where user_id = '${TA}' and title = 'A member is waiting';`);
  rec('3.4.1', 'The trainer is told somebody has been waiting over a day', 1, trainerNudge.n,
    trainerNudge.n === 1);

  const before = await one('select count(*)::int as n from notifications;');
  await db.exec(`select sweep_stale_requests();`);
  const after = await one('select count(*)::int as n from notifications;');
  rec('3.4.2', 'Running it again sends nothing — the dedupe index holds, it does not race',
    before.n, after.n, before.n === after.n);

  const memberTold = await one(`select count(*)::int as n from notifications
    where user_id = '${M2}' and title = 'Your request is still pending';`);
  rec('3.4.3', 'At two days the member is told it is still pending', 1, memberTold.n,
    memberTold.n === 1);

  const alt = await one(`select coalesce(bool_or(message ilike '%different trainer%'), false) as offered
    from notifications where user_id = '${M2}' and title = 'Your request is still pending';`);
  rec('3.4.3b', 'and is offered another trainer rather than left waiting', true, alt.offered,
    alt.offered === true);

  const expired = await one(`select status::text, decided_by_role, decided_by is null as anon
    from pt_sessions where id = '50000000-0000-0000-0000-00000000003a';`);
  rec('3.4.4', 'A request whose start has passed is declined rather than left pending forever',
    'rejected', expired.status, expired.status === 'rejected');
  rec('3.4.4b', "and is stamped 'system', not the admin who opened the page",
    'system + no author', `${expired.decided_by_role} + ${expired.anon ? 'no author' : 'AUTHOR SET'}`,
    expired.decided_by_role === 'system' && expired.anon === true);

  const toldWhy = await one(`select count(*)::int as n from notifications
    where user_id = '${M2}' and title = 'Session request expired';`);
  rec('3.4.4c', 'and the member is told why', 1, toldWhy.n, toldWhy.n === 1);
}

{
  // A session tomorrow that nobody has confirmed — the member is about to plan
  // a day around it.
  await asOwner();
  await db.exec(`insert into pt_sessions (id, trainer_id, member_id, starts_at, status, requested_at)
    values ('50000000-0000-0000-0000-00000000004a','${TB}','${M1}', now() + interval '9 hours', 'pending', now() - interval '3 hours');`);
  await db.exec(`set request.jwt.claim.sub = ''; select sweep_stale_requests();`);
  const soon = await one(`select
      count(*) filter (where user_id = '${TB}' and title = 'Session tomorrow still unconfirmed')::int as trainer,
      count(*) filter (where user_id = '${M1}' and title = 'Still waiting on your coach')::int as member,
      count(*) filter (where user_id = '${AD}' and title = 'Unconfirmed session within 24 hours')::int as admin
    from notifications;`);
  rec('3.4.5', 'A session inside 24 hours that nobody confirmed reaches all three',
    'trainer 1, member 1, admin 1',
    `trainer ${soon.trainer}, member ${soon.member}, admin ${soon.admin}`,
    soon.trainer === 1 && soon.member === 1 && soon.admin === 1);
}

{
  // A member must not be able to run it: it writes to every admin's inbox and
  // closes other people's bookings.
  await as(M1);
  await refuses('3.4.6', 'A member runs the sweep', `select sweep_stale_requests();`,
    'Only the front desk');
  await asOwner();
}

const failures = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(r.id).padEnd(9)} ${r.name}`);
  if (!r.pass) console.log(`          expected ${r.expected}, got ${r.got}${r.detail ? ' — ' + r.detail : ''}`);
  else if (r.detail) console.log(`          ${r.detail}`);
}
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
