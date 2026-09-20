-- 0111 — A gym's life, and its front door for people who already train there.
--
-- Three gaps this closes, each confirmed by reading the code rather than
-- assumed:
--
--   1. A gym had two states, `active` and `suspended`. Real ones also get
--      created and never claimed, claimed and never set up, put on a trial,
--      fall behind, and eventually leave. The platform could see none of that
--      as one word.
--   2. The setup wizard always restarted at step one. Every step already saved
--      as it went, so the *data* survived — but an owner who stopped halfway
--      through had to walk back through screens they had already done.
--   3. A gym joining Core Fitness usually already has members. There was no way
--      to bring them: the front desk could create an account one at a time, and
--      nothing else existed. No invitations, and CSV was export-only.
--
-- ---- ONE SOURCE PER FACT -------------------------------------------------------------
--
-- The tempting shape here is a `lifecycle` column with eight values. It is the
-- wrong one: "has an owner", "has been set up" and "is past its date" are
-- already recorded, in `gym_roles`, `gyms.onboarded_at` and `gyms.paid_until`.
-- A column repeating them would be a second source that drifts the first time
-- anybody writes one and not the other — the exact failure this schema keeps
-- being bitten by.
--
-- So `gyms.status` stays what it is: the platform's **stored decision** about a
-- gym, and it gains only the two decisions it could not express (`cancelled`,
-- `archived`). Everything derivable is derived, once, in `gym_state()`.

-- ============================================================================
-- 1. THE DECISIONS THE PLATFORM MAKES
-- ============================================================================

alter table gyms drop constraint if exists gyms_status_check;
alter table gyms add constraint gyms_status_check
  check (status in ('active', 'suspended', 'cancelled', 'archived'));

comment on column gyms.status is
  'The platform''s stored decision (0111): active, suspended, cancelled (they '
  'left) or archived (hidden from the working list). Everything derivable — no '
  'owner, not set up, on trial, overdue — is derived by gym_state(), never stored.';

-- One word for a gym, folded from facts that already exist. Ordered by what
-- matters most to say out loud: a gym that has left is not "overdue", and a gym
-- nobody can sign into is not "active" however paid-up it is.
create or replace function gym_state(p_gym uuid default null)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when g.status = 'archived'  then 'archived'
    when g.status = 'cancelled' then 'cancelled'
    when g.status = 'suspended' then 'suspended'
    -- Created, but nobody holds the keys yet (0107's approve-gym has not run).
    when not exists (select 1 from gym_roles r
                      where r.gym_id = g.id and r.role = 'admin' and r.status = 'active')
      then 'no_owner'
    -- Owned, but its owner has not finished /admin/setup.
    when g.onboarded_at is null then 'onboarding'
    -- Past its date by more than the seven-day grace (0099's gym_lock_reason).
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date - 7 then 'overdue'
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date then 'due'
    -- Never paid anything, and on a plan with a free period: still trying it.
    when not exists (select 1 from gym_payments x where x.gym_id = g.id)
         and coalesce((select pp.trial_days from platform_plans pp where pp.key = g.plan), 0) > 0
      then 'trial'
    else 'active'
  end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;
revoke all on function gym_state(uuid) from public, anon;
grant execute on function gym_state(uuid) to authenticated;

-- A gym that has left, or been archived, is read-only for the same reason a
-- suspended one is. 0099's version only knew about 'suspended' and the date.
create or replace function gym_lock_reason(p_gym uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case
           when g.status = 'archived'  then 'archived'
           when g.status = 'cancelled' then 'cancelled'
           when g.status = 'suspended' then 'suspended'
           when g.paid_until is not null
                and g.paid_until < (now() at time zone 'Asia/Manila')::date - 7 then 'overdue'
         end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

-- `set_gym_status` gains the two new decisions, and keeps 0106's rule that
-- taking a gym's access away is never done without a reason its owner is told.
create or replace function set_gym_status(p_gym uuid, p_status text, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_was text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change a gym''s status.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'cancelled', 'archived') then
    raise exception 'Unknown gym status: %', p_status;
  end if;
  if p_status <> 'active' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to set a gym to %. The gym is told this sentence.', p_status;
  end if;

  select name, status into v_name, v_was from gyms where id = p_gym;
  if v_name is null then
    raise exception 'That gym does not exist.';
  end if;

  update gyms set status = p_status where id = p_gym;

  perform platform_log(p_gym, 'gym.' || p_status,
    v_name || case p_status
      when 'active'    then ' is active again'
      when 'suspended' then ' was suspended'
      when 'cancelled' then ' left Core Fitness'
      else                  ' was archived'
    end || case when coalesce(btrim(p_reason), '') = '' then '' else ': ' || btrim(p_reason) end,
    jsonb_build_object('from', v_was, 'to', p_status, 'reason', nullif(btrim(p_reason), '')));
end;
$$;
revoke all on function set_gym_status(uuid, text, text) from public, anon;
grant execute on function set_gym_status(uuid, text, text) to authenticated;

-- A gym that has left or been archived stops being listed to strangers.
drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, s.accent
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

-- ============================================================================
-- 2. SETUP THAT PICKS UP WHERE IT WAS LEFT
-- ============================================================================
-- Each wizard step already writes before it advances, so nothing was ever lost.
-- This records only *where they got to*, so they are not walked back through
-- screens they have already filled in.

alter table gyms add column if not exists onboarding_step text;

comment on column gyms.onboarding_step is
  'The setup step this gym''s owner last reached (0111). NULL = not started. '
  'The data itself is already saved step by step; this is only the bookmark.';

create or replace function set_onboarding_step(p_step text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := acting_gym_id();
begin
  if v_gym is null then
    raise exception 'No gym to set up.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can set the gym up.' using errcode = '42501';
  end if;
  if length(coalesce(p_step, '')) > 40 then
    raise exception 'That is not a step name.';
  end if;
  -- Only while it is unfinished. Once a gym is open, the bookmark is history
  -- and must not be rewritten by someone revisiting Settings.
  update gyms set onboarding_step = p_step
   where id = v_gym and onboarded_at is null;
end;
$$;
revoke all on function set_onboarding_step(text) from public, anon;
grant execute on function set_onboarding_step(text) to authenticated;

-- my_gym_context gains the bookmark, so the wizard opens on the right step
-- without a second round trip. Otherwise unchanged from 0107.
drop function if exists my_gym_context();
create function my_gym_context()
returns table (gym_id uuid, gym_name text, slug text, role user_role, status text,
               lock_reason text, short_name text, logo_url text, accent text, gym_count int,
               onboarded boolean, onboarding_step text, gym_state text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         gym_lock_reason(g.id), s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         (select count(*)::int from gym_roles x where x.user_id = auth.uid() and x.status <> 'archived'),
         g.onboarded_at is not null,
         g.onboarding_step,
         gym_state(g.id)
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
    left join gym_settings s on s.gym_id = g.id
   where p.id = auth.uid();
$$;

-- ============================================================================
-- 3. BRINGING THE MEMBERS A GYM ALREADY HAS
-- ============================================================================
-- A gym joining Core Fitness has members already. Creating them one at a time
-- at the desk is the only thing that existed, which is fine for a walk-in and
-- hopeless for two hundred people.
--
-- An invitation is a row, not an email: nothing in this project sends mail, so
-- the gym hands out the link or the code the way it already talks to its
-- members. The token is what makes it safe to hand out — it names one gym and
-- one role, it expires, and it can be revoked.

create table if not exists gym_invitations (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  -- Who it is for. The email is how the desk recognises it in their own list,
  -- and how `accept_invitation` refuses one meant for somebody else.
  email       text not null check (length(btrim(email)) between 3 and 120),
  first_name  text,
  last_name   text,
  phone       text,
  role        user_role not null default 'member'
              check (role in ('member', 'trainer', 'staff')),
  -- Unguessable, and the only thing the invitee needs. Two v4 UUIDs with their
  -- dashes removed: 64 hex characters, ~244 bits of randomness from the same
  -- source `gen_random_uuid()` uses. Deliberately NOT gen_random_bytes(), which
  -- lives in pgcrypto — an extension this schema does not otherwise need, and
  -- which is not on `public`'s search path in either Supabase or the harness.
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),
  revoked_at  timestamptz,
  note        text,
  created_by  uuid references profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_gym_invitations_gym on gym_invitations(gym_id, created_at desc);
-- One live invitation per address per gym: re-inviting someone replaces theirs
-- rather than leaving two tokens that both work.
create unique index if not exists idx_gym_invitations_open
  on gym_invitations(gym_id, lower(btrim(email)))
  where accepted_at is null and revoked_at is null;

alter table gym_invitations enable row level security;

-- It is one gym's table, so it joins the tenancy layer and carries the same
-- four RESTRICTIVE policies as the other fifty.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_invitations','gym_modules','gym_plans','gym_settings','invoice_counters',
    'member_profiles','member_share_prefs','membership_events','membership_plans','memberships',
    'notifications','payments','pending_registrations','plan_features','point_ledger','point_rules',
    'pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','workout_logs','workout_plans','workout_routine_exercises','workout_routines',
    'workout_sets']::text[]
$$;

do $$
begin
  execute 'drop policy if exists tenant_select on gym_invitations';
  execute 'drop policy if exists tenant_insert on gym_invitations';
  execute 'drop policy if exists tenant_update on gym_invitations';
  execute 'drop policy if exists tenant_delete on gym_invitations';
  execute 'create policy tenant_select on gym_invitations as restrictive for select to anon, authenticated
             using (gym_id = current_gym_id())';
  execute 'create policy tenant_insert on gym_invitations as restrictive for insert to anon, authenticated
             with check (gym_id = current_gym_id() and gym_writable())';
  execute 'create policy tenant_update on gym_invitations as restrictive for update to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())
             with check (gym_id = current_gym_id())';
  execute 'create policy tenant_delete on gym_invitations as restrictive for delete to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())';
end $$;

-- **No permissive policy of any kind.** A token is a credential: it must not be
-- listable by the gym's own members, and the person accepting one is by
-- definition not in the gym yet, so no policy could serve them anyway. Every
-- read and write below is a SECURITY DEFINER function that names who may do it
-- — the same shape as `activity_log` (0037).
comment on table gym_invitations is
  'Invitations to join a gym (0111). RLS on, no permissive policy: reachable '
  'only through invite_to_gym/list_invitations/revoke_invitation/peek_invitation/accept_invitation.';

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

  -- Already here? Then an invitation is the wrong tool and would read as a
  -- second account waiting to happen.
  if exists (select 1 from gym_roles r join profiles p on p.id = r.user_id
              where r.gym_id = v_gym and lower(p.email) = lower(btrim(p_email))) then
    raise exception 'Somebody with that email already belongs to this gym.';
  end if;

  -- Re-inviting replaces the open one, so only ever one token works.
  update gym_invitations set revoked_at = now()
   where gym_id = v_gym and lower(btrim(email)) = lower(btrim(p_email))
     and accepted_at is null and revoked_at is null;

  insert into gym_invitations (gym_id, email, first_name, last_name, phone, role, note)
  values (v_gym, btrim(p_email), nullif(btrim(p_first), ''), nullif(btrim(p_last), ''),
          nullif(btrim(p_phone), ''), p_role::user_role, nullif(btrim(p_note), ''))
  returning gym_invitations.id, gym_invitations.token into v_id, v_tok;

  perform log_activity('member.invited', 'gym_invitations', v_id, null,
    btrim(p_email) || ' was invited as a ' || p_role,
    jsonb_build_object('email', btrim(p_email), 'role', p_role), v_gym);

  return query select v_id, v_tok;
end;
$$;
revoke all on function invite_to_gym(text, text, text, text, text, text) from public, anon;
grant execute on function invite_to_gym(text, text, text, text, text, text) to authenticated;

create or replace function list_invitations(p_include_done boolean default false)
returns table (id uuid, email text, first_name text, last_name text, phone text,
               role text, token text, expires_at timestamptz, accepted_at timestamptz,
               revoked_at timestamptz, note text, created_at timestamptz, state text)
language sql stable security definer set search_path = public as $$
  select i.id, i.email, i.first_name, i.last_name, i.phone, i.role::text, i.token,
         i.expires_at, i.accepted_at, i.revoked_at, i.note, i.created_at,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at  is not null then 'revoked'
              when i.expires_at  < now()     then 'expired'
              else 'waiting' end
    from gym_invitations i
   where i.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
     and (coalesce(p_include_done, false)
          or (i.accepted_at is null and i.revoked_at is null and i.expires_at >= now()))
   order by i.created_at desc;
$$;
revoke all on function list_invitations(boolean) from public, anon;
grant execute on function list_invitations(boolean) to authenticated;

create or replace function revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_email text;
begin
  if get_my_role() not in ('admin', 'staff') then
    raise exception 'Only the gym can withdraw an invitation.' using errcode = '42501';
  end if;
  update gym_invitations set revoked_at = now()
   where id = p_id and gym_id = v_gym and accepted_at is null
  returning email into v_email;
  if v_email is null then
    raise exception 'That invitation is not this gym''s, or has already been used.';
  end if;
  perform log_activity('member.invite_withdrawn', 'gym_invitations', p_id, null,
    'The invitation to ' || v_email || ' was withdrawn', '{}'::jsonb, v_gym);
end;
$$;
revoke all on function revoke_invitation(uuid) from public, anon;
grant execute on function revoke_invitation(uuid) to authenticated;

-- What an invitation says before anyone signs in: which gym, and as what. No
-- token is echoed back and no email is revealed — someone who guessed a token
-- learns only a gym's public name, which the gym list would tell them anyway.
create or replace function peek_invitation(p_token text)
returns table (gym_id uuid, gym_name text, slug text, logo_url text, accent text,
               role text, first_name text, state text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, s.logo_url, coalesce(s.accent, 'violet'),
         i.role::text, i.first_name,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at  is not null then 'revoked'
              when i.expires_at  < now()     then 'expired'
              when g.status <> 'active'      then 'gym_unavailable'
              else 'waiting' end
    from gym_invitations i
    join gyms g on g.id = i.gym_id
    left join gym_settings s on s.gym_id = g.id
   where i.token = btrim(p_token);
$$;
grant execute on function peek_invitation(text) to anon, authenticated;

-- Accepting. This is the one function here a stranger may call, so it checks
-- everything: the token, the expiry, the revocation, the gym, and that the
-- person accepting is the person invited.
create or replace function accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_inv gym_invitations;
  v_my_email text;
begin
  if v_me is null then
    raise exception 'Sign in first, then open the invitation again.';
  end if;
  select * into v_inv from gym_invitations where token = btrim(p_token);
  if v_inv.id is null then
    raise exception 'That invitation link is not valid.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'That invitation has already been used.';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'That invitation was withdrawn by the gym.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'That invitation has expired. Ask the gym for a new one.';
  end if;
  if not exists (select 1 from gyms where id = v_inv.gym_id and status = 'active') then
    raise exception 'That gym is not taking sign-ups right now.';
  end if;

  -- An invitation is addressed. Letting anyone with the link take a *staff*
  -- seat because they happened to see it is the hole this closes.
  select lower(email) into v_my_email from profiles where id = v_me;
  if v_my_email is distinct from lower(btrim(v_inv.email)) then
    raise exception 'That invitation was sent to %. Sign in with that email address.',
      v_inv.email using errcode = '42501';
  end if;

  -- Already known to this gym. Two very different cases, and treating them the
  -- same left people stuck:
  --
  --   * waiting in the approval queue — an invitation IS the gym approving them
  --     by name, so it approves them. Without this, someone who asked to join
  --     and was then invited stayed pending for ever, which is the worst of
  --     both doors.
  --   * already active — leave them exactly as they are. An invitation must
  --     never quietly demote this gym's owner to a member because somebody
  --     typed their address into the member invite box.
  if exists (select 1 from gym_roles where gym_id = v_inv.gym_id and user_id = v_me) then
    perform act_as_gym(v_inv.gym_id);
    update gym_roles
       set role = v_inv.role, status = 'active'
     where gym_id = v_inv.gym_id and user_id = v_me
       and status = 'pending_approval';

    if v_inv.role = 'member' then
      insert into member_profiles (gym_id, profile_id, qr_code)
      values (v_inv.gym_id, v_me, v_me::text)
      on conflict (gym_id, profile_id) do nothing;
    elsif v_inv.role = 'trainer' then
      insert into trainer_profiles (gym_id, profile_id)
      values (v_inv.gym_id, v_me)
      on conflict (gym_id, profile_id) do nothing;
    end if;

    update gym_invitations set accepted_at = now(), accepted_by = v_me where id = v_inv.id;
    perform act_as_gym(null);
    return v_inv.gym_id;
  end if;

  perform act_as_gym(v_inv.gym_id);

  -- An invited member is `active`, not `pending_approval`: the gym invited them
  -- by name, which *is* the approval. A self-registration still queues (0100).
  insert into gym_roles (gym_id, user_id, role, status)
  values (v_inv.gym_id, v_me, v_inv.role, 'active');

  if v_inv.role = 'member' then
    insert into member_profiles (gym_id, profile_id, qr_code)
    values (v_inv.gym_id, v_me, v_me::text)
    on conflict (gym_id, profile_id) do nothing;
  elsif v_inv.role = 'trainer' then
    insert into trainer_profiles (gym_id, profile_id)
    values (v_inv.gym_id, v_me)
    on conflict (gym_id, profile_id) do nothing;
  end if;

  update profiles set active_gym_id = v_inv.gym_id where id = v_me and active_gym_id is null;
  update gym_invitations set accepted_at = now(), accepted_by = v_me where id = v_inv.id;

  perform log_activity('member.invite_accepted', 'gym_invitations', v_inv.id,
    case when v_inv.role = 'member' then v_me end,
    coalesce((select nullif(trim(first_name || ' ' || last_name), '') from profiles where id = v_me),
             v_inv.email) || ' accepted their invitation',
    jsonb_build_object('role', v_inv.role), v_inv.gym_id);

  perform act_as_gym(null);
  return v_inv.gym_id;
end;
$$;
revoke all on function accept_invitation(text) from public, anon;
grant execute on function accept_invitation(text) to authenticated;

-- ============================================================================
-- 4. THE SAME GYM ASKING TWICE
-- ============================================================================
-- The website's form has no account behind it, so nothing stopped a gym filling
-- it in five times. The platform's list showed five rows and no hint that they
-- were one gym.

-- Dropped first: 0106 returned `setof gym_applications`, and the two extra
-- columns change the row type, which `create or replace` refuses outright.
drop function if exists platform_applications(text);
create function platform_applications(p_status text default null)
returns table (id uuid, gym_name text, owner_name text, email text, phone text,
               address text, member_estimate int, message text, status text,
               reason text, gym_id uuid, created_at timestamptz,
               duplicates int, already_a_gym boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.gym_name, a.owner_name, a.email, a.phone, a.address,
         a.member_estimate, a.message, a.status, a.reason, a.gym_id, a.created_at,
         -- Other applications from the same address or the same gym name.
         (select count(*)::int from gym_applications d
           where d.id <> a.id
             and (lower(btrim(d.email)) = lower(btrim(a.email))
                  or lower(btrim(d.gym_name)) = lower(btrim(a.gym_name)))),
         -- That address already runs a gym here: this is an existing customer,
         -- not a new one, and letting them in again would make a second gym.
         exists (select 1 from profiles p join gym_roles r on r.user_id = p.id
                  where lower(p.email) = lower(btrim(a.email))
                    and r.role = 'admin' and r.status = 'active')
    from gym_applications a
   where is_platform_admin()
     and (p_status is null or a.status = p_status)
   order by a.created_at desc;
$$;
revoke all on function platform_applications(text) from public, anon;
grant execute on function platform_applications(text) to authenticated;

-- ============================================================================
-- 5. DID THE BACKUP RUN?
-- ============================================================================
-- The weekly encrypted backup is a GitHub Action (docs/BACKUPS.md). The
-- platform app had no way to know whether it succeeded, so "is my data safe"
-- was answered by remembering to go and look.
--
-- The workflow calls this at the end of a good run; the platform screen reads
-- the last one. A backup that did not run writes nothing, which is exactly how
-- silence becomes visible.

create or replace function record_backup(p_size_bytes bigint default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform records a backup.' using errcode = '42501';
  end if;
  perform platform_log(null, 'platform.backup',
    'Database backup completed'
      || case when p_size_bytes is null then ''
              else ' (' || round(p_size_bytes / 1048576.0, 1) || ' MB)' end,
    jsonb_build_object('bytes', p_size_bytes, 'note', nullif(btrim(p_note), '')));
end;
$$;
revoke all on function record_backup(bigint, text) from public, anon;
grant execute on function record_backup(bigint, text) to authenticated;

create or replace function last_backup()
returns table (at timestamptz, summary text, days_ago int)
language sql stable security definer set search_path = public as $$
  select e.created_at, e.summary,
         extract(day from now() - e.created_at)::int
    from platform_events e
   where is_platform_admin() and e.action = 'platform.backup'
   order by e.created_at desc
   limit 1;
$$;
revoke all on function last_backup() from public, anon;
grant execute on function last_backup() to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0111_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0111_applied() from public, anon;
grant execute on function migration_0111_applied() to authenticated;
comment on function migration_0111_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0111.sql
