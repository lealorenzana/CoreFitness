-- 0154 — A gym that applies agrees to the platform's terms, and the record
-- says which words it agreed to.
--
-- Until now the website's footer sent a gym owner to the *member* Terms — a
-- document about freezing your membership — and nothing a gym signed up under
-- was written down anywhere. The site now publishes three documents for gyms
-- (Terms for gyms, the Data Processing Agreement, the platform's Privacy
-- Policy), versioned by the date they took effect, and the apply form asks the
-- applicant to agree to them.
--
-- ---- WHY A VERSION, NOT A TICK ---------------------------------------------------------
--
-- "Agreed at 14:02" means nothing if the words can change at 14:03. 0119 made
-- this rule for waivers and 0079's `terms_accepted_at` on members still breaks
-- it. So the application stores the *version* — the date printed at the top of
-- the documents the applicant was shown — beside the time. The published text
-- for each version lives in the site's source history under that date.
--
-- ---- WHY A SECOND CALL, NOT A NEW PARAMETER --------------------------------------------
--
-- `submit_gym_application()` keeps its 0148 signature. Changing it would break
-- a website deployed before this file is pasted (or the other way round), and
-- migrations here go in by hand, one at a time. Instead the site submits, gets
-- the private status token back, and then calls `accept_gym_terms(token, v)`.
-- Possession of the token is what proves it is the applicant — the same
-- credential `application_status()` and `application_reply()` already rest on.
-- Before this file is pasted that call fails, the site says nothing about it,
-- and the platform simply sees no acceptance: an honest gap, never a false one.
--
-- First acceptance wins: a second call cannot move the date or the version,
-- so the record cannot be rewritten after the fact.
--
-- Re-runnable.

alter table gym_applications add column if not exists terms_version text;
alter table gym_applications add column if not exists terms_accepted_at timestamptz;

alter table gym_applications drop constraint if exists gym_applications_terms_version_check;
alter table gym_applications add constraint gym_applications_terms_version_check
  check (terms_version is null or terms_version ~ '^\d{4}-\d{2}-\d{2}$');
alter table gym_applications drop constraint if exists gym_applications_terms_pair_check;
alter table gym_applications add constraint gym_applications_terms_pair_check
  check ((terms_version is null) = (terms_accepted_at is null));

comment on column gym_applications.terms_version is
  'The effective date printed on the gym documents the applicant agreed to (0154). '
  'Written once by accept_gym_terms(); NULL means no acceptance was recorded.';

-- ============================================================================
-- 1. AGREEING, FROM THE WEBSITE
-- ============================================================================
create or replace function accept_gym_terms(p_token text, p_version text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'That is not a version of the terms.';
  end if;
  -- A version from the future is not one anybody could have read.
  if p_version::date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'That version of the terms is not published yet.';
  end if;

  update gym_applications
     set terms_version = p_version, terms_accepted_at = now()
   where status_token = btrim(p_token)
     and length(btrim(coalesce(p_token, ''))) >= 32
     and terms_accepted_at is null
  returning id into v_id;

  -- Unknown token, or already accepted: both are "nothing changed", and the
  -- caller cannot tell which — a token is a credential, so no oracle for it.
  return v_id is not null;
end;
$$;
revoke all on function accept_gym_terms(text, text) from public;
grant execute on function accept_gym_terms(text, text) to anon, authenticated;

-- ============================================================================
-- 2. THE PLATFORM SEES IT
-- ============================================================================
-- 0148's platform_applications(), unchanged except the two columns at the end.
drop function if exists platform_applications(text);
create function platform_applications(p_status text default null)
returns table (id uuid, gym_name text, owner_name text, email text, phone text,
               address text, member_estimate int, message text, status text,
               reason text, gym_id uuid, created_at timestamptz,
               duplicates int, already_a_gym boolean,
               plan_key text, plan_name text, billing text, heard_from text,
               contact_pref text, contact_handle text, status_token text,
               messages int, unread int, last_message_at timestamptz,
               terms_version text, terms_accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.gym_name, a.owner_name, a.email, a.phone, a.address,
         a.member_estimate, a.message, a.status, a.reason, a.gym_id, a.created_at,
         (select count(*)::int from gym_applications d
           where d.id <> a.id
             and (lower(btrim(d.email)) = lower(btrim(a.email))
                  or lower(btrim(d.gym_name)) = lower(btrim(a.gym_name)))),
         exists (select 1 from profiles p join gym_roles r on r.user_id = p.id
                  where lower(p.email) = lower(btrim(a.email))
                    and r.role = 'admin' and r.status = 'active'),
         a.plan_key, (select p.name from platform_plans p where p.key = a.plan_key), a.billing, a.heard_from,
         a.contact_pref, a.contact_handle, a.status_token,
         (select count(*)::int from application_messages m where m.application_id = a.id),
         (select count(*)::int from application_messages m where m.application_id = a.id and not m.from_platform
             and m.created_at > coalesce(a.platform_read_at, '-infinity'::timestamptz)),
         (select max(m.created_at) from application_messages m where m.application_id = a.id),
         a.terms_version, a.terms_accepted_at
    from gym_applications a
   where is_platform_admin()
     and (p_status is null or a.status = p_status)
   order by a.created_at desc;
$$;
revoke all on function platform_applications(text) from public, anon;
grant execute on function platform_applications(text) to authenticated;

-- ============================================================================
-- 3. WHAT THE DOCUMENTS QUOTE, FROM WHERE IT IS SET
-- ============================================================================
-- The gym documents name the business, how to reach it, the grace period and
-- when reminders go out. Each of those is already a setting in platform_billing
-- (0138) — typed into a document instead, it would be the "7 typed in four
-- places" 0138 removed. The table has no policy, so this is the website's one
-- read of it: the public facts only, never receipt_note or anything else.
create or replace function platform_public_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'business_name', b.business_name, 'business_address', b.business_address,
           'business_email', b.business_email, 'business_phone', b.business_phone,
           'grace_days', b.grace_days, 'reminder_days', to_jsonb(b.reminder_days))
    from platform_billing b
   where b.id;
$$;
revoke all on function platform_public_terms() from public;
grant execute on function platform_public_terms() to anon, authenticated;

create or replace function migration_0154_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0154_applied() from public, anon;
grant execute on function migration_0154_applied() to authenticated;
comment on function migration_0154_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0154.sql
