-- VERIFICATION for 0186 (expired → free tier, audiences, starter plans, points switch)
-- Paste into the Supabase SQL editor right after 0186. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean; c6 boolean;
begin
  select exists (select 1 from pg_proc where proname = 'plan_allows' and prosrc like '%frozen%') into c1;
  c2 := has_function_privilege('authenticated', 'members_in_audience(text, uuid[])', 'execute');
  select exists (select 1 from information_schema.columns where table_name = 'membership_plans' and column_name = 'price_unset') into c3;
  select exists (select 1 from platform_features where key = 'points') and exists (select 1 from platform_features where key = 'seasons' and parent_key = 'points') into c4;
  select exists (select 1 from pg_trigger where tgname = 'a_points_switch') into c5;
  select coalesce((select migration_0186_applied()), false) into c6;
  raise exception 'REPORT 0186: free-tier fallback=% | audiences=% | price_unset=% | points switch=% | ledger guard=% | marker=%', c1, c2, c3, c4, c5, c6;
end
$$;
