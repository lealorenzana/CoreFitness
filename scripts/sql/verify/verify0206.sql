-- VERIFICATION for 0206 (achievement points, secret, tell the member, who qualifies)
-- Paste into the Supabase SQL editor right after 0206. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean; f boolean;
begin
  select count(*) = 3 from information_schema.columns
   where table_name = 'achievements' and column_name in ('points', 'secret', 'tell_member') into a;
  select exists (select 1 from pg_trigger where tgname = 'achievement_unlocked' and not tgisinternal) into b;
  select not exists (select 1 from gyms g where not exists (select 1 from point_rules r where r.gym_id = g.id and r.key = 'achievement')) into c;
  select to_regprocedure('achievement_qualifiers(text, text, numeric, text, numeric)') is not null into d;
  select not has_function_privilege('anon', 'achievement_qualifiers(text, text, numeric, text, numeric)', 'execute') into e;
  select coalesce((select migration_0206_applied()), false) into f;
  raise exception 'REPORT 0206: three columns=% | unlock trigger=% | every gym has the rule=% | qualifiers=% | closed to visitors=% | marker=%', a, b, c, d, e, f;
end
$$;
