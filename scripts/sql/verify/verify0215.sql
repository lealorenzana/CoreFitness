-- VERIFICATION for 0215 (the gym's own messages are marked; the members' redesign note)
-- Paste into the Supabase SQL editor right after 0215. Read-only; the error is the report.
do $$
declare a boolean; b int; c boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'from_gym') into a;
  select count(*) from app_releases where app = 'member' and title = 'A cleaner, simpler app' into b;
  select coalesce((select migration_0215_applied()), false) into c;
  raise exception 'REPORT 0215: from_gym column=% | members'' redesign note=% (expect 1) | marker=%', a, b, c;
end
$$;
