-- ============================================================================
-- 0236 — Usernames, login slips, first-sign-in set-up (2026-11-07, the owner's answers)
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-11-07-usernames-login-slips-design.md
--
--   * profiles.username — OPTIONAL, unique across Core Fitness (an account moves
--     between gyms), 3–20 of a-z 0-9 . _, starting and ending with a letter or
--     digit, stored lowercase. Sign in with email OR username.
--   * A desk-made account may have NO email: it gets a stand-in address
--     <username>@no-email.invalid. The reserved .invalid TLD can never receive
--     mail, and Auth, gym_invitations and accept_invitation() work unchanged.
--     is_stand_in_email() marks it so screens say "No email".
--   * Signing in by username is done on the server (the sign-in-username Edge
--     Function, service role): login_email_for_username() is revoked from every
--     client role, so no client ever learns an address from a username.
--     login_failures (no policy for any role) holds that function's own limit —
--     a server-side sign-in bypasses Auth's per-IP limit.
--   * The desk resets a login (a new one-time password and a slip) only for an
--     account with no real email or that never finished its first sign-in:
--     login_reset_check() is that rule, called AS the desk before the Edge
--     Function touches anything, and it writes the activity log.
-- ============================================================================

-- ---- the column ---------------------------------------------------------------
alter table profiles add column if not exists username text;

do $$ begin
  alter table profiles add constraint profiles_username_form
    check (username is null or username ~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$');
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_username_key on profiles (username) where username is not null;

-- ---- the stand-in address -----------------------------------------------------
create or replace function is_stand_in_email(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(lower(btrim(p_email)) like '%@no-email.invalid', false);
$$;
grant execute on function is_stand_in_email(text) to authenticated;

-- Words a username may not be: they read as the gym or the system speaking.
create or replace function username_reserved(p text) returns boolean
language sql immutable set search_path = public as $$
  select lower(btrim(coalesce(p, ''))) in ('admin', 'administrator', 'root', 'support', 'help', 'desk', 'frontdesk',
    'front.desk', 'owner', 'staff', 'coach', 'trainer', 'member', 'corefitness', 'core.fitness', 'system', 'null', 'undefined');
$$;
revoke all on function username_reserved(text) from public, anon;
-- The tidy trigger below runs as the person writing their row, so it must be callable.
grant execute on function username_reserved(text) to authenticated;

-- Lowercased and trimmed on the way in; an empty one is none. RLS cannot limit
-- columns, so a person writing their own profile row directly is held to the
-- same words as set_my_username() here (the form and uniqueness are the
-- constraint and the index).
create or replace function profiles_username_tidy() returns trigger
language plpgsql set search_path = public as $$
begin
  new.username := nullif(lower(btrim(coalesce(new.username, ''))), '');
  if new.username is not null and username_reserved(new.username)
     and (tg_op = 'INSERT' or new.username is distinct from old.username) then
    raise exception 'That username is kept for the gym. Choose another.';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_username_tidy on profiles;
create trigger profiles_username_tidy before insert or update of username on profiles
  for each row execute function profiles_username_tidy();

-- Why a username cannot be used, in words — or null when it can. p_for is the
-- account it would belong to (null for a new one), so keeping your own is fine.
create or replace function username_problem(p text, p_for uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := lower(btrim(coalesce(p, '')));
begin
  if length(v) < 3 then return 'A username is at least 3 characters.'; end if;
  if length(v) > 20 then return 'A username is at most 20 characters.'; end if;
  if v !~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$' then
    return 'Use letters, numbers, dots or underscores, starting and ending with a letter or number.';
  end if;
  if username_reserved(v) then return 'That username is kept for the gym. Choose another.'; end if;
  if exists (select 1 from profiles where username = v and id is distinct from p_for) then
    return 'That username is taken. Choose another.';
  end if;
  return null;
end;
$$;
revoke all on function username_problem(text, uuid) from public, anon, authenticated;

-- ---- the signed-in person ------------------------------------------------------
-- For the "choose a username" field: available to me (my own counts as free).
create or replace function username_available(p text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  return username_problem(p, auth.uid());   -- null = yes
end;
$$;
revoke all on function username_available(text) from public, anon;
grant execute on function username_available(text) to authenticated;

create or replace function set_my_username(p text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_email text;
  v_why text;
  v text := nullif(lower(btrim(coalesce(p, ''))), '');
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select email into v_email from profiles where id = v_me;
  if v is null then
    -- Without a real email the username is the only way in.
    if is_stand_in_email(v_email) then
      raise exception 'Your username is how you sign in, so you need one. Change it instead.';
    end if;
    update profiles set username = null where id = v_me;
    return null;
  end if;
  v_why := username_problem(v, v_me);
  if v_why is not null then raise exception '%', v_why; end if;
  update profiles set username = v where id = v_me;
  return v;
end;
$$;
revoke all on function set_my_username(text) from public, anon;
grant execute on function set_my_username(text) to authenticated;

-- What the account itself needs to know about its login (Settings, first sign-in).
create or replace function my_login() returns table (username text, has_email boolean, email text)
language sql stable security definer set search_path = public as $$
  select p.username, not is_stand_in_email(p.email), case when is_stand_in_email(p.email) then null else p.email end
    from profiles p where p.id = auth.uid();
$$;
revoke all on function my_login() from public, anon;
grant execute on function my_login() to authenticated;

-- ---- the server only ------------------------------------------------------------
create or replace function login_email_for_username(p text) returns text
language sql stable security definer set search_path = public as $$
  select p2.email from profiles p2 where p2.username = lower(btrim(coalesce(p, ''))) limit 1;
$$;
revoke all on function login_email_for_username(text) from public, anon, authenticated;
grant execute on function login_email_for_username(text) to service_role;

-- The username sign-in's own limit: no policy for any client role.
create table if not exists login_failures (
  id bigint generated always as identity primary key,
  username text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_username_at on login_failures (username, at desc);
alter table login_failures enable row level security;
revoke all on login_failures from public, anon, authenticated;
grant select, insert, delete on login_failures to service_role;

-- ---- what the desk may see and do ------------------------------------------------
-- A person's login, for the member/coach drawer: their username, whether they
-- have a real email, whether they finished their first sign-in, and whether the
-- caller may reset it. Only for someone in the caller's gym.
create or replace function login_info_for(p_user uuid)
returns table (username text, has_email boolean, set_up boolean, can_reset boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_mine text := get_my_role()::text;
  v_role text;
  v_email text;
  v_meta jsonb;
  v_set boolean;
begin
  if v_gym is null or v_mine not in ('admin', 'staff') then
    raise exception 'Only the gym''s owner or front desk can see logins.' using errcode = '42501';
  end if;
  select r.role::text into v_role from gym_roles r where r.gym_id = v_gym and r.user_id = p_user;
  if v_role is null then
    -- Invited and not yet in: still this gym's, through the open invitation.
    select i.role::text into v_role from gym_invitations i join profiles p on lower(p.email) = lower(btrim(i.email))
     where i.gym_id = v_gym and p.id = p_user and i.accepted_at is null and i.revoked_at is null
     order by i.created_at desc limit 1;
  end if;
  if v_role is null then
    raise exception 'That person is not in this gym.' using errcode = '42501';
  end if;
  select p.email into v_email from profiles p where p.id = p_user;
  select u.raw_user_meta_data into v_meta from auth.users u where u.id = p_user;
  v_set := not coalesce((v_meta ->> 'must_change_password')::boolean, false)
           and not coalesce((v_meta ->> 'invite_pending')::boolean, false);
  return query select
    (select p.username from profiles p where p.id = p_user),
    not is_stand_in_email(v_email),
    v_set,
    -- The desk resets members; the owner anyone. Only an account with no real
    -- email, or one never set up — an account with an email uses Forgot password.
    (v_mine = 'admin' or (v_mine = 'staff' and v_role = 'member'))
      and (is_stand_in_email(v_email) or not v_set);
end;
$$;
revoke all on function login_info_for(uuid) from public, anon;
grant execute on function login_info_for(uuid) to authenticated;

-- Called AS the desk by the reset-login Edge Function before it changes anything:
-- the same rule as can_reset, and the record of who did it.
create or replace function login_reset_check(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_name text;
begin
  select * into v from login_info_for(p_user);
  if not v.can_reset then
    raise exception 'This login can''t be reset here: they have their own email and use Forgot password on the sign-in screen.'
      using errcode = '42501';
  end if;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = p_user;
  perform log_activity('login.reset', 'profiles', p_user, null,
    coalesce(nullif(v_name, ''), 'Someone') || '''s login was reset',
    jsonb_build_object('username', v.username), acting_gym_id());
  return v.username;
end;
$$;
revoke all on function login_reset_check(uuid) from public, anon;
grant execute on function login_reset_check(uuid) to authenticated;

-- ---- invite_to_gym: the log names a username, never the stand-in address --------
create or replace function invite_to_gym(
  p_email text, p_role text default 'member',
  p_first text default null, p_last text default null,
  p_phone text default null, p_note text default null
) returns table (id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := acting_gym_id();
  v_mine text := get_my_role()::text;
  v_id   uuid;
  v_tok  text;
  v_who  text;
begin
  if v_gym is null then
    raise exception 'Sign in to a gym first.' using errcode = '42501';
  end if;
  -- The same split as add_person_to_gym (0104): the front desk brings members
  -- in, an owner brings anybody in. Staff must not be able to mint staff.
  if not (v_mine = 'admin' or (v_mine = 'staff' and p_role = 'member')) then
    raise exception 'Only the owner can invite a %, and the front desk only a member.', p_role
      using errcode = '42501';
  end if;
  if p_role not in ('member', 'trainer', 'staff') then
    raise exception 'A gym invites a member, a coach or someone for the desk.';
  end if;
  if coalesce(btrim(p_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '"%" is not an email address.', p_email;
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.';
  end if;
  perform act_as_gym(v_gym);

  if exists (select 1 from gym_roles r join profiles p on p.id = r.user_id
              where r.gym_id = v_gym and lower(p.email) = lower(btrim(p_email))) then
    raise exception 'Somebody with that email already belongs to this gym.';
  end if;

  update gym_invitations set revoked_at = now()
   where gym_id = v_gym and lower(btrim(email)) = lower(btrim(p_email))
     and accepted_at is null and revoked_at is null;

  insert into gym_invitations (gym_id, email, first_name, last_name, phone, role, note)
  values (v_gym, btrim(p_email), nullif(btrim(p_first), ''), nullif(btrim(p_last), ''),
          nullif(btrim(p_phone), ''), p_role::user_role, nullif(btrim(p_note), ''))
  returning gym_invitations.id, gym_invitations.token into v_id, v_tok;

  -- 0236: a no-email account is named by its username, never the stand-in address.
  v_who := case when is_stand_in_email(p_email)
                then '@' || split_part(lower(btrim(p_email)), '@', 1)
                else btrim(p_email) end;
  perform log_activity('member.invited', 'gym_invitations', v_id, null,
    v_who || ' was invited as a ' || p_role,
    jsonb_build_object('email', case when is_stand_in_email(p_email) then null else btrim(p_email) end,
                       'username', case when is_stand_in_email(p_email) then split_part(lower(btrim(p_email)), '@', 1) end,
                       'role', p_role), v_gym);

  return query select v_id, v_tok;
end;
$$;
revoke all on function invite_to_gym(text, text, text, text, text, text) from public, anon;
grant execute on function invite_to_gym(text, text, text, text, text, text) to authenticated;

-- ---- the probe ---------------------------------------------------------------------
create or replace function migration_0236_applied() returns boolean
language sql stable set search_path = public as $$ select true; $$;
grant execute on function migration_0236_applied() to anon, authenticated;
