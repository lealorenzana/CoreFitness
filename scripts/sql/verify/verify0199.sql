-- VERIFICATION for 0199 (security hardening: helpers definer-only, badge/challenge guards, form and mail caps)
-- Paste into the Supabase SQL editor right after 0199. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean;
begin
  select not has_function_privilege('authenticated', 'notify_once(uuid, text, text, text, text, text, uuid)', 'execute')
     and not has_function_privilege('anon', 'log_activity(text, text, uuid, uuid, text, jsonb, uuid)', 'execute') into a;
  select not has_function_privilege('anon', 'generate_class_instances(integer, uuid)', 'execute') into b;
  select exists (select 1 from pg_trigger where tgname = 'a_unlock_only_seen') into c;
  select exists (select 1 from pg_trigger where tgname = 'a_join_not_finished') into d;
  select coalesce((select migration_0199_applied()), false) into e;
  raise exception 'REPORT 0199: helpers closed=% | visitor timetable closed=% | badge guard=% | challenge guard=% | marker=%', a, b, c, d, e;
end
$$;
