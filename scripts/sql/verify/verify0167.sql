-- VERIFICATION for 0167 (members pay by GCash, Maya or bank)
-- Paste into the Supabase SQL editor right after 0167. Read-only; the error is the report.
-- feature should be true, table true, columns 7, functions true, marker true.
do $$
declare c1 boolean; c2 boolean; n int; c3 boolean; c4 boolean;
begin
  select exists (select 1 from platform_features where key = 'online_pay' and parent_key = 'front_desk') into c1;
  select to_regclass('public.gym_payment_methods') is not null into c2;
  select count(*) into n from information_schema.columns
   where table_name = 'renewal_requests' and column_name in ('pay_method_id','pay_method_label','pay_kind','pay_reference','pay_proof','pay_amount','paid_on');
  c3 := has_function_privilege('authenticated', 'request_renewal_paid(uuid, uuid, text, text, date)', 'execute')
        and not has_function_privilege('anon', 'request_renewal_paid(uuid, uuid, text, text, date)', 'execute');
  select coalesce((select migration_0167_applied()), false) into c4;
  raise exception 'REPORT 0167: feature=% | table=% | columns=% | functions=% | marker=%', c1, c2, n, c3, c4;
end
$$;
