-- Core Fitness — Foundation schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query), then run 0002_rls.sql.

-- ============ ENUMS ============
create type user_role as enum ('admin','trainer','member');
create type membership_status as enum ('active','expired','frozen','cancelled','pending');
create type plan_tier as enum ('free','freemium','premium');
create type booking_status as enum ('pending','approved','rejected','cancelled');
create type payment_status as enum ('completed','pending','failed');
create type checkin_method as enum ('qr','manual');
create type class_level as enum ('beginner','intermediate','advanced','all_levels');

-- NOTE: profiles.status is deliberately plain `text`, not an enum — this matches the
-- live database. Statuses have churned during development ('archived' was added after
-- launch) and `alter type ... add value` can't be used in the same transaction that
-- adds it, which makes enum changes awkward mid-project. The allowed values are
-- 'active' | 'pending_approval' | 'suspended' | 'archived', enforced in TypeScript via
-- ProfileStatus in src/types/db.ts rather than by the database.

-- ============ PROFILES (1:1 with auth.users; role + status live here) ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'member',
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  photo_url text,
  status text not null default 'active', -- see note above; not an enum
  created_at timestamptz not null default now()
);

-- member-specific extension (keeps profiles lean, forward-compatible with later features)
create table member_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  gym_id text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  qr_code text unique,
  experience_level text, -- 'beginner'|'intermediate'|'advanced' — captured, not yet used by matching logic
  created_at timestamptz not null default now()
);

-- trainer-specific extension
create table trainer_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  specialization text,
  bio text,
  availability text
);

-- ============ MEMBERSHIP PLANS (single source of truth) ============
create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier plan_tier not null default 'premium',
  price numeric(10,2) not null default 0,
  duration_days int not null default 30,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ MEMBERSHIPS (member <-> plan, status) ============
create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  plan_id uuid not null references membership_plans(id),
  status membership_status not null default 'pending',
  start_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ PAYMENTS ============
create table payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  membership_id uuid references memberships(id),
  amount numeric(10,2) not null,
  method text not null,
  status payment_status not null default 'completed',
  due_date date,
  invoice_number text,
  notes text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============ CLASSES (catalog only, no matching logic yet) ============
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trainer_id uuid references trainer_profiles(profile_id),
  level class_level not null default 'all_levels',
  capacity int not null default 20,
  location text,
  class_type text,
  scheduled_at timestamptz,
  duration_minutes int not null default 60,
  created_at timestamptz not null default now()
);

-- ============ BOOKINGS (single shape, replaces the two divergent admin flows) ============
create table bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  status booking_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  approved_by uuid references profiles(id)
);

-- ============ ATTENDANCE (single shared table) ============
create table attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  gym_id text,
  check_in_time timestamptz not null default now(),
  method checkin_method not null default 'manual',
  recorded_by uuid references profiles(id)
);

-- ============ NOTIFICATIONS (unified across both apps) ============
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  action_url text,
  metadata jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ PENDING REGISTRATIONS (admin review queue) ============
create table pending_registrations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  requested_plan_id uuid references membership_plans(id),
  auth_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============ INDEXES (FK lookups used by the app's list views) ============
create index idx_member_profiles_qr_code on member_profiles(qr_code);
create index idx_memberships_member_id on memberships(member_id);
create index idx_payments_member_id on payments(member_id);
create index idx_bookings_member_id on bookings(member_id);
create index idx_bookings_class_id on bookings(class_id);
create index idx_classes_trainer_id on classes(trainer_id);
create index idx_attendance_member_id on attendance(member_id);
create index idx_notifications_user_id on notifications(user_id);
create index idx_pending_registrations_auth_user_id on pending_registrations(auth_user_id);

-- Keep memberships.updated_at current
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_memberships_updated_at
before update on memberships
for each row execute function set_updated_at();
