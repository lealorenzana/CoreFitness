-- VERIFICATION for 0181 (coaching: ways in, terms, stand-ins, who is paid)
-- Paste into the Supabase SQL editor right after 0181. Read-only; the error is the report.
do $$
declare c1 int; c2 boolean; c3 boolean; c4 boolean; v text;
begin
  select count(*) into c1 from information_schema.tables where table_name in ('coachings', 'coaching_standins', 'coaching_prices', 'trainer_payment_methods');
  c2 := has_function_privilege('authenticated', 'request_coaching(uuid, text, integer, text)', 'execute');
  c3 := not has_function_privilege('authenticated', 'coaching_activate(uuid)', 'execute');
  select coalesce((select migration_0181_applied()), false) into c4;
  select string_agg(distinct coaching_fee_mode || ' ' || array_to_string(coaching_modes, '+'), ', ') into v from gym_settings;
  raise exception 'REPORT 0181: tables=% (want 4) | request=% | activate hidden=% | marker=% | gyms: %', c1, c2, c3, c4, v;
end
$$;
