-- VERIFICATION for 0131_coach_chat.sql
-- Paste into the Supabase SQL editor right after 0131. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Chats are private to the two people in them. "write policies" must be 0
-- (sending goes through send_message), and "read policies" must be exactly 2 —
-- one per table, each naming only the two participants. A third would be
-- someone else being let in.
do $$
declare v_write int; v_read int; v_tbls int;
begin
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('conversations', 'messages')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*) into v_read from pg_policies
   where schemaname = 'public' and tablename in ('conversations', 'messages')
     and cmd = 'SELECT' and permissive = 'PERMISSIVE';
  select count(*) into v_tbls from pg_tables where schemaname = 'public' and tablename in ('conversations', 'messages');
  raise exception 'REPORT 0131: write policies=% % | read policies=% % | tables=% of 2 %',
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_read, case when v_read = 2 then 'OK' else 'NOT OK - STOP' end,
    v_tbls, case when v_tbls = 2 then 'OK' else 'NOT OK' end;
end $$;
