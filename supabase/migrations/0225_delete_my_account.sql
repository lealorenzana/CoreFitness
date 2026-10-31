-- 0225 — deleting your own account (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part D).
--
-- Anyone — a member, a coach, a gym's owner or desk, an applicant — can ask to
-- delete their account from their own settings. Then:
--
--   * AT ONCE: every session is signed out (the account is locked); future
--     single sessions and class bookings are cancelled with the reason
--     "Account deleted" and the other side told; package offers not yet paid are
--     withdrawn; each gym they belong to is told;
--   * FOR 7 DAYS: signing in shows when it will be erased, and one tap keeps it
--     (cancel_account_deletion);
--   * AFTER 7 DAYS (erase_due_accounts, a re-runnable sweep — pg_cron where it
--     exists, and app loads): KEEP, BUT ANONYMISED — payments, receipts,
--     memberships, visits, bookings and sessions stay in each gym's books under
--     the name "Deleted member"; everything personal is erased: name, email,
--     phone, photo, address, birthday, emergency contact, workouts and sets,
--     routines, programs, plans, measurements, targets, records, progress
--     photos, chats, assistant conversations, health (PAR-Q) answers, badges,
--     notifications, push devices, credentials; their sign-in is closed and the
--     email freed. Files in Storage cannot be removed from SQL, so their paths
--     are queued (erasure_files) and the `erase-accounts` Edge Function removes
--     them with the Storage API.
--
-- Refused while it would leave others stranded:
--   * the only owner of an open gym — "Ask Core Fitness to close the gym or
--     hand it over first", so members are told and can switch;
--   * a coach with a package running (or paid, waiting to start) — "End or
--     hand over your packages first";
--   * the platform's own admin account.
-- Safe to paste again.

create table if not exists account_deletions (
  id           uuid primary key default gen_random_uuid(),
  person       uuid not null references profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  erase_after  timestamptz not null,
  cancelled_at timestamptz,
  erased_at    timestamptz
);
create unique index if not exists uq_account_deletions_open on account_deletions(person)
  where cancelled_at is null and erased_at is null;
alter table account_deletions enable row level security;   -- no policy: definer functions only

create table if not exists erasure_files (
  id        uuid primary key default gen_random_uuid(),
  person    uuid,
  bucket    text not null,
  path      text not null,
  is_prefix boolean not null default false,   -- remove everything under this folder
  queued_at timestamptz not null default now(),
  done_at   timestamptz
);
create index if not exists idx_erasure_files_due on erasure_files(queued_at) where done_at is null;
alter table erasure_files enable row level security;   -- no policy: definer functions only

/** Why this person cannot delete their account yet, or null. */
create or replace function account_deletion_blocker(p_person uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_gym text;
begin
  if exists (select 1 from platform_admins where user_id = p_person) then
    return 'This is Core Fitness''s own admin account. It cannot be deleted here.';
  end if;
  select g.name into v_gym
    from gym_roles r join gyms g on g.id = r.gym_id
   where r.user_id = p_person and r.role = 'admin' and r.status = 'active' and g.status in ('active', 'suspended')
     and not exists (select 1 from gym_roles o where o.gym_id = r.gym_id and o.role = 'admin' and o.status = 'active'
                        and o.user_id <> p_person)
   limit 1;
  if v_gym is not null then
    return 'You own ' || v_gym || '. Ask Core Fitness to close the gym or hand it to another owner first — then its members are told and can switch.';
  end if;
  if exists (select 1 from coachings where trainer_id = p_person and status in ('active', 'payment_sent')) then
    return 'Members are on a package with you. End or hand over each package first (Packages), then delete your account.';
  end if;
  return null;
end;
$$;
revoke all on function account_deletion_blocker(uuid) from public, anon, authenticated;

/** What the settings screens show before asking: whether it can go ahead, and why not. */
create or replace function my_account_deletion() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'pending', (select jsonb_build_object('requested_at', d.requested_at, 'erase_after', d.erase_after)
                  from account_deletions d where d.person = auth.uid() and d.cancelled_at is null and d.erased_at is null),
    'blocked', account_deletion_blocker(auth.uid())) end;
$$;
revoke all on function my_account_deletion() from public, anon;
grant execute on function my_account_deletion() to authenticated;

/** Ask to delete my account. Returns when it will be erased. */
create or replace function request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_block text;
  v_when timestamptz;
  v_name text;
  r record;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select erase_after into v_when from account_deletions where person = me and cancelled_at is null and erased_at is null;
  if v_when is not null then return v_when; end if;
  v_block := account_deletion_blocker(me);
  if v_block is not null then raise exception '%', v_block; end if;

  v_name := display_name_of(me);
  v_when := now() + interval '7 days';
  insert into account_deletions (person, erase_after) values (me, v_when);

  -- Future single sessions and class bookings, theirs as coach or as member: cancelled, the other side told.
  insert into cancellation_reasons (gym_id, key, label, applies_to, needs_note, sort_order, is_active)
  select distinct x.gym_id, 'account_deleted', 'Account deleted', 'any', false, 99, false
    from (select s.gym_id from pt_sessions s where (s.trainer_id = me or s.member_id = me) and s.starts_at > now() and s.status::text in ('pending', 'approved')
          union select b.gym_id from bookings b join classes c on c.id = b.class_id
           where b.member_id = me and c.scheduled_at > now() and b.status::text in ('pending', 'approved')) x
  on conflict (gym_id, key) do nothing;
  perform set_config('corefitness.cancelling', 'on', true);
  for r in select s.id, s.gym_id, s.member_id, s.trainer_id from pt_sessions s
            where (s.trainer_id = me or s.member_id = me) and s.starts_at > now() and s.status::text in ('pending', 'approved') loop
    update pt_sessions set status = 'cancelled', cancelled_at = now(), cancelled_by = me,
           cancelled_by_role = case when r.trainer_id = me then 'trainer' else 'member' end,
           cancellation_reason = 'account_deleted', cancellation_note = 'They deleted their account.'
     where id = r.id;
    if r.trainer_id = me then
      perform notify_once(r.member_id, 'booking', 'Your coach cancelled a session',
        v_name || ' is leaving and cancelled your session. You can book another coach.', '/member/sessions', 'cancel:' || r.id || ':member', r.gym_id);
    elsif r.trainer_id is not null then
      perform notify_once(r.trainer_id, 'booking', 'A booking was cancelled',
        'A member deleted their account, so their session is cancelled.', '/trainer/schedule', 'cancel:' || r.id || ':trainer', r.gym_id);
    end if;
  end loop;
  update bookings b set status = 'cancelled', cancelled_at = now(), cancelled_by = me, cancelled_by_role = 'member',
         cancellation_reason = 'account_deleted', cancellation_note = 'They deleted their account.'
    from classes c
   where c.id = b.class_id and b.member_id = me and c.scheduled_at > now() and b.status::text in ('pending', 'approved');

  -- Package offers and asks not yet paid are withdrawn.
  update coachings set status = 'cancelled', end_reason = 'Account deleted', updated_at = now()
   where (trainer_id = me or member_id = me) and status in ('invited', 'requested', 'awaiting_payment');

  -- Each gym they belong to is told: the desk sees why their name goes.
  for r in select distinct gr.gym_id, gr.role from gym_roles gr where gr.user_id = me and gr.status in ('active', 'pending_approval') loop
    perform act_as_gym(r.gym_id);
    perform notify_once(o.user_id, 'system', 'An account is being deleted',
        v_name || ' (' || r.role || ') asked to delete their account. It is erased on '
          || to_char(v_when at time zone 'Asia/Manila', 'FMMonth FMDD') || ' unless they sign back in and keep it. Their payments and visits stay in your records as "Deleted member".',
        '/members', 'deletion:' || me || ':' || o.user_id, r.gym_id)
      from gym_roles o where o.gym_id = r.gym_id and o.role = 'admin' and o.status = 'active' and o.user_id <> me;
  end loop;
  perform act_as_gym(null);
  perform platform_log(null, 'account.deletion_requested', v_name || ' asked to delete their account', jsonb_build_object('person', me, 'erase_after', v_when));

  -- Locked at once: every device is signed out.
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using me;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using me;
  end if;
  return v_when;
end;
$$;
revoke all on function request_account_deletion() from public, anon;
grant execute on function request_account_deletion() to authenticated;

/** Keep my account: signing in within the 7 days offers this. */
create or replace function cancel_account_deletion() returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid; r record;
begin
  if me is null then return false; end if;
  update account_deletions set cancelled_at = now()
   where person = me and cancelled_at is null and erased_at is null
  returning id into v_id;
  if v_id is null then return false; end if;
  for r in select distinct gr.gym_id from gym_roles gr where gr.user_id = me and gr.status in ('active', 'pending_approval') loop
    perform act_as_gym(r.gym_id);
    perform notify_once(o.user_id, 'system', 'An account is staying',
        display_name_of(me) || ' signed back in and kept their account.', '/members', 'deletion-kept:' || v_id || ':' || o.user_id, r.gym_id)
      from gym_roles o where o.gym_id = r.gym_id and o.role = 'admin' and o.status = 'active' and o.user_id <> me;
  end loop;
  perform act_as_gym(null);
  perform platform_log(null, 'account.deletion_cancelled', display_name_of(me) || ' kept their account', jsonb_build_object('person', me));
  return true;
end;
$$;
revoke all on function cancel_account_deletion() from public, anon;
grant execute on function cancel_account_deletion() to authenticated;

-- 0039's qr_code guard, letting the erase through: only erase_account() sets this
-- transaction-local flag (as 0081's cancel_booking sets corefitness.cancelling).
create or replace function prevent_member_profile_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('corefitness.erasing', true), '') = 'on' then return new; end if;
  if get_my_role() is distinct from 'admin' then
    if new.qr_code is distinct from old.qr_code then
      raise exception 'Only admins can change qr_code';
    end if;
  end if;
  return new;
end;
$$;

/** Erase one person: keep the gym's books, anonymised; remove everything personal. */
create or replace function erase_account(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('corefitness.erasing', 'on', true);
  -- Files first (queued: Storage is removed by the erase-accounts Edge Function).
  insert into erasure_files (person, bucket, path, is_prefix) values (p, 'avatars', p::text || '/', true);
  insert into erasure_files (person, bucket, path) select p, 'progress', x.path from progress_photos x where x.member_id = p and x.path is not null;
  insert into erasure_files (person, bucket, path) select p, 'credentials', x.file_path from trainer_credentials x where x.trainer_id = p and x.file_path is not null;
  insert into erasure_files (person, bucket, path) select p, 'media', u from room_posts x, unnest(array[x.photo_url, x.video_url]) u
   where x.author_id = p and u is not null;
  insert into erasure_files (person, bucket, path)
  select p, 'applications', d.path from application_documents d join gym_applications a on a.id = d.application_id
   where a.applicant_id = p and a.status <> 'approved' and d.path is not null;

  -- An application still waiting is called off; one not let in loses its documents.
  update gym_applications set status = 'withdrawn' where applicant_id = p and status = 'pending';
  delete from application_documents d using gym_applications a
   where a.id = d.application_id and a.applicant_id = p and a.status <> 'approved';

  -- Everything personal.
  delete from workout_logs where member_id = p;               -- sets go with them
  delete from workout_routines where member_id = p;
  delete from workout_plans where member_id = p;
  delete from gym_plans where member_id = p;
  delete from gym_programs where member_id = p;               -- their own programs; days and enrolments go with them
  delete from program_enrolments where member_id = p;
  delete from body_measurements where member_id = p;
  delete from fitness_goals where member_id = p;
  delete from personal_records where member_id = p;
  delete from progress_photos where member_id = p;
  delete from conversations where member_id = p or trainer_id = p;   -- messages go with them
  delete from messages where sender_id = p;
  delete from room_posts where author_id = p;                 -- comments on them go too
  delete from room_comments where author_id = p;
  delete from room_submissions where member_id = p;
  delete from assistant_conversations where user_id = p;      -- messages go with them
  delete from ai_coach_profiles where member_id = p;
  delete from ai_meal_guides where member_id = p;
  delete from ai_proposals where member_id = p;
  delete from ai_usage_days where member_id = p;
  delete from achievement_unlocks where user_id = p;
  delete from streak_milestones where member_id = p;
  delete from checkin_picks where member_id = p;
  delete from saved_resources where member_id = p;
  delete from member_share_prefs where member_id = p;
  delete from referral_codes where member_id = p;
  delete from notifications where user_id = p;
  delete from notification_prefs where user_id = p;
  delete from push_subscriptions where user_id = p;
  delete from tours_seen where person_id = p;
  delete from app_release_reads where user_id = p;
  delete from announcement_dismissals where user_id = p;
  delete from trainer_credentials where trainer_id = p;
  delete from trainer_payment_methods where trainer_id = p;
  update payment_accounts set disconnected_at = coalesce(disconnected_at, now()) where trainer_id = p;
  -- The signed waiver stays (a record of what was agreed); the health answers do not.
  update waiver_acceptances set par_q = null where member_id = p;
  -- A package still running as a member ends.
  update coachings set status = 'ended', end_reason = 'Account deleted', ended_at = now(), updated_at = now()
   where member_id = p and status = 'active';

  -- The gym's books keep the rows; the name becomes "Deleted member".
  update member_profiles set address = null, emergency_contact_name = null, emergency_contact_phone = null,
         emergency_contact_relationship = null, date_of_birth = null, gender = null, guardian_consent_name = null,
         interests = '{}', training_focus = null, qr_code = null, show_on_boards = false
   where profile_id = p;
  update trainer_profiles set specialization = null, bio = null, availability = null, certifications = '{}',
         focus_areas = '{}', achievements = null
   where profile_id = p;
  update gym_roles set status = 'archived' where user_id = p;
  update profiles set first_name = 'Deleted', last_name = 'member', email = 'deleted+' || p || '@deleted.invalid',
         phone = null, photo_url = null, active_gym_id = null
   -- status stays: changing it would make 0100's mirror re-file a gym role. erased_at says it.
   where id = p;

  -- Their sign-in is closed and the address freed for anyone to use again.
  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id = $1' using p;
  end if;
  update auth.users set email = 'deleted+' || p || '@deleted.invalid', raw_user_meta_data = '{}'::jsonb where id = p;
  begin
    execute 'update auth.users set banned_until = ''infinity'', phone = null where id = $1' using p;
  exception when undefined_column then null;
  end;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p;
  end if;
  perform set_config('corefitness.erasing', 'off', true);
end;
$$;
revoke all on function erase_account(uuid) from public, anon, authenticated;

/**
 * The sweep: erase every account whose 7 days are up. Re-runnable — it touches
 * only those, once. Called by pg_cron (where present), the erase-accounts Edge
 * Function and app loads; returns how many were erased.
 */
create or replace function erase_due_accounts() returns int
language plpgsql security definer set search_path = public as $$
declare d record; n int := 0;
begin
  for d in select * from account_deletions where cancelled_at is null and erased_at is null and erase_after <= now()
            for update skip locked loop
    perform erase_account(d.person);
    update account_deletions set erased_at = now() where id = d.id;
    perform platform_log(null, 'account.erased', 'An account was erased (7 days after it asked)', jsonb_build_object('person', d.person));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function erase_due_accounts() from public, anon;
grant execute on function erase_due_accounts() to authenticated, service_role;

/** For the Edge Function: files still to remove. */
create or replace function erasure_files_due() returns table (id uuid, bucket text, path text, is_prefix boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.bucket, f.path, f.is_prefix from erasure_files f where f.done_at is null order by f.queued_at limit 500;
$$;
revoke all on function erasure_files_due() from public, anon, authenticated;
grant execute on function erasure_files_due() to service_role;

create or replace function erasure_files_done(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update erasure_files set done_at = now() where id = any(p_ids) and done_at is null;
$$;
revoke all on function erasure_files_done(uuid[]) from public, anon, authenticated;
grant execute on function erasure_files_done(uuid[]) to service_role;

/** The platform's view: who asked, when it is erased, and files still waiting. */
create or replace function platform_account_deletions()
returns table (person uuid, name text, requested_at timestamptz, erase_after timestamptz, cancelled_at timestamptz, erased_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.person, display_name_of(d.person), d.requested_at, d.erase_after, d.cancelled_at, d.erased_at
    from account_deletions d where is_platform_admin() order by d.requested_at desc limit 200;
$$;
revoke all on function platform_account_deletions() from public, anon;
grant execute on function platform_account_deletions() to authenticated;

-- Once a day where pg_cron exists (the Edge Function and app loads cover the rest).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('erase-due-accounts', '15 18 * * *', 'select erase_due_accounts()');
  end if;
end
$$;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0225_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0225_applied() to anon, authenticated;
