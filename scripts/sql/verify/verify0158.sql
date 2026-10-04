-- VERIFICATION for 0158_application_payment_messages.sql
-- Paste into the Supabase SQL editor right after 0158. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_col boolean; v_send boolean; v_anon boolean; v_card boolean; v_thread int; v_marker boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'application_messages' and column_name = 'payment_method_id') into v_col;
  select has_function_privilege('authenticated', 'platform_application_send_payment(uuid, uuid, text)', 'execute') into v_send;
  select has_function_privilege('anon', 'platform_application_send_payment(uuid, uuid, text)', 'execute') into v_anon;
  select has_function_privilege('anon', 'application_pay_card(uuid)', 'execute') or has_function_privilege('authenticated', 'application_pay_card(uuid)', 'execute') into v_card;
  select count(*) into v_thread from information_schema.routine_columns where routine_name = 'platform_application_thread' and column_name = 'method_label';
  select coalesce((select migration_0158_applied()), false) into v_marker;
  raise exception 'REPORT 0158: column=% % | platform can send=% % | anon can send=% % | card callable directly=% % | thread names method=% % | marker=% %',
    v_col, case when v_col then 'OK' else 'NOT OK - STOP' end,
    v_send, case when v_send then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_card, case when not v_card then 'OK' else 'NOT OK' end,
    v_thread, case when v_thread >= 1 then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
