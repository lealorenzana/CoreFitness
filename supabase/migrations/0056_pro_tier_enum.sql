-- 0056 — add the 'pro' tier. Enum only; nothing uses it until 0057.
--
-- This file exists on its own for one reason: **PostgreSQL cannot add a value
-- to an enum and then use that value in the same transaction.** The Supabase
-- SQL Editor wraps a script in one, so `alter type … add value 'pro'` followed
-- by `insert … values ('pro')` fails with:
--
--     unsafe use of new value "pro" of enum type plan_tier
--
-- The `staff` role hit exactly this and shipped as 0011 (enum) then 0012
-- (everything that uses it). Same shape here.
--
-- **Run this one, wait for it to succeed, then run 0057.**
--
-- ---------------------------------------------------------------------------
-- Why a fourth tier at all
-- ---------------------------------------------------------------------------
-- The gym asked for four named plans: Free Trial, Free Plan, Premium and
-- Pro/VIP. Three of those already exist under different names; 'pro' is the
-- only genuinely new one, and it needs an enum value because `plan_tier` is
-- what the badge colour and the seeding defaults key off.
--
-- The tier is still **a label, not a rulebook** (0017): what a plan actually
-- includes lives in its own columns and in `plan_features` (0049), so the gym
-- can make Pro cheaper than Premium, or give Free Trial more than Pro, without
-- a code change. Nothing branches on the tier name to decide access.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'plan_tier' and e.enumlabel = 'pro'
  ) then
    alter type plan_tier add value 'pro';
  end if;
end
$$;

-- ============================================================================
-- VERIFICATION — expect: free, freemium, premium, pro
-- ============================================================================
--   select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--    where t.typname = 'plan_tier' order by e.enumsortorder;
