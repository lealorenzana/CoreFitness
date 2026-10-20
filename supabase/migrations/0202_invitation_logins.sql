-- ============================================================================
-- 0202 — An invitation is a login (2026-10-20, the owner's design)
-- ============================================================================
--
-- Before: an invitation was a link. The person opened it in the member app,
-- made an account with the whole member sign-up (date of birth, emergency
-- contact, a plan) — even when they were invited as a coach or for the front
-- desk — and landed on the member home whatever they were invited as.
--
-- Now: sending an invitation creates the login (the `invite-account` Edge
-- Function, which holds the Auth admin API no SQL may hold) and emails the
-- address and a one-time password, with the right app: the admin app for the
-- front desk, the phone app for a coach or a member. The account belongs to no
-- gym yet. At first sign-in the app sees `invite_pending` on the account, asks
-- for a new password and the fill-up form for that role, and calls
-- `complete_invitation()` — which is the acceptance. So:
--
--   * a withdrawn or expired invitation gives nothing: the account exists but
--     has no gym, and the screen says the invitation is no longer valid;
--   * the gym sees the person as "waiting to be accepted" until they actually
--     signed in and filled the form, exactly as before;
--   * the front desk lands in Settings → Staff accounts by the same gym_roles
--     row every staff account has (no staff_permissions row = the whole desk,
--     until the owner narrows it).
--
-- `complete_invitation()` checks everything `accept_invitation()` checks (it
-- calls it), then saves the form for the role. An invited member also gets the
-- free tier the way an approved sign-up does — accept_invitation() had left an
-- invited member with no membership at all.
-- ============================================================================

create or replace function complete_invitation(
  p_token text,
  p_first text, p_last text, p_phone text default null,
  -- a member's form (the same fields as finish_signup)
  p_dob date default null, p_gender text default null, p_guardian text default null,
  p_address text default null, p_emergency_name text default null,
  p_emergency_phone text default null, p_emergency_relationship text default null,
  p_terms_version text default null, p_privacy_version text default null,
  -- a coach's form
  p_specialization text default null, p_years int default null, p_bio text default null
) returns table (gym_id uuid, role text)
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_inv gym_invitations;
  v_gym uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_inv from gym_invitations where token = btrim(coalesce(p_token, ''));
  if v_inv.id is null then
    raise exception 'That invitation is not valid.';
  end if;

  -- The form, checked before anything is written.
  if coalesce(btrim(p_first), '') = '' or coalesce(btrim(p_last), '') = '' then
    raise exception 'Please enter your first and last name.';
  end if;
  if coalesce(btrim(p_phone), '') <> '' and exists (
       select 1 from profiles p
        where p.id <> v_me and p.status <> 'archived'
          and normalize_phone(p.phone) is not null
          and normalize_phone(p.phone) = normalize_phone(p_phone)) then
    raise exception 'That phone number is already registered';
  end if;
  if v_inv.role = 'member' then
    if p_dob is null then raise exception 'Please enter your date of birth.'; end if;
    if p_dob > v_today then raise exception 'That date of birth is in the future.'; end if;
    if p_terms_version is null or p_privacy_version is null then
      raise exception 'Please accept the Terms and Privacy Policy.';
    end if;
    if p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' or p_terms_version::date > v_today
       or p_privacy_version !~ '^\d{4}-\d{2}-\d{2}$' or p_privacy_version::date > v_today then
      raise exception 'That is not a published version.';
    end if;
  end if;
  if v_inv.role = 'trainer' then
    if coalesce(btrim(p_specialization), '') = '' then
      raise exception 'Please say what you coach.';
    end if;
    if p_years is not null and (p_years < 0 or p_years > 70) then
      raise exception 'Years coaching is between 0 and 70.';
    end if;
  end if;

  -- The acceptance: token, expiry, withdrawal, the gym, and that the signed-in
  -- address is the invited one. Raises with the reason when any fails.
  v_gym := accept_invitation(p_token);

  perform act_as_gym(v_gym);
  update profiles
     set first_name = btrim(p_first), last_name = btrim(p_last),
         phone = coalesce(nullif(btrim(p_phone), ''), phone),
         active_gym_id = v_gym
   where id = v_me;

  if v_inv.role = 'member' then
    -- The versions they agreed to, where 0155's trigger on member_profiles reads
    -- them when terms_accepted_at is set — finish_signup's way, one record.
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
             || jsonb_build_object('terms_version', p_terms_version, 'privacy_version', p_privacy_version)
     where id = v_me;
    update member_profiles
       set date_of_birth = p_dob,
           gender = nullif(btrim(coalesce(p_gender, '')), ''),
           guardian_consent_name = nullif(btrim(coalesce(p_guardian, '')), ''),
           address = nullif(btrim(coalesce(p_address, '')), ''),
           emergency_contact_name = nullif(btrim(coalesce(p_emergency_name, '')), ''),
           emergency_contact_phone = nullif(btrim(coalesce(p_emergency_phone, '')), ''),
           emergency_contact_relationship = nullif(btrim(coalesce(p_emergency_relationship, '')), ''),
           terms_accepted_at = coalesce(terms_accepted_at, now())
     where member_profiles.gym_id = v_gym and profile_id = v_me;
    -- Invited by name is approved — the free tier, as an approved sign-up gets.
    perform grant_free_membership(v_me, v_gym);
  elsif v_inv.role = 'trainer' then
    update trainer_profiles
       set specialization = btrim(p_specialization),
           years_experience = p_years,
           bio = coalesce(nullif(btrim(coalesce(p_bio, '')), ''), bio)
     where trainer_profiles.gym_id = v_gym and profile_id = v_me;
  end if;

  -- The first-sign-in screen is done; the account stops asking.
  update auth.users
     set raw_user_meta_data = (coalesce(raw_user_meta_data, '{}'::jsonb) - 'invite_token' - 'invite_pending')
                              || jsonb_build_object('first_name', btrim(p_first), 'last_name', btrim(p_last))
   where id = v_me;

  perform act_as_gym(null);
  return query select v_gym, v_inv.role::text;
end;
$$;
revoke all on function complete_invitation(text, text, text, text, date, text, text, text, text, text, text, text, text, text, int, text) from public, anon;
grant execute on function complete_invitation(text, text, text, text, date, text, text, text, text, text, text, text, text, text, int, text) to authenticated;

-- What the invitation was for, for the first-sign-in screen: 0111's peek plus
-- the names and phone the gym typed, so the form starts filled in. Only for the
-- signed-in person it was sent to — peek_invitation stays the anonymous one.
create or replace function my_invitation(p_token text)
returns table (gym_id uuid, gym_name text, logo_url text, role text, state text,
               first_name text, last_name text, phone text, email text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, s.logo_url, i.role::text,
         case when i.accepted_at is not null then 'accepted'
              when i.revoked_at  is not null then 'revoked'
              when i.expires_at  < now()     then 'expired'
              when g.status <> 'active'      then 'gym_unavailable'
              else 'waiting' end,
         coalesce(i.first_name, p.first_name), coalesce(i.last_name, p.last_name),
         coalesce(i.phone, p.phone), i.email
    from gym_invitations i
    join gyms g on g.id = i.gym_id
    left join gym_settings s on s.gym_id = g.id
    left join profiles p on p.id = auth.uid()
   where i.token = btrim(coalesce(p_token, ''))
     and lower(btrim(i.email)) = lower((select email from auth.users where id = auth.uid()));
$$;
revoke all on function my_invitation(text) from public, anon;
grant execute on function my_invitation(text) to authenticated;

create or replace function migration_0202_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0202_applied() from public, anon;
grant execute on function migration_0202_applied() to authenticated;
comment on function migration_0202_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0202.sql
