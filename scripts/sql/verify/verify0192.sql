-- VERIFICATION for 0192 (PayMongo part 2a: members pay their gym; gyms and coaches connect their own accounts)
-- Paste into the Supabase SQL editor right after 0192. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select relrowsecurity from pg_class where relname = 'payment_accounts' into c1;
  c2 := not has_function_privilege('authenticated', 'payment_account_secret(uuid)', 'execute')
        and has_function_privilege('service_role', 'payment_account_secret(uuid)', 'execute');
  select exists (select 1 from pg_namespace where nspname = 'vault') into c3;
  select exists (select 1 from pg_proc where proname = 'paymongo_settle' and prosrc like '%coaching_activate%') into c4;
  select coalesce((select migration_0192_applied()), false) into c5;
  raise exception 'REPORT 0192: accounts RLS=% | keys readable only by the service role=% | Supabase Vault present=% | settle covers renewals and coaching=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
