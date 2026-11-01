-- VERIFICATION for 0227 (switching gyms, members only)
-- Paste into the Supabase SQL editor right after 0227. Read-only; the error is the report.
do $$
declare c boolean; j text; t boolean; two int;
begin
  select coalesce((select migration_0227_applied()), false) into c;
  select pg_get_functiondef('public.request_to_join(uuid,text,text,text)'::regprocedure) into j;
  select exists (select 1 from pg_trigger where tgname = 'gym_switch_answer' and tgrelid = 'public.gym_roles'::regclass) into t;
  select count(*) into two from (select user_id from gym_roles where role = 'member' and status in ('active', 'pending_approval')
                                  group by user_id having count(*) > 1) x;
  raise exception 'REPORT 0227: gym_switches=% | storage_moves=% | join refuses a second gym=% | switch=% | answer trigger=% | members in two gyms now=% (0 expected) | marker=%',
    to_regclass('public.gym_switches') is not null, to_regclass('public.storage_moves') is not null,
    position('Switch gym instead' in j) > 0,
    to_regprocedure('public.request_gym_switch(uuid,text,text,boolean)') is not null, t, two, c;
end
$$;
