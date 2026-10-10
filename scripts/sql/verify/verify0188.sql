-- VERIFICATION for 0188 (gym feedback: ratings, ideas, bug reports, testimonials)
-- Paste into the Supabase SQL editor right after 0188. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean; c6 boolean;
begin
  select count(*) = 3 from pg_class where relname in ('platform_ratings', 'feature_requests', 'testimonials') and relrowsecurity into c1;
  select not exists (select 1 from pg_policies where tablename in ('platform_ratings', 'feature_requests', 'testimonials')) into c2;
  select exists (select 1 from information_schema.columns where table_name = 'support_tickets' and column_name = 'kind') into c3;
  select exists (select 1 from storage.buckets where id = 'support' and not public) into c4;
  c5 := has_function_privilege('anon', 'public_testimonials()', 'execute');
  select coalesce((select migration_0188_applied()), false) into c6;
  raise exception 'REPORT 0188: tables with RLS=% | no policies=% | bug tickets=% | private support bucket=% | website testimonials=% | marker=%', c1, c2, c3, c4, c5, c6;
end
$$;
