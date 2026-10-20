-- VERIFICATION for 0205 (Retention: the desk logs a call)
-- Paste into the Supabase SQL editor right after 0205. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean;
begin
  select to_regprocedure('log_retention_call(uuid, text)') is not null into a;
  select not has_function_privilege('anon', 'log_retention_call(uuid, text)', 'execute') into b;
  select exists (select 1 from information_schema.columns where table_name = 'winback_sends' and column_name = 'note') into c;
  select position('''call''' in pg_get_functiondef('trg_winback_cap()'::regprocedure)) > 0 into d; -- a call holds back the month's automatic message
  select coalesce((select migration_0205_applied()), false) into e;
  raise exception 'REPORT 0205: log_retention_call=% | closed to visitors=% | note column=% | a call holds back automatics=% | marker=%', a, b, c, d, e;
end
$$;
