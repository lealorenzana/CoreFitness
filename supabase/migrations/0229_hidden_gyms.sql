-- 0229 — a gym can be hidden from the gym lists (Part G: a second private test gym).
--
-- Gym #1 (Core Fitness Lab) was kept out of the website's list and the member
-- app's Find your gym only because it is gym_one(). A second test gym — to try
-- switching gyms with — needs the same privacy, so a gym can now be HIDDEN:
-- left out of list_gyms() and gym_finder(), and nothing else changes. It is
-- still reached by its own link or its join code, which is how its testers get
-- in. Both functions are redefined in full with that one condition added.
-- Safe to paste again.

alter table gyms add column if not exists hidden boolean not null default false;
update gyms set hidden = true where id = gym_one() and not hidden;

create or replace function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, accent_action text, tagline text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         nullif(btrim(coalesce(s.tagline, '')), '')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and g.id <> gym_one()
    and not g.hidden
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;

create or replace function gym_finder(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, tagline text, join_policy text,
               latitude numeric, longitude numeric, address text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         nullif(btrim(coalesce(s.tagline, '')), ''),
         coalesce(s.join_policy, 'open'), g.latitude, g.longitude, nullif(btrim(coalesce(s.address, '')), '')
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.status = 'active'
     and g.id <> gym_one()
     and not g.hidden
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or g.name ilike '%' || btrim(p_search) || '%' or g.slug ilike '%' || btrim(p_search) || '%'
          or coalesce(s.address, '') ilike '%' || btrim(p_search) || '%')
   order by g.name
   limit 300;
$$;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0229_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0229_applied() to anon, authenticated;
