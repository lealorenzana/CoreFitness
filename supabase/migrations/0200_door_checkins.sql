-- ============================================================================
-- 0200 — The door: members pick their activity, coaches check in too
-- ============================================================================
--
-- Two switches the owner sets (Setup → Checking in, and Settings):
--
--   member_activity_pick  On by default. A member taps what they are doing
--                         today on their QR screen ("Gym floor", "Class"…, the
--                         gym's own activity_options) and may make it their
--                         usual. The check-in takes it, whichever way the desk
--                         takes the check-in (scan, kiosk, typed, searched).
--                         The desk's own tag wins — a member's pick only fills
--                         an empty activity. Which one it was is recorded
--                         (attendance.activity_by), by a trigger, so the
--                         screen can say "their pick" or "desk" truthfully.
--
--   coach_checkin_on      Off by default. Each coach gets a QR in the trainer
--                         app; the desk and the kiosk check them in. Their own
--                         table (coach_checkins): a coach is never a member
--                         visit, so no points, streaks, badges or member
--                         counts — and nothing is written to attendance.
--
-- Also attendance.source ('desk' | 'kiosk'), set by the app, so Today and
-- History can say where a check-in was taken. NULL on older rows. And
-- frequent_guests(): walk-ins with 3+ visits in 30 days, for Walk-ins'
-- "Guests who could join".
-- ============================================================================

alter table gym_settings add column if not exists member_activity_pick boolean not null default true;
alter table gym_settings add column if not exists coach_checkin_on boolean not null default false;

alter table attendance add column if not exists source text check (source is null or source in ('desk', 'kiosk'));
alter table attendance add column if not exists activity_by text check (activity_by is null or activity_by in ('member', 'desk'));

-- The owner's two switches. Only the owner; the desk works the door, it does not set its rules.
create or replace function set_door_settings(p_member_pick boolean, p_coach_checkin boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner changes how check-in works.' using errcode = '42501';
  end if;
  update gym_settings set member_activity_pick = coalesce(p_member_pick, member_activity_pick),
                          coach_checkin_on = coalesce(p_coach_checkin, coach_checkin_on)
   where gym_id = acting_gym_id();
  if not found then raise exception 'This gym has no settings row yet.'; end if;
end;
$$;
revoke all on function set_door_settings(boolean, boolean) from public, anon;
grant execute on function set_door_settings(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- A member's pick: today's, and their usual. One row per member per gym.
-- Written only through set_my_checkin_pick() — no write policy for anyone.
-- ---------------------------------------------------------------------------
create table if not exists checkin_picks (
  gym_id     uuid not null default current_gym_id() references gyms(id) on delete cascade,
  member_id  uuid not null references profiles(id) on delete cascade,
  usual      text check (usual is null or length(usual) between 1 and 60),
  today      text check (today is null or length(today) between 1 and 60),
  today_on   date,
  updated_at timestamptz not null default now(),
  primary key (gym_id, member_id)
);
alter table checkin_picks enable row level security;
drop policy if exists checkin_picks_read on checkin_picks;
create policy checkin_picks_read on checkin_picks for select to authenticated
  using (member_id = auth.uid() or is_front_desk());
grant select on checkin_picks to authenticated;

-- p_activity: what they are doing today (NULL = nothing picked today, which
-- also means "not my usual today"). p_usual: true makes it the usual, false
-- clears the usual, NULL leaves the usual alone (a different pick just for
-- today). One of the gym's activity_options, or refused.
create or replace function set_my_checkin_pick(p_activity text, p_usual boolean default null)
returns table (today text, usual text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_gym uuid := current_gym_id(); s record; v text := nullif(btrim(coalesce(p_activity, '')), '');
begin
  if auth.uid() is null or get_my_role() is distinct from 'member' then
    raise exception 'Only a member picks their check-in activity.' using errcode = '42501';
  end if;
  select gs.member_activity_pick, gs.activity_options into s from gym_settings gs where gs.gym_id = v_gym;
  if not coalesce(s.member_activity_pick, false) then
    raise exception 'Your gym tags check-ins at the desk.';
  end if;
  if v is not null and not (v = any (coalesce(s.activity_options, '{}'::text[]))) then
    raise exception '"%" is not one of this gym''s activities.', v;
  end if;
  insert into checkin_picks as c (gym_id, member_id, today, today_on, usual, updated_at)
  values (v_gym, auth.uid(), v, manila_today(), case when p_usual then v end, now())
  on conflict (gym_id, member_id) do update
     set today = excluded.today, today_on = excluded.today_on,
         usual = case when p_usual is true then excluded.today when p_usual is false then null else c.usual end, updated_at = now();
  return query select c.today, c.usual from checkin_picks c where c.gym_id = v_gym and c.member_id = auth.uid();
end;
$$;
revoke all on function set_my_checkin_pick(text, boolean) from public, anon;
grant execute on function set_my_checkin_pick(text, boolean) to authenticated;

-- The pick the check-in takes: today's if they picked today (even "nothing"),
-- else their usual. The desk's tag wins. activity_by is the trigger's to say,
-- never the client's.
create or replace function trg_attendance_pick() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text; p checkin_picks; on_ boolean;
begin
  if nullif(btrim(coalesce(new.activity, '')), '') is not null then
    new.activity_by := 'desk';
    return new;
  end if;
  new.activity := null;
  new.activity_by := null;
  select coalesce(gs.member_activity_pick, false) into on_ from gym_settings gs where gs.gym_id = new.gym_id;
  if not coalesce(on_, false) then return new; end if;
  select * into p from checkin_picks c where c.gym_id = new.gym_id and c.member_id = new.member_id;
  if p.member_id is null then return new; end if;
  v := case when p.today_on = (new.check_in_time at time zone 'Asia/Manila')::date then p.today else p.usual end;
  if v is not null then
    new.activity := v;
    new.activity_by := 'member';
  end if;
  return new;
end;
$$;
revoke all on function trg_attendance_pick() from public, anon, authenticated;
drop trigger if exists a_attendance_pick on attendance;
create trigger a_attendance_pick before insert on attendance
  for each row execute function trg_attendance_pick();

-- ---------------------------------------------------------------------------
-- Coach check-ins. Once a day per coach; the desk (or the kiosk, which runs as
-- the desk) records them; the coach reads their own; the owner and desk read
-- the gym's. Written only through record_coach_checkin().
-- ---------------------------------------------------------------------------
create table if not exists coach_checkins (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default current_gym_id() references gyms(id) on delete cascade,
  trainer_id    uuid not null references profiles(id) on delete cascade,
  check_in_time timestamptz not null default now(),
  day           date not null default (now() at time zone 'Asia/Manila')::date,
  method        text not null default 'qr' check (method in ('qr', 'manual')),
  source        text not null default 'desk' check (source in ('desk', 'kiosk')),
  recorded_by   uuid references profiles(id) on delete set null,
  unique (gym_id, trainer_id, day)
);
create index if not exists coach_checkins_day_idx on coach_checkins (gym_id, day);
alter table coach_checkins enable row level security;
drop policy if exists coach_checkins_read on coach_checkins;
create policy coach_checkins_read on coach_checkins for select to authenticated
  using (trainer_id = auth.uid() or is_front_desk());
grant select on coach_checkins to authenticated;

do $$
declare t text;
begin
  foreach t in array array['checkin_picks', 'coach_checkins'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end
$$;

-- The gym's coaches for the desk and the kiosk, with today's check-in.
create or replace function door_coaches()
returns table (trainer_id uuid, first_name text, last_name text, photo_url text, checked_in_at timestamptz, checkin_id uuid)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.first_name, p.last_name, p.photo_url, c.check_in_time, c.id
    from gym_roles r
    join profiles p on p.id = r.user_id
    left join coach_checkins c on c.gym_id = r.gym_id and c.trainer_id = r.user_id and c.day = manila_today()
   where is_front_desk() and r.gym_id = current_gym_id() and r.role = 'trainer' and r.status = 'active'
   order by c.check_in_time nulls last, p.first_name;
$$;
revoke all on function door_coaches() from public, anon;
grant execute on function door_coaches() to authenticated;

create or replace function record_coach_checkin(p_trainer uuid, p_method text default 'qr', p_source text default 'desk')
returns table (id uuid, check_in_time timestamptz, first_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_gym uuid := current_gym_id(); v_first text; v_row coach_checkins;
begin
  if not is_front_desk() then raise exception 'The front desk checks coaches in.' using errcode = '42501'; end if;
  if not gym_writable() then raise exception 'This gym is read-only right now.' using errcode = '42501'; end if;
  if not coalesce((select gs.coach_checkin_on from gym_settings gs where gs.gym_id = v_gym), false) then
    raise exception 'Coach check-in is off. The owner turns it on in Settings → Gym Information.';
  end if;
  if p_method not in ('qr', 'manual') or p_source not in ('desk', 'kiosk') then raise exception 'Unknown way of checking in.'; end if;
  select p.first_name into v_first
    from gym_roles r join profiles p on p.id = r.user_id
   where r.gym_id = v_gym and r.user_id = p_trainer and r.role = 'trainer' and r.status = 'active';
  if not found then raise exception 'That code is not one of this gym''s coaches.'; end if;
  begin
    insert into coach_checkins (gym_id, trainer_id, method, source, recorded_by)
    values (v_gym, p_trainer, p_method, p_source, auth.uid()) returning * into v_row;
  exception when unique_violation then
    raise exception '% already checked in today.', coalesce(v_first, 'This coach');
  end;
  return query select v_row.id, v_row.check_in_time, v_first;
end;
$$;
revoke all on function record_coach_checkin(uuid, text, text) from public, anon;
grant execute on function record_coach_checkin(uuid, text, text) to authenticated;

-- The wrong coach scanned: the desk undoes it, today only (as 0035 for members).
create or replace function undo_coach_checkin(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v coach_checkins;
begin
  if not is_front_desk() then raise exception 'The front desk undoes a check-in.' using errcode = '42501'; end if;
  select * into v from coach_checkins where id = p_id and gym_id = current_gym_id() for update;
  if v.id is null then raise exception 'That check-in is not here.'; end if;
  if v.day <> manila_today() then raise exception 'Only today''s check-ins can be undone.'; end if;
  delete from coach_checkins where id = p_id;
end;
$$;
revoke all on function undo_coach_checkin(uuid) from public, anon;
grant execute on function undo_coach_checkin(uuid) to authenticated;

-- Walk-ins who keep coming back (Attendance → Walk-ins, "Guests who could
-- join"): p_min or more visits in the last p_days, with what they have paid.
-- The desk only; guests have no account.
create or replace function frequent_guests(p_days int default 30, p_min int default 3)
returns table (guest_id uuid, name text, phone text, visits int, spent numeric, last_visit date)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.phone, count(*)::int, coalesce(sum(v.amount), 0), max(v.visit_day)
    from guest_visits v join guests g on g.id = v.guest_id
   where is_front_desk() and v.gym_id = current_gym_id() and v.voided_at is null
     and v.visit_day > manila_today() - greatest(1, least(coalesce(p_days, 30), 365))
   group by g.id, g.name, g.phone
  having count(*) >= greatest(1, coalesce(p_min, 3))
   order by count(*) desc, max(v.visit_day) desc
   limit 12;
$$;
revoke all on function frequent_guests(int, int) from public, anon;
grant execute on function frequent_guests(int, int) to authenticated;

-- Every gym table, for the tenancy suite (0185's list plus the two above).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0200_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0200_applied() from public, anon;
grant execute on function migration_0200_applied() to authenticated;
comment on function migration_0200_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0200.sql
