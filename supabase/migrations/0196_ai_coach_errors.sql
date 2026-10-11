-- ============================================================================
-- 0196 — Why the AI coach failed, written down
-- ============================================================================
--
-- When the model call fails, ai-coach only logged it to the Edge Function's
-- console, which nobody reads — the coach failed for a day as "busy" with the
-- reason sitting in a log. Each failure now leaves a row: the HTTP status and
-- the API's own error text (which never carries the key or the member's words;
-- it is trimmed to 400 characters anyway). RLS on, no policy: the function
-- writes through ai_log_error() (service role only), the platform reads through
-- platform_ai_errors(). Kept for 30 days.
-- ============================================================================

create table if not exists ai_coach_errors (
  id       uuid primary key default gen_random_uuid(),
  gym_id   uuid references gyms(id) on delete cascade,
  at       timestamptz not null default now(),
  status   int,
  message  text
);
alter table ai_coach_errors enable row level security;   -- no policy

create or replace function ai_log_error(p_gym uuid, p_status int, p_message text) returns void
language sql security definer set search_path = public as $$
  delete from ai_coach_errors where at < now() - interval '30 days';
  insert into ai_coach_errors (gym_id, status, message) values (p_gym, p_status, left(coalesce(p_message, ''), 400));
$$;
revoke all on function ai_log_error(uuid, int, text) from public, anon, authenticated;
grant execute on function ai_log_error(uuid, int, text) to service_role;

create or replace function platform_ai_errors(p_limit int default 50)
returns table (at timestamptz, gym_name text, status int, message text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Platform only.' using errcode = '42501'; end if;
  return query
    select e.at, g.name, e.status, e.message from ai_coach_errors e left join gyms g on g.id = e.gym_id
     order by e.at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function platform_ai_errors(int) from public, anon;
grant execute on function platform_ai_errors(int) to authenticated;

create or replace function migration_0196_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0196_applied() from public, anon;
grant execute on function migration_0196_applied() to authenticated;
comment on function migration_0196_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0196.sql
