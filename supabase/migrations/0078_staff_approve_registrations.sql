-- 0078 — the front desk can approve a sign-up, and a rejection says why.
--
-- ## What was actually blocked
--
-- CLAUDE.md has carried "staff approving registrations needs an Edge Function"
-- since 0012. Reading the policies rather than the note: it does not. Staff can
-- already read the queue (0012), delete from it (0012), write the intake fields
-- (`apply_registration_details`, guarded by `is_front_desk()`, 0036) and insert
-- the free membership (`memberships_insert_staff`, 0012). Exactly one step in
-- the approval refuses them — `profiles.status`, whose only UPDATE policies are
-- self and admin (0002/0006).
--
-- So this is one guard, not a new service. An Edge Function would have added a
-- deploy, a secret and a second place where approval logic lives, to work
-- around a single policy.
--
-- ## The rule, and why it is this narrow
--
-- Staff may move an account from `pending_approval` to `active` and nothing
-- else. That is the desk's job: somebody has walked in and signed up. It is not
-- the same as un-suspending, which reverses a decision an admin made for a
-- reason — 0011/0012 keep staff out of accounts, and this does not change that.
-- Admin keeps every transition.
--
-- A staff member therefore cannot:
--   * suspend or archive anyone (the reason-bearing transitions),
--   * reactivate an account an admin suspended,
--   * touch an account that was never pending.
--
-- ## Rejection now records its reason
--
-- `rejectPendingRegistration()` wrote `status = 'suspended'` straight onto
-- `profiles`, which is the one path around 0069's requirement that a suspension
-- say why — the account went dark with an empty history. The admin app now
-- routes rejection through this function like every other status change, so the
-- reason lands in `account_status_events` with it. Nothing here enforces that;
-- the function already refuses a blank reason for `suspended`. It is noted
-- because the fix is in the caller and this is where somebody will look.
--
-- Replaces 0069's function body in place: one writer for account status, which
-- is the property that makes the audit trail trustworthy.

create or replace function set_account_status(
  p_profile uuid,
  p_status  text,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_prev text;
  -- text, not user_role: plpgsql converts on assignment, and the comparisons
  -- below are against literals either way. It also keeps the function loadable
  -- by scripts/sql/*.mjs, whose minimal fixture stubs get_my_role() as text.
  v_role text;
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

  select status into v_prev from profiles where id = p_profile;
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

  update profiles set status = p_status where id = p_profile;

  insert into account_status_events
    (profile_id, status, previous_status, reason, recorded_by)
  values
    (p_profile, p_status, v_prev, nullif(btrim(p_reason), ''), auth.uid());
end;
$fn$;

revoke all on function set_account_status(uuid, text, text) from public, anon;
grant execute on function set_account_status(uuid, text, text) to authenticated;

comment on function set_account_status(uuid, text, text) is
  'The only writer of profiles.status. Admin may make any transition, with a '
  'reason required to suspend or archive (0069). Staff may make exactly one: '
  'pending_approval -> active, so the front desk can approve a sign-up without '
  'gaining account control (0078). Every change is recorded in '
  'account_status_events.';

-- Marker for scripts/probe-migrations.py. 0078 creates no table, column or new
-- function, so it leaves no schema trace of its own and the probe would have
-- reported it live before it ever ran (0074's lesson).
create or replace function migration_0078_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0078_applied() from public, anon;
grant execute on function migration_0078_applied() to authenticated;

comment on function migration_0078_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   As a staff account, approve a pending sign-up: it succeeds, and
--     select * from account_status_events order by created_at desc limit 1;
--   shows the transition with staff as recorded_by.
--   As the same staff account, suspending anyone must raise.
--   As an admin, every transition still works, and a blank suspension reason
--   still raises.
