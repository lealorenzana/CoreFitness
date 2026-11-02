-- VERIFICATION for 0230 (plans by size and features; the member limit holds)
-- Paste into the Supabase SQL editor right after 0230. Read-only; the error is the report.
do $$
declare s text; g text; lock_s int; lock_g int; lock_p int; trg boolean; c boolean;
begin
  select coalesce((select migration_0230_applied()), false) into c;
  select max_members || ' members ₱' || price_monthly::int into s from platform_plans where key = 'starter';
  select max_members || ' members ₱' || price_monthly::int into g from platform_plans where key = 'growth';
  select count(*) into lock_s from platform_plan_features where plan_key = 'starter' and not enabled;
  select count(*) into lock_g from platform_plan_features where plan_key = 'growth' and not enabled;
  select count(*) into lock_p from platform_plan_features where plan_key = 'pro' and not enabled;
  select exists (select 1 from pg_trigger where tgname = 'gym_roles_member_limit') into trg;
  raise exception 'REPORT 0230: Starter % (% locked) | Growth % (% locked) | Pro locked % | member-limit trigger=% | marker=%',
    s, lock_s, g, lock_g, lock_p, trg, c;
end
$$;
