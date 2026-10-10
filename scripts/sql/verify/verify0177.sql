-- VERIFICATION for 0177 (the AI coach does more)
-- Paste into the Supabase SQL editor right after 0177. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  c1 := has_function_privilege('authenticated', 'ai_coach_gym_info()', 'execute');
  c2 := has_function_privilege('authenticated', 'ai_coach_progress()', 'execute');
  select pg_get_constraintdef(oid) like '%program.create%' into c3 from pg_constraint where conname = 'ai_proposals_kind_check';
  c4 := to_regprocedure('apply_ai_proposal_v1(uuid)') is not null and not has_function_privilege('authenticated', 'apply_ai_proposal_v1(uuid)', 'execute');
  select coalesce((select migration_0177_applied()), false) into c5;
  raise exception 'REPORT 0177: gym_info=% | progress=% | new_kinds=% | v1_kept_private=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
