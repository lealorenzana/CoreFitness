-- VERIFICATION for 0191 (PayMongo, part 1: a gym pays Core Fitness online)
-- Paste into the Supabase SQL editor right after 0191. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select count(*) = 2 from pg_class where relname in ('paymongo_checkouts', 'gym_theme_unlocks') and relrowsecurity into c1;
  c2 := not has_function_privilege('authenticated', 'paymongo_settle(text, text, int, text)', 'execute')
        and has_function_privilege('service_role', 'paymongo_settle(text, text, int, text)', 'execute');
  select exists (select 1 from pg_trigger where tgname = 'a_custom_colours_paid') into c3;
  select not exists (select 1 from gym_settings s where (s.accent ~ '^#' or coalesce(s.accent_action, '') ~ '^#')
                       and not exists (select 1 from gym_theme_unlocks u where u.gym_id = s.gym_id)) into c4;
  select coalesce((select migration_0191_applied()), false) into c5;
  raise exception 'REPORT 0191: tables with RLS=% | settle is service-only=% | colour codes need the unlock=% | gyms on their own code kept it=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
