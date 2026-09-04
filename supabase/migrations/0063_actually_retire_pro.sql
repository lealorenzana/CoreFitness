-- 0063 — fix the guard that blocked its own writer, then actually retire Pro.
--
-- Two things were wrong after 0060–0062, and between them the gym ran every
-- migration and still had a Pro plan with a member on it.
--
-- ---------------------------------------------------------------------------
-- 1. `retire_plan()` refused to run in the SQL Editor
-- ---------------------------------------------------------------------------
-- 0062 guarded it with:
--
--     if get_my_role() is distinct from 'admin' then raise ...
--
-- `get_my_role()` is `select role from profiles where id = auth.uid()`. In the
-- SQL Editor there is no JWT, so `auth.uid()` is NULL, the select returns no
-- row, and `get_my_role()` is NULL. `NULL is distinct from 'admin'` is **true**,
-- so the function raised "Only an admin can delete a membership plan" at the
-- one caller who is unambiguously entitled to run it.
--
-- This is the same bug as 0055's first draft of `settle_goals()`, which refused
-- the cron job that was its only caller — and it is written down in CLAUDE.md
-- as a rule ("check it does not block its own writer"). It got written twice.
--
-- The fix is to guard the case that actually needs guarding: **a signed-in
-- session that is not an admin**. No session at all means the caller reached
-- this function without going through PostgREST as a logged-in user — the SQL
-- Editor, a migration, or cron — and `anon` cannot reach it regardless because
-- 0062 revoked execute from `anon` and only granted it to `authenticated`.
--
-- ---------------------------------------------------------------------------
-- 2. Nothing had actually retired Pro
-- ---------------------------------------------------------------------------
-- 0060 **deactivates** a plan that still has memberships pointing at it, rather
-- than deleting it, because `memberships.plan_id` has no cascade. That was the
-- safe thing to do at the time — but the gym's instruction was to remove Pro
-- and put its member back on the free tier, and a deactivated row with a member
-- still attached to it is neither.
--
-- 0062 supplied the function that does it properly and stopped there, leaving
-- the actual retirement as a button somebody had to know to press. This file
-- presses it.

-- ============================================================================
-- THE CORRECTED FUNCTION
-- ============================================================================
create or replace function retire_plan(p_plan_id uuid)
returns table (moved int, plan_name text, moved_to text)
language plpgsql security definer set search_path = public as $fn$
declare
  v_plan  membership_plans;
  v_free  membership_plans;
  v_moved int := 0;
  v_trials int := 0;
begin
  -- Only a *signed-in non-admin* is refused.
  --
  -- `auth.uid() is not null` is the test for "a browser session is making this
  -- call". With no session the caller is the SQL Editor, a migration or cron,
  -- and none of those can be checked against `profiles` because they have no
  -- row there. Execute is revoked from `anon` (0062), so "no session" cannot
  -- mean a stranger over the public API.
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can delete a membership plan.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_plan from membership_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'That plan no longer exists — someone may have deleted it already.';
  end if;

  -- The destination is resolved by tier, not name (see `free_tier_plan()`), and
  -- **must not be filtered on is_active here** beyond what that function already
  -- does: if the gym has deactivated their free plan there is nowhere safe to
  -- send anyone, and saying so is better than inventing a destination.
  select * into v_free from free_tier_plan();
  if v_free.id is null then
    raise exception
      'There is no active free plan to move members to, so this plan cannot be '
      'deleted without stranding them. Create a plan on the free tier first.';
  end if;

  if v_plan.id = v_free.id then
    raise exception
      'This is the free plan members fall back to when another plan is deleted. '
      'Deactivate it instead, or create a replacement free plan first.';
  end if;

  -- A claimed trial is history: repointing it would falsify the record, and
  -- deleting it would hand that member a second trial.
  if to_regclass('freemium_trials') is not null then
    execute 'select count(*) from freemium_trials where plan_id = $1'
      into v_trials using p_plan_id;

    if v_trials > 0 then
      raise exception
        'Cannot delete "%": % member(s) claimed their one free trial on it, and '
        'that record cannot be moved without either falsifying it or handing '
        'them a second trial. Deactivate the plan instead — it disappears from '
        'the member app either way.', v_plan.name, v_trials;
    end if;
  end if;

  -- Every membership, whatever its status. Status and dates are left alone:
  -- retiring a plan is an act about the catalogue and must not reactivate a
  -- lapsed member or cut short anyone's remaining days.
  update memberships set plan_id = v_free.id, updated_at = now()
   where plan_id = p_plan_id;
  get diagnostics v_moved = row_count;

  update pending_registrations set requested_plan_id = v_free.id
   where requested_plan_id = p_plan_id;

  delete from membership_plans where id = p_plan_id;

  return query select v_moved, v_plan.name, v_free.name;
end;
$fn$;

revoke all on function retire_plan(uuid) from public, anon;
grant execute on function retire_plan(uuid) to authenticated;

-- ============================================================================
-- NOW ACTUALLY RETIRE PRO
-- ============================================================================
-- Guarded on the plan still existing, so a second paste is a no-op notice
-- rather than the "that plan no longer exists" exception the function raises.
do $retire$
declare
  v_pro uuid;
  r     record;
begin
  select id into v_pro from membership_plans where name = 'Pro' and tier = 'pro';

  if v_pro is null then
    raise notice 'No Pro plan left to retire — already done.';
    return;
  end if;

  select * into r from retire_plan(v_pro);
  raise notice 'Retired "%": % membership(s) moved to "%".', r.plan_name, r.moved, r.moved_to;
end
$retire$;

-- ============================================================================
-- VERIFICATION — run these after the paste
-- ============================================================================
-- Expect exactly three plans, all active, and nobody on a tier called 'pro':
--
--   select name, tier, price, duration_days, is_active
--     from membership_plans order by price;
--
--   select p.email, pl.name as plan, m.status, m.expiry_date
--     from memberships m
--     join membership_plans pl on pl.id = m.plan_id
--     join profiles p on p.id = m.member_id
--    order by p.email;
--
-- The member who was on Pro should now read "Free Plan" with the same status
-- and the same expiry date they had before.
--
-- The member's phone caches entitlements for five minutes (useFeatures.ts), so
-- their app catches up on its own within that — no reinstall, no re-login.
