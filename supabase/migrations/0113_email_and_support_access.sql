-- 0113 — Two things a service needs that this one could not do: reach its
-- customers, and help them.
--
-- ============================================================================
-- PART ONE: EMAIL
-- ============================================================================
-- Nothing in this project has ever sent mail. Every handover is a human
-- copying a string: an owner's temporary password, an invitation link, a
-- reset, an answer to an application. Every screen that does it says so
-- plainly, which was the honest thing to do — but a service that cannot
-- contact its own customers is incomplete, not minimal.
--
-- The shape follows the one this schema already uses for notifications (0026):
-- **the row is the record, the send is the alert.** `email_outbox` is written
-- first and always; the send is attempted after and is allowed to fail. That
-- way "did we tell them?" has an answer even when the mail provider is down,
-- and a failed send can be seen and retried rather than vanishing.
--
-- It also degrades honestly. With no provider configured the outbox still
-- records the message as 'not_sent', the Edge Function says so in its reply,
-- and the screens keep offering the copy-paste they offer today. Nothing
-- claims an email went out that did not — the rule that made those screens say
-- "pass this on yourself" in the first place.

create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),
  -- The gym this is about, when it is about one. NULL for platform mail such
  -- as an answer to an application from a gym that does not exist yet.
  gym_id      uuid references gyms(id) on delete set null,
  to_email    text not null check (length(btrim(to_email)) between 3 and 200),
  to_name     text,
  subject     text not null check (length(btrim(subject)) between 1 and 200),
  body        text not null,
  -- Which message this is, so the log reads as events rather than prose.
  kind        text not null check (kind in (
                'owner_credentials', 'password_reset', 'invitation',
                'application_approved', 'application_rejected', 'test')),
  status      text not null default 'queued'
              check (status in ('queued', 'sent', 'failed', 'not_configured')),
  error       text,
  sent_at     timestamptz,
  created_by  uuid references profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_email_outbox_created on email_outbox(created_at desc);
create index if not exists idx_email_outbox_gym on email_outbox(gym_id, created_at desc);

alter table email_outbox enable row level security;

-- No policy for anybody. A sent message contains a credential often enough
-- (an invitation token, a temporary password) that the table must not be
-- readable by a gym's own members, and the platform reads it through the
-- function below. Same shape as `activity_log` (0037) and `gym_invitations`.
comment on table email_outbox is
  'Every message this service has tried to send (0113). RLS on, no policy: the '
  'body can contain a credential. Written by record_email(), read by '
  'platform_email_log() and my_gym_email_log().';

/**
 * Record that we are about to send something. Called by the Edge Function
 * before it attempts delivery, so the row exists even if the send throws.
 */
create or replace function record_email(
  p_to text, p_subject text, p_body text, p_kind text,
  p_gym uuid default null, p_to_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- The platform sends its own mail; a gym sends its own invitations. Nobody
  -- else may put a message in this system's name.
  if not (is_platform_admin()
          or (p_gym is not null and p_gym = current_gym_id()
              and get_my_role() in ('admin', 'staff'))) then
    raise exception 'Not allowed to send mail for that gym.' using errcode = '42501';
  end if;

  insert into email_outbox (gym_id, to_email, to_name, subject, body, kind)
  values (p_gym, btrim(p_to), nullif(btrim(p_to_name), ''), btrim(p_subject), p_body, p_kind)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function record_email(text, text, text, text, uuid, text) from public, anon;
grant execute on function record_email(text, text, text, text, uuid, text) to authenticated;

/** How it went. Called by the Edge Function once the provider has answered. */
create or replace function settle_email(p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed', 'not_configured') then
    raise exception 'Unknown send result: %', p_status;
  end if;
  update email_outbox
     set status = p_status,
         error = nullif(btrim(p_error), ''),
         sent_at = case when p_status = 'sent' then now() end
   where id = p_id
     and (is_platform_admin()
          or (gym_id = current_gym_id() and get_my_role() in ('admin', 'staff')));
end;
$$;
revoke all on function settle_email(uuid, text, text) from public, anon;
grant execute on function settle_email(uuid, text, text) to authenticated;

-- The body is deliberately NOT returned by either log below: it can contain a
-- token or a temporary password, and "who was told what, and did it arrive" is
-- the question a log answers. The message itself was shown once, on screen.

create or replace function platform_email_log(p_days int default 30)
returns table (id uuid, gym_id uuid, gym_name text, to_email text, to_name text,
               subject text, kind text, status text, error text,
               sent_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.gym_id, g.name, e.to_email, e.to_name, e.subject, e.kind,
         e.status, e.error, e.sent_at, e.created_at
    from email_outbox e
    left join gyms g on g.id = e.gym_id
   where is_platform_admin()
     and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   order by e.created_at desc
   limit 500;
$$;
revoke all on function platform_email_log(int) from public, anon;
grant execute on function platform_email_log(int) to authenticated;

/** A gym's own sending — its invitations. Its desk, its record. */
create or replace function my_gym_email_log(p_days int default 30)
returns table (id uuid, to_email text, to_name text, subject text, kind text,
               status text, error text, sent_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.to_email, e.to_name, e.subject, e.kind,
         e.status, e.error, e.sent_at, e.created_at
    from email_outbox e
   where e.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
     and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   order by e.created_at desc
   limit 200;
$$;
revoke all on function my_gym_email_log(int) from public, anon;
grant execute on function my_gym_email_log(int) to authenticated;

-- ============================================================================
-- PART TWO: SUPPORT ACCESS, WITH THE GYM'S CONSENT
-- ============================================================================
-- The platform owner cannot see a gym as its owner sees it, which makes "the
-- members page is broken" impossible to answer. The obvious fix — let the
-- platform in — is the one thing that would undo the isolation this whole
-- system rests on, so it was deliberately left out (docs/TENANCY.md).
--
-- This is the version that does not cost the guarantee:
--
--   * the GYM grants it, from its own settings. The platform cannot grant
--     itself access, and there is no function that lets it.
--   * it EXPIRES. The gym picks how long, up to a day.
--   * it is REVOCABLE at any moment, by the gym, in one click.
--   * it is READ-ONLY, and not by convention — see below.
--   * every grant, entry and revocation is logged where the gym can read it.
--
-- ---- WHY IT IS READ-ONLY ------------------------------------------------------------
--
-- Not "the screens do not offer writes". 0099 gave every one of the fifty-odd
-- gym tables four RESTRICTIVE policies, and all three write policies require
-- `gym_writable()`. Support mode makes that function return false, so every
-- INSERT, UPDATE and DELETE on every gym table is refused by the same rule that
-- already refuses them to a suspended gym — one place, fifty tables, no list to
-- keep in step. The harness asserts it against a representative set.

create table if not exists support_grants (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  granted_by  uuid not null references profiles(id),
  reason      text,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  -- Stamped the first time the platform actually looks, so a gym can tell the
  -- difference between "I offered" and "they came in".
  first_used_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint support_grants_window check (expires_at > created_at)
);

create index if not exists idx_support_grants_live
  on support_grants(gym_id, expires_at desc) where revoked_at is null;

alter table support_grants enable row level security;

comment on table support_grants is
  'A gym letting the platform look, for a while (0113). Granted only by the '
  'gym''s own owner, expiring, revocable, and read-only by construction: '
  'gym_writable() is false while it is in use.';

/** Is this platform admin currently inside a live grant for this gym? */
create or replace function support_session_gym() returns uuid
language sql stable security definer set search_path = public as $$
  -- Two things must both be true: the caller is the platform, and they have
  -- deliberately entered a gym whose grant is still live. The setting alone
  -- grants nothing — a client that sets it without a grant gets NULL.
  select g.gym_id
    from support_grants g
   where is_platform_admin()
     and g.gym_id = nullif(current_setting('cf.support_gym', true), '')::uuid
     and g.revoked_at is null
     and g.expires_at > now()
   limit 1;
$$;
revoke all on function support_session_gym() from public, anon;
grant execute on function support_session_gym() to authenticated;

-- The gym grants it. Note there is no platform-side equivalent: the only way
-- this row comes into existence is a gym's own owner asking for it.
-- The OUT names are deliberately not `id` and `expires_at`: those are columns
-- of the table this function updates, and plpgsql resolves the bare name to the
-- OUT variable, which makes `where expires_at > now()` ambiguous and fails at
-- runtime rather than at create time.
create or replace function grant_support_access(p_hours int default 4, p_reason text default null)
returns table (grant_id uuid, grant_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_id  uuid;
  v_exp timestamptz;
begin
  if v_gym is null then
    raise exception 'No gym to grant access to.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can let Core Fitness look at this gym.'
      using errcode = '42501';
  end if;
  if coalesce(p_hours, 0) not between 1 and 24 then
    raise exception 'Support access lasts between 1 and 24 hours.';
  end if;

  -- One live grant at a time: granting again replaces the old one rather than
  -- leaving two windows open, one of which the owner has forgotten.
  update support_grants set revoked_at = now()
   where gym_id = v_gym and revoked_at is null and expires_at > now();

  insert into support_grants (gym_id, granted_by, reason, expires_at)
  values (v_gym, auth.uid(), nullif(btrim(p_reason), ''), now() + make_interval(hours => p_hours))
  returning support_grants.id, support_grants.expires_at into v_id, v_exp;


  perform log_activity('gym.support_granted', 'support_grants', v_id, null,
    'Core Fitness was allowed to look at this gym for ' || p_hours || ' hour(s)'
      || case when coalesce(btrim(p_reason), '') = '' then '' else ': ' || btrim(p_reason) end,
    jsonb_build_object('hours', p_hours, 'expires_at', v_exp), v_gym);
  perform platform_log(v_gym, 'support.granted',
    coalesce((select name from gyms where id = v_gym), 'A gym')
      || ' allowed support access for ' || p_hours || ' hour(s)',
    jsonb_build_object('grant', v_id, 'expires_at', v_exp, 'reason', nullif(btrim(p_reason), '')));

  return query select v_id, v_exp;
end;
$$;
revoke all on function grant_support_access(int, text) from public, anon;
grant execute on function grant_support_access(int, text) to authenticated;

create or replace function revoke_support_access() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := acting_gym_id(); n int;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can withdraw support access.' using errcode = '42501';
  end if;
  update support_grants set revoked_at = now()
   where gym_id = v_gym and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  if n > 0 then
    perform log_activity('gym.support_revoked', 'support_grants', null, null,
      'Support access was withdrawn', '{}'::jsonb, v_gym);
    perform platform_log(v_gym, 'support.revoked',
      coalesce((select name from gyms where id = v_gym), 'A gym') || ' withdrew support access',
      '{}'::jsonb);
  end if;
  return n;
end;
$$;
revoke all on function revoke_support_access() from public, anon;
grant execute on function revoke_support_access() to authenticated;

/** What the gym sees about it: their own grant, and whether it has been used. */
create or replace function my_support_grant()
returns table (id uuid, reason text, expires_at timestamptz, first_used_at timestamptz,
               hours_left numeric, granted_by_name text)
language sql stable security definer set search_path = public as $$
  select g.id, g.reason, g.expires_at, g.first_used_at,
         round(extract(epoch from (g.expires_at - now())) / 3600.0, 1),
         (select nullif(trim(p.first_name || ' ' || p.last_name), '')
            from profiles p where p.id = g.granted_by)
    from support_grants g
   where g.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
     and g.revoked_at is null and g.expires_at > now()
   order by g.expires_at desc
   limit 1;
$$;
revoke all on function my_support_grant() from public, anon;
grant execute on function my_support_grant() to authenticated;

/** The gyms that have invited the platform in right now. */
create or replace function platform_support_grants()
returns table (id uuid, gym_id uuid, gym_name text, reason text,
               expires_at timestamptz, first_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.gym_id, y.name, g.reason, g.expires_at, g.first_used_at
    from support_grants g join gyms y on y.id = g.gym_id
   where is_platform_admin() and g.revoked_at is null and g.expires_at > now()
   order by g.expires_at;
$$;
revoke all on function platform_support_grants() from public, anon;
grant execute on function platform_support_grants() to authenticated;

/**
 * Enter a gym the platform has been invited into. Sets the session setting
 * `support_session_gym()` reads, stamps first use, and logs the visit so the
 * gym can see it happened.
 */
create or replace function enter_support_session(p_gym uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform uses support access.' using errcode = '42501';
  end if;
  if not exists (select 1 from support_grants
                  where gym_id = p_gym and revoked_at is null and expires_at > now()) then
    raise exception 'That gym has not granted support access, or it has expired.'
      using errcode = '42501';
  end if;

  perform set_config('cf.support_gym', p_gym::text, false);

  update support_grants set first_used_at = coalesce(first_used_at, now())
   where gym_id = p_gym and revoked_at is null and expires_at > now();

  select name into v_name from gyms where id = p_gym;
  perform platform_log(p_gym, 'support.entered',
    'Looked at ' || coalesce(v_name, 'a gym') || ' using the access it granted', '{}'::jsonb);
  -- Recorded in the GYM's own log too: being looked at is something the gym
  -- should be able to read without asking us.
  perform log_activity('gym.support_entered', 'support_grants', null, null,
    'Core Fitness looked at this gym using the access you granted', '{}'::jsonb, p_gym);
  return v_name;
end;
$$;
revoke all on function enter_support_session(uuid) from public, anon;
grant execute on function enter_support_session(uuid) to authenticated;

create or replace function leave_support_session() returns void
language sql security definer set search_path = public as $$
  select set_config('cf.support_gym', '', false);
$$;
revoke all on function leave_support_session() from public, anon;
grant execute on function leave_support_session() to authenticated;

-- ---- the two functions that make it work, and make it read-only ----------------------

-- `current_gym_id()` gains a support branch. A platform admin has no gym of
-- their own (they belong to none), so this adds a gym where there was none
-- rather than overriding anybody's.
create or replace function current_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.active_gym_id from profiles p where p.id = auth.uid()),
    support_session_gym()
  );
$$;

-- ...and `gym_writable()` refuses every write while it is in use. 0099's four
-- RESTRICTIVE policies all require this for insert, update and delete, so one
-- false here is fifty tables read-only — including tables added after today.
create or replace function gym_writable(p_gym uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_gym, current_gym_id()) is not null
     and gym_lock_reason(p_gym) is null
     and support_session_gym() is null;
$$;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0113_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0113_applied() from public, anon;
grant execute on function migration_0113_applied() to authenticated;
comment on function migration_0113_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0113.sql
