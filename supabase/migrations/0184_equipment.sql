-- ============================================================================
-- 0184 — The gym's equipment: what there is, where it is, what is broken
-- ============================================================================
--
-- The owner keeps an Equipment list (name, category, photo, how many, where in
-- the gym — "2nd floor, cardio zone" — and Available / Under repair / Coming
-- soon). Members see it in the app; each item lists the library exercises that
-- use it, and an exercise says whether this gym has its equipment. The AI
-- coach reads the list (ai_coach_gym_info) so it can swap an exercise for
-- what the gym really has.
--
-- A member taps "Report a problem" on an item (one open report per member per
-- item); the desk is told and marks it Under repair, which members then see;
-- marking it Available closes the reports and tells the people who reported.
--
-- A switch, `equipment`, like any other part of the app (0141).
-- ============================================================================

insert into platform_features (key, label, description, sort_order) values
  ('equipment', 'Equipment',
   'Your equipment list — where each machine is, what is under repair — and members reporting a broken one.', 78)
on conflict (key) do nothing;

create table if not exists gym_equipment (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default current_gym_id() references gyms(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 80),
  category      text not null default 'other'
                check (category in ('cardio', 'machines', 'free_weights', 'benches_racks', 'functional', 'other')),
  photo_url     text,
  quantity      int  not null default 1 check (quantity between 1 and 500),
  location_note text check (location_note is null or length(location_note) <= 80),
  status        text not null default 'available' check (status in ('available', 'repair', 'soon')),
  notes         text check (notes is null or length(notes) <= 300),
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (gym_id, id)
);
create index if not exists gym_equipment_gym_idx on gym_equipment (gym_id, category, sort_order);

-- Which library exercises use an item. The exercise may be a shared one or
-- this gym's own.
create table if not exists equipment_exercises (
  gym_id       uuid not null default current_gym_id() references gyms(id) on delete cascade,
  equipment_id uuid not null,
  exercise_id  uuid not null references exercises(id) on delete cascade,
  primary key (equipment_id, exercise_id),
  foreign key (gym_id, equipment_id) references gym_equipment (gym_id, id) on delete cascade
);
create index if not exists equipment_exercises_ex_idx on equipment_exercises (gym_id, exercise_id);

create table if not exists equipment_reports (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null default current_gym_id() references gyms(id) on delete cascade,
  equipment_id uuid not null,
  member_id    uuid not null references profiles(id) on delete cascade,
  note         text not null check (length(btrim(note)) between 3 and 500),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references profiles(id),
  foreign key (gym_id, equipment_id) references gym_equipment (gym_id, id) on delete cascade
);
create unique index if not exists equipment_reports_one_open on equipment_reports (equipment_id, member_id) where status = 'open';

alter table gym_equipment enable row level security;
alter table equipment_exercises enable row level security;
alter table equipment_reports enable row level security;

-- Everyone at the gym reads the list and its exercises; the owner edits it.
drop policy if exists equipment_read on gym_equipment;
create policy equipment_read on gym_equipment for select to authenticated using (true);
drop policy if exists equipment_owner_insert on gym_equipment;
create policy equipment_owner_insert on gym_equipment for insert to authenticated with check (get_my_role() = 'admin');
drop policy if exists equipment_owner_update on gym_equipment;
create policy equipment_owner_update on gym_equipment for update to authenticated
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');
drop policy if exists equipment_owner_delete on gym_equipment;
create policy equipment_owner_delete on gym_equipment for delete to authenticated using (get_my_role() = 'admin');

drop policy if exists equipment_ex_read on equipment_exercises;
create policy equipment_ex_read on equipment_exercises for select to authenticated using (true);
drop policy if exists equipment_ex_owner_insert on equipment_exercises;
create policy equipment_ex_owner_insert on equipment_exercises for insert to authenticated with check (get_my_role() = 'admin');
drop policy if exists equipment_ex_owner_delete on equipment_exercises;
create policy equipment_ex_owner_delete on equipment_exercises for delete to authenticated using (get_my_role() = 'admin');

-- A member reads their own reports; the desk reads all. Written by functions only.
drop policy if exists equipment_reports_read on equipment_reports;
create policy equipment_reports_read on equipment_reports for select to authenticated
  using (member_id = auth.uid() or is_front_desk());

grant select, insert, update, delete on gym_equipment to authenticated;
grant select, insert, delete on equipment_exercises to authenticated;
grant select on equipment_reports to authenticated;

do $$
declare t text;
begin
  foreach t in array array['gym_equipment', 'equipment_exercises', 'equipment_reports'] loop
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

create or replace function trg_equipment_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists equipment_touch on gym_equipment;
create trigger equipment_touch before update on gym_equipment for each row execute function trg_equipment_touch();

-- ---------------------------------------------------------------------------
-- Reporting and fixing
-- ---------------------------------------------------------------------------
create or replace function report_equipment(p_item uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e gym_equipment; v_id uuid; r record;
begin
  if auth.uid() is null or role_in_gym(current_gym_id()) is null then
    raise exception 'Sign in at this gym first.' using errcode = '42501';
  end if;
  select * into e from gym_equipment where id = p_item and gym_id = current_gym_id();
  if e.id is null then raise exception 'That equipment is not on this gym''s list.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say what is wrong with it.'; end if;
  insert into equipment_reports (gym_id, equipment_id, member_id, note)
  values (e.gym_id, e.id, auth.uid(), left(btrim(p_note), 500)) returning id into v_id;
  for r in select user_id from gym_roles where gym_id = e.gym_id and role in ('admin', 'staff') and status = 'active' loop
    perform notify_once(r.user_id, 'system', 'Equipment problem: ' || e.name,
      display_name_of(auth.uid()) || ': ' || left(btrim(p_note), 140) || coalesce(' (' || e.location_note || ')', ''),
      '/equipment', 'equipment:report:' || v_id || ':' || r.user_id, e.gym_id);
  end loop;
  return v_id;
exception when unique_violation then
  raise exception 'You already reported this one — the desk has it.';
end;
$$;
revoke all on function report_equipment(uuid, text) from public, anon;
grant execute on function report_equipment(uuid, text) to authenticated;

-- The desk (or owner) sets the status. Available closes the open reports and
-- tells whoever reported; Under repair tells them it is being dealt with.
create or replace function set_equipment_status(p_item uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare e gym_equipment; r record;
begin
  if not is_front_desk() then raise exception 'The front desk sets equipment status.' using errcode = '42501'; end if;
  if p_status not in ('available', 'repair', 'soon') then raise exception 'Choose available, under repair, or coming soon.'; end if;
  select * into e from gym_equipment where id = p_item and gym_id = current_gym_id() for update;
  if e.id is null then raise exception 'That equipment is not on this gym''s list.'; end if;
  update gym_equipment set status = p_status where id = p_item;
  for r in select id, member_id from equipment_reports where equipment_id = p_item and status = 'open' loop
    perform notify_once(r.member_id, 'system',
      case when p_status = 'available' then e.name || ' is fixed' else e.name || ' is being repaired' end,
      case when p_status = 'available' then 'Thanks for reporting it — it is back in use.' else 'Thanks for reporting it. The gym has marked it under repair.' end,
      '/member/equipment', 'equipment:' || p_status || ':' || r.id, e.gym_id);
  end loop;
  if p_status = 'available' then
    update equipment_reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
     where equipment_id = p_item and status = 'open';
  end if;
end;
$$;
revoke all on function set_equipment_status(uuid, text) from public, anon;
grant execute on function set_equipment_status(uuid, text) to authenticated;

-- The desk's queue: open reports with the item and who reported.
create or replace function open_equipment_reports() returns table (
  id uuid, equipment_id uuid, equipment_name text, location_note text, status text, note text, member_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, e.id, e.name, e.location_note, e.status, r.note, display_name_of(r.member_id), r.created_at
    from equipment_reports r join gym_equipment e on e.id = r.equipment_id
   where r.gym_id = current_gym_id() and r.status = 'open' and is_front_desk()
   order by r.created_at desc;
$$;
revoke all on function open_equipment_reports() from public, anon;
grant execute on function open_equipment_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- The AI coach sees the list (B8: swap an exercise for what the gym has).
-- 0177's reader, renamed, plus the equipment.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'ai_coach_gym_info' and pronargs = 0)
     and not exists (select 1 from pg_proc where proname = 'ai_coach_gym_info_v1') then
    alter function ai_coach_gym_info() rename to ai_coach_gym_info_v1;
  end if;
end
$$;
revoke all on function ai_coach_gym_info_v1() from public, anon, authenticated;
create or replace function ai_coach_gym_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select ai_coach_gym_info_v1() || jsonb_build_object(
    'equipment', case when gym_module_on(current_gym_id(), 'equipment') then coalesce((
      select jsonb_agg(jsonb_build_object('name', e.name, 'category', e.category, 'how_many', e.quantity,
                                          'where', e.location_note, 'status', e.status) order by e.category, e.sort_order, e.name)
        from gym_equipment e where e.gym_id = current_gym_id()), '[]'::jsonb) else null end);
$$;
revoke all on function ai_coach_gym_info() from public, anon;
grant execute on function ai_coach_gym_info() to authenticated;

-- Gym tables (TENANCY).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
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

create or replace function migration_0184_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0184_applied() from public, anon;
grant execute on function migration_0184_applied() to authenticated;
comment on function migration_0184_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0184.sql
