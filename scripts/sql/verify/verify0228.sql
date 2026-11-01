-- VERIFICATION for 0228 (an applicant changes their plan)
-- Paste into the Supabase SQL editor right after 0228. Read-only; the error is the report.
do $$
declare c boolean; f text;
begin
  select coalesce((select migration_0228_applied()), false) into c;
  select pg_get_functiondef('public.change_application_plan(uuid,text,text)'::regprocedure) into f;
  raise exception 'REPORT 0228: change_application_plan=% | locked once paid=% | marker=%',
    f is not null, position('plan is fixed now' in f) > 0, c;
end
$$;
