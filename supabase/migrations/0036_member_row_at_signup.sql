-- 0036 — the member's row exists from sign-up, not from approval.
--
-- 0033 moved "have I finished onboarding?" off localStorage and onto
-- `member_profiles.onboarding_completed_at`, and its own comment said:
--
--     "No policy or trigger work needed. member_profiles_update_self (0006)
--      already lets a member write their own row."
--
-- That is true, and it is not enough, because **there is no row to write yet.**
-- The order of events for a self-registering member is:
--
--   1. signUp()          → trigger 0005 creates `profiles` (pending_approval)
--                          and a `pending_registrations` entry. No member row.
--   2. first login       → onboarding runs
--   3. onboarding finish → UPDATE member_profiles … matches **zero rows**
--   4. admin approves    → INSERT member_profiles … with the column NULL
--
-- A zero-row UPDATE is not an error, so step 3 reported success and wrote
-- nothing. The client caught this and parked the answer in localStorage to
-- apply later — which re-created the exact per-device flag 0033 set out to
-- remove. Sign in on a phone instead of the laptop you registered on and the
-- whole flow replays, permanently, because nothing ever writes the column.
--
-- `experience_level` was lost the same way, and that one is worse: it is what
-- Book a Session reads to recommend classes, so every self-registered member
-- has been getting recommendations based on an answer the database never saw.
--
-- Fix the ordering rather than the symptom: create the row at sign-up. A member
-- who has registered *is* a member record — `profiles.status` is what says
-- whether they may use the gym, and that is unchanged. Approval now fills the
-- row in instead of creating it.

-- ── 1. Backfill, before any new rows exist ──────────────────────────────────
--
-- Every `member_profiles` row that exists right now belongs to somebody who was
-- approved, which means they registered, which means they were walked through
-- onboarding at least once. Marking them complete is the honest reading, and it
-- follows the rule the client already states: wrongly re-running onboarding for
-- an existing member is far more annoying than wrongly skipping it for a new
-- one. `created_at` rather than now(), so the timestamp does not claim they
-- finished onboarding on the day this migration was run.
update member_profiles
   set onboarding_completed_at = created_at
 where onboarding_completed_at is null;

-- ── 2. Rows for members who never got one ──────────────────────────────────
--
-- Runs after the backfill on purpose: these are the still-pending members, and
-- they keep `onboarding_completed_at = NULL` because they may genuinely not
-- have finished. From here on their answers have somewhere to land.
insert into member_profiles (profile_id, qr_code)
select p.id, p.id::text
  from profiles p
 where p.role = 'member'
   and not exists (select 1 from member_profiles m where m.profile_id = p.id)
on conflict (profile_id) do nothing;

-- ── 3. What the member picked in onboarding, kept ──────────────────────────
--
-- The interests step wrote to `localStorage['fitness_preferences']` and was read
-- by nothing at all — a control that writes a flag nothing reads. Stored here it
-- survives the device and can drive recommendations.
alter table member_profiles
  add column if not exists interests text[] not null default '{}';

comment on column member_profiles.interests is
  'Activities the member picked in onboarding. Drives class recommendations alongside experience_level. Empty = no preference expressed, which means "recommend nothing on this basis", not "recommend everything".';

-- ── 4. Sign-up creates the row ─────────────────────────────────────────────
--
-- Same SECURITY DEFINER trigger as 0005, with the member row added. It stays
-- guarded by `signup_source` so the admin-bootstrap and create-trainer paths
-- still no-op. `qr_code` matches what approval used to set (the profile id), so
-- check-in behaves identically.
create or replace function handle_new_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
begin
  if meta->>'signup_source' is distinct from 'member_self_registration' then
    return new;
  end if;

  insert into profiles (id, role, first_name, last_name, email, phone, status)
  values (
    new.id,
    'member',
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    'pending_approval'
  )
  on conflict (id) do nothing;

  -- The row onboarding writes into. Created here, not at approval, because
  -- onboarding runs first.
  insert into member_profiles (profile_id, qr_code)
  values (new.id, new.id::text)
  on conflict (profile_id) do nothing;

  insert into pending_registrations (first_name, last_name, email, phone, requested_plan_id, auth_user_id)
  values (
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    nullif(meta->>'requested_plan_id', '')::uuid,
    new.id
  )
  on conflict (email) do nothing;

  return new;
end;
$$;

-- ── 5. Approval fills the row in ───────────────────────────────────────────
--
-- The admin client used to INSERT here and would now hit a duplicate key. It
-- has been changed to an UPDATE; this function exists so the intake fields land
-- in one statement regardless, and so a member row is created if this project
-- somehow has a member without one (an account made before this migration on a
-- different path).
create or replace function apply_registration_details(
  member uuid,
  p_date_of_birth date,
  p_gender text,
  p_address text,
  p_ec_name text,
  p_ec_phone text,
  p_ec_relationship text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can apply registration details';
  end if;

  insert into member_profiles (profile_id, qr_code, date_of_birth, gender, address,
                               emergency_contact_name, emergency_contact_phone,
                               emergency_contact_relationship)
  values (member, member::text, p_date_of_birth, p_gender, p_address,
          p_ec_name, p_ec_phone, p_ec_relationship)
  on conflict (profile_id) do update
    set date_of_birth                  = coalesce(excluded.date_of_birth, member_profiles.date_of_birth),
        gender                         = coalesce(excluded.gender, member_profiles.gender),
        address                        = coalesce(excluded.address, member_profiles.address),
        emergency_contact_name         = coalesce(excluded.emergency_contact_name, member_profiles.emergency_contact_name),
        emergency_contact_phone        = coalesce(excluded.emergency_contact_phone, member_profiles.emergency_contact_phone),
        emergency_contact_relationship = coalesce(excluded.emergency_contact_relationship, member_profiles.emergency_contact_relationship);
end;
$$;

grant execute on function apply_registration_details(uuid, date, text, text, text, text, text) to authenticated;

comment on function apply_registration_details is
  'Approval-time write of the sign-up intake fields. Upserts because 0036 makes the member row exist from sign-up, so the old INSERT would now collide. coalesce keeps a value the member has since edited from being overwritten by a blank from the queue.';
