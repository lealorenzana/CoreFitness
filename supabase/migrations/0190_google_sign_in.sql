-- ============================================================================
-- 0190 — Signing up and in with a Google account
-- ============================================================================
--
-- Supabase Auth does the Google part (the provider is switched on in the
-- dashboard). What it cannot do is what our sign-up trigger does: a Google
-- account arrives with Google's name and email and NO gym — the trigger
-- (0179) runs only for `signup_source = 'member_self_registration'`, which an
-- OAuth sign-up never carries. So the account is finished here, once signed in:
--
--   * MEMBERS — finish_signup(): the same joining rule as the email form
--     (join_decision(): listed / link-or-code / front-desk-only, the minimum
--     age, auto or desk approval), the same rows (profile, the per-gym role,
--     the member row with birth date and guardian, the free tier or the desk's
--     queue), and the Terms/Privacy versions they agreed to (recorded through
--     0155's trigger, from the account's metadata). A person already in a gym
--     joins another the existing way, request_to_join().
--   * GYM APPLICANTS — Google confirms the address, so my_applications() (0187)
--     already finds an application sent from it; now it also gives the
--     account a profile with no gym, so approve-gym can make it the owner.
--   * my_signup_state() tells a screen which of those a signed-in account is.
-- ============================================================================

/** What a freshly signed-in account still needs: nothing, a gym, or to be an applicant. */
create or replace function my_signup_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u auth.users; v_meta jsonb;
begin
  if auth.uid() is null then return null; end if;
  select * into u from auth.users where id = auth.uid();
  v_meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  return jsonb_build_object(
    'has_profile', exists (select 1 from profiles where id = auth.uid()),
    'gyms', (select count(*)::int from gym_roles where user_id = auth.uid()),
    'applications', (select count(*)::int from gym_applications a
                      where a.applicant_id = auth.uid() or lower(btrim(a.email)) = my_confirmed_email()),
    'email', u.email,
    -- Google's own names, offered to the form (never applied without the person seeing them).
    'first_name', coalesce(nullif(v_meta->>'given_name', ''), nullif(split_part(coalesce(v_meta->>'full_name', v_meta->>'name', ''), ' ', 1), '')),
    'last_name', coalesce(nullif(v_meta->>'family_name', ''),
                          nullif(btrim(substr(coalesce(v_meta->>'full_name', v_meta->>'name', ''),
                                              length(split_part(coalesce(v_meta->>'full_name', v_meta->>'name', ''), ' ', 1)) + 1)), '')),
    'avatar_url', nullif(v_meta->>'avatar_url', ''));
end;
$$;
revoke all on function my_signup_state() from public, anon;
grant execute on function my_signup_state() to authenticated;

/**
 * A signed-in account with no gym joins one — the email form's sign-up, for an
 * account Google made. Returns 'auto' (in, on the free tier) or 'desk' (asked).
 */
create or replace function finish_signup(
  p_gym uuid, p_via text, p_code text, p_referral text,
  p_first text, p_last text, p_phone text, p_dob date, p_guardian text,
  p_gender text, p_address text, p_emergency_name text, p_emergency_phone text, p_emergency_relationship text,
  p_requested_plan uuid, p_terms_version text, p_privacy_version text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_email text; v_way text; v_st text; r record;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if exists (select 1 from gym_roles where user_id = v_me) then
    raise exception 'This account already belongs to a gym. Join another from Find your gym.';
  end if;
  if coalesce(btrim(p_first), '') = '' or coalesce(btrim(p_last), '') = '' then
    raise exception 'Please enter your first and last name.';
  end if;
  if p_dob is null then raise exception 'Please enter your date of birth.'; end if;
  if not exists (select 1 from gyms where id = p_gym and status = 'active') then
    raise exception 'That gym is not taking sign-ups right now.';
  end if;
  if coalesce(btrim(p_phone), '') <> '' and is_phone_taken(p_phone) then
    raise exception 'That phone number is already registered';
  end if;
  if p_terms_version is null or p_privacy_version is null then
    raise exception 'Please accept the Terms and Privacy Policy.';
  end if;

  v_way := join_decision(p_gym, p_via, p_code, p_referral, p_dob);
  v_st := case when v_way = 'auto' then 'active' else 'pending_approval' end;
  select email into v_email from auth.users where id = v_me;

  -- The versions they agreed to, where 0155's trigger reads them; and the
  -- details the email form would have carried, kept with the account.
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'signup_source', 'member_google', 'gym_id', p_gym, 'first_name', btrim(p_first), 'last_name', btrim(p_last),
      'phone', nullif(btrim(p_phone), ''), 'date_of_birth', p_dob, 'gender', nullif(p_gender, ''),
      'terms_accepted', 'true', 'terms_version', p_terms_version, 'privacy_version', p_privacy_version,
      'referral_code', coalesce(p_referral, ''), 'join_via', coalesce(p_via, 'list'))
   where id = v_me;

  perform act_as_gym(p_gym);
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id)
  values (v_me, 'member', btrim(p_first), btrim(p_last), v_email, nullif(btrim(p_phone), ''), v_st, p_gym)
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name,
        phone = coalesce(profiles.phone, excluded.phone), status = excluded.status, active_gym_id = excluded.active_gym_id;
  -- 0097's mirror trigger may have filed the profile under this gym already; the role is set here, once.
  insert into gym_roles (gym_id, user_id, role, status) values (p_gym, v_me, 'member', v_st)
  on conflict (gym_id, user_id) do update set role = 'member', status = excluded.status;
  delete from gym_roles where user_id = v_me and gym_id <> p_gym;

  insert into member_profiles (gym_id, profile_id, qr_code, terms_accepted_at, date_of_birth, guardian_consent_name,
                               address, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
  values (p_gym, v_me, v_me::text, now(), p_dob, nullif(btrim(coalesce(p_guardian, '')), ''),
          nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_emergency_name, '')), ''),
          nullif(btrim(coalesce(p_emergency_phone, '')), ''), nullif(btrim(coalesce(p_emergency_relationship, '')), ''))
  on conflict (gym_id, profile_id) do nothing;

  if v_way = 'auto' then
    perform grant_free_membership(v_me, p_gym);
  else
    insert into pending_registrations (gym_id, first_name, last_name, email, phone, requested_plan_id, auth_user_id)
    values (p_gym, btrim(p_first), btrim(p_last), v_email, nullif(btrim(p_phone), ''),
            (select mp.id from membership_plans mp where mp.id = p_requested_plan and mp.gym_id = p_gym), v_me)
    on conflict (gym_id, email) do nothing;
    for r in select user_id from gym_roles where gym_id = p_gym and role in ('admin', 'staff') and status = 'active' loop
      perform notify_once(r.user_id, 'system', 'New member request',
        btrim(p_first) || ' ' || btrim(p_last) || ' asked to join the gym.', '/members', 'join:' || p_gym || ':' || v_me, p_gym);
    end loop;
  end if;
  perform act_as_gym(null);
  return v_way;
end;
$$;
revoke all on function finish_signup(uuid, text, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function finish_signup(uuid, text, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text) to authenticated;

/**
 * A profile with no gym for an account Google made, so an invitation (which
 * checks the profile's email, 0111) can be accepted. Does nothing when the
 * account already has one. The role comes from the invitation, never from here.
 */
create or replace function ensure_my_profile() returns void
language plpgsql security definer set search_path = public as $$
declare u auth.users; v_meta jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then return; end if;
  select * into u from auth.users where id = auth.uid();
  v_meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  insert into profiles (id, role, first_name, last_name, email, status, active_gym_id)
  values (auth.uid(), 'member',
          coalesce(nullif(v_meta->>'given_name', ''), nullif(split_part(coalesce(v_meta->>'full_name', v_meta->>'name', ''), ' ', 1), ''), 'New'),
          coalesce(nullif(v_meta->>'family_name', ''), 'Member'), u.email, 'active', null)
  on conflict (id) do nothing;
  -- 0097's mirror trigger files a gym-less profile under Gym #1; this one belongs to no gym yet.
  delete from gym_roles where user_id = auth.uid();
end;
$$;
revoke all on function ensure_my_profile() from public, anon;
grant execute on function ensure_my_profile() to authenticated;

-- ---- applicants signing in with Google ---------------------------------------------------------------
-- 0187's my_applications(), plus: an account Google made (no profile) that
-- finds an application gets a profile with no gym, as the apply form's does.
create or replace function my_applications() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := my_confirmed_email(); u auth.users; v_meta jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  -- The profile first: applicant_id points at profiles.
  if not exists (select 1 from profiles where id = auth.uid())
     and v_email is not null
     and exists (select 1 from gym_applications where applicant_id is null and lower(btrim(email)) = v_email) then
    select * into u from auth.users where id = auth.uid();
    v_meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
    insert into profiles (id, role, first_name, last_name, email, status, active_gym_id)
    values (auth.uid(), 'member',
            coalesce(nullif(v_meta->>'given_name', ''), nullif(split_part(coalesce(v_meta->>'full_name', v_meta->>'name', ''), ' ', 1), ''), 'Gym'),
            coalesce(nullif(v_meta->>'family_name', ''), 'Owner'), u.email, 'active', null)
    on conflict (id) do nothing;
    delete from gym_roles where user_id = auth.uid();
  end if;
  if v_email is not null and exists (select 1 from profiles where id = auth.uid()) then
    update gym_applications set applicant_id = auth.uid()
     where applicant_id is null and lower(btrim(email)) = v_email;
  end if;
  return coalesce((
    select jsonb_agg(application_status(a.status_token)
             || jsonb_build_object(
                  'id', a.id, 'status_token', a.status_token, 'phone', a.phone, 'address', a.address,
                  'documents', coalesce((select jsonb_agg(to_jsonb(d)) from application_documents_of(a.id) d), '[]'::jsonb),
                  'missing', to_jsonb(application_documents_missing(a.id)))
             order by a.created_at desc)
      from gym_applications a
     where a.applicant_id = auth.uid()), '[]'::jsonb);
end;
$$;
revoke all on function my_applications() from public, anon;
grant execute on function my_applications() to authenticated;

create or replace function migration_0190_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0190_applied() from public, anon;
grant execute on function migration_0190_applied() to authenticated;
comment on function migration_0190_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0190.sql
