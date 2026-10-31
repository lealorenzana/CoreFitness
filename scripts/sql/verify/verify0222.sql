-- VERIFICATION for 0222 (the applicant's account is the owner's login)
-- Paste into the Supabase SQL editor right after 0222. Read-only; the error is the report.
do $$
declare d text; c boolean;
begin
  select pg_get_functiondef('public.create_gym(text,text,uuid)'::regprocedure) into d;
  select coalesce((select migration_0222_applied()), false) into c;
  raise exception 'REPORT 0222: create_gym makes the owner=% (expect true) | checks a confirmed email=% (expect true) | marker=%',
    position('gym_roles' in d) > 0, position('email_confirmed_at' in d) > 0, c;
end
$$;
