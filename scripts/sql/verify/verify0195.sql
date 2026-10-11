-- VERIFICATION for 0195 (a failed coach message is given back)
-- Paste into the Supabase SQL editor right after 0195. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean;
begin
  select exists (select 1 from pg_proc where proname = 'ai_release_message' and prosrc like '%gym_ai_credits%') into c1;
  select not has_function_privilege('authenticated', 'ai_release_message(uuid, uuid)', 'execute') into c2;
  select coalesce((select migration_0195_applied()), false) into c3;
  raise exception 'REPORT 0195: release gives back a message and a top-up=% | members cannot call it=% | marker=%', c1, c2, c3;
end
$$;
