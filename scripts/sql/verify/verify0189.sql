-- VERIFICATION for 0189 (Starter/Growth/Pro prices, AI coach top-ups)
-- Paste into the Supabase SQL editor right after 0189. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean; c6 boolean;
begin
  select count(*) = 3 from platform_plans where key in ('starter', 'growth', 'pro') and is_public into c1;
  select not exists (select 1 from platform_plans where key in ('standard', 'premium') and is_public) into c2;
  select count(*) = 2 from pg_class where relname in ('gym_ai_credits', 'ai_topups') and relrowsecurity into c3;
  select exists (select 1 from pg_proc where proname = 'ai_claim_message' and prosrc like '%gym_ai_credits%') into c4;
  c5 := not has_function_privilege('authenticated', 'ai_claim_message(uuid, uuid)', 'execute');
  select coalesce((select migration_0189_applied()), false) into c6;
  raise exception 'REPORT 0189: three priced tiers=% | old plans hidden=% | top-up tables RLS=% | coach uses top-ups=% | counter still service-only=% | marker=%', c1, c2, c3, c4, c5, c6;
end
$$;
