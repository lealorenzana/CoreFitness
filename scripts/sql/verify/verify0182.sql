-- VERIFICATION for 0182 (gym location, finder, OpenStreetMap cache, suggestions)
-- Paste into the Supabase SQL editor right after 0182. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 int; c4 boolean; n int;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gyms' and column_name = 'latitude') into c1;
  c2 := has_function_privilege('anon', 'gym_finder(text)', 'execute');
  select count(*) into c3 from information_schema.tables where table_name in ('osm_gyms', 'osm_tiles', 'gym_suggestions');
  select coalesce((select migration_0182_applied()), false) into c4;
  select count(*) into n from gyms where latitude is not null;
  raise exception 'REPORT 0182: location=% | finder for signed-out=% | tables=% (want 3) | marker=% | gyms pinned so far: %', c1, c2, c3, c4, n;
end
$$;
