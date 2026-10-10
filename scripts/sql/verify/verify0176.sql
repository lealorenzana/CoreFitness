-- VERIFICATION for 0176 (Targets switch)
-- Paste into the Supabase SQL editor right after 0176. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean;
begin
  select exists (select 1 from platform_features where key = 'targets' and parent_key = 'progress') into c1;
  select coalesce((select migration_0176_applied()), false) into c2;
  raise exception 'REPORT 0176: targets_switch=% | marker=%', c1, c2;
end
$$;
