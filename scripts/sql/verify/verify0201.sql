-- VERIFICATION for 0201 (the walk-in history)
-- Paste into the Supabase SQL editor right after 0201. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean;
begin
  select position('Type the guest''s name' in pg_get_functiondef('record_guest_visit(uuid, text, text, text, text)'::regprocedure)) > 0 into a;
  select to_regprocedure('guest_visits_between(date, date)') is not null into b;
  select not has_function_privilege('anon', 'guest_visits_between(date, date)', 'execute') into c;
  select coalesce((select migration_0201_applied()), false) into d;
  raise exception 'REPORT 0201: name still required=% | history function=% | closed to visitors=% | marker=%', a, b, c, d;
end
$$;
