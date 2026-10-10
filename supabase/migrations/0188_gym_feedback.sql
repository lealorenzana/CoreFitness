-- ============================================================================
-- 0188 — Gyms tell Core Fitness what they think
-- ============================================================================
--
-- E3. Four ways, from the admin app:
--   * RATE CORE FITNESS — 1 to 5 stars and a comment, any time; the newest
--     rating is the gym's current one, the older ones stay as history.
--   * FEATURE REQUESTS — the platform sets each one Planned / Done / Not now
--     (with a note), and the gym sees its own requests and their status.
--   * BUG REPORTS — a support ticket (0137) marked as a bug, with an optional
--     screenshot in a private bucket (a screen can show member data, so the
--     file is readable only by that gym's owner/desk and the platform).
--   * A TESTIMONIAL — opt-in words the platform approves before the website
--     shows them (public_testimonials(), anon); the owner can take theirs down
--     at any time, and it disappears at once.
--
-- Every table has RLS on and NO policy: definer functions only, as 0137.
-- ============================================================================

-- ---- ratings ---------------------------------------------------------------------------------------------
create table if not exists platform_ratings (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  rated_by   uuid references profiles(id) on delete set null default auth.uid(),
  stars      int not null check (stars between 1 and 5),
  comment    text check (length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_ratings_gym on platform_ratings(gym_id, created_at desc);
alter table platform_ratings enable row level security;

create or replace function rate_core_fitness(p_stars int, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'admin' then
    raise exception 'The gym''s owner rates Core Fitness.' using errcode = '42501';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'Pick 1 to 5 stars.'; end if;
  insert into platform_ratings (gym_id, stars, comment) values (current_gym_id(), p_stars, nullif(btrim(p_comment), ''));
  perform platform_log(current_gym_id(), 'feedback.rating',
    (select name from gyms where id = current_gym_id()) || ' rated Core Fitness ' || p_stars || '/5',
    jsonb_build_object('stars', p_stars));
end;
$$;
revoke all on function rate_core_fitness(int, text) from public, anon;
grant execute on function rate_core_fitness(int, text) to authenticated;

create or replace function my_platform_rating() returns table (stars int, comment text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.stars, r.comment, r.created_at from platform_ratings r
   where r.gym_id = current_gym_id() and storage_role_here() = 'admin'
   order by r.created_at desc limit 1;
$$;
revoke all on function my_platform_rating() from public, anon;
grant execute on function my_platform_rating() to authenticated;

-- ---- feature requests ------------------------------------------------------------------------------------
create table if not exists feature_requests (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  author_id     uuid references profiles(id) on delete set null default auth.uid(),
  title         text not null check (length(btrim(title)) between 3 and 120),
  body          text check (length(body) <= 2000),
  status        text not null default 'open' check (status in ('open', 'planned', 'done', 'not_now')),
  platform_note text check (length(platform_note) <= 1000),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists idx_feature_requests_gym on feature_requests(gym_id, created_at desc);
alter table feature_requests enable row level security;

create or replace function submit_feature_request(p_title text, p_body text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'The owner or the front desk sends ideas to Core Fitness.' using errcode = '42501';
  end if;
  if (select count(*) from feature_requests where gym_id = current_gym_id() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That is plenty of ideas for one day — thank you. Send more tomorrow.';
  end if;
  insert into feature_requests (gym_id, title, body) values (current_gym_id(), btrim(p_title), nullif(btrim(p_body), ''))
  returning id into v_id;
  perform platform_log(current_gym_id(), 'feedback.idea',
    (select name from gyms where id = current_gym_id()) || ' asked for: ' || left(btrim(p_title), 100),
    jsonb_build_object('request', v_id));
  return v_id;
end;
$$;
revoke all on function submit_feature_request(text, text) from public, anon;
grant execute on function submit_feature_request(text, text) to authenticated;

create or replace function my_feature_requests()
returns table (id uuid, title text, body text, status text, platform_note text, created_at timestamptz, decided_at timestamptz, author_name text)
language sql stable security definer set search_path = public as $$
  select f.id, f.title, f.body, f.status, f.platform_note, f.created_at, f.decided_at,
         (select nullif(trim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = f.author_id)
    from feature_requests f
   where f.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')
   order by f.created_at desc;
$$;
revoke all on function my_feature_requests() from public, anon;
grant execute on function my_feature_requests() to authenticated;

create or replace function platform_set_feature_request(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f feature_requests;
begin
  if not is_platform_admin() then raise exception 'Only the platform answers ideas.' using errcode = '42501'; end if;
  if p_status not in ('open', 'planned', 'done', 'not_now') then raise exception 'Unknown status.'; end if;
  update feature_requests
     set status = p_status, platform_note = nullif(btrim(p_note), ''),
         decided_at = case when p_status = 'open' then null else now() end
   where id = p_id returning * into f;
  if f.id is null then raise exception 'That idea does not exist.'; end if;
  if f.author_id is not null and p_status <> 'open' then
    perform act_as_gym(f.gym_id);
    perform notify_once(f.author_id, 'system',
      case p_status when 'planned' then 'Core Fitness is planning your idea'
                    when 'done' then 'Your idea is in Core Fitness'
                    else 'About your idea' end,
      left(f.title, 80) || coalesce(': ' || left(btrim(p_note), 120), ''),
      '/feedback', 'idea-' || f.id || '-' || p_status, f.gym_id);
    perform act_as_gym(null);
  end if;
end;
$$;
revoke all on function platform_set_feature_request(uuid, text, text) from public, anon;
grant execute on function platform_set_feature_request(uuid, text, text) to authenticated;

-- ---- bug reports: a ticket, marked, with a screenshot -------------------------------------------------------
alter table support_tickets add column if not exists kind text not null default 'help' check (kind in ('help', 'bug'));
alter table support_tickets add column if not exists screenshot text check (length(screenshot) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- support/<gym id>/<file>: that gym's owner or desk writes and reads; the platform reads.
drop policy if exists support_files_insert on storage.objects;
drop policy if exists support_files_read   on storage.objects;
create policy support_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support'
              and split_part(name, '/', 1) = public.current_gym_id()::text
              and coalesce(public.storage_role_here(), '') in ('admin', 'staff'));
create policy support_files_read on storage.objects for select to authenticated
  using (bucket_id = 'support'
         and (public.is_platform_admin()
              or (split_part(name, '/', 1) = public.current_gym_id()::text
                  and coalesce(public.storage_role_here(), '') in ('admin', 'staff'))));

create or replace function report_bug(p_title text, p_body text, p_screenshot text default null, p_context jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_screenshot is not null and split_part(p_screenshot, '/', 1) <> current_gym_id()::text then
    raise exception 'That screenshot is not in your gym''s folder.';
  end if;
  v_id := open_support_ticket(left(btrim(p_title), 120), p_body);
  update support_tickets
     set kind = 'bug', screenshot = p_screenshot,
         context = case when p_context is null then null else jsonb_strip_nulls(jsonb_build_object(
           'route', left(p_context ->> 'route', 300), 'build', left(p_context ->> 'build', 80),
           'user_agent', left(p_context ->> 'user_agent', 300), 'at', now())) end
   where id = v_id;
  return v_id;
end;
$$;
revoke all on function report_bug(text, text, text, jsonb) from public, anon;
grant execute on function report_bug(text, text, text, jsonb) to authenticated;

/** Kind and screenshot of tickets — for both sides' lists, without redefining 0137's readers. */
create or replace function ticket_extras(p_ids uuid[]) returns table (id uuid, kind text, screenshot text)
language sql stable security definer set search_path = public as $$
  select t.id, t.kind, t.screenshot from support_tickets t
   where t.id = any(p_ids)
     and (is_platform_admin() or (t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')));
$$;
revoke all on function ticket_extras(uuid[]) from public, anon;
grant execute on function ticket_extras(uuid[]) to authenticated;

-- ---- testimonials ---------------------------------------------------------------------------------------------
create table if not exists testimonials (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null default auth.uid(),
  quote       text not null check (length(btrim(quote)) between 20 and 400),
  shown_name  text not null check (length(btrim(shown_name)) between 2 and 80),
  shown_role  text check (length(shown_role) <= 80),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists idx_testimonials_status on testimonials(status, decided_at desc);
alter table testimonials enable row level security;

create or replace function submit_testimonial(p_quote text, p_name text, p_role text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if storage_role_here() is distinct from 'admin' then
    raise exception 'The gym''s owner writes its testimonial.' using errcode = '42501';
  end if;
  -- One live testimonial a gym: a new one replaces the old (it leaves the
  -- website until Core Fitness approves the new words).
  update testimonials set status = 'withdrawn', decided_at = now()
   where gym_id = current_gym_id() and status in ('pending', 'approved');
  insert into testimonials (gym_id, quote, shown_name, shown_role)
  values (current_gym_id(), btrim(p_quote), btrim(p_name), nullif(btrim(p_role), ''))
  returning id into v_id;
  perform platform_log(current_gym_id(), 'feedback.testimonial',
    (select name from gyms where id = current_gym_id()) || ' sent a testimonial', jsonb_build_object('testimonial', v_id));
  return v_id;
end;
$$;
revoke all on function submit_testimonial(text, text, text) from public, anon;
grant execute on function submit_testimonial(text, text, text) to authenticated;

create or replace function my_testimonials()
returns table (id uuid, quote text, shown_name text, shown_role text, status text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.quote, t.shown_name, t.shown_role, t.status, t.created_at, t.decided_at from testimonials t
   where t.gym_id = current_gym_id() and storage_role_here() = 'admin'
   order by t.created_at desc;
$$;
revoke all on function my_testimonials() from public, anon;
grant execute on function my_testimonials() to authenticated;

-- The owner takes theirs down — approved or not — and it leaves the website at once.
create or replace function withdraw_testimonial(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'admin' then
    raise exception 'The gym''s owner manages its testimonial.' using errcode = '42501';
  end if;
  update testimonials set status = 'withdrawn', decided_at = now()
   where id = p_id and gym_id = current_gym_id() and status in ('pending', 'approved');
  if not found then raise exception 'That testimonial is not live.'; end if;
end;
$$;
revoke all on function withdraw_testimonial(uuid) from public, anon;
grant execute on function withdraw_testimonial(uuid) to authenticated;

create or replace function platform_set_testimonial(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform approves testimonials.' using errcode = '42501'; end if;
  update testimonials set status = case when p_approve then 'approved' else 'declined' end, decided_at = now()
   where id = p_id and status in ('pending', 'approved');
  if not found then raise exception 'That testimonial was taken down by its gym.'; end if;
end;
$$;
revoke all on function platform_set_testimonial(uuid, boolean) from public, anon;
grant execute on function platform_set_testimonial(uuid, boolean) to authenticated;

/** What the website shows: approved testimonials from gyms still on the service. */
create or replace function public_testimonials()
returns table (id uuid, quote text, shown_name text, shown_role text, gym_name text, logo_url text)
language sql stable security definer set search_path = public as $$
  select t.id, t.quote, t.shown_name, t.shown_role, g.name,
         (select s.logo_url from gym_settings s where s.gym_id = g.id)
    from testimonials t join gyms g on g.id = t.gym_id and g.status = 'active'
   where t.status = 'approved'
   order by t.decided_at desc
   limit 12;
$$;
revoke all on function public_testimonials() from public;
grant execute on function public_testimonials() to anon, authenticated;

-- ---- the platform's view --------------------------------------------------------------------------------------
create or replace function platform_feedback() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_platform_admin() then jsonb_build_object(
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('gym_id', r.gym_id, 'gym_name', g.name, 'stars', r.stars, 'comment', r.comment,
                          'created_at', r.created_at, 'current', r.created_at = (select max(x.created_at) from platform_ratings x where x.gym_id = r.gym_id))
                          order by r.created_at desc)
                         from platform_ratings r join gyms g on g.id = r.gym_id), '[]'::jsonb),
    'average', (select round(avg(c.stars)::numeric, 2) from (select distinct on (gym_id) stars from platform_ratings order by gym_id, created_at desc) c),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'gym_id', f.gym_id, 'gym_name', g.name, 'title', f.title, 'body', f.body,
                        'status', f.status, 'platform_note', f.platform_note, 'created_at', f.created_at, 'decided_at', f.decided_at)
                        order by (f.status = 'open') desc, f.created_at desc)
                       from feature_requests f join gyms g on g.id = f.gym_id), '[]'::jsonb),
    'testimonials', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'gym_name', g.name, 'quote', t.quote, 'shown_name', t.shown_name,
                        'shown_role', t.shown_role, 'status', t.status, 'created_at', t.created_at, 'decided_at', t.decided_at)
                        order by (t.status = 'pending') desc, t.created_at desc)
                       from testimonials t join gyms g on g.id = t.gym_id where t.status <> 'withdrawn'), '[]'::jsonb)) end;
$$;
revoke all on function platform_feedback() from public, anon;
grant execute on function platform_feedback() to authenticated;

create or replace function migration_0188_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0188_applied() from public, anon;
grant execute on function migration_0188_applied() to authenticated;
comment on function migration_0188_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0188.sql
