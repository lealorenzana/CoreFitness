/**
 * Runs seed-demo-data.sql and remove-demo-data.sql against real PostgreSQL
 * (pglite) before anyone pastes them into the live project.
 *
 * Every table the seed writes carries a **canary trigger that raises**. So the
 * seed can only pass if its triggers really are off while it writes — which is
 * the whole reason the invoice counter, the points ledger and the trainers'
 * inboxes are safe. Afterwards the canaries must be back on.
 *
 * One **real** row is planted in each table first. Removal must leave every one
 * of them standing.
 *
 *   npm install @electric-sql/pglite      # anywhere; not a project dependency
 *   node <repo>/scripts/demo-data/verify-demo-data.mjs "<repo>"
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromCwd = createRequire(pathToFileURL(process.cwd() + '/'));
const { PGlite } = await import(pathToFileURL(requireFromCwd.resolve('@electric-sql/pglite')).href);

const REPO = process.argv[2];
const seedSql = readFileSync(`${REPO}/scripts/demo-data/seed-demo-data.sql`, 'utf8');
const removeSql = readFileSync(`${REPO}/scripts/demo-data/remove-demo-data.sql`, 'utf8');

const db = await PGlite.create();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const one = async (sql) => (await db.query(sql)).rows[0] ?? {};

// ── Fixture: the columns the scripts touch, with the real types ─────────────
await db.exec(`
create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz,
  -- No default, exactly as GoTrue declares them: the seed must fill these.
  confirmation_token text, recovery_token text, email_change text
);

create type user_role as enum ('admin','staff','trainer','member');
create type membership_status as enum ('active','expired','frozen','cancelled','pending');
create type plan_tier as enum ('free','freemium','premium','pro');
create type booking_status as enum ('pending','approved','rejected','cancelled');
create type payment_status as enum ('completed','pending','failed');
create type checkin_method as enum ('qr','manual');
create type class_level as enum ('beginner','intermediate','advanced','all_levels');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'member', first_name text not null, last_name text not null,
  email text not null unique, phone text, photo_url text,
  status text not null default 'active', created_at timestamptz not null default now()
);
create table member_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  gym_id text, address text, emergency_contact_name text, emergency_contact_phone text,
  emergency_contact_relationship text, qr_code text unique, experience_level text,
  training_focus text, date_of_birth date, gender text, onboarding_completed_at timestamptz,
  interests text[] not null default '{}', created_at timestamptz not null default now()
);
create table membership_plans (
  id uuid primary key default gen_random_uuid(), name text not null,
  tier plan_tier not null, price numeric(10,2) not null default 0, duration_days int
);
create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  plan_id uuid not null references membership_plans(id),
  status membership_status not null default 'pending', start_date date, expiry_date date,
  never_expires boolean not null default false, frozen_at date,
  freeze_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  membership_id uuid references memberships(id), amount numeric(10,2) not null,
  method text not null, status payment_status not null default 'completed', due_date date,
  invoice_number text not null, notes text, recorded_by uuid references profiles(id),
  paid_on date not null default current_date, created_at timestamptz not null default now()
);
create unique index payments_invoice_number_key on payments (invoice_number);
create table attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  gym_id text, check_in_time timestamptz not null default now(),
  method checkin_method not null default 'manual', recorded_by uuid references profiles(id),
  activity text
);
create table classes (
  id uuid primary key default gen_random_uuid(), name text not null, trainer_id uuid,
  level class_level not null default 'all_levels', capacity int not null default 20 check (capacity > 0),
  location text, class_type text, scheduled_at timestamptz,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  template_id uuid, created_at timestamptz not null default now()
);
create unique index on classes(template_id, scheduled_at);
create table bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  status booking_status not null default 'pending', requested_at timestamptz not null default now(),
  approved_at timestamptz, rejected_at timestamptz, approved_by uuid references profiles(id),
  decided_by uuid references profiles(id), decided_by_role text, decided_at timestamptz
);
create table membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  kind text not null check (kind in ('freeze','unfreeze','cancel')), reason text,
  refund_requested boolean not null default false, refund_note text,
  recorded_by uuid references profiles(id), created_at timestamptz not null default now()
);
create table account_status_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null, previous_status text, reason text,
  recorded_by uuid references profiles(id), created_at timestamptz not null default now()
);
create table activity_log (
  id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
  actor_id uuid, action text not null, subject_type text not null, subject_id uuid,
  member_id uuid, summary text not null
);

-- The canary. If any user trigger fires during the seed, this is the one.
create function canary() returns trigger language plpgsql as $$
begin
  raise exception 'CANARY: a user trigger fired on % (%)', tg_table_name, tg_op;
end $$;
`);

const SEEDED = ['profiles', 'member_profiles', 'memberships', 'payments', 'attendance',
  'classes', 'bookings', 'membership_events', 'account_status_events'];

// ── One real member, with one real row everywhere, planted BEFORE the canaries
const REAL = 'a1b2c3d4-0000-4000-9000-000000000001';
await db.exec(`
insert into membership_plans (name, tier, price, duration_days) values
  ('Free Plan','free',0,null), ('Free Trial','freemium',0,30), ('Premium','premium',1500,30);
insert into auth.users (id, email) values ('${REAL}', 'lea@realgym.ph');
insert into profiles (id, first_name, last_name, email) values ('${REAL}', 'Real', 'Member', 'lea@realgym.ph');
insert into member_profiles (profile_id, qr_code) values ('${REAL}', '${REAL}');
insert into memberships (member_id, plan_id, status) select '${REAL}', id, 'active' from membership_plans where name = 'Premium';
insert into payments (member_id, amount, method, invoice_number) values ('${REAL}', 1500, 'cash', 'INV-2026-0001');
insert into attendance (member_id) values ('${REAL}');
insert into classes (id, name, scheduled_at) values ('c1a55000-0000-4000-9000-000000000001', 'Real Class', now() + interval '2 days');
insert into bookings (member_id, class_id, status) values ('${REAL}', 'c1a55000-0000-4000-9000-000000000001', 'approved');
insert into membership_events (membership_id, member_id, kind, reason) select id, '${REAL}', 'freeze', 'Real reason' from memberships where member_id = '${REAL}';
insert into account_status_events (profile_id, status, reason) values ('${REAL}', 'active', null);
insert into activity_log (action, subject_type, member_id, summary) values ('payment.recorded', 'payment', '${REAL}', 'Real audit entry');
`);
for (const t of SEEDED) {
  await db.exec(`create trigger canary_${t} before insert or update or delete on ${t}
                 for each row execute function canary();`);
}

const counts = async () => one(`select
  (select count(*) from profiles    where id::text like '5eed0001-0000-4000-8000-%')::int as members,
  (select count(*) from payments    where id::text like '5eed0003-0000-4000-8000-%')::int as payments,
  (select count(*) from classes     where id::text like '5eed0005-0000-4000-8000-%')::int as classes,
  (select count(*) from bookings    where id::text like '5eed0006-0000-4000-8000-%')::int as bookings,
  (select count(*) from attendance  where id::text like '5eed0004-0000-4000-8000-%')::int as checkins,
  (select count(*) from membership_events where id::text like '5eed0007-0000-4000-8000-%')::int as events`);
const canariesOn = async () =>
  (await one(`select count(*)::int as n from pg_trigger
               where tgname like 'canary_%' and tgenabled = 'O'`)).n === SEEDED.length;

// ════════════════════════════════════════════════════════════════════════════
try {
  await db.exec(seedSql);
  check('Seed runs with a raising canary on every table it writes', true);
} catch (e) {
  check('Seed runs with a raising canary on every table it writes', false, String(e.message).split('\n')[0]);
  process.exit(1);
}
check('Every canary is back ON afterwards', await canariesOn());

const c = await counts();
check('150 demo members', c.members === 150, `${c.members}`);
check('Members page needs more than one page (10 per page)', c.members > 10);
const groups = (await one(`select count(distinct member_id)::int as n from payments
                            where id::text like '5eed0003-0000-4000-8000-%'`)).n;
check('Payments page needs several pages (8 members per page)', groups > 16, `${groups} members, ${c.payments} payments`);
check('72 past classes', c.classes === 72, `${c.classes}`);
check('Bookings page needs many pages (12 per page)', c.bookings > 120, `${c.bookings}`);
check('Check-ins over sixty days', c.checkins > 1500, `${c.checkins}`);

const today = (await one(`select count(*)::int as n from attendance
  where id::text like '5eed0004-0000-4000-8000-%'
    and (check_in_time at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date`)).n;
const openMin = (await one(`select floor(extract(epoch from (now() at time zone 'Asia/Manila')
  - ((now() at time zone 'Asia/Manila')::date + time '06:00')) / 60)::int as m`)).m;
check('Today\'s desk log has check-ins (or it is before opening)', openMin <= 0 ? today === 0 : today > 10,
  `${today} today, ${openMin} min since 06:00 Manila`);

check('No check-in is in the future', (await one(`select count(*)::int as n from attendance
  where id::text like '5eed0004-0000-4000-8000-%' and check_in_time > now()`)).n === 0);
check('Every demo class is in the past', (await one(`select count(*)::int as n from classes
  where id::text like '5eed0005-0000-4000-8000-%' and scheduled_at >= now()`)).n === 0);
check('No demo class has a trainer', (await one(`select count(*)::int as n from classes
  where id::text like '5eed0005-0000-4000-8000-%' and trainer_id is not null`)).n === 0);
check('No booking is left pending (the sweep would message the real admin)', (await one(`select count(*)::int as n
  from bookings where id::text like '5eed0006-0000-4000-8000-%' and status = 'pending'`)).n === 0);
check('Nobody is booked into two overlapping classes', (await one(`select count(*)::int as n
  from bookings a join classes ca on ca.id = a.class_id
  join bookings b on b.member_id = a.member_id and b.id < a.id
  join classes cb on cb.id = b.class_id
  where a.id::text like '5eed0006-%' and a.status in ('approved','pending') and b.status in ('approved','pending')
    and (ca.scheduled_at, ca.scheduled_at + interval '60 minutes')
        overlaps (cb.scheduled_at, cb.scheduled_at + interval '60 minutes')`)).n === 0);
check('No booking exceeds its class capacity', (await one(`select count(*)::int as n from (
  select c.id from classes c join bookings b on b.class_id = c.id
   where c.id::text like '5eed0005-%' group by c.id, c.capacity having count(*) > c.capacity) x`)).n === 0);
check('Free Plan members have no bookings (they cannot book)', (await one(`select count(*)::int as n
  from bookings b join memberships m on m.member_id = b.member_id join membership_plans p on p.id = m.plan_id
  where b.id::text like '5eed0006-%' and p.tier = 'free'`)).n === 0);
check('Only Premium members have payments', (await one(`select count(*)::int as n
  from payments pa join memberships m on m.id = pa.membership_id join membership_plans p on p.id = m.plan_id
  where pa.id::text like '5eed0003-%' and p.tier <> 'premium'`)).n === 0);
check('Every demo invoice is on the SEED- series', (await one(`select count(*)::int as n from payments
  where id::text like '5eed0003-%' and invoice_number not like 'SEED-%'`)).n === 0);
check('Every frozen or cancelled membership has an event with a reason', (await one(`select count(*)::int as n
  from memberships m where m.id::text like '5eed0002-%' and m.status in ('frozen','cancelled')
   and not exists (select 1 from membership_events e where e.membership_id = m.id
                    and e.kind in ('freeze','cancel') and coalesce(btrim(e.reason),'') <> '')`)).n === 0);
check('Every suspended or archived member has a reason on record', (await one(`select count(*)::int as n
  from profiles p where p.id::text like '5eed0001-%' and p.status in ('suspended','archived')
   and not exists (select 1 from account_status_events e where e.profile_id = p.id
                    and coalesce(btrim(e.reason),'') <> '')`)).n === 0);
check('GoTrue token columns are empty strings, not NULL', (await one(`select count(*)::int as n from auth.users
  where id::text like '5eed0001-%' and (confirmation_token is null or recovery_token is null or email_change is null)`)).n === 0);
check('No demo member can sign in (no password)', (await one(`select count(*)::int as n from auth.users
  where id::text like '5eed0001-%' and coalesce(encrypted_password, '') <> ''`)).n === 0);

// ── Idempotent ─────────────────────────────────────────────────────────────
await db.exec(seedSql);
const c2 = await counts();
check('A second run adds nothing', JSON.stringify(c) === JSON.stringify(c2), JSON.stringify(c2));

// ── A payment recorded against a demo member during a demo (random id) ──────
await db.exec(`drop trigger canary_payments on payments;`);
await db.exec(`insert into payments (member_id, amount, method, invoice_number)
               values ('5eed0001-0000-4000-8000-000000000003', 1500, 'cash', 'INV-2026-0099');
               insert into activity_log (action, subject_type, member_id, summary)
               values ('payment.recorded', 'payment', '5eed0001-0000-4000-8000-000000000003', 'Demo-time entry');`);
await db.exec(`create trigger canary_payments before insert or update or delete on payments
               for each row execute function canary();`);

// ── Removal ────────────────────────────────────────────────────────────────
try {
  await db.exec(removeSql);
  check('Removal runs with the canaries on', true);
} catch (e) {
  check('Removal runs with the canaries on', false, String(e.message).split('\n')[0]);
}
check('Every canary is back ON after removal', await canariesOn());
const c3 = await counts();
check('No demo rows remain anywhere', Object.values(c3).every((v) => v === 0), JSON.stringify(c3));
check('No demo auth users remain', (await one(`select count(*)::int as n from auth.users where id::text like '5eed%'`)).n === 0);
check('The demo-time payment (random id) went too', (await one(`select count(*)::int as n from payments
  where invoice_number = 'INV-2026-0099'`)).n === 0);
check('The demo-time audit entry went too', (await one(`select count(*)::int as n from activity_log
  where summary = 'Demo-time entry'`)).n === 0);

const real = await one(`select
  (select count(*) from auth.users where id = '${REAL}')::int as users,
  (select count(*) from profiles where id = '${REAL}')::int as profiles,
  (select count(*) from memberships where member_id = '${REAL}')::int as memberships,
  (select count(*) from payments where invoice_number = 'INV-2026-0001')::int as payments,
  (select count(*) from attendance where member_id = '${REAL}')::int as attendance,
  (select count(*) from classes where name = 'Real Class')::int as classes,
  (select count(*) from bookings where member_id = '${REAL}')::int as bookings,
  (select count(*) from membership_events where member_id = '${REAL}')::int as events,
  (select count(*) from account_status_events where profile_id = '${REAL}')::int as status_events,
  (select count(*) from activity_log where summary = 'Real audit entry')::int as audit`);
check('Every real row survived removal', Object.values(real).every((v) => v === 1), JSON.stringify(real));

await db.exec(removeSql);
check('Removal is safe to run twice', true);

try {
  await db.exec(`insert into attendance (member_id) values ('${REAL}');`);
  check('Triggers really are live again (a real write hits the canary)', false, 'insert went through');
} catch (e) {
  check('Triggers really are live again (a real write hits the canary)', String(e.message).includes('CANARY'));
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
