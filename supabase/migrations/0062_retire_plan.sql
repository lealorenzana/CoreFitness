-- 0062 — deleting a plan moves its members to the free tier instead of failing.
--
-- Two things went wrong on the Membership Plans screen, and they compounded:
--
--   1. The card said **"Active Members 0"** for a plan a member was actually on.
--      It counts client-side over `listMemberships()` and only tallies rows whose
--      status is exactly `'active'` — so a membership in any other state is
--      invisible to it while still being very much a foreign key.
--   2. Because the count was 0, the guard that refuses to delete a plan with
--      members did not fire, the raw `delete` ran, `memberships.plan_id`
--      rejected it, and the screen said **"Failed to delete plan"** — which
--      names the symptom and not one useful fact about the cause.
--
-- The gym's answer to "what should happen to the member?" is: **they go back to
-- the free tier.** That is the right default for this gym — the alternative is
-- an account pointing at a plan that no longer exists, and the free tier is the
-- one plan that always exists and costs nothing to be on.
--
-- So deletion stops being a `delete` and becomes this function: move everyone
-- off, then remove the plan, in **one transaction**. Half of that would be worse
-- than neither — members moved off a plan that then failed to delete, or a
-- deleted plan with orphaned rows.
--
-- ---------------------------------------------------------------------------
-- Why this is SQL and not three calls from the admin app
-- ---------------------------------------------------------------------------
-- Same rule as everything else here: a client that can do this in three steps
-- can also stop after the first. A function is atomic, runs as one unit, and
-- reports what it actually did rather than what the browser assumed.

-- ============================================================================
-- WHAT COUNTS AS THE FREE TIER
-- ============================================================================
-- The destination is resolved by **tier, not by name**. "Free Plan" is what the
-- gym calls it today and 0057 already renamed it once; a function that looked up
-- a literal name would break the next time somebody edits it on screen.
create or replace function free_tier_plan() returns membership_plans
language sql stable security definer set search_path = public as $$
  select * from membership_plans
   where tier = 'free' and is_active
   order by price asc, created_at asc
   limit 1;
$$;

comment on function free_tier_plan() is
  'The plan members fall back to. Resolved by tier so renaming it on the '
  'Membership Plans screen cannot break the fallback.';

-- ============================================================================
-- RETIRE A PLAN
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
  -- ── Who may do this ──────────────────────────────────────────────────────
  -- Admin only, matching `membership_plans_write_admin` (0006). Staff run the
  -- front desk; they do not restructure what the gym sells. Checked here rather
  -- than left to RLS because SECURITY DEFINER turns RLS off — the whole point
  -- of a definer function is that it can do what the caller cannot, so the
  -- guard has to be written out.
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can delete a membership plan.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_plan from membership_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'That plan no longer exists — someone may have deleted it already.';
  end if;

  select * into v_free from free_tier_plan();
  if v_free.id is null then
    raise exception
      'There is no active free plan to move members to, so this plan cannot be '
      'deleted without stranding them. Create a plan on the free tier first.';
  end if;

  -- ── The free tier cannot delete itself ───────────────────────────────────
  -- It is the destination. Removing it is how every other plan's deletion stops
  -- working, and the failure would not show up until the next one was tried.
  if v_plan.id = v_free.id then
    raise exception
      'This is the free plan members fall back to when another plan is deleted. '
      'Deactivate it instead, or create a replacement free plan first.';
  end if;

  -- ── A claimed trial is history and must not be rewritten ─────────────────
  -- `freemium_trials` records that a member has used their one trial, ever.
  -- Repointing those rows at the free plan would make the record say something
  -- untrue; deleting them would hand those members a second trial. Neither is
  -- acceptable, so a plan with claimed trials is refused with the reason.
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

  -- ── Move the memberships ─────────────────────────────────────────────────
  -- **Every** membership, whatever its status — that is the bug this file
  -- exists for. A cancelled or expired row is still a foreign key.
  --
  -- `status` and the dates are deliberately left alone. Retiring a plan is an
  -- administrative act about the *catalogue*; it must not quietly reactivate a
  -- lapsed member, nor cut short someone's remaining days. What changes is what
  -- they are entitled to from now on, which is `plan_features` reading off the
  -- new plan — and that is exactly what the gym asked for.
  update memberships set plan_id = v_free.id, updated_at = now()
   where plan_id = p_plan_id;
  get diagnostics v_moved = row_count;

  -- Someone mid-signup who asked for this plan gets the free tier instead, so
  -- approving them still works.
  update pending_registrations set requested_plan_id = v_free.id
   where requested_plan_id = p_plan_id;

  -- plan_features cascades (0049). Nothing else references membership_plans.
  delete from membership_plans where id = p_plan_id;

  return query select v_moved, v_plan.name, v_free.name;
end;
$fn$;

revoke all on function retire_plan(uuid) from public, anon;
grant execute on function retire_plan(uuid) to authenticated;

comment on function retire_plan(uuid) is
  'Delete a plan and move everyone on it to the free tier, atomically. Admin '
  'only. Returns how many memberships moved so the screen can report the truth '
  'rather than a client-side guess.';

-- ============================================================================
-- HONEST MEMBER COUNTS FOR THE CARDS
-- ============================================================================
-- The "Active Members 0" that started this. The screen was counting only
-- `status = 'active'` and labelling the result "Active Members", which is
-- defensible right up until it is the number a delete guard depends on.
--
-- Both numbers, computed where the rows are: `active` for the revenue figure,
-- `total` for anything that needs to know whether the plan is referenced at all.
create or replace function plan_member_counts()
returns table (plan_id uuid, active_count int, total_count int)
language sql stable security definer set search_path = public as $$
  select p.id,
         count(*) filter (where m.status = 'active')::int,
         count(m.id)::int
    from membership_plans p
    left join memberships m on m.plan_id = p.id
   group by p.id;
$$;

revoke all on function plan_member_counts() from public, anon;
grant execute on function plan_member_counts() to authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select * from plan_member_counts()
--     join membership_plans p on p.id = plan_id;
--
-- If a plan shows total_count > 0 while the screen said "Active Members 0",
-- that is the exact discrepancy this file was written for.
--
-- Then, to remove Pro:
--   select * from retire_plan((select id from membership_plans where name = 'Pro'));
-- → moved | plan_name | moved_to
--   ------+-----------+-----------
--       1 | Pro       | Free Plan
