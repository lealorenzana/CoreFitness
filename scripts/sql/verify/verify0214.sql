-- VERIFICATION for 0214 (the ready-made pairs' colour codes are free)
-- Paste into the Supabase SQL editor right after 0214. Read-only; the error is the report.
do $$
declare a int; b boolean; c boolean;
begin
  select coalesce(array_length(free_pair_colours(), 1), 0) into a;
  select position('free_pair_colours' in pg_get_functiondef('trg_custom_colours_paid()'::regprocedure)) > 0 into b;
  select coalesce((select migration_0214_applied()), false) into c;
  raise exception 'REPORT 0214: free pair codes=% (expect 29) | the paywall trigger reads them=% | marker=%', a, b, c;
end
$$;
