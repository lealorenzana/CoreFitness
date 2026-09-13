-- 0079 — the terms checkbox becomes a record, not just a gate.
--
-- Register.tsx has always required "I agree to the Terms and Privacy Policy"
-- before it will submit. That flag then died in React state. The gym could say
-- the form requires it; it could not show, for any one member, that they had
-- agreed — which is the whole point of asking, and what RA 10173 means by
-- consent being demonstrable. Same family as the rule this project keeps
-- relearning: a control writing a flag nothing reads is a lie. This one wrote a
-- flag nothing *stored*.
--
-- ## Stamped by the server, not sent by the browser
--
-- The client says *whether* the box was ticked; the database decides *when*.
-- A timestamp posted by a browser is a timestamp from a clock the gym does not
-- control and cannot correct, and this schema has been bitten by clock trust
-- before. `now()` here is Postgres's clock, the same one every other row in the
-- audit trail is stamped by, so the consent sorts correctly against them.
--
-- ## Why member_profiles and not a consent table
--
-- One member, one signup, one answer. A table would buy re-consent history for
-- a policy version that does not exist yet: the pages carry a "last updated"
-- date and nothing reads it. When the gym starts versioning the terms, that
-- table is the right shape and this column is what it backfills from.
--
-- Replaces handle_new_member_signup() from **0036**, its last definition
-- (0005 → 0027 → 0031 → 0036). Resolve the chain before editing it again; 0039
-- missed exactly this and 0048 had to repair it.

alter table member_profiles
  add column if not exists terms_accepted_at timestamptz;

comment on column member_profiles.terms_accepted_at is
  'When this member accepted the Terms and Privacy Policy at sign-up. Stamped '
  'server-side by handle_new_member_signup() (0079) from the signup metadata; '
  'NULL for members created at the desk, who agree on paper.';

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
  insert into member_profiles (profile_id, qr_code, terms_accepted_at)
  values (
    new.id,
    new.id::text,
    -- Only 'true' counts. A missing key, 'false', or anything else leaves NULL,
    -- which reads as "no record of consent" rather than as a quiet yes.
    case when meta->>'terms_accepted' = 'true' then now() end
  )
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

-- Marker for scripts/probe-migrations.py. The column is probe-able on its own,
-- but the trigger body is not — and the body is the half that matters.
create or replace function migration_0079_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0079_applied() from public, anon;
grant execute on function migration_0079_applied() to authenticated;

comment on function migration_0079_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   Register a member in the app with the box ticked, then:
--     select profile_id, terms_accepted_at from member_profiles
--      order by terms_accepted_at desc nulls last limit 5;
--   Expect a timestamp within a second of the sign-up. Existing members stay
--   NULL, and the admin drawer says "not recorded" for them rather than
--   implying they refused.
