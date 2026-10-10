-- ============================================================================
-- 0183 — The platform fills the map's cache of OpenStreetMap gyms
-- ============================================================================
--
-- 0182's osm-gyms Edge Function was to refresh osm_gyms itself. On the day it
-- shipped, overpass-api.de answered 406 to every request from Supabase's edge
-- servers (the User-Agent arrives, with "SupabaseEdgeRuntime" appended) and
-- the public mirrors were down — while the same request from an ordinary
-- browser succeeds. So the platform app fetches OpenStreetMap from the
-- platform owner's browser ("Refresh map data", around every pinned gym) and
-- stores each area here.
--
-- Only the platform may write: a gym on the map that is not there would send
-- members to a field. Members still read only the cache, through the Edge
-- Function — OpenStreetMap is never asked once per member.
-- ============================================================================

create or replace function platform_store_osm_tile(p_tile text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform refreshes map data.' using errcode = '42501';
  end if;
  if p_tile !~ '^-?[0-9]{1,2}\.[0-9]{2}:-?[0-9]{1,3}\.[0-9]{2}$' then
    raise exception 'That is not a map area.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send up to 500 gyms for one area.';
  end if;
  delete from osm_gyms where tile = p_tile;
  insert into osm_gyms (osm_id, name, latitude, longitude, address, tile, fetched_at)
  select left(r->>'osm_id', 40), left(nullif(btrim(r->>'name'), ''), 120),
         (r->>'latitude')::numeric(9,6), (r->>'longitude')::numeric(9,6),
         left(nullif(btrim(r->>'address'), ''), 200), p_tile, now()
    from jsonb_array_elements(p_rows) r
   where r->>'osm_id' ~ '^(node|way|relation)/[0-9]+$'
     and (r->>'latitude')::numeric between -90 and 90 and (r->>'longitude')::numeric between -180 and 180
  on conflict (osm_id) do update
     set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude,
         address = excluded.address, tile = excluded.tile, fetched_at = excluded.fetched_at;
  get diagnostics n = row_count;
  insert into osm_tiles (tile, fetched_at, count) values (p_tile, now(), n)
  on conflict (tile) do update set fetched_at = now(), count = excluded.count;
  return n;
end;
$$;
revoke all on function platform_store_osm_tile(text, jsonb) from public, anon;
grant execute on function platform_store_osm_tile(text, jsonb) to authenticated;

-- Where gyms are pinned, so the platform knows which areas to refresh.
create or replace function platform_pinned_gyms() returns table (id uuid, name text, latitude numeric, longitude numeric)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.latitude, g.longitude from gyms g
   where is_platform_admin() and g.latitude is not null and g.status = 'active'
   order by g.name;
$$;
revoke all on function platform_pinned_gyms() from public, anon;
grant execute on function platform_pinned_gyms() to authenticated;

create or replace function migration_0183_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0183_applied() from public, anon;
grant execute on function migration_0183_applied() to authenticated;
comment on function migration_0183_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0183.sql
