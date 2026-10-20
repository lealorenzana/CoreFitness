-- VERIFICATION for 0202 (an invitation is a login)
-- Paste into the Supabase SQL editor right after 0202. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean;
begin
  select to_regprocedure('complete_invitation(text, text, text, text, date, text, text, text, text, text, text, text, text, text, integer, text)') is not null into a;
  select to_regprocedure('my_invitation(text)') is not null into b;
  select not has_function_privilege('anon', 'complete_invitation(text, text, text, text, date, text, text, text, text, text, text, text, text, text, integer, text)', 'execute')
     and not has_function_privilege('anon', 'my_invitation(text)', 'execute') into c;
  select position('grant_free_membership' in pg_get_functiondef('complete_invitation(text, text, text, text, date, text, text, text, text, text, text, text, text, text, integer, text)'::regprocedure)) > 0 into d;
  select coalesce((select migration_0202_applied()), false) into e;
  raise exception 'REPORT 0202: complete_invitation=% | my_invitation=% | closed to visitors=% | invited member gets the free tier=% | marker=%', a, b, c, d, e;
end
$$;
