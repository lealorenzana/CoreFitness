-- VERIFICATION for 0196 (why the AI coach failed, written down)
-- Paste into the Supabase SQL editor right after 0196. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean;
begin
  select relrowsecurity from pg_class where relname = 'ai_coach_errors' into c1;
  select not has_function_privilege('authenticated', 'ai_log_error(uuid, int, text)', 'execute') into c2;
  select coalesce((select migration_0196_applied()), false) into c3;
  raise exception 'REPORT 0196: errors table RLS=% | members cannot write it=% | marker=%', c1, c2, c3;
end
$$;
