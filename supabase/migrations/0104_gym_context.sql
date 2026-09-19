-- 0104 — What the apps need to be gym-aware (SaaS Part B).
--
--   my_gym_context()   "who am I, where": the caller's current gym, their role
--                      and status there, its branding and lock reason, and how
--                      many gyms they belong to. Replaces every read of the
--                      legacy profiles.role/status in the apps' sign-in gates.
--   gym_people         profiles, with role and status *in the current gym* in
--                      place of the legacy columns — a list screen swaps the
--                      table name and keeps its filters.
--   add_person_to_gym  what the create-* Edge Functions call, as the admin, to
--                      put a new account into the admin's gym.
--   set_gym_role       an admin changes someone's role in this gym only.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-b-gym-aware-apps.md (Task 1)

create or replace function my_gym_context()
returns table (gym_id uuid, gym_name text, slug text, role user_role, status text,
               lock_reason text, short_name text, logo_url text, accent text, gym_count int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         gym_lock_reason(g.id), s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         (select count(*)::int from gym_roles x where x.user_id = auth.uid() and x.status <> 'archived')
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
    left join gym_settings s on s.gym_id = g.id
   where p.id = auth.uid();
$$;
revoke all on function my_gym_context() from public, anon;
grant execute on function my_gym_context() to authenticated;

-- The same columns as profiles, in the same order, but role and status are
-- this gym's. security_invoker: the caller's own rules decide which rows show,
-- and 0099 already limits profiles to people who share the current gym.
create or replace view gym_people with (security_invoker = true) as
  select p.id, r.role, p.first_name, p.last_name, p.email, p.phone, p.photo_url,
         r.status, p.created_at, p.active_gym_id,
         r.gym_id, r.created_at as joined_at
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = current_gym_id();
grant select on gym_people to authenticated;

-- A new account joins the caller's gym. Idempotent (the Edge Function may be
-- retried, and during the transition the 0097 mirror has already filed a role).
create or replace function add_person_to_gym(p_user uuid, p_role user_role, p_status text default 'active')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := current_gym_id();
  v_mine text := get_my_role()::text;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Sign in to a gym first.';
  end if;
  if not (v_mine = 'admin' or (v_mine = 'staff' and p_role = 'member')) then
    raise exception 'Only an admin can add a %, and the front desk only a member.', p_role
      using errcode = '42501';
  end if;
  if p_status not in ('active', 'pending_approval') then
    raise exception 'A new account starts active or pending.';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.';
  end if;
  perform act_as_gym(v_gym);

  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, p_user, p_role, p_status)
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;

  if p_role = 'member' then
    insert into member_profiles (gym_id, profile_id, qr_code)
    values (v_gym, p_user, p_user::text)
    on conflict (gym_id, profile_id) do nothing;
  elsif p_role = 'trainer' then
    insert into trainer_profiles (gym_id, profile_id)
    values (v_gym, p_user)
    on conflict (gym_id, profile_id) do nothing;
  end if;

  update profiles set active_gym_id = v_gym where id = p_user and active_gym_id is null;
end;
$$;
revoke all on function add_person_to_gym(uuid, user_role, text) from public, anon;
grant execute on function add_person_to_gym(uuid, user_role, text) to authenticated;

-- An admin changes someone's role in this gym — never their own (the one way
-- to lock a gym out of its own admin screens by accident).
create or replace function set_gym_role(p_user uuid, p_role user_role)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can change a role.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;
  update gym_roles set role = p_role where user_id = p_user and gym_id = v_gym;
  if not found then
    raise exception 'That person is not part of this gym.';
  end if;
  if p_role = 'trainer' then
    insert into trainer_profiles (gym_id, profile_id) values (v_gym, p_user)
    on conflict (gym_id, profile_id) do nothing;
  elsif p_role = 'member' then
    insert into member_profiles (gym_id, profile_id, qr_code) values (v_gym, p_user, p_user::text)
    on conflict (gym_id, profile_id) do nothing;
  end if;
end;
$$;
revoke all on function set_gym_role(uuid, user_role) from public, anon;
grant execute on function set_gym_role(uuid, user_role) to authenticated;

create or replace function migration_0104_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0104_applied() from public, anon;
grant execute on function migration_0104_applied() to authenticated;
comment on function migration_0104_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0104.sql
