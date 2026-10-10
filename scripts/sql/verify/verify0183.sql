-- VERIFICATION for 0183 (the platform fills the OpenStreetMap cache)
-- Paste into the Supabase SQL editor right after 0183. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean;
begin
  c1 := has_function_privilege('authenticated', 'platform_store_osm_tile(text, jsonb)', 'execute');
  c2 := not has_function_privilege('anon', 'platform_store_osm_tile(text, jsonb)', 'execute');
  select coalesce((select migration_0183_applied()), false) into c3;
  raise exception 'REPORT 0183: store for platform=% | not for signed-out=% | marker=%', c1, c2, c3;
end
$$;
