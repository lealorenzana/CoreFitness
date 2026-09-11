-- Removes everything seed-demo-data.sql and seed-demo-data-2.sql created —
-- and only that.
--
-- Paste into the Supabase SQL Editor and run. One atomic block: all of it goes
-- or none of it does. Safe to run twice, and safe if only part 1 was run.
--
-- ## How it finds the demo data
--
-- Demo **people** — members, coaches and pending sign-ups — are those whose id
-- matches `5eed____-0000-4000-8000-…` **and** whose email ends
-- `@seed.corefitness-test.com`. Both, not either.
--
-- Everything else goes **by person** as well as by the seed's id pattern. So a
-- payment recorded against a demo member during a demo, or a redemption, goes
-- too, even though its id was random.
--
-- ## Three things a demo may have done, handled here
--
--   * **A retired demo template reactivated.** The generator then made real,
--     bookable classes from it, with random ids, and a real member may have
--     booked one. Those classes and their bookings go with the template — the
--     class was never real.
--   * **A demo reward switched on**, and a real member redeemed it. The
--     redemption goes, or the reward could not be deleted (the foreign key is
--     ON DELETE RESTRICT). The member's points are not affected: redemptions
--     are recorded against the ledger, not taken out of it.
--   * **A real class given to a demo coach.** The class stays; it just has no
--     coach again.
--
-- ## Why the triggers are off while it runs
--
-- Deleting fires them: every removed booking, payment and redemption would
-- write an audit entry or a notification about somebody who never existed.
-- Off inside this transaction only.

do $rm$
declare
  v_people  uuid[];
  v_coaches uuid[];
  v_pat     text := '5eed____-0000-4000-8000-%';
begin
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
    raise notice 'No demo data found. Nothing to remove.';
    return;
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

  raise notice 'Removed % demo people (% of them coaches), with everything attached to them.',
    cardinality(v_people), cardinality(v_coaches);
end
$rm$;
