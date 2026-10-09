-- VERIFICATION for 0170 (every notification is pushed)
-- Paste into the Supabase SQL editor right after 0170. Read-only; the error is the report.
-- every value should be true; pg_net=true means the trigger can reach send-push.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_net') into c1;
  select exists (select 1 from pg_trigger where tgname = 'push_notification' and not tgisinternal) into c2;
  c3 := not has_function_privilege('authenticated', 'claim_notification_push(uuid)', 'execute');
  select exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'pushed_at') into c4;
  select coalesce((select migration_0170_applied()), false) into c5;
  raise exception 'REPORT 0170: pg_net=% | trigger=% | claim_service_only=% | pushed_at=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
