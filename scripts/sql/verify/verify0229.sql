-- VERIFICATION for 0229 (a gym can be hidden from the gym lists)
-- Paste into the Supabase SQL editor right after 0229. Read-only; the error is the report.
do $$
declare c boolean; l text; f text; lab boolean;
begin
  select coalesce((select migration_0229_applied()), false) into c;
  select pg_get_functiondef('public.list_gyms(text)'::regprocedure) into l;
  select pg_get_functiondef('public.gym_finder(text)'::regprocedure) into f;
  select hidden into lab from gyms where id = gym_one();
  raise exception 'REPORT 0229: gyms.hidden=% | website list skips hidden=% | Find your gym skips hidden=% | the Lab is hidden=% | marker=%',
    exists (select 1 from information_schema.columns where table_name = 'gyms' and column_name = 'hidden'),
    position('not g.hidden' in l) > 0, position('not g.hidden' in f) > 0, lab, c;
end
$$;
