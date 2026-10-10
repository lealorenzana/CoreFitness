-- VERIFICATION for 0190 (signing up and in with Google)
-- Paste into the Supabase SQL editor right after 0190. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean;
begin
  c1 := has_function_privilege('authenticated', 'my_signup_state()', 'execute') and not has_function_privilege('anon', 'my_signup_state()', 'execute');
  select exists (select 1 from pg_proc where proname = 'finish_signup' and prosrc like '%join_decision%') into c2;
  select exists (select 1 from pg_proc where proname = 'my_applications' and prosrc like '%profile first%') into c3;
  select coalesce((select migration_0190_applied()), false) into c4;
  raise exception 'REPORT 0190: signup state signed-in only=% | finish_signup uses the joining rule=% | Google applicants get a profile=% | marker=%', c1, c2, c3, c4;
end
$$;
