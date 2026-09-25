-- Paste into the Supabase SQL editor right after 0113. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- Two lines decide whether this migration is safe to keep:
--
--   "gym_writable refuses a support session"  — this is what makes support
--   access read-only. 0099 gave every gym table three write policies that all
--   require gym_writable(), so one false there is fifty tables read-only. If it
--   says NOT OK, the platform could write inside a gym that only invited it to
--   look, and you should roll 0113 back.
--
--   "policies on email_outbox / support_grants" — both must be 0. An outbox
--   body can hold an invitation token or a temporary password.
do $$
declare
  v_tables int; v_policies int; v_fns int; v_writable_ok boolean;
  v_grants int; v_live int; v_mail int; v_unsent int; v_pending text;
begin
  select count(*) into v_tables from pg_tables
   where schemaname = 'public' and tablename in ('email_outbox', 'support_grants');

  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename in ('email_outbox', 'support_grants');

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('record_email', 'settle_email', 'platform_email_log', 'my_gym_email_log',
                     'grant_support_access', 'revoke_support_access', 'my_support_grant',
                     'platform_support_grants', 'enter_support_session', 'leave_support_session',
                     'support_session_gym');

  -- The heart of it, read out of the function's own text: gym_writable() must
  -- consult support_session_gym(). Checked as a property rather than by running
  -- it, because in the SQL editor there is no session to run it in.
  select prosrc like '%support_session_gym()%' into v_writable_ok
    from pg_proc where pronamespace = 'public'::regnamespace and proname = 'gym_writable'
    limit 1;

  select count(*) into v_grants from support_grants;
  select count(*) into v_live from support_grants
   where revoked_at is null and expires_at > now();

  select count(*) into v_mail from email_outbox;
  select count(*) into v_unsent from email_outbox where status <> 'sent';

  select string_agg(g.name, ', ') into v_pending
    from support_grants s join gyms g on g.id = s.gym_id
   where s.revoked_at is null and s.expires_at > now();

  raise exception 'REPORT 0113: new tables=% of 2 % | policies on them=% % | new functions=% of 11 % | gym_writable refuses a support session=% % | support grants ever=% (live now=%: %) | emails recorded=% (not sent=%)',
    v_tables, case when v_tables = 2 then 'OK' else 'NOT OK' end,
    v_policies, case when v_policies = 0 then 'OK' else 'NOT OK — STOP' end,
    v_fns, case when v_fns = 11 then 'OK' else 'NOT OK' end,
    coalesce(v_writable_ok, false),
    case when coalesce(v_writable_ok, false) then 'OK' else 'NOT OK — STOP, roll 0113 back' end,
    v_grants, v_live, coalesce(v_pending, 'none'),
    v_mail, v_unsent;
end $$;
