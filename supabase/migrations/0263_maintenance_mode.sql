-- ============================================================================
-- 0263 — Maintenance mode (the owner, 2026-11-22)
-- ============================================================================
--
-- One switch on the platform's Platform page: while it is on, the admin app and
-- the member app (members and coaches) show a full-screen notice with the
-- platform's message instead of their screens, for an update or an outage. A
-- platform admin is never shut out (the read says "off" to them).
--
-- The switch is a single row: a row means on, no row means off. The apps treat a
-- missing function (before this is pasted) as off, so they are safe to deploy first.
-- Every change is written to the platform's activity (platform_log).
-- ============================================================================

create table if not exists platform_maintenance (
  id          boolean primary key default true check (id),
  message     text not null check (length(btrim(message)) between 3 and 400),
  started_at  timestamptz not null default now(),
  started_by  uuid references profiles(id) on delete set null
);
alter table platform_maintenance enable row level security;
-- No policies: read through platform_maintenance_state(), written through set_platform_maintenance().

-- Everyone's read, signed in or not (the sign-in screens show it too). Off for a platform admin.
create or replace function platform_maintenance_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when m.id is null or (auth.uid() is not null and is_platform_admin()) then jsonb_build_object('on', false)
    else jsonb_build_object('on', true, 'message', m.message, 'since', m.started_at) end
    from (select 1) one left join platform_maintenance m on true;
$$;
revoke execute on function platform_maintenance_state() from public;
grant execute on function platform_maintenance_state() to anon, authenticated;

-- The platform's view: the switch as it is, even for an admin.
create or replace function platform_maintenance_admin() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_platform_admin() then null
    when m.id is null then jsonb_build_object('on', false)
    else jsonb_build_object('on', true, 'message', m.message, 'since', m.started_at) end
    from (select 1) one left join platform_maintenance m on true;
$$;
revoke execute on function platform_maintenance_admin() from public, anon;
grant execute on function platform_maintenance_admin() to authenticated;

-- Turn it on with a message, change the message, or turn it off with an empty one.
create or replace function set_platform_maintenance(p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_message, ''));
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can turn maintenance mode on or off.'; end if;
  if v = '' then
    delete from platform_maintenance where id;
    perform platform_log(null, 'maintenance.off', 'Maintenance mode was turned off', null);
  else
    if length(v) < 3 or length(v) > 400 then raise exception 'Write a message of 3 to 400 characters.'; end if;
    insert into platform_maintenance (id, message, started_by) values (true, v, auth.uid())
      on conflict (id) do update set message = excluded.message;
    perform platform_log(null, 'maintenance.on', 'Maintenance mode: ' || v, jsonb_build_object('message', v));
  end if;
end;
$$;
revoke execute on function set_platform_maintenance(text) from public, anon;
grant execute on function set_platform_maintenance(text) to authenticated;

create or replace function migration_0263_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0263_applied() to anon, authenticated;
