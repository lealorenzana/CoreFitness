-- ============================================================================
-- 0279: a member belongs to one gym at a time, on reinstating too (2026-11-26)
-- ============================================================================
-- 0227 said it, but only request_to_join() checked it. On 2026-11-25 EYA GYM
-- suspended a member (declining her switch), she switched to G Fitness, and
-- 30 minutes later EYA reinstated her: suspended → active, so she was an active
-- member of two gyms.
--
-- set_account_status() is the one door for the owner's and desk's Reinstate,
-- Restore and Approve (0069/0078/0100); it now refuses to make someone a member
-- here while they are an active or waiting member of another gym, unless their
-- switch to this gym is waiting. Redefined in full from 0100 with that check.
-- Coaches are not limited. Rows that already break the rule are not changed.
-- (A trigger on gym_roles was tried first: the Lab demo scripts and the test
-- set-ups add a second gym before removing the first, and it refused them.)
-- Safe to paste again.
-- ============================================================================

-- The first draft's trigger, if it was pasted.
drop trigger if exists one_gym_per_member on gym_roles;
drop function if exists trg_one_gym_per_member();

create or replace function set_account_status(
  p_profile uuid,
  p_status  text,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym  uuid := acting_gym_id();
  v_prev text;
  -- text, not user_role: plpgsql converts on assignment, and the comparisons
  -- below are against literals either way. It also keeps the function loadable
  -- by scripts/sql/*.mjs, whose minimal fixture stubs get_my_role() as text.
  v_role text;
  v_other text;
begin
  if p_status not in ('active', 'pending_approval', 'suspended', 'archived') then
    raise exception 'Unknown account status: %', p_status;
  end if;

  -- A suspension with no reason is the thing 0069 exists to prevent. The
  -- sentence is 0074's, not 0069's: "a reason is required to suspended an
  -- account" is read out at a desk, and this file must not undo that repair by
  -- copying the older body forward. Caught by scripts/sql/reasons-and-limits.mjs.
  if p_status in ('suspended', 'archived')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to set an account to %.', p_status;
  end if;

  -- The status in *this* gym. Someone with no role here is not this gym's to change.
  select status into v_prev from gym_roles where user_id = p_profile and gym_id = v_gym;
  if v_prev is null then
    raise exception 'No such account.';
  end if;

  -- `auth.uid() is not null and` first, as everywhere else in this schema:
  -- outside a browser session auth.uid() is NULL, and a bare role test would
  -- refuse the SQL Editor and the replay harness — the bug 0055 and 0062 both
  -- shipped. Inside a session the checks below still apply.
  if auth.uid() is not null then
    v_role := get_my_role();

    -- The front desk's single permitted transition. Spelled out rather than
    -- expressed as "not admin", because the next role added to this schema
    -- would otherwise inherit it silently.
    -- `v_prev = 'active'` is here for the double-click, not as a permission:
    -- it falls through to the quiet early return below, which writes nothing.
    -- Without it, approving a member somebody else just approved would raise a
    -- permission error at a desk with a queue behind it. The guard stays above
    -- the early return either way — 0074 shipped that bug the other way round.
    if v_role = 'staff' then
      if not (p_status = 'active' and v_prev in ('pending_approval', 'active')) then
        raise exception
          'The front desk can activate a pending sign-up. Changing an account '
          'beyond that is an admin action.';
      end if;
    elsif v_role is distinct from 'admin' then
      raise exception 'Only an admin can change an account status.';
    end if;
  end if;

  -- Nothing to record and nothing to change. Returning quietly rather than
  -- raising keeps a double-click idempotent instead of alarming.
  if v_prev = p_status then
    return;
  end if;

  -- 0279: a member belongs to one gym at a time (0227). Reinstating, restoring
  -- or approving someone who is now a member of another gym would make them a
  -- member of two; they switch gyms from their app instead. A switch waiting on
  -- this gym's desk is allowed: completing it archives the old role.
  if p_status in ('active', 'pending_approval') and v_prev not in ('active', 'pending_approval') then
    select g.name into v_other from gym_roles r join gyms g on g.id = r.gym_id
     where r.user_id = p_profile and r.gym_id <> v_gym and r.role = 'member'
       and r.status in ('active', 'pending_approval')
       and exists (select 1 from gym_roles h where h.user_id = p_profile and h.gym_id = v_gym and h.role = 'member')
       and not exists (select 1 from gym_switches s where s.member = p_profile and s.to_gym = v_gym and s.status = 'pending')
     limit 1;
    if v_other is not null then
      raise exception 'This person is now a member of %. A member belongs to one gym at a time, so they switch gyms from their app.', v_other;
    end if;
  end if;

  update gym_roles set status = p_status where user_id = p_profile and gym_id = v_gym;
  -- Today's apps read profiles.status until Part B moves them to gym_roles.
  -- The mirror copies this back into the same gym, so it cannot touch another.
  perform set_config('cf.acting_gym', v_gym::text, true);
  update profiles set status = p_status where id = p_profile;

  insert into account_status_events
    (gym_id, profile_id, status, previous_status, reason, recorded_by)
  values
    (v_gym, p_profile, p_status, v_prev, nullif(btrim(p_reason), ''), auth.uid());
end;
$fn$;
