-- VERIFICATION for 0204 (the desk books a member into a class)
-- Paste into the Supabase SQL editor right after 0204. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean;
begin
  select to_regprocedure('desk_book_class(uuid, uuid)') is not null into a;
  select not has_function_privilege('anon', 'desk_book_class(uuid, uuid)', 'execute') into b;
  select position('never held to the member''s own paperwork' in pg_get_functiondef('waiver_blocks(uuid, uuid)'::regprocedure)) > 0 into c;
  select coalesce((select migration_0204_applied()), false) into d;
  raise exception 'REPORT 0204: desk_book_class=% | closed to visitors=% | waiver steps aside for the desk=% | marker=%', a, b, c, d;
end
$$;
