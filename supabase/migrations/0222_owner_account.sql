-- 0222 — the applicant's account is the owner's login (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part A).
--
-- A gym owner applies on the website with an account (Google, or email and
-- password). Until now, letting the gym in made a SECOND login for the owner —
-- the approve-gym Edge Function, with a temporary password — unless the platform
-- happened to type the same address. Now create_gym() with an application makes
-- that application's OWN account the gym's owner, in the same transaction:
--
--   * the account tied to the application (applicant_id), or — for an
--     application sent before accounts existed — the account whose CONFIRMED
--     email is the application's address;
--   * the account's email must be confirmed: an address nobody proved is theirs
--     is not given a gym. Approval refuses and says why;
--   * gym_roles(gym, account, 'admin', 'active'), and the account's current gym
--     is the new gym, so the admin app opens on it at their next sign-in.
--
-- No Edge Function and no password: they sign in to the admin app with the
-- email and password, or Google, they applied with. A gym made by hand on the
-- platform's Gyms page (no application) is unchanged — its owner is still invited.
-- Safe to paste again.

create or replace function create_gym(p_name text, p_slug text, p_application uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid;
  v_owner uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can create a gym.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The gym needs a name.';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 then
    raise exception 'The link name can use small letters, numbers and dashes only.';
  end if;
  if exists (select 1 from gyms where slug = p_slug) then
    raise exception 'Another gym already uses the link name "%".', p_slug;
  end if;

  -- The owner comes with the application: its own account, with a confirmed email.
  if p_application is not null then
    select u.id into v_owner
      from gym_applications a
      join auth.users u on u.email_confirmed_at is not null
                       and (u.id = a.applicant_id
                            or (a.applicant_id is null and lower(btrim(u.email)) = lower(btrim(a.email))))
     where a.id = p_application
     order by (u.id = a.applicant_id) desc
     limit 1;
    if v_owner is null then
      raise exception 'Their email is not confirmed yet — they must open the link we sent them (or sign in with Google) before their gym can be let in.';
    end if;
  end if;

  insert into gyms (name, slug, status, plan) values (btrim(p_name), p_slug, 'active', 'trial')
  returning id into v_gym;

  -- Its own plans, point rules, reasons, goal templates, badges and settings,
  -- copied from Gym #1 so the gym opens working rather than empty (0098).
  perform seed_gym_defaults(v_gym);

  if p_application is not null then
    -- 0187's trigger refuses this until all six documents are verified and in date.
    update gym_applications
       set status = 'approved', gym_id = v_gym, decided_by = auth.uid(), decided_at = now(),
           applicant_id = coalesce(applicant_id, v_owner)
     where id = p_application and status = 'pending';

    insert into gym_roles (gym_id, user_id, role, status)
    values (v_gym, v_owner, 'admin', 'active')
    on conflict (gym_id, user_id) do update set role = 'admin', status = 'active';
    update profiles set active_gym_id = v_gym where id = v_owner;
  end if;

  perform platform_log(v_gym, 'gym.created', btrim(p_name) || ' was let in',
                       jsonb_build_object('slug', p_slug, 'application', p_application, 'owner', v_owner));
  return v_gym;
end;
$$;
revoke all on function create_gym(text, text, uuid) from public, anon;
grant execute on function create_gym(text, text, uuid) to authenticated;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0222_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0222_applied() to anon, authenticated;
