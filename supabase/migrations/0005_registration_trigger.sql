-- Core Fitness — follow-up migration
--
-- Bug found via live testing: this project requires email confirmation, so
-- supabase.auth.signUp() returns no active session until the user clicks the
-- confirmation link. The original design (client inserts profiles +
-- pending_registrations right after signUp, in the same request) fails RLS,
-- because auth.uid() is null with no session yet.
--
-- Fix: a SECURITY DEFINER trigger on auth.users creates the profile server-side,
-- independent of the client's session state — the canonical Supabase pattern for
-- this exact situation. registerMember() now passes first_name/last_name/phone/
-- requested_plan_id via signUp()'s `options.data`, which lands in
-- auth.users.raw_user_meta_data for this trigger to read.
--
-- The `signup_source` marker keeps this from colliding with the other two
-- account-creation paths (admin bootstrap via dashboard, trainer creation via
-- the create-trainer Edge Function) — neither of those set that key, so the
-- trigger no-ops for them instead of inserting a conflicting duplicate profile.

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

create trigger trg_handle_new_member_signup
after insert on auth.users
for each row execute function handle_new_member_signup();
