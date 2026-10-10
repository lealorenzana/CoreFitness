-- ============================================================================
-- 0182 — Finding a gym: where each gym is, a list by distance, a map
-- ============================================================================
--
-- Sign-up used to start at a name search over "open" gyms only. Now:
--   * the owner pins the gym (gyms.latitude/longitude, set_gym_location());
--   * gym_finder() lists every active gym with how it is joined, so each row
--     says what to do — Join (listed), Have a code? (code only), Directions
--     (front desk only) — and the screen sorts by distance on the device;
--   * other gyms come from OpenStreetMap (leisure=fitness_centre), fetched
--     server-side by the osm-gyms Edge Function a tile at a time and cached
--     here (osm_gyms / osm_tiles) — never per user — so a member can see a gym
--     that is not on Core Fitness yet and suggest it (suggest_gym());
--   * the member's own location is used on the device and never sent here.
--
-- A front-desk-only gym is shown with Directions only: 0179 still refuses any
-- sign-up into it that a member's invite did not bring.
-- ============================================================================

alter table gyms add column if not exists latitude numeric(9,6);
alter table gyms add column if not exists longitude numeric(9,6);
alter table gyms drop constraint if exists gyms_location_check;
alter table gyms add constraint gyms_location_check check (
  (latitude is null) = (longitude is null)
  and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)));

-- The owner pins the gym. NULL, NULL takes the pin away.
create or replace function set_gym_location(p_lat numeric, p_lng numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner places the gym on the map.' using errcode = '42501';
  end if;
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'That is not a place on the map.';
  end if;
  update gyms set latitude = p_lat, longitude = p_lng where id = acting_gym_id();
end;
$$;
revoke all on function set_gym_location(numeric, numeric) from public, anon;
grant execute on function set_gym_location(numeric, numeric) to authenticated;

-- Every active gym, how it is joined, and where it is. Never the join code.
create or replace function gym_finder(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, tagline text,
               join_policy text, latitude numeric, longitude numeric, address text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         nullif(btrim(coalesce(s.tagline, '')), ''),
         coalesce(s.join_policy, 'open'), g.latitude, g.longitude, nullif(btrim(coalesce(s.address, '')), '')
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.status = 'active'
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or g.name ilike '%' || btrim(p_search) || '%' or g.slug ilike '%' || btrim(p_search) || '%'
          or coalesce(s.address, '') ilike '%' || btrim(p_search) || '%')
   order by g.name
   limit 300;
$$;
revoke all on function gym_finder(text) from public;
grant execute on function gym_finder(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- OpenStreetMap's gyms, cached by tile (written only by the Edge Function,
-- with the service role; read by anyone).
-- ---------------------------------------------------------------------------
create table if not exists osm_gyms (
  osm_id     text primary key,          -- 'node/123', 'way/456'
  name       text,
  latitude   numeric(9,6) not null,
  longitude  numeric(9,6) not null,
  address    text,
  tile       text not null,
  fetched_at timestamptz not null default now()
);
create index if not exists osm_gyms_tile_idx on osm_gyms (tile);
create table if not exists osm_tiles (
  tile       text primary key,          -- '13.25:121.00' — 0.25° squares
  fetched_at timestamptz not null default now(),
  count      int not null default 0
);
alter table osm_gyms enable row level security;
alter table osm_tiles enable row level security;
drop policy if exists osm_gyms_read on osm_gyms;
create policy osm_gyms_read on osm_gyms for select to anon, authenticated using (true);
drop policy if exists osm_tiles_read on osm_tiles;
create policy osm_tiles_read on osm_tiles for select to anon, authenticated using (true);
grant select on osm_gyms, osm_tiles to anon, authenticated;

-- "This gym is not on Core Fitness — suggest it." Anyone may; the platform reads.
create table if not exists gym_suggestions (
  id           uuid primary key default gen_random_uuid(),
  osm_id       text,
  name         text not null check (length(btrim(name)) between 1 and 120),
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  note         text check (note is null or length(note) <= 500),
  suggested_by uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists gym_suggestions_once on gym_suggestions (osm_id, coalesce(suggested_by, '00000000-0000-0000-0000-000000000000'::uuid))
  where osm_id is not null;
alter table gym_suggestions enable row level security;   -- no policy: the functions below are the doors

create or replace function suggest_gym(p_osm_id text, p_name text, p_lat numeric, p_lng numeric, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'Say which gym.'; end if;
  -- A busy anonymous door: at most 20 suggestions an hour from everyone signed out.
  if auth.uid() is null and (select count(*) from gym_suggestions where suggested_by is null and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many suggestions just now. Try again later.';
  end if;
  insert into gym_suggestions (osm_id, name, latitude, longitude, note, suggested_by)
  values (nullif(btrim(coalesce(p_osm_id, '')), ''), left(btrim(p_name), 120), p_lat, p_lng, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict do nothing;
end;
$$;
revoke all on function suggest_gym(text, text, numeric, numeric, text) from public;
grant execute on function suggest_gym(text, text, numeric, numeric, text) to anon, authenticated;

-- The platform's list: each suggested gym once, with how many asked.
create or replace function platform_gym_suggestions()
returns table (osm_id text, name text, latitude numeric, longitude numeric, asks int, last_at timestamptz, notes text[])
language sql stable security definer set search_path = public as $$
  select osm_id, max(name), max(latitude), max(longitude), count(*)::int, max(created_at),
         array_remove(array_agg(note order by created_at desc), null)
    from gym_suggestions
   where is_platform_admin()
   group by coalesce(osm_id, id::text), osm_id
   order by count(*) desc, max(created_at) desc
   limit 200;
$$;
revoke all on function platform_gym_suggestions() from public, anon;
grant execute on function platform_gym_suggestions() to authenticated;

create or replace function migration_0182_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0182_applied() from public, anon;
grant execute on function migration_0182_applied() to authenticated;
comment on function migration_0182_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0182.sql
