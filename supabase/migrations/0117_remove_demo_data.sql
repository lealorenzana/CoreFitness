-- 0117 — The demo data can be removed from a screen, not a paste.
--
-- `scripts/demo-data/remove-demo-data.sql` has existed and worked since the
-- seeds did. The problem was never the SQL; it was *when* it gets run. It is a
-- 166-line paste into the Supabase SQL editor, and the moment anybody actually
-- needs it is the evening before a demo, when the dashboard is showing 150
-- seeded members and every revenue figure on it is fiction.
--
-- A destructive, irreversible operation whose only interface is "paste this
-- large file into a production SQL console, under time pressure" is a
-- deployment risk rather than a missing feature.
--
-- ---- THE LOGIC IS MOVED HERE, NOT COPIED ----------------------------------------------
--
-- The script's body now lives in `remove_demo_data()` and the file is a
-- one-line pointer at it. Two copies of a delete this wide is how one copy
-- gets a fix and the other does not — and the stale one is what somebody
-- pastes at 11pm.
--
-- ---- WHY THE PLATFORM APP AND NOT THE GYM OWNER ----------------------------------------
--
-- Demo data is a property of this *deployment*, not of a gym. It is seeded into
-- Gym #1, and its people are rows in `profiles` and `auth.users`, which are not
-- gym-scoped — so there is no honest per-gym version of this delete, and
-- pretending otherwise would mean a gym owner pressing a button that reaches
-- outside their gym. The platform app is localhost-only, which is the right
-- amount of friction for something that cannot be undone.
--
-- A gym owner still gets the **count**, on System, so they can see that their
-- figures include seeded rows and know why they are high. Seeing it is not
-- destructive; removing it is.
--
-- ---- WHAT IT DELIBERATELY DOES NOT TOUCH -----------------------------------------------
--
-- Unchanged from the script, and worth keeping said out loud:
--
--   * A real class handed to a demo coach keeps existing, with no coach.
--   * A real member who redeemed a demo reward keeps their points: redemptions
--     are recorded against the ledger, not taken out of it.
--   * A demo template that was reactivated and generated real bookable classes
--     takes those classes with it, because that class was never real.

-- ---- what is there ---------------------------------------------------------------------
-- Read-only, and deliberately readable by a gym admin as well as by the
-- platform: a gym whose dashboard is inflated by seeded rows is entitled to
-- know it, and knowing costs nothing.

create or replace function demo_data_summary()
returns table (people int, coaches int, payments int, attendance int,
               classes int, bookings int, events int, challenges int, rewards int)
language sql stable security definer set search_path = public as $$
  with folk as (
    select id, role from profiles
     where id::text like '5eed____-0000-4000-8000-%'
       and email like '%@seed.corefitness-test.com'
  )
  select (select count(*)::int from folk),
         (select count(*)::int from folk where role = 'trainer'),
         (select count(*)::int from payments   where member_id in (select id from folk)),
         (select count(*)::int from attendance where member_id in (select id from folk)),
         (select count(*)::int from classes    where is_demo_row(id) or is_demo_row(template_id)),
         (select count(*)::int from bookings   where member_id in (select id from folk)),
         (select count(*)::int from events     where is_demo_row(id)),
         (select count(*)::int from challenges where is_demo_row(id)),
         (select count(*)::int from rewards    where is_demo_row(id));
$$;
revoke all on function demo_data_summary() from public, anon;
grant execute on function demo_data_summary() to authenticated;
comment on function demo_data_summary() is
  'How much of what this deployment shows is seeded (0117). Read-only.';

-- ---- removing it -----------------------------------------------------------------------
-- SECURITY DEFINER because it disables triggers while it runs: deleting fires
-- them, and every removed booking, payment and redemption would otherwise write
-- an audit entry or a notification about somebody who never existed. Off inside
-- this transaction only, and the function owns the tables so it may.

create or replace function remove_demo_data() returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_people  uuid[];
  v_coaches uuid[];
  v_pat     text := '5eed____-0000-4000-8000-%';
begin
  if not is_platform_admin() then
    raise exception 'Only Core Fitness can remove the demo data.' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into v_people
    from profiles
   where id::text like v_pat and email like '%@seed.corefitness-test.com';
  select coalesce(array_agg(id), '{}') into v_coaches
    from profiles where id = any(v_people) and role = 'trainer';

  if cardinality(v_people) = 0
     and not exists (select 1 from classes         where id::text like v_pat)
     and not exists (select 1 from class_templates where id::text like v_pat)
     and not exists (select 1 from events          where id::text like v_pat)
     and not exists (select 1 from challenges      where id::text like v_pat)
     and not exists (select 1 from rewards         where id::text like v_pat) then
    return 'No demo data found. Nothing to remove.';
  end if;

  alter table profiles               disable trigger user;
  alter table member_profiles        disable trigger user;
  alter table trainer_profiles       disable trigger user;
  alter table memberships            disable trigger user;
  alter table payments               disable trigger user;
  alter table attendance             disable trigger user;
  alter table classes                disable trigger user;
  alter table class_templates        disable trigger user;
  alter table bookings               disable trigger user;
  alter table pt_sessions            disable trigger user;
  alter table membership_events      disable trigger user;
  alter table account_status_events  disable trigger user;
  alter table trainer_credentials    disable trigger user;
  alter table trainer_ratings        disable trigger user;
  alter table trainer_feedback       disable trigger user;
  alter table events                 disable trigger user;
  alter table event_registrations    disable trigger user;
  alter table notifications          disable trigger user;
  alter table challenges             disable trigger user;
  alter table challenge_participants disable trigger user;
  alter table rewards                disable trigger user;
  alter table reward_redemptions     disable trigger user;
  alter table achievement_unlocks    disable trigger user;
  alter table pending_registrations  disable trigger user;

  -- The audit log: the seed's own entries, and anything since about demo people.
  delete from activity_log
   where detail->>'seed' = 'true'
      or member_id  = any(v_people)
      or subject_id = any(v_people)
      or actor_id   = any(v_people)
      or subject_id::text like v_pat;

  delete from notifications       where user_id = any(v_people) or id::text like v_pat;

  delete from reward_redemptions  where member_id = any(v_people)
                                     or reward_id::text like v_pat
                                     or id::text like v_pat;
  delete from rewards             where id::text like v_pat;

  delete from achievement_unlocks where user_id = any(v_people) or id::text like v_pat;

  delete from challenge_participants where member_id = any(v_people) or challenge_id::text like v_pat;
  delete from challenges             where id::text like v_pat;

  delete from event_registrations where member_id = any(v_people) or event_id::text like v_pat;
  delete from events              where id::text like v_pat;

  delete from trainer_feedback    where member_id = any(v_people) or trainer_id = any(v_coaches);
  delete from trainer_ratings     where member_id = any(v_people) or trainer_id = any(v_coaches);
  delete from pt_sessions         where member_id = any(v_people) or trainer_id = any(v_coaches);
  delete from trainer_credentials where trainer_id = any(v_coaches);

  -- Classes the seed made, and any generated from a demo template since.
  delete from bookings
   where member_id = any(v_people)
      or class_id in (select id from classes
                       where id::text like v_pat or template_id::text like v_pat);
  delete from classes         where id::text like v_pat or template_id::text like v_pat;
  delete from class_templates where id::text like v_pat;
  -- A real class or template handed to a demo coach keeps existing, uncoached.
  update classes         set trainer_id = null where trainer_id = any(v_coaches);
  update class_templates set trainer_id = null where trainer_id = any(v_coaches);

  delete from attendance            where member_id  = any(v_people);
  delete from payments              where member_id  = any(v_people);
  delete from membership_events     where member_id  = any(v_people);
  delete from memberships           where member_id  = any(v_people);
  delete from account_status_events where profile_id = any(v_people);
  delete from pending_registrations where auth_user_id = any(v_people)
                                       or id::text like v_pat
                                       or email like '%@seed.corefitness-test.com';

  delete from trainer_profiles where profile_id = any(v_coaches);
  delete from member_profiles  where profile_id = any(v_people);
  delete from profiles         where id = any(v_people);
  -- Last. Cascades to anything else a demo person picked up during a demo
  -- (points, coach hours), through the foreign keys, which stay on.
  delete from auth.users       where id = any(v_people);

  alter table profiles               enable trigger user;
  alter table member_profiles        enable trigger user;
  alter table trainer_profiles       enable trigger user;
  alter table memberships            enable trigger user;
  alter table payments               enable trigger user;
  alter table attendance             enable trigger user;
  alter table classes                enable trigger user;
  alter table class_templates        enable trigger user;
  alter table bookings               enable trigger user;
  alter table pt_sessions            enable trigger user;
  alter table membership_events      enable trigger user;
  alter table account_status_events  enable trigger user;
  alter table trainer_credentials    enable trigger user;
  alter table trainer_ratings        enable trigger user;
  alter table trainer_feedback       enable trigger user;
  alter table events                 enable trigger user;
  alter table event_registrations    enable trigger user;
  alter table notifications          enable trigger user;
  alter table challenges             enable trigger user;
  alter table challenge_participants enable trigger user;
  alter table rewards                enable trigger user;
  alter table reward_redemptions     enable trigger user;
  alter table achievement_unlocks    enable trigger user;
  alter table pending_registrations  enable trigger user;

  perform platform_log(null, 'demo.removed',
    'Removed ' || cardinality(v_people) || ' demo people and everything attached to them',
    jsonb_build_object('people', cardinality(v_people), 'coaches', cardinality(v_coaches)));

  return 'Removed ' || cardinality(v_people) || ' demo people ('
    || cardinality(v_coaches) || ' of them coaches), with everything attached to them.';
end;
$fn$;
revoke all on function remove_demo_data() from public, anon;
grant execute on function remove_demo_data() to authenticated;
comment on function remove_demo_data() is
  'Removes everything the demo seeds created, and only that (0117). Platform '
  'admin only, and irreversible. The body moved here from '
  'scripts/demo-data/remove-demo-data.sql, which now only calls it.';

-- ---- the probe marker ------------------------------------------------------------------

create or replace function migration_0117_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0117_applied() from public, anon;
grant execute on function migration_0117_applied() to authenticated;
comment on function migration_0117_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0117.sql
