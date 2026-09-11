/**
 * Runs both seeds and the removal script against real PostgreSQL (pglite)
 * before anyone pastes them into the live project.
 *
 * Every table a seed writes carries a **canary trigger that raises**, so a seed
 * passes only if its triggers really are off while it writes — the reason the
 * invoice counter, members' inboxes and the trainers' notifications stay
 * untouched. Afterwards every canary must be back on.
 *
 * One **real** row is planted in each table first. Removal must leave all of
 * them standing — including a real member's booking on a real class.
 *
 * Every claim the part-2 header makes about what real members can or cannot
 * see is checked here, not only asserted there.
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
const read = (f) => readFileSync(`${REPO}/scripts/demo-data/${f}`, 'utf8');
const seed1 = read('seed-demo-data.sql');
const seed2 = read('seed-demo-data-2.sql');
const removeSql = read('remove-demo-data.sql');

const db = await PGlite.create();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const one = async (sql) => (await db.query(sql)).rows[0] ?? {};
const n = async (sql) => Number((await one(sql)).n);

// ── Fixture: the columns the scripts touch, with the real types ─────────────
await db.exec(`
create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz,
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
create table trainer_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  specialization text, bio text, availability text, years_experience int,
  certifications text[], focus_areas text[], achievements text
);
create table trainer_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  day_of_week int not null, start_time time not null, end_time time not null
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
create table class_templates (
  id uuid primary key default gen_random_uuid(), name text not null,
  trainer_id uuid references trainer_profiles(profile_id) on delete set null,
  level class_level not null default 'all_levels', capacity int not null default 20 check (capacity > 0),
  location text, day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null, duration_minutes int not null default 60,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table classes (
  id uuid primary key default gen_random_uuid(), name text not null,
  trainer_id uuid references trainer_profiles(profile_id),
  level class_level not null default 'all_levels', capacity int not null default 20 check (capacity > 0),
  location text, class_type text, scheduled_at timestamptz,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  template_id uuid references class_templates(id) on delete set null,
  created_at timestamptz not null default now()
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
create table pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  starts_at timestamptz not null, duration_minutes int not null default 60 check (duration_minutes > 0),
  status booking_status not null default 'pending', notes text,
  requested_at timestamptz not null default now(), approved_at timestamptz,
  approved_by uuid references profiles(id), created_at timestamptz not null default now(),
  payment_id uuid references payments(id),
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
create table trainer_credentials (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  title text not null, file_path text not null unique, mime_type text, size_bytes int,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  uploaded_at timestamptz not null default now(), reviewed_by uuid references profiles(id),
  reviewed_at timestamptz, review_note text
);
create table trainer_ratings (
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  period date not null check (period = date_trunc('month', period)::date),
  primary key (member_id, trainer_id, period)
);
create table trainer_feedback (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  note text not null check (length(btrim(note)) between 1 and 2000),
  recommendation text check (recommendation is null or length(recommendation) <= 2000),
  pt_session_id uuid references pt_sessions(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table pending_registrations (
  id uuid primary key default gen_random_uuid(), first_name text not null, last_name text not null,
  email text not null unique, phone text, requested_plan_id uuid references membership_plans(id),
  auth_user_id uuid references auth.users(id), created_at timestamptz not null default now(),
  date_of_birth date, gender text, address text, emergency_contact_name text, emergency_contact_phone text
);
create table events (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  starts_at timestamptz not null, duration_minutes int not null default 60, location text,
  capacity int not null default 30, cancelled boolean not null default false,
  created_by uuid references profiles(id), created_at timestamptz not null default now(),
  what_to_bring text, who_is_it_for text, fee numeric(10,2), contact text,
  is_featured boolean not null default false, image_url text
);
create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  registered_at timestamptz not null default now(), unique (event_id, member_id)
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, title text not null, message text not null, action_url text,
  metadata jsonb, read boolean not null default false, created_at timestamptz not null default now(),
  archived_at timestamptz, cleared_at timestamptz, image_url text
);
create table achievement_metrics (
  key text primary key, audience text not null, label text not null,
  sort_order int not null default 0, challengeable boolean not null default false
);
create table challenges (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  metric_key text not null references achievement_metrics(key), target int not null check (target > 0),
  starts_on date not null, ends_on date not null, reward_points int not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now(),
  image_url text, check (ends_on >= starts_on)
);
create table challenge_participants (
  challenge_id uuid not null references challenges(id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  joined_at timestamptz not null default now(), completed_on date,
  primary key (challenge_id, member_id)
);
create table rewards (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  cost_points int not null check (cost_points > 0), stock int check (stock is null or stock >= 0),
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  reward_id uuid not null references rewards(id) on delete restrict,
  cost_points int not null check (cost_points > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled')),
  requested_at timestamptz not null default now(), decided_by uuid references profiles(id),
  decided_at timestamptz, decision_note text
);
create table achievements (
  key text primary key, audience text not null, title text not null,
  active boolean not null default true, sort_order int not null default 0
);
create table achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  achievement_key text not null, unlocked_on date not null, seen boolean not null default false,
  created_at timestamptz not null default now(), unique (user_id, achievement_key)
);
create table activity_log (
  id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
  actor_id uuid, actor_role text, actor_label text, action text not null,
  subject_type text not null, subject_id uuid, member_id uuid, summary text not null, detail jsonb
);

create function canary() returns trigger language plpgsql as $$
begin
  raise exception 'CANARY: a user trigger fired on % (%)', tg_table_name, tg_op;
end $$;

insert into membership_plans (name, tier, price, duration_days) values
  ('Free Plan','free',0,null), ('Free Trial','freemium',0,30), ('Premium','premium',1500,30);
insert into achievement_metrics (key, audience, label, sort_order, challengeable) values
  ('training_days','member','Training days',1,true), ('early_checkins','member','Early check-ins',2,true),
  ('weekend_days','member','Weekend days',3,true), ('classes_attended','member','Classes attended',4,true),
  ('sessions_delivered','trainer','Sessions delivered',5,false);
insert into achievements (key, audience, title, active, sort_order) values
  ('first_checkin','member','First check-in',true,1), ('ten_visits','member','Ten visits',true,2),
  ('early_bird','member','Early bird',true,3), ('retired_badge','member','Retired',false,4),
  ('coach_ten','trainer','Ten sessions',true,5);
`);

const SEEDED = ['profiles', 'member_profiles', 'trainer_profiles', 'memberships', 'payments',
  'attendance', 'classes', 'class_templates', 'bookings', 'pt_sessions', 'membership_events',
  'account_status_events', 'trainer_credentials', 'trainer_ratings', 'trainer_feedback', 'events',
  'event_registrations', 'notifications', 'challenges', 'challenge_participants', 'rewards',
  'reward_redemptions', 'achievement_unlocks', 'pending_registrations'];

// ── Real rows, planted BEFORE the canaries ──────────────────────────────────
const RM = 'a1b2c3d4-0000-4000-9000-000000000001';   // a real member
const RT = 'a1b2c3d4-0000-4000-9000-000000000002';   // a real trainer
const RP = 'a1b2c3d4-0000-4000-9000-000000000003';   // a real pending sign-up
await db.exec(`
insert into auth.users (id, email) values ('${RM}','lea@realgym.ph'), ('${RT}','coach@realgym.ph'), ('${RP}','new@realgym.ph');
insert into profiles (id, role, first_name, last_name, email) values
  ('${RM}','member','Real','Member','lea@realgym.ph'), ('${RT}','trainer','Real','Coach','coach@realgym.ph');
insert into profiles (id, role, first_name, last_name, email, status) values
  ('${RP}','member','Real','Pending','new@realgym.ph','pending_approval');
insert into member_profiles (profile_id, qr_code) values ('${RM}','${RM}'), ('${RP}','${RP}');
insert into trainer_profiles (profile_id, specialization) values ('${RT}','Strength');
insert into trainer_availability (trainer_id, day_of_week, start_time, end_time) values ('${RT}', 1, '06:00', '18:00');
insert into memberships (member_id, plan_id, status) select '${RM}', id, 'active' from membership_plans where name = 'Premium';
insert into payments (member_id, amount, method, invoice_number) values ('${RM}', 1500, 'cash', 'INV-2026-0001');
insert into attendance (member_id) values ('${RM}');
insert into class_templates (id, name, trainer_id, day_of_week, start_time) values
  ('7e000000-0000-4000-9000-000000000001', 'Real Template', '${RT}', 1, '07:00');
insert into classes (id, name, trainer_id, scheduled_at) values
  ('c1a55000-0000-4000-9000-000000000001', 'Real Class', '${RT}', now() + interval '2 days');
insert into bookings (member_id, class_id, status) values ('${RM}', 'c1a55000-0000-4000-9000-000000000001', 'approved');
insert into pt_sessions (trainer_id, member_id, starts_at, status) values ('${RT}', '${RM}', now() - interval '3 days', 'approved');
insert into membership_events (membership_id, member_id, kind, reason) select id, '${RM}', 'freeze', 'Real reason' from memberships where member_id = '${RM}';
insert into account_status_events (profile_id, status) values ('${RM}', 'active');
insert into trainer_credentials (trainer_id, title, file_path, status) values ('${RT}', 'Real cert', 'real/1.pdf', 'verified');
insert into trainer_ratings (member_id, trainer_id, stars, period) values ('${RM}', '${RT}', 5, date_trunc('month', now())::date);
insert into trainer_feedback (trainer_id, member_id, note) values ('${RT}', '${RM}', 'Real note');
insert into pending_registrations (first_name, last_name, email, auth_user_id) values ('Real','Pending','new@realgym.ph','${RP}');
insert into events (title, starts_at) values ('Real Event', now() + interval '5 days');
insert into event_registrations (event_id, member_id) select id, '${RM}' from events where title = 'Real Event';
insert into notifications (user_id, type, title, message) values ('${RM}', 'info', 'Real notice', 'Real message');
insert into challenges (title, metric_key, target, starts_on, ends_on) values ('Real Challenge', 'training_days', 10, current_date, current_date + 20);
insert into challenge_participants (challenge_id, member_id) select id, '${RM}' from challenges where title = 'Real Challenge';
insert into rewards (id, name, cost_points) values ('4e000000-0000-4000-9000-000000000001', 'Real Reward', 100);
insert into reward_redemptions (member_id, reward_id, cost_points) values ('${RM}', '4e000000-0000-4000-9000-000000000001', 100);
insert into achievement_unlocks (user_id, achievement_key, unlocked_on) values ('${RM}', 'first_checkin', current_date);
insert into activity_log (action, subject_type, member_id, summary) values ('payment.recorded', 'payment', '${RM}', 'Real audit entry');
`);
for (const t of SEEDED) {
  await db.exec(`create trigger canary_${t} before insert or update or delete on ${t}
                 for each row execute function canary();`);
}
const canariesOn = async () =>
  (await n(`select count(*) as n from pg_trigger where tgname like 'canary_%' and tgenabled = 'O'`)) === SEEDED.length;

const run = async (label, sql) => {
  try { await db.exec(sql); check(label, true); return true; }
  catch (e) { check(label, false, String(e.message).split('\n')[0]); return false; }
};

// ════════════════════════════════════════════════════════════════════════════
//  Part 1, then part 2, with a raising canary on every table either writes
// ════════════════════════════════════════════════════════════════════════════
if (!(await run('Part 1 runs past a raising canary on every table', seed1))) process.exit(1);
if (!(await run('Part 2 runs past a raising canary on every table', seed2))) process.exit(1);
check('Every canary is back ON afterwards', await canariesOn());

const P = `'5eed____-0000-4000-8000-%'`;
const count = async (table, prefix) =>
  n(`select count(*) as n from ${table} where id::text like '${prefix}-0000-4000-8000-%'`);

const coaches = await count('profiles', '5eed0009');
check('12 demo coaches', coaches === 12, `${coaches}`);
check('Trainers page needs two pages (12 per page)', coaches + 1 > 12);
const creds = await count('trainer_credentials', '5eed000a');
check('Credentials: 2–3 per coach', creds >= 24 && creds <= 36, `${creds}`);
check('Credentials include verified, pending AND rejected', (await n(`select count(distinct status) as n
  from trainer_credentials where id::text like '5eed000a-%'`)) === 3);
check('Every rejected credential says why', (await n(`select count(*) as n from trainer_credentials
  where id::text like '5eed000a-%' and status = 'rejected' and coalesce(btrim(review_note),'') = ''`)) === 0);
check('No demo coach has open hours (nobody can book one)', (await n(`select count(*) as n
  from trainer_availability where trainer_id::text like '5eed0009-%'`)) === 0);
check('Every demo template is retired (the generator skips it)', (await n(`select count(*) as n
  from class_templates where id::text like '5eed000b-%' and active`)) === 0,
  `${await count('class_templates', '5eed000b')} templates`);
check('Every past demo class now has its coach', (await n(`select count(*) as n from classes
  where id::text like '5eed0005-%' and trainer_id is null`)) === 0);
check('No demo class is in the future', (await n(`select count(*) as n from classes
  where id::text like '5eed0005-%' and scheduled_at >= now()`)) === 0);

const pts = await count('pt_sessions', '5eed000e');
check('PT sessions', pts > 100, `${pts}`);
check('Bookings page gains more pages', true, `${pts + await count('bookings', '5eed0006')} class+PT rows`);
check('No PT session is in the future', (await n(`select count(*) as n from pt_sessions
  where id::text like '5eed000e-%' and starts_at >= now()`)) === 0);
check('No PT session is left pending (the sweep would message the admin)', (await n(`select count(*) as n
  from pt_sessions where id::text like '5eed000e-%' and status = 'pending'`)) === 0);
check('No coach is double-booked (PT against PT or against their own class)', (await n(`
  with held as (
    select trainer_id, starts_at, starts_at + interval '60 minutes' as ends_at, id::text as k
      from pt_sessions where status in ('approved','pending') and trainer_id::text like '5eed0009-%'
    union all
    select trainer_id, scheduled_at, scheduled_at + interval '60 minutes', id::text
      from classes where trainer_id::text like '5eed0009-%')
  select count(*) as n from held a join held b
    on a.trainer_id = b.trainer_id and a.k < b.k
   and (a.starts_at, a.ends_at) overlaps (b.starts_at, b.ends_at)`)) === 0);
check('No member is double-booked (PT against their class bookings)', (await n(`
  select count(*) as n from pt_sessions s
    join bookings b on b.member_id = s.member_id and b.status in ('approved','pending')
    join classes c on c.id = b.class_id
   where s.id::text like '5eed000e-%' and s.status in ('approved','pending')
     and (s.starts_at, s.starts_at + interval '60 minutes')
         overlaps (c.scheduled_at, c.scheduled_at + interval '60 minutes')`)) === 0);
check('Evaluations exist, one per member, coach and month', (await n(`select count(*) as n from trainer_ratings
  where trainer_id::text like '5eed0009-%'`)) > 20);
check('Only members who had a session rate that coach', (await n(`select count(*) as n from trainer_ratings r
  where r.trainer_id::text like '5eed0009-%' and not exists (select 1 from pt_sessions s
   where s.member_id = r.member_id and s.trainer_id = r.trainer_id and s.status = 'approved')`)) === 0);
check('Coach feedback exists', (await count('trainer_feedback', '5eed000f')) > 10);

check('6 pending registrations', (await count('pending_registrations', '5eed000d')) === 6);
check('Each has a pending_approval account behind it', (await n(`select count(*) as n from pending_registrations r
  join profiles p on p.id = r.auth_user_id where r.id::text like '5eed000d-%' and p.status = 'pending_approval'`)) === 6);

const ev = await count('events', '5eed0010');
check('14 events — Events page needs two pages (12 per page)', ev === 14, `${ev}`);
check('Every demo event is in the past', (await n(`select count(*) as n from events
  where id::text like '5eed0010-%' and starts_at >= now()`)) === 0);
check('No event is registered past its capacity', (await n(`select count(*) as n from (
  select e.id from events e join event_registrations r on r.event_id = e.id
   where e.id::text like '5eed0010-%' group by e.id, e.capacity having count(*) > e.capacity) x`)) === 0);

const annRows = await count('notifications', '5eed0012');
const annGroups = await n(`select count(distinct (title, message, date_trunc('minute', created_at))) as n
  from notifications where id::text like '5eed0012-%'`);
check('Announcements group into 12 sends — history needs two pages (9 per page)', annGroups === 12,
  `${annGroups} sends, ${annRows} rows`);
check('No real person receives a demo announcement', (await n(`select count(*) as n from notifications
  where id::text like '5eed0012-%' and user_id::text not like ${P}`)) === 0);
check('Nobody receives the same announcement twice', (await n(`select count(*) as n from (
  select user_id, title from notifications where id::text like '5eed0012-%'
   group by user_id, title having count(*) > 1) x`)) === 0);
check('Announcements stay well under the 500-row history window', annRows < 400, `${annRows}`);

check('8 challenges, all ended (members only see running ones)', (await count('challenges', '5eed0013')) === 8
  && (await n(`select count(*) as n from challenges where id::text like '5eed0013-%'
    and ends_on >= (now() at time zone 'Asia/Manila')::date`)) === 0);
check('Challenge participants exist', (await n(`select count(*) as n from challenge_participants
  where challenge_id::text like '5eed0013-%'`)) > 20);

check('12 rewards, all inactive (members cannot see or redeem them)', (await count('rewards', '5eed0014')) === 12
  && (await n(`select count(*) as n from rewards where id::text like '5eed0014-%' and is_active`)) === 0);
const rd = await count('reward_redemptions', '5eed0015');
check('Redemptions — history needs pages', rd > 16, `${rd}`);
check('Redemptions cover every status', (await n(`select count(distinct status) as n from reward_redemptions
  where id::text like '5eed0015-%'`)) === 4);

check('Achievement unlocks, only against active member badges', (await count('achievement_unlocks', '5eed0016')) > 20
  && (await n(`select count(*) as n from achievement_unlocks u join achievements a on a.key = u.achievement_key
    where u.id::text like '5eed0016-%' and (not a.active or a.audience <> 'member')`)) === 0);
check('No unlock is dated in the future', (await n(`select count(*) as n from achievement_unlocks
  where id::text like '5eed0016-%' and unlocked_on > (now() at time zone 'Asia/Manila')::date`)) === 0);
check('The real member\'s unlock is untouched', (await n(`select count(*) as n from achievement_unlocks
  where user_id = '${RM}'`)) === 1);

const act = await n(`select count(*) as n from activity_log where detail->>'seed' = 'true'`);
check('Activity log needs pages (40 per page)', act > 40, `${act}`);
check('No demo audit entry names a real actor', (await n(`select count(*) as n from activity_log
  where detail->>'seed' = 'true' and actor_id is not null`)) === 0);

// ── Idempotent ─────────────────────────────────────────────────────────────
const snapshot = async () => JSON.stringify(await one(`select
  (select count(*) from profiles where id::text like ${P}) as people,
  (select count(*) from pt_sessions where id::text like ${P}) as pt,
  (select count(*) from events where id::text like ${P}) as events,
  (select count(*) from notifications where id::text like ${P}) as notices,
  (select count(*) from reward_redemptions where id::text like ${P}) as redemptions,
  (select count(*) from trainer_ratings where trainer_id::text like ${P}) as ratings,
  (select count(*) from activity_log where detail->>'seed' = 'true') as audit`));
const before = await snapshot();
await db.exec(seed1); await db.exec(seed2);
check('Running both parts again adds nothing', before === await snapshot(), before);

// ── Things a demo might do, which removal must cope with ────────────────────
for (const t of ['classes', 'bookings', 'reward_redemptions', 'rewards', 'payments', 'class_templates']) {
  await db.exec(`alter table ${t} disable trigger canary_${t};`);
}
await db.exec(`
  -- A retired demo template reactivated; the generator made a class; a REAL member booked it.
  update class_templates set active = true where id = '5eed000b-0000-4000-8000-000000000001';
  insert into classes (id, name, template_id, scheduled_at)
    values ('9e000000-0000-4000-9000-000000000001', 'Sunrise Yoga', '5eed000b-0000-4000-8000-000000000001', now() + interval '3 days');
  insert into bookings (member_id, class_id, status) values ('${RM}', '9e000000-0000-4000-9000-000000000001', 'pending');
  -- A demo reward switched on, and a REAL member redeemed it.
  update rewards set is_active = true where id = '5eed0014-0000-4000-8000-000000000001';
  insert into reward_redemptions (member_id, reward_id, cost_points) values ('${RM}', '5eed0014-0000-4000-8000-000000000001', 200);
  -- A REAL class handed to a demo coach.
  update classes set trainer_id = '5eed0009-0000-4000-8000-000000000001' where name = 'Real Class';
  -- A payment taken against a demo member (random id).
  insert into payments (member_id, amount, method, invoice_number) values ('5eed0001-0000-4000-8000-000000000003', 1500, 'cash', 'INV-2026-0099');
`);
for (const t of ['classes', 'bookings', 'reward_redemptions', 'rewards', 'payments', 'class_templates']) {
  await db.exec(`alter table ${t} enable trigger canary_${t};`);
}

// ════════════════════════════════════════════════════════════════════════════
//  Removal
// ════════════════════════════════════════════════════════════════════════════
await run('Removal runs past the canaries', removeSql);
check('Every canary is back ON after removal', await canariesOn());

const left = await one(`select
  (select count(*) from auth.users where id::text like ${P}) as users,
  (select count(*) from profiles where id::text like ${P}) as people,
  (select count(*) from trainer_profiles where profile_id::text like ${P}) as coaches,
  (select count(*) from classes where id::text like ${P} or template_id::text like ${P}) as classes,
  (select count(*) from class_templates where id::text like ${P}) as templates,
  (select count(*) from bookings where id::text like ${P}) as bookings,
  (select count(*) from pt_sessions where id::text like ${P}) as pt,
  (select count(*) from trainer_credentials where id::text like ${P}) as creds,
  (select count(*) from trainer_ratings where trainer_id::text like ${P}) as ratings,
  (select count(*) from events where id::text like ${P}) as events,
  (select count(*) from notifications where id::text like ${P}) as notices,
  (select count(*) from challenges where id::text like ${P}) as challenges,
  (select count(*) from rewards where id::text like ${P}) as rewards,
  (select count(*) from reward_redemptions where reward_id::text like ${P}) as redemptions,
  (select count(*) from achievement_unlocks where id::text like ${P}) as unlocks,
  (select count(*) from pending_registrations where id::text like ${P}) as pending,
  (select count(*) from payments where invoice_number in ('INV-2026-0099') or id::text like ${P}) as payments,
  (select count(*) from activity_log where detail->>'seed' = 'true') as audit`);
check('No demo rows remain anywhere', Object.values(left).every((v) => Number(v) === 0), JSON.stringify(left));
check('The class generated from a demo template went too', (await n(`select count(*) as n from classes
  where id = '9e000000-0000-4000-9000-000000000001'`)) === 0);

const real = await one(`select
  (select count(*) from profiles where id in ('${RM}','${RT}','${RP}')) as people,
  (select count(*) from trainer_availability where trainer_id = '${RT}') as hours,
  (select count(*) from memberships where member_id = '${RM}') as memberships,
  (select count(*) from payments where invoice_number = 'INV-2026-0001') as payments,
  (select count(*) from attendance where member_id = '${RM}') as attendance,
  (select count(*) from class_templates where name = 'Real Template') as templates,
  (select count(*) from classes where name = 'Real Class') as classes,
  (select count(*) from bookings b join classes c on c.id = b.class_id where c.name = 'Real Class') as bookings,
  (select count(*) from pt_sessions where trainer_id = '${RT}') as pt,
  (select count(*) from trainer_credentials where trainer_id = '${RT}') as creds,
  (select count(*) from trainer_ratings where trainer_id = '${RT}') as ratings,
  (select count(*) from trainer_feedback where trainer_id = '${RT}') as feedback,
  (select count(*) from pending_registrations where auth_user_id = '${RP}') as pending,
  (select count(*) from events where title = 'Real Event') as events,
  (select count(*) from event_registrations where member_id = '${RM}') as registrations,
  (select count(*) from notifications where user_id = '${RM}') as notices,
  (select count(*) from challenges where title = 'Real Challenge') as challenges,
  (select count(*) from rewards where name = 'Real Reward') as rewards,
  (select count(*) from reward_redemptions where reward_id = '4e000000-0000-4000-9000-000000000001') as redemptions,
  (select count(*) from achievement_unlocks where user_id = '${RM}') as unlocks,
  (select count(*) from activity_log where summary = 'Real audit entry') as audit`);
const expected = { people: 3 };
check('Every real row survived removal', Object.entries(real).every(([k, v]) => Number(v) === (expected[k] ?? 1)),
  JSON.stringify(real));
check('The real class handed to a demo coach stays, uncoached', (await n(`select count(*) as n from classes
  where name = 'Real Class' and trainer_id is null`)) === 1);

await run('Removal is safe to run twice', removeSql);
try {
  await db.exec(`insert into attendance (member_id) values ('${RM}');`);
  check('Triggers really are live again (a real write hits the canary)', false, 'insert went through');
} catch (e) {
  check('Triggers really are live again (a real write hits the canary)', String(e.message).includes('CANARY'));
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
