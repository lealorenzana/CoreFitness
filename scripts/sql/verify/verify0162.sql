-- VERIFICATION for 0162 (support ticket access)
-- Paste into the Supabase SQL editor right after 0162. Read-only; the error is the report. Every value should be true.
do $$
declare c0 boolean; c1 boolean; c2 boolean; c3 boolean;
begin
  select (select count(*) = 8 from information_schema.columns where table_name = 'support_tickets' and column_name in ('access_hours','access_why','access_requested_at','access_answer','access_grant_id','resolution','resolved_at','context')) into c0;
  c1 := has_function_privilege('authenticated','approve_ticket_access(uuid)','execute');
  c2 := not has_function_privilege('anon','approve_ticket_access(uuid)','execute');
  select coalesce((select migration_0162_applied()), false) into c3;
  raise exception 'REPORT 0162: check 1=% | check 2=% | check 3=% | marker=%', c0, c1, c2, c3;
end
$$;
