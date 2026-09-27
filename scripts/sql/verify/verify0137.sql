-- VERIFICATION for 0137_platform_talk.sql
-- Paste into the Supabase SQL editor right after 0137. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Four tables with RLS on and NO policy (every read and write goes through a
-- definer function), and the platform-only functions refuse anyone else.
do $$
declare v_tables int; v_rls int; v_policies int; v_fns int; v_guarded int;
begin
  select count(*) into v_tables from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname in ('platform_announcements', 'announcement_dismissals', 'support_tickets', 'support_messages');
  select count(*) into v_rls from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
     and relname in ('platform_announcements', 'announcement_dismissals', 'support_tickets', 'support_messages');
  select count(*) into v_policies from pg_policies where schemaname = 'public'
     and tablename in ('platform_announcements', 'announcement_dismissals', 'support_tickets', 'support_messages');
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('save_announcement', 'end_announcement', 'platform_announcements_list', 'my_announcements',
       'dismiss_announcement', 'open_support_ticket', 'reply_support_ticket', 'set_ticket_status',
       'my_support_tickets', 'platform_support_tickets', 'support_thread', 'platform_bell');
  select count(*) into v_guarded from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('save_announcement', 'end_announcement', 'platform_announcements_list', 'platform_support_tickets', 'platform_bell')
     and prosrc like '%is_platform_admin()%';
  raise exception 'REPORT 0137: tables=% of 4 % | RLS on=% of 4 % | policies=% (want 0) % | functions=% of 12 % | platform-only=% of 5 %',
    v_tables, case when v_tables = 4 then 'OK' else 'NOT OK' end,
    v_rls, case when v_rls = 4 then 'OK' else 'NOT OK - STOP' end,
    v_policies, case when v_policies = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 12 then 'OK' else 'NOT OK' end,
    v_guarded, case when v_guarded = 5 then 'OK' else 'NOT OK - STOP' end;
end $$;
