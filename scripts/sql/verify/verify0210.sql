-- VERIFICATION for 0210 (every points payout asks about the member's plan, never the caller's)
-- Paste into the Supabase SQL editor right after 0210. Read-only; the error is the report.
do $$
declare bad text; m boolean;
begin
  -- Each payout's body must use member_plan_allows, and none may still call bare plan_allows(..., 'points_earn').
  select string_agg(p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname in ('award_points', 'settle_challenges', 'trg_detect_personal_record', 'trg_referral_paid', 'award_classwork',
                       'trg_points_shop_sale', 'settle_squads', 'settle_gym_goals')
     and regexp_replace(p.prosrc, 'member_plan_allows', '', 'g') ~ 'plan_allows\([^)]*points_earn';
  select coalesce((select migration_0210_applied()), false) into m;
  raise exception 'REPORT 0210: payouts still asking the caller=% | marker=%', coalesce(bad, 'none'), m;
end
$$;
