-- 0060 — back to three plans, and the trial is one month.
--
-- 0057 gave the gym four named plans because a fourth had been asked for:
-- Free Trial, Free Plan, Premium and Pro/VIP. Having looked at what they
-- actually sell, the gym's answer is three:
--
--     Free Trial   freemium   ₱0       one month, then it ends
--     Free Plan    free       ₱0       gym floor, no expiry
--     Premium      premium    ₱1,500   30 days, everything
--
-- Two changes, both to rows. Neither touches the schema.
--
-- ---------------------------------------------------------------------------
-- Why the 'pro' enum value stays
-- ---------------------------------------------------------------------------
-- **PostgreSQL cannot remove a value from an enum.** 0056 exists precisely
-- because adding one is awkward; taking one away is not supported at all short
-- of rebuilding the type and every column that uses it. So `plan_tier` keeps
-- `'pro'`, both apps keep it in their `PlanTier` union, and the admin's tier
-- dropdown simply stops offering it. A tier nobody can pick and no row uses is
-- inert — and if a Pro row does survive somewhere, the app still renders it
-- rather than crashing on an unknown tier.
--
-- This is the same reasoning as members being archived and never deleted: the
-- value stops being offered, it does not stop existing.

-- ============================================================================
-- 1. THE TRIAL IS ONE MONTH
-- ============================================================================
-- 0004 seeded it at 90 days ('3-month trial'). The gym wants one month, which
-- is the length that actually converts here — three months of free access is
-- most of a quarter and the habit is either formed by week four or it is not.
--
-- **Members already on the trial keep the expiry they were given.** This
-- changes what the *plan* hands out from now on; it does not reach into
-- `memberships` and shorten anyone's remaining days, which would be taking
-- back something already promised. Their next renewal moves them onto whatever
-- they choose then.
--
-- Guarded on the value rather than run blind, so a re-paste after the gym
-- edits the number on the Membership Plans screen is a no-op instead of
-- resetting their choice back to 30.
update membership_plans
   set duration_days = 30
 where name = 'Free Trial'
   and duration_days = 90;

-- The description is a feature list the admin edits line by line, so only the
-- one stale line is rewritten — a wholesale overwrite would throw away
-- anything they have added to it.
update membership_plans
   set description = replace(description, '3-month trial', '1-month trial')
 where name = 'Free Trial'
   and description like '%3-month trial%';

-- ============================================================================
-- 2. PRO IS RETIRED
-- ============================================================================
-- `memberships.plan_id` references this table with **no cascade and no null
-- action**, so deleting a plan a member is on raises a foreign key violation —
-- which is the correct behaviour and the reason this is not a one-line delete.
--
-- Two outcomes, decided by whether anything actually points at the row:
--
--   * **Nothing references it** — the row goes. `plan_features` cascades, so
--     the feature cells go with it and no orphan matrix rows are left behind.
--   * **Something references it** — the row is deactivated instead. Every
--     member-facing screen already filters on `is_active` (Register, Renew,
--     the assistant's plan list), so the plan disappears from the app; the
--     admin's member drawer deliberately still shows it for a member who is on
--     it, because hiding the plan somebody is currently paying for is how a
--     dropdown silently reassigns them.
--
-- Either way the gym is left with three plans on offer. Re-running is safe:
-- the second pass finds no Pro row, or finds it already inactive.
do $retire_pro$
declare
  v_pro         uuid;
  v_memberships int := 0;
  v_pending     int := 0;
  v_trials      int := 0;
begin
  select id into v_pro from membership_plans where name = 'Pro' and tier = 'pro' limit 1;

  if v_pro is null then
    raise notice 'No Pro plan found — nothing to retire.';
    return;
  end if;

  select count(*) into v_memberships from memberships where plan_id = v_pro;
  select count(*) into v_pending
    from pending_registrations where requested_plan_id = v_pro;

  -- freemium_trials cannot hold a Pro plan (only the freemium tier claims a
  -- trial), but it is a FK to this table and counting it costs nothing. A
  -- surprise here is worth seeing rather than hitting as a raw FK error.
  if to_regclass('freemium_trials') is not null then
    select count(*) into v_trials from freemium_trials where plan_id = v_pro;
  end if;

  if v_memberships = 0 and v_pending = 0 and v_trials = 0 then
    delete from membership_plans where id = v_pro;
    raise notice 'Pro plan deleted — nothing referenced it.';
  else
    update membership_plans set is_active = false where id = v_pro;
    raise notice 'Pro plan deactivated, not deleted: % membership(s), % pending '
                 'registration(s), % trial row(s) still reference it. It is now '
                 'hidden from members. To remove it for good, move those onto '
                 'another plan first, then run this file again.',
                 v_memberships, v_pending, v_trials;
  end if;
end
$retire_pro$;

-- ============================================================================
-- DEMO_ACCOUNTS.sql
-- ============================================================================
-- That file created a `demo.pro@corefitness.test` member on the Pro plan, and
-- its up-front check refused to run at all unless all four plans existed. Both
-- are updated in the same commit as this file, so a fresh run creates five
-- accounts on three plans. An existing demo.pro account is what will keep the
-- Pro row alive above — remove it with:
--
--   delete from auth.users where email = 'demo.pro@corefitness.test';
--
-- then re-run this file and the Pro row is deleted rather than deactivated.

-- ============================================================================
-- VERIFICATION — expect exactly three active plans
-- ============================================================================
--   select name, tier, price, duration_days, is_active
--     from membership_plans
--    order by is_active desc, price;
--
-- Free Trial should read tier 'freemium', price 0, duration_days 30.
