-- ============================================================================
-- 0179 — Who can join, how they are let in, and how old they must be
-- ============================================================================
--
-- A gym picks one of three joining rules (0110's join_policy):
--   open     Listed — anyone finds it in the app and signs up
--   code     Link or code only — a sign-up must carry the gym's join code, or
--            come through its own /join/<slug> link
--   closed   Front desk only — no self sign-up. A friend invited by a member
--            (a referral code) may send a JOIN REQUEST, which the desk accepts
--            or declines; everyone else is told to visit the desk.
-- and, for open and code, whether a sign-up is let in AUTOMATICALLY (active,
-- on the gym's free tier) or WAITS for the desk (0078's approval).
--
-- The bug this closes: the sign-up trigger (0100) checked none of it, so a
-- member could sign up straight into a front-desk-only gym. Now the trigger
-- and request_to_join() (an existing account joining another gym) apply the
-- same rule, in SQL, where a crafted request cannot skip it.
--
-- And a gym's minimum age (default 16): a sign-up with a birth date younger
-- than that is refused; under 18 is let in only with a guardian's consent
-- recorded (waiver, 0119), which the desk sees.
-- ============================================================================

alter table gym_settings add column if not exists join_approval text not null default 'desk';
alter table gym_settings drop constraint if exists gym_settings_join_approval_check;
alter table gym_settings add constraint gym_settings_join_approval_check check (join_approval in ('auto', 'desk'));
alter table gym_settings add column if not exists min_age int not null default 16 check (min_age between 0 and 21);
alter table member_profiles add column if not exists guardian_consent_name text;

-- The owner sets the rule, the approval and the minimum age together.
create or replace function set_join_settings(p_policy text, p_approval text, p_min_age int) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how members join.' using errcode = '42501';
  end if;
  if p_approval not in ('auto', 'desk') then raise exception 'Sign-ups are let in automatically or by the desk.'; end if;
  if p_min_age is null or p_min_age not between 0 and 21 then raise exception 'A minimum age is between 0 and 21.'; end if;
  v_code := set_join_policy(p_policy, false);
  update gym_settings set join_approval = p_approval, min_age = p_min_age where gym_id = acting_gym_id();
  return v_code;
end;
$$;
revoke all on function set_join_settings(text, text, int) from public, anon;
grant execute on function set_join_settings(text, text, int) to authenticated;

-- The free tier, active, for someone just let in — the SQL twin of the admin
-- app's startFreeMembership(): by tier, never by name; nothing if they already
-- have a membership here.
create or replace function grant_free_membership(p_member uuid, p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_plan uuid; v_days int; d date := (now() at time zone 'Asia/Manila')::date;
begin
  if exists (select 1 from memberships where member_id = p_member and gym_id = p_gym) then return; end if;
  select id, duration_days into v_plan, v_days from membership_plans
   where gym_id = p_gym and tier = 'free' and is_active order by price limit 1;
  if v_plan is null then return; end if;   -- no free plan: the desk starts them by hand
  insert into memberships (gym_id, member_id, plan_id, status, start_date, expiry_date, never_expires)
  values (p_gym, p_member, v_plan, 'active', d, case when v_days is null then null else d + v_days end, v_days is null);
end;
$$;
revoke all on function grant_free_membership(uuid, uuid) from public, anon, authenticated;

-- Whether this way in is allowed. Returns 'auto' (let in now), 'desk' (wait),
-- or raises the reason in words the app shows.
create or replace function join_decision(p_gym uuid, p_via text, p_code text, p_referral text, p_birth date)
returns text
language plpgsql stable security definer set search_path = public as $$
declare s record; v_name text; v_age int;
begin
  select g.name, coalesce(gs.join_policy, 'open') policy, coalesce(gs.join_approval, 'desk') approval,
         coalesce(gs.min_age, 16) min_age, gs.join_code
    into s from gyms g left join gym_settings gs on gs.gym_id = g.id
   where g.id = p_gym and g.status = 'active';
  if s.name is null then raise exception 'That gym is not taking sign-ups right now.'; end if;
  if p_birth is not null then
    v_age := extract(year from age((now() at time zone 'Asia/Manila')::date, p_birth))::int;
    if v_age < s.min_age then
      raise exception '% welcomes members from age % — ask at the front desk.', s.name, s.min_age using errcode = '42501';
    end if;
  end if;
  if s.policy = 'closed' then
    -- Only a friend a member invited may ask; the desk decides every one.
    if coalesce(p_referral, '') = '' or not exists (
         select 1 from referral_codes r where r.gym_id = p_gym and upper(r.code) = upper(p_referral)) then
      raise exception '% creates its members'' accounts at the front desk. Visit the gym and they will set you up — or ask a member to invite you.',
        s.name using errcode = '42501';
    end if;
    return 'desk';
  end if;
  if s.policy = 'code' and coalesce(p_via, '') <> 'link'
     and (coalesce(p_code, '') = '' or upper(p_code) is distinct from upper(coalesce(s.join_code, ''))) then
    raise exception '% is joined with its code or its own link. Ask the gym for it.', s.name using errcode = '42501';
  end if;
  return s.approval;
end;
$$;
revoke all on function join_decision(uuid, text, text, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sign-up trigger, with the rule applied (0100's body, plus the decision).
-- ---------------------------------------------------------------------------
create or replace function handle_new_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta   jsonb := new.raw_user_meta_data;
  v_gym  uuid;
  v_way  text;
  v_dob  date;
  v_st   text;
begin
  if meta->>'signup_source' is distinct from 'member_self_registration' then
    return new;
  end if;

  if nullif(meta->>'gym_id', '') is null then
    v_gym := gym_one();
  else
    select g.id into v_gym from gyms g
     where g.id::text = meta->>'gym_id' and g.status = 'active';
    if v_gym is null then
      raise exception 'That gym is not taking sign-ups right now.';
    end if;
  end if;
  begin v_dob := nullif(meta->>'date_of_birth', '')::date; exception when others then v_dob := null; end;
  v_way := join_decision(v_gym, meta->>'join_via', meta->>'join_code', meta->>'referral_code', v_dob);
  v_st := case when v_way = 'auto' then 'active' else 'pending_approval' end;
  perform act_as_gym(v_gym);

  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id)
  values (new.id, 'member', coalesce(meta->>'first_name', 'New'), coalesce(meta->>'last_name', 'Member'),
          new.email, meta->>'phone', v_st, v_gym)
  on conflict (id) do nothing;

  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, new.id, 'member', v_st)
  on conflict (gym_id, user_id) do nothing;

  insert into member_profiles (gym_id, profile_id, qr_code, terms_accepted_at, date_of_birth, guardian_consent_name)
  values (v_gym, new.id, new.id::text,
          case when meta->>'terms_accepted' = 'true' then now() end,
          v_dob, nullif(btrim(coalesce(meta->>'guardian_name', '')), ''))
  on conflict (gym_id, profile_id) do nothing;

  if v_way = 'auto' then
    perform grant_free_membership(new.id, v_gym);
  else
    insert into pending_registrations (gym_id, first_name, last_name, email, phone, requested_plan_id, auth_user_id)
    values (v_gym, coalesce(meta->>'first_name', 'New'), coalesce(meta->>'last_name', 'Member'), new.email, meta->>'phone',
            (select mp.id from membership_plans mp where mp.id::text = nullif(meta->>'requested_plan_id', '') and mp.gym_id = v_gym),
            new.id)
    on conflict (gym_id, email) do nothing;
  end if;

  perform act_as_gym(null);
  return new;
end;
$$;

-- An existing account joining another gym: the same rule.
create or replace function request_to_join(p_gym uuid, p_via text, p_code text, p_referral text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); p profiles; v_way text; v_st text; r record; v_dob date;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from gym_roles where gym_id = p_gym and user_id = v_me) then
    raise exception 'You have already joined or asked to join that gym.';
  end if;
  select date_of_birth into v_dob from member_profiles where profile_id = v_me and date_of_birth is not null limit 1;
  v_way := join_decision(p_gym, p_via, p_code, p_referral, v_dob);
  v_st := case when v_way = 'auto' then 'active' else 'pending_approval' end;
  select * into p from profiles where id = v_me;
  perform act_as_gym(p_gym);
  insert into gym_roles (gym_id, user_id, role, status) values (p_gym, v_me, 'member', v_st);
  insert into member_profiles (gym_id, profile_id, qr_code, date_of_birth) values (p_gym, v_me, v_me::text, v_dob)
  on conflict (gym_id, profile_id) do nothing;
  if v_way = 'auto' then
    perform grant_free_membership(v_me, p_gym);
  else
    insert into pending_registrations (gym_id, first_name, last_name, email, phone, auth_user_id)
    values (p_gym, p.first_name, p.last_name, p.email, p.phone, v_me) on conflict (gym_id, email) do nothing;
    for r in select user_id from gym_roles where gym_id = p_gym and role in ('admin', 'staff') and status = 'active' loop
      perform notify_once(r.user_id, 'system', 'New member request',
        coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Someone') || ' asked to join the gym.',
        '/members', 'join:' || p_gym || ':' || v_me, p_gym);
    end loop;
  end if;
  perform act_as_gym(null);
  return v_way;
end;
$$;
revoke all on function request_to_join(uuid, text, text, text) from public, anon;
grant execute on function request_to_join(uuid, text, text, text) to authenticated;
-- The old one-argument signature stays callable and means "found it in the list".
create or replace function request_to_join(p_gym uuid) returns void
language sql security definer set search_path = public as $$ select request_to_join(p_gym, 'list', null, null); $$;

-- What a sign-up screen needs to know before asking anything: the rule, the
-- approval, the minimum age. Nothing else (never the join code itself).
create or replace function gym_join_rules(p_gym uuid)
returns table (policy text, approval text, min_age int)
language sql stable security definer set search_path = public as $$
  select coalesce(gs.join_policy, 'open'), coalesce(gs.join_approval, 'desk'), coalesce(gs.min_age, 16)
    from gyms g left join gym_settings gs on gs.gym_id = g.id
   where g.id = p_gym and g.status = 'active';
$$;
revoke all on function gym_join_rules(uuid) from public;
grant execute on function gym_join_rules(uuid) to anon, authenticated;

create or replace function migration_0179_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0179_applied() from public, anon;
grant execute on function migration_0179_applied() to authenticated;
comment on function migration_0179_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0179.sql
