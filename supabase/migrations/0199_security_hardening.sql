-- ============================================================================
-- 0199 — What the red team got through (2026-10-18)
-- ============================================================================
--
-- scripts/sql/security-red-team.mjs attacks the database as a signed-out
-- visitor, a member, a coach and another gym's member — the browser holds the
-- public anon key, so the database is the only guard. Most attacks failed.
-- These did not:
--
--   1. Helper functions every trigger uses were still executable by anyone
--      (Postgres grants EXECUTE to PUBLIC by default): notify_once let a
--      member — or with a gym id, a visitor — put any title and any link in
--      anyone's inbox (a phishing door); log_activity forged Activity log
--      entries, which only triggers may write (0037); next_invoice_number
--      burned a gym's receipt numbers; display_name_of / activity_member_name /
--      current_membership_of answered for any person's id, in any gym. No
--      screen calls any of them — every caller is a SECURITY DEFINER function,
--      which runs as the owner and keeps working.
--   2. generate_class_instances and sweep_stale_requests let a visitor act on
--      any gym (harmless outcomes, but nobody signed out should).
--   3. achievement_unlocks_mark_seen (0028) is meant to flip `seen`, but a
--      policy cannot limit columns (RLS filters rows, never columns), so a
--      member could swap their badge for another or backdate it.
--   4. Joining a challenge accepted completed_on — a member could appear
--      finished on the standings, and settle_challenges then never paid them.
--   5. The public application form capped one email address, not the form:
--      a flood from changing addresses went through. And a gym's desk could
--      send unlimited email through send-email.
-- ============================================================================

-- ---- 1. helpers: definer-only -------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'notify_once(uuid, text, text, text, text, text, uuid)',
    'log_activity(text, text, uuid, uuid, text, jsonb, uuid)',
    'next_invoice_number(integer, uuid)',
    'display_name_of(uuid)',
    'activity_member_name(uuid)',
    'current_membership_of(uuid)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- ---- 2. signed-in only ------------------------------------------------------------------
revoke all on function generate_class_instances(integer, uuid) from public, anon;
grant execute on function generate_class_instances(integer, uuid) to authenticated, service_role;
revoke all on function sweep_stale_requests(uuid) from public, anon;
grant execute on function sweep_stale_requests(uuid) to authenticated, service_role;

-- ---- 3. a member may only mark a badge seen ----------------------------------------------
-- Invoker on purpose: current_user is the caller's role for a direct write
-- ('authenticated'), and the owner inside award_achievement & the sweeps.
create or replace function trg_unlock_only_seen() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.user_id        := old.user_id;
    new.achievement_key := old.achievement_key;
    new.unlocked_on    := old.unlocked_on;
    new.gym_id         := old.gym_id;
    new.created_at     := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists a_unlock_only_seen on achievement_unlocks;
create trigger a_unlock_only_seen before update on achievement_unlocks
  for each row execute function trg_unlock_only_seen();

-- ---- 4. joining a challenge is joining, not finishing -----------------------------------
create or replace function trg_join_not_finished() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.completed_on := null;
  end if;
  return new;
end;
$$;
drop trigger if exists a_join_not_finished on challenge_participants;
create trigger a_join_not_finished before insert on challenge_participants
  for each row execute function trg_join_not_finished();

-- ---- 5. the doors that cost mail ----------------------------------------------------------
-- 0148's form, plus a ceiling for everyone signed out together.
create or replace function submit_gym_application(
  p_gym_name text, p_owner_name text, p_email text, p_phone text,
  p_address text default null, p_member_estimate int default null, p_message text default null,
  p_plan_key text default null, p_billing text default null, p_heard_from text default null,
  p_contact_pref text default null, p_contact_handle text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if p_plan_key is not null and not exists (
       select 1 from platform_plans where key = p_plan_key and is_active and is_public) then
    raise exception 'That plan is not on offer. Pick one of the plans on the page.';
  end if;
  -- A form with no account behind it: five a day from one address is plenty.
  if (select count(*) from gym_applications
       where lower(btrim(email)) = lower(btrim(p_email)) and created_at > now() - interval '1 day') >= 5 then
    raise exception 'We already have your applications from today. We will answer them — no need to send another.';
  end if;
  -- And 0199: at most 20 an hour from everyone, so changing the address is no way round it.
  if (select count(*) from gym_applications where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'A lot of applications came in just now. Please try again in an hour.';
  end if;

  insert into gym_applications (gym_name, owner_name, email, phone, address, member_estimate, message,
                                plan_key, billing, heard_from, contact_pref, contact_handle)
  values (btrim(p_gym_name), btrim(p_owner_name), lower(btrim(p_email)), btrim(p_phone),
          nullif(btrim(p_address), ''), p_member_estimate, nullif(btrim(p_message), ''),
          p_plan_key, coalesce(nullif(p_billing, ''), 'monthly'), nullif(btrim(p_heard_from), ''),
          nullif(p_contact_pref, ''), nullif(btrim(p_contact_handle), ''))
  returning status_token into v_token;
  return v_token;
end;
$$;
revoke all on function submit_gym_application(text, text, text, text, text, int, text, text, text, text, text, text) from public;
grant execute on function submit_gym_application(text, text, text, text, text, int, text, text, text, text, text, text) to anon, authenticated;

-- 0113's outbox, plus a daily ceiling per gym (the platform's own mail is not capped).
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
  if not is_platform_admin()
     and (select count(*) from email_outbox where gym_id = p_gym and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Your gym has sent 100 emails today, the most a day. Try again tomorrow.';
  end if;

  insert into email_outbox (gym_id, to_email, to_name, subject, body, kind)
  values (p_gym, btrim(p_to), nullif(btrim(p_to_name), ''), btrim(p_subject), p_body, p_kind)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function record_email(text, text, text, text, uuid, text) from public, anon;
grant execute on function record_email(text, text, text, text, uuid, text) to authenticated;

create or replace function migration_0199_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0199_applied() from public, anon;
grant execute on function migration_0199_applied() to authenticated;
comment on function migration_0199_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0199.sql
