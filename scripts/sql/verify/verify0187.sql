-- VERIFICATION for 0187 (applicant accounts, verification documents)
-- Paste into the Supabase SQL editor right after 0187. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean; c6 boolean; c7 boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_applications' and column_name = 'applicant_id') into c1;
  select exists (select 1 from pg_trigger where tgname = 'trg_handle_new_applicant_signup') into c2;
  select exists (select 1 from storage.buckets where id = 'applications' and not public) into c3;
  select relrowsecurity from pg_class where relname = 'application_documents' into c4;
  select exists (select 1 from pg_trigger where tgname = 'application_needs_documents') into c5;
  c6 := has_function_privilege('authenticated', 'my_applications()', 'execute')
        and not has_function_privilege('anon', 'my_applications()', 'execute');
  select coalesce((select migration_0187_applied()), false) into c7;
  raise exception 'REPORT 0187: applicant_id=% | sign-up trigger=% | private bucket=% | documents RLS=% | approve needs documents=% | my_applications signed-in only=% | marker=%', c1, c2, c3, c4, c5, c6, c7;
end
$$;
