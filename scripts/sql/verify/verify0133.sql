-- VERIFICATION for 0133_shop.sql
-- Paste into the Supabase SQL editor right after 0133. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "write policies on the shop" must be 0: products, sales and stock change only
-- through save_product / move_stock / record_sale / void_sale, which check who
-- is asking. "stock guard" must be 1: the number follows its moves.
do $$
declare v_write int; v_tbls int; v_guard int; v_apply int;
begin
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('shop_products', 'shop_sales', 'shop_sale_items', 'stock_moves')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*) into v_tbls from pg_tables where schemaname = 'public'
     and tablename in ('shop_products', 'shop_sales', 'shop_sale_items', 'stock_moves');
  select count(*) into v_guard from pg_trigger where tgname = 'stock_guard';
  select count(*) into v_apply from pg_trigger where tgname = 'stock_move_apply';
  raise exception 'REPORT 0133: write policies on the shop=% % | tables=% of 4 % | stock guard=% % | stock follows moves=% %',
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_tbls, case when v_tbls = 4 then 'OK' else 'NOT OK' end,
    v_guard, case when v_guard = 1 then 'OK' else 'NOT OK' end,
    v_apply, case when v_apply = 1 then 'OK' else 'NOT OK' end;
end $$;
