-- VERIFICATION for 0221 (the tours: who has seen which, one column per app; the guides' notes)
-- Paste into the Supabase SQL editor right after 0221. Read-only; the error is the report.
do $$
declare cols int; rls boolean; pol int; fns int; anon_ok boolean; n int; c boolean;
begin
  select count(*) from information_schema.columns where table_name = 'tours_seen' and column_name in ('member', 'coach', 'admin') into cols;
  select relrowsecurity from pg_class where relname = 'tours_seen' into rls;
  select count(*) from pg_policies where tablename = 'tours_seen' and cmd <> 'SELECT' into pol;
  select count(*) from pg_proc where proname in ('my_tours_seen', 'mark_tour_seen') and prosecdef into fns;
  select has_function_privilege('anon', 'mark_tour_seen(text, text)', 'execute') into anon_ok;
  select count(*) from app_releases where title like '%quick tour%' into n;
  select coalesce((select migration_0221_applied()), false) into c;
  raise exception 'REPORT 0221: app columns=% (expect 3) | RLS on=% | write policies=% (expect 0) | definer functions=% (expect 2) | visitor may mark=% (expect false) | notes=% (expect 3) | marker=%',
    cols, rls, pol, fns, anon_ok, n, c;
end
$$;
