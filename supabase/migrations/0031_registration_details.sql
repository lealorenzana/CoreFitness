-- 0031 — the details a gym actually needs at sign-up.
--
-- Registration collected a name, a phone, an email and a plan. Two things were
-- missing that the schema was already half-ready for:
--
--   * **Date of birth and gender** had no columns at all.
--   * **Emergency contact** had columns on `member_profiles` since 0001 and
--     *nothing ever wrote to them*. In a business where people lift heavy
--     things, an unfilled emergency contact is the one blank field that
--     actually matters.
--
-- **A birth date, not an age.** An `age int` is correct for exactly one year
-- and then quietly lies, and nothing in the app would ever notice. Age is
-- derived on read; the stored fact is the one that stays true.

alter table member_profiles
  add column if not exists date_of_birth date,
  add column if not exists gender text;

-- Small, respectful set. Text with a check rather than an enum so adding a
-- value later is an ALTER on one constraint, not an enum migration — and NULL
-- stays meaningful for every member who registered before this column existed.
alter table member_profiles drop constraint if exists member_profiles_gender_check;
alter table member_profiles add constraint member_profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'prefer_not_to_say'));

-- A birth date in the future, or implying an age of 130, is a typo rather than
-- a member. Deliberately wide: this catches slips, it does not set gym policy
-- on who may join.
alter table member_profiles drop constraint if exists member_profiles_dob_check;
alter table member_profiles add constraint member_profiles_dob_check
  check (
    date_of_birth is null
    or (date_of_birth <= current_date and date_of_birth > current_date - interval '130 years')
  );

-- ============================================================================
-- CARRYING THEM THROUGH APPROVAL
-- ============================================================================
--
-- A self-registering member has no `member_profiles` row yet — the trigger in
-- 0005 writes `profiles` + `pending_registrations`, and approval creates
-- `member_profiles`. So anything collected at sign-up has to wait in the
-- review queue, exactly as first_name/phone already do.

alter table pending_registrations
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text;

-- ============================================================================
-- SIGN-UP TRIGGER — rewritten to carry the new fields
-- ============================================================================
--
-- Same shape as 0027's version (which added the phone-uniqueness guard); this
-- adds the extra metadata keys. `signUp()` returns no session under email
-- confirmation, so the client cannot insert these itself — they arrive as
-- `raw_user_meta_data` and this trigger is the only thing that can write them.

create or replace function handle_new_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
  phone_digits text;
begin
  if meta->>'signup_source' is distinct from 'member_self_registration' then
    return new;
  end if;

  phone_digits := normalize_phone(meta->>'phone');

  -- Kept from 0027: a phone number identifies one member at the front desk.
  if phone_digits is not null and phone_digits <> '' and is_phone_taken(meta->>'phone') then
    raise exception 'That phone number is already registered';
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

  insert into pending_registrations (
    first_name, last_name, email, phone, requested_plan_id, auth_user_id,
    date_of_birth, gender, address,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
  )
  values (
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    nullif(meta->>'requested_plan_id', '')::uuid,
    new.id,
    -- nullif before the cast: an empty string is not a date, and ''::date
    -- raises rather than yielding NULL.
    nullif(meta->>'date_of_birth', '')::date,
    nullif(meta->>'gender', ''),
    nullif(meta->>'address', ''),
    nullif(meta->>'emergency_contact_name', ''),
    nullif(meta->>'emergency_contact_phone', ''),
    nullif(meta->>'emergency_contact_relationship', '')
  )
  on conflict (email) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_member_signup on auth.users;
create trigger trg_handle_new_member_signup
after insert on auth.users
for each row execute function handle_new_member_signup();

-- ============================================================================
-- AGE, DERIVED
-- ============================================================================
--
-- So that every screen computes it the same way. `age()` on a birthday that
-- has not happened yet this year must not round up, which hand-rolled
-- year-subtraction gets wrong for roughly half the year.

create or replace function age_years(dob date)
returns int language sql immutable as $$
  select case
    when dob is null then null
    else extract(year from age(current_date, dob))::int
  end;
$$;

grant execute on function age_years(date) to authenticated;
