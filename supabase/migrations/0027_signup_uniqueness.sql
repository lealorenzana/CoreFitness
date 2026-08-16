-- 0027 — refuse a signup that reuses an email or a phone number.
--
-- Two problems, one cause: the app had no way to ask whether a detail was
-- already in use before creating the account.
--
-- **Email.** `auth.users.email` is unique, but `supabase.auth.signUp` does not
-- report a clash — it returns a user with an empty `identities` array so the
-- endpoint cannot be used to enumerate accounts. The client now detects that
-- (see `registerMember`), but only after the member has filled in all three
-- steps. The RPC below lets the Account step say so immediately.
--
-- **Phone.** Nothing has ever checked it. Two members could register the same
-- number, and the front desk would have two records that look like the same
-- person. There is no unique constraint to lean on, so this adds both a lookup
-- for the UI and a hard guard in the signup trigger.
--
-- ---------------------------------------------------------------------------
-- The trade being made
-- ---------------------------------------------------------------------------
-- `is_email_taken` is an enumeration oracle: anyone can ask whether an address
-- has an account here. That is a real cost, accepted deliberately — the
-- alternative is a member filling in a whole registration and being told at the
-- end, or worse, being told nothing. This is one gym in Mamburao, not a service
-- where account existence is sensitive.
--
-- Phone numbers are compared on **digits only**, so "+63 912 345 6789",
-- "09123456789" and "0912-345-6789" all collide. A gym gets those three forms
-- of the same number constantly.
--
-- NOTE: this makes a phone number single-use. A couple sharing one handset can
-- only register one account against it; the second must be added by the front
-- desk through create-member, which does not go through this trigger.

-- Digits only, or NULL when there's nothing left. One definition, used by both
-- the lookup and the trigger, so the UI and the boundary cannot disagree.
create or replace function normalize_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '');
$$;

-- ============ LOOKUPS FOR THE SIGNUP FORM ============
-- SECURITY DEFINER because the caller is anonymous: RLS on `profiles` allows a
-- member to read only their own row, and someone registering has no row yet.
-- Both return a bare boolean and nothing else — no name, no id, no status.
create or replace function is_email_taken(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(trim(p_email))
  );
$$;

create or replace function is_phone_taken(p_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.status <> 'archived'
      and normalize_phone(p.phone) is not null
      and normalize_phone(p.phone) = normalize_phone(p_phone)
  );
$$;

grant execute on function is_email_taken(text) to anon, authenticated;
grant execute on function is_phone_taken(text) to anon, authenticated;

-- ============ THE ACTUAL BOUNDARY ============
-- The lookups above are for wording; this is what enforces it. A check in the
-- form is advice — two people can submit in the same second, and PostgREST is
-- reachable without the form at all.
--
-- Raising here aborts the `auth.users` insert, so no orphaned auth account is
-- left behind for an address that never got a profile.
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

  if phone_digits is not null and exists (
    select 1 from profiles p
    where p.status <> 'archived'
      and normalize_phone(p.phone) = phone_digits
  ) then
    raise exception 'That phone number is already registered.'
      using errcode = '23505';
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

-- Verify:
--   select is_email_taken('someone@example.com');   -- expect true for a real member
--   select is_phone_taken('0912 345 6789');         -- format-insensitive
