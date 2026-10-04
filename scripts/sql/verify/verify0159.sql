-- VERIFICATION for 0159_rewards_earning_season.sql
-- Paste into the Supabase SQL editor right after 0159. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rules int; v_on int; v_shop boolean; v_pay boolean; v_over boolean; v_anon boolean; v_marker boolean;
begin
  select count(*) into v_rules from point_rules where key in ('shop_purchase', 'membership_paid');
  select count(*) into v_on from point_rules where key in ('shop_purchase', 'membership_paid') and is_active;
  select exists (select 1 from pg_trigger where tgname = 'shop_sales_points' and not tgisinternal) into v_shop;
  select exists (select 1 from pg_trigger where tgname = 'payments_points' and not tgisinternal) into v_pay;
  select has_function_privilege('authenticated', 'season_overview()', 'execute') into v_over;
  select has_function_privilege('anon', 'season_overview()', 'execute') into v_anon;
  select coalesce((select migration_0159_applied()), false) into v_marker;
  raise exception 'REPORT 0159: new rules=% (2 per gym) | switched on=% % | shop trigger=% % | payment trigger=% % | overview callable=% % | anon=% % | marker=% %',
    v_rules,
    v_on, case when v_on = 0 then 'OK (they ship off)' else 'CHECK — someone turned one on' end,
    v_shop, case when v_shop then 'OK' else 'NOT OK - STOP' end,
    v_pay, case when v_pay then 'OK' else 'NOT OK - STOP' end,
    v_over, case when v_over then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
