-- VERIFICATION for 0236 (usernames, login slips, first-sign-in set-up)
-- Paste into the Supabase SQL editor right after 0236. Read-only; the error is the report.
do $$
declare c boolean; col boolean; idx boolean; chk boolean; trg boolean; tbl boolean; rls boolean;
        open_fns int; client_lookup boolean; client_fail_read boolean; svc_lookup boolean; taken int; bad_form int;
begin
  select coalesce((select migration_0236_applied()), false) into c;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'username') into col;
  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_username_key') into idx;
  select exists (select 1 from pg_constraint where conname = 'profiles_username_form') into chk;
  select exists (select 1 from pg_trigger where tgname = 'profiles_username_tidy') into trg;
  select exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'login_failures') into tbl;
  select coalesce((select relrowsecurity from pg_class where oid = 'public.login_failures'::regclass), false) into rls;
  -- A visitor may call none of them; the address lookup is the server's alone.
  select count(*) into open_fns from pg_proc p
   where p.proname in ('username_available', 'set_my_username', 'my_login', 'login_email_for_username',
                       'login_info_for', 'login_reset_check', 'username_problem')
     and has_function_privilege('anon', p.oid, 'execute');
  select has_function_privilege('authenticated', 'public.login_email_for_username(text)', 'execute') into client_lookup;
  select has_table_privilege('authenticated', 'public.login_failures', 'select') into client_fail_read;
  select has_function_privilege('service_role', 'public.login_email_for_username(text)', 'execute') into svc_lookup;
  -- Nobody has one yet, so nothing can be wrong with them.
  select count(*) - count(distinct username) into taken from profiles where username is not null;
  select count(*) into bad_form from profiles where username is not null and username !~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$';
  raise exception 'REPORT 0236: profiles.username=% (unique index=%, form check=%, tidy trigger=%) | login_failures=% (RLS on=%) | functions a visitor can call=% (want 0) | signed-in can turn a username into an email=% (want false) | signed-in can read failures=% (want false) | server lookup=% (want true) | duplicate usernames=% | bad usernames=% | marker=%',
    col, idx, chk, trg, tbl, rls, open_fns, client_lookup, client_fail_read, svc_lookup, taken, bad_form, c;
end
$$;
