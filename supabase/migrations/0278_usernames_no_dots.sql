-- ============================================================================
-- 0278: usernames are letters, numbers and underscores only (owner, 2026-11-26)
-- ============================================================================
-- 0236 allowed dots and suggested "first.last", so nearly every username had a
-- dot. A username is now like most apps': a-z, 0-9 and _, 3 to 20 long,
-- starting and ending with a letter or number.
--
--   * Every username with a dot is renamed: the dots dropped ("maria.santos" →
--     "mariasantos"); if that is too short, reserved or taken, the dots become
--     underscores; if that is taken too, a number is added. On 2026-11-26 every
--     dotted username belonged to a demo gym (0238); no real gym had one.
--   * The stand-in address of a no-email account (<old>@no-email.invalid) is
--     NOT changed: sign-in goes username → profiles → address, so it still works.
--   * Signing in with the old dotted name still works: login_email_for_username()
--     tries the name as typed, then without dots, then with underscores.
-- Paste after the apps and the sign-in-username function that use the new rule
-- are deployed (they accept both until this runs).
-- ============================================================================

alter table profiles drop constraint if exists profiles_username_form;

-- One statement for every name whose dotless form is free, valid and unique (all of them on
-- 2026-11-26, by a dry run), so 10,250 rows do not run one by one; the loop below takes the rest.
with d as (select id, replace(username, '.', '') v, count(*) over (partition by replace(username, '.', '')) c
             from profiles where username like '%.%')
update profiles p set username = d.v from d
 where p.id = d.id and length(d.v) >= 3 and not username_reserved(d.v)
   and not exists (select 1 from profiles q where q.username = d.v)
   and d.c = 1;

do $$
declare
  r record;
  v text;
  n int;
begin
  for r in select id, username from profiles where username like '%.%' order by created_at nulls last, id loop
    v := replace(r.username, '.', '');
    if length(v) < 3 or username_reserved(v) or exists (select 1 from profiles where username = v and id <> r.id) then
      v := replace(r.username, '.', '_');
    end if;
    n := 1;
    while username_reserved(v) or exists (select 1 from profiles where username = v and id <> r.id) loop
      n := n + 1;
      v := left(replace(r.username, '.', ''), 20 - length(n::text)) || n::text;
    end loop;
    update profiles set username = v where id = r.id;
  end loop;
end $$;

alter table profiles add constraint profiles_username_form
  check (username is null or username ~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$');

create or replace function username_problem(p text, p_for uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := lower(btrim(coalesce(p, '')));
begin
  if length(v) < 3 then return 'A username is at least 3 characters.'; end if;
  if length(v) > 20 then return 'A username is at most 20 characters.'; end if;
  if v !~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$' then
    return 'Use letters, numbers or underscores only, starting and ending with a letter or number.';
  end if;
  if username_reserved(v) then return 'That username is kept for the gym. Choose another.'; end if;
  if exists (select 1 from profiles where username = v and id is distinct from p_for) then
    return 'That username is taken. Choose another.';
  end if;
  return null;
end;
$$;
revoke all on function username_problem(text, uuid) from public, anon, authenticated;

-- The old dotted name still signs in: as typed, then without dots, then with underscores.
create or replace function login_email_for_username(p text) returns text
language sql stable security definer set search_path = public as $$
  with t as (select lower(btrim(coalesce(p, ''))) v)
  select p2.email from profiles p2, t
  where p2.username in (t.v, replace(t.v, '.', ''), replace(t.v, '.', '_'))
  order by (p2.username = t.v) desc, (p2.username = replace(t.v, '.', '')) desc
  limit 1;
$$;
revoke all on function login_email_for_username(text) from public, anon, authenticated;
grant execute on function login_email_for_username(text) to service_role;

-- Demo gyms made after this (0238's demo_gym_step still passes 'gym07.owner') get the dots dropped.
create or replace function demo_account(p_id uuid, p_gym uuid, p_username text, p_first text, p_last text,
                                        p_role user_role, p_hash text, p_phone text, p_joined timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := replace(p_username, '.', '');   -- 0278: 'gym07.owner' is made as 'gym07owner'
  v_email text := v_name || '@no-email.invalid';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', v_email, p_hash, now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('first_name', p_first, 'last_name', p_last, 'demo', true), p_joined, now(), '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
  select p_id, 'email', p_id::text, jsonb_build_object('sub', p_id::text, 'email', v_email, 'email_verified', true), now(), now()
   where not exists (select 1 from auth.identities i where i.user_id = p_id and i.provider = 'email');
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id, username, created_at)
  values (p_id, p_role, p_first, p_last, v_email, p_phone, 'active', p_gym, v_name, p_joined)
  on conflict (id) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name,
                                 status = 'active', active_gym_id = excluded.active_gym_id, username = excluded.username;
  insert into gym_roles (gym_id, user_id, role, status)
  values (p_gym, p_id, p_role, 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
end;
$$;
revoke execute on function demo_account(uuid, uuid, text, text, text, user_role, text, text, timestamptz) from public, anon, authenticated;
