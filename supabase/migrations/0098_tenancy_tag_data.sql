-- 0098 — Every gym's rows carry the gym. Keys and references become per gym,
-- so the database itself refuses a row that points into another gym: a Gym B
-- booking of a Gym A class fails on its foreign key, whatever the app sends.
--
-- The acting gym. gym_id defaults to acting_gym_id(): the gym that system
-- code set for this transaction (a sweep, the seeding of a new gym, an Edge
-- Function) or else the signed-in caller's current gym. A trigger that files a
-- side row (a plan's features, an activity-log line, a notification) therefore
-- lands in the right gym without naming it, and an insert with neither fails
-- on NOT NULL — loudly, never into a guessed gym. The same-gym rules (0099)
-- check current_gym_id(), not the acting gym, so a client gains nothing by it.
--
-- Transition keys. A key that widens to include gym_id breaks every
-- `on conflict (<old columns>)` that names it. Where a function still does,
-- the old key stays, renamed *_transition, and is dropped by the migration
-- that rewrites that function (0100, 0102, 0103). Three are targeted by the
-- apps' own upserts (body measurements, share preferences, trainer ratings)
-- and stay until the apps move in Part B.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 3)

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_plans','gym_settings','invoice_counters','member_profiles',
    'member_share_prefs','membership_events','membership_plans','memberships','notifications',
    'payments','pending_registrations','plan_features','point_ledger','point_rules','pt_sessions',
    'refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','workout_logs','workout_plans','workout_routine_exercises','workout_routines',
    'workout_sets']::text[]
$$;
comment on function tenancy_gym_tables() is
  'Every table whose rows belong to one gym. 0099 puts the same-gym rules on exactly these.';

-- ---- the acting gym ------------------------------------------------------------

-- The acting gym: what system code set for this transaction, else the signed-in
-- caller's current gym, else — only while exactly one gym exists — that gym.
-- The last is a fact, not a guess: it keeps pg_cron sweeps and today's Edge
-- Functions working between this paste and the function rewrites (0100–0103).
-- From the second gym on, code with no caller must name its gym.
create or replace function acting_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('cf.acting_gym', true), '')::uuid,
                  current_gym_id(),
                  (select min(id::text)::uuid from gyms having count(*) = 1));
$$;

-- For system code: every row written for the rest of this transaction belongs to p_gym.
create or replace function act_as_gym(p_gym uuid) returns void
language sql volatile as $$
  select set_config('cf.acting_gym', coalesce(p_gym::text, ''), true);
$$;
revoke all on function act_as_gym(uuid) from public, anon, authenticated;

-- ---- 1. the prototype's text gym_id columns (0001) go; nothing reads them -------

alter table member_profiles drop column if exists gym_id;
alter table attendance drop column if exists gym_id;

-- ---- 2. gym_id on every gym table: add, backfill, default, not null -------------

do $$
declare t text;
begin
  foreach t in array tenancy_gym_tables() loop
    execute format('alter table %I add column if not exists gym_id uuid references gyms(id)', t);
    execute format('update %I set gym_id = gym_one() where gym_id is null', t);
    execute format('alter table %I alter column gym_id set default acting_gym_id()', t);
    execute format('alter table %I alter column gym_id set not null', t);
    execute format('create index if not exists %I on %I (gym_id)', t || '_gym_idx', t);
  end loop;
end $$;

-- The library: NULL is the Core Fitness library every gym reads; a gym's own
-- additions carry its id. Errors: NULL when the screen broke before sign-in.
alter table exercises         add column if not exists gym_id uuid references gyms(id);
alter table workout_resources add column if not exists gym_id uuid references gyms(id);
alter table client_errors     add column if not exists gym_id uuid references gyms(id);
alter table exercises         alter column gym_id set default acting_gym_id();
alter table workout_resources alter column gym_id set default acting_gym_id();
alter table client_errors     alter column gym_id set default acting_gym_id();
update client_errors set gym_id = gym_one() where gym_id is null;

-- ---- 3. park every foreign key between two gym tables -------------------------

drop table if exists _tenancy_fk;
create temporary table _tenancy_fk (src text, name text, def text);
insert into _tenancy_fk
select c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.contype = 'f'
  and c.conrelid::regclass::text = any(tenancy_gym_tables())
  and c.confrelid::regclass::text = any(tenancy_gym_tables());

do $$
declare r record;
begin
  for r in select * from _tenancy_fk loop
    execute format('alter table %I drop constraint %I', r.src, r.name);
  end loop;
end $$;

-- ---- 4. keys per gym ------------------------------------------------------------

-- Text keys: each gym has its own rules, reasons, templates and badges.
alter table achievements         drop constraint achievements_pkey,         add constraint achievements_pkey primary key (gym_id, key);
alter table cancellation_reasons drop constraint cancellation_reasons_pkey, add constraint cancellation_reasons_pkey primary key (gym_id, key);
alter table goal_templates       drop constraint goal_templates_pkey,       add constraint goal_templates_pkey primary key (gym_id, key);
alter table point_rules          drop constraint point_rules_pkey,          add constraint point_rules_pkey primary key (gym_id, key);
alter table cash_closeouts       drop constraint cash_closeouts_pkey,       add constraint cash_closeouts_pkey primary key (gym_id, day);
alter table trainer_profiles     drop constraint trainer_profiles_pkey,     add constraint trainer_profiles_pkey primary key (gym_id, profile_id);
alter table gym_plans            drop constraint gym_plans_member_id_day_of_week_key,
                                 add constraint gym_plans_member_id_day_of_week_key unique (gym_id, member_id, day_of_week);

-- gym_settings: one row per gym. `id` stays (always true, no longer the key)
-- so every `.eq('id', true)` read keeps working; the same-gym rule leaves each
-- gym exactly its own row.
alter table gym_settings drop constraint gym_settings_pkey, add constraint gym_settings_pkey primary key (gym_id);

-- Widened, with the old key kept for the functions that still name it.
alter table invoice_counters drop constraint invoice_counters_pkey,
  add constraint invoice_counters_pkey primary key (gym_id, year),
  add constraint invoice_counters_year_transition unique (year);                     -- dropped in 0100

alter table member_profiles drop constraint member_profiles_pkey,
  add constraint member_profiles_pkey primary key (gym_id, profile_id),
  add constraint member_profiles_profile_id_transition unique (profile_id);          -- dropped in 0100
alter table member_profiles rename constraint member_profiles_qr_code_key to member_profiles_qr_code_transition; -- 0100
alter table member_profiles add constraint member_profiles_qr_code_key unique (gym_id, qr_code);

alter table freemium_trials drop constraint freemium_trials_pkey,
  add constraint freemium_trials_pkey primary key (gym_id, member_id),
  add constraint freemium_trials_member_id_transition unique (member_id);            -- dropped in 0100

alter table pending_registrations rename constraint pending_registrations_email_key to pending_registrations_email_transition; -- 0100
alter table pending_registrations add constraint pending_registrations_email_key unique (gym_id, email);

alter table achievement_unlocks rename constraint achievement_unlocks_user_id_achievement_key_key
  to achievement_unlocks_user_key_transition;                                        -- dropped in 0102
alter table achievement_unlocks add constraint achievement_unlocks_user_id_achievement_key_key
  unique (gym_id, user_id, achievement_key);

alter table point_ledger rename constraint point_ledger_member_id_rule_key_source_table_source_id_key
  to point_ledger_source_transition;                                                  -- dropped in 0102
alter table point_ledger add constraint point_ledger_member_id_rule_key_source_table_source_id_key
  unique (gym_id, member_id, rule_key, source_table, source_id);

-- The apps upsert on these three; they stay until Part B moves the apps.
alter table member_share_prefs drop constraint member_share_prefs_pkey,
  add constraint member_share_prefs_pkey primary key (gym_id, member_id),
  add constraint member_share_prefs_member_id_transition unique (member_id);          -- Part B clean-up
alter table body_measurements rename constraint body_measurements_member_id_measured_on_key
  to body_measurements_member_day_transition;                                          -- Part B clean-up
alter table body_measurements add constraint body_measurements_member_id_measured_on_key
  unique (gym_id, member_id, measured_on);
alter table trainer_ratings drop constraint trainer_ratings_pkey,
  add constraint trainer_ratings_pkey primary key (gym_id, member_id, trainer_id, period),
  add constraint trainer_ratings_period_transition unique (member_id, trainer_id, period); -- Part B clean-up

-- Unique indexes.
drop index if exists payments_invoice_number_key;
create unique index payments_invoice_number_key on payments (gym_id, invoice_number);

alter index notifications_dedupe_unique rename to notifications_dedupe_transition;    -- dropped in 0103
create unique index notifications_dedupe_unique on notifications (gym_id, user_id, (metadata ->> 'dedupe'))
  where metadata ? 'dedupe';

alter index renewal_requests_one_open rename to renewal_requests_one_open_transition;  -- dropped in 0100
create unique index renewal_requests_one_open on renewal_requests (gym_id, member_id) where status = 'open';

drop index if exists exercises_name_unique;
create unique index exercises_name_unique
  on exercises (coalesce(gym_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
drop index if exists workout_resources_url_unique;
create unique index workout_resources_url_unique
  on workout_resources (coalesce(gym_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(url));

-- ---- 5. unique (gym_id, <key>) wherever the key does not already lead with gym_id,
--         so a reference can name the gym as well as the row ------------------------

do $$
declare t text; k text;
begin
  foreach t in array tenancy_gym_tables() loop
    select string_agg(quote_ident(a.attname), ', ' order by array_position(c.conkey, a.attnum)) into k
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.conrelid = t::regclass and c.contype = 'p';
    if k is not null and k not like 'gym_id%' then
      execute format('alter table %I add constraint %I unique (gym_id, %s)', t, t || '_gym_key', k);
    end if;
  end loop;
end $$;

-- ---- 6. every parked foreign key comes back with gym_id in front ---------------
-- ON DELETE SET NULL names its column, or it would null gym_id too.

do $$
declare r record; d text; col text;
begin
  for r in select * from _tenancy_fk loop
    col := substring(r.def from 'FOREIGN KEY \((\w+)\)');
    d := regexp_replace(r.def, 'FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)',
                        'FOREIGN KEY (gym_id, \1) REFERENCES \2(gym_id, \3)');
    d := replace(d, 'ON DELETE SET NULL', format('ON DELETE SET NULL (%I)', col));
    execute format('alter table %I add constraint %I %s', r.src, r.name, d);
  end loop;
end $$;
drop table _tenancy_fk;

-- ---- 7. gym_settings: the brand colour; the gym's name has one home ---------------

alter table gym_settings alter column id set default true;
alter table gym_settings add column if not exists accent text not null default 'violet'
  check (accent in ('violet', 'indigo', 'blue', 'teal', 'emerald', 'rose', 'orange', 'slate'));

create or replace function trg_gym_settings_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gyms set name = new.gym_name
   where id = new.gym_id and name is distinct from new.gym_name;
  return new;
end;
$$;
drop trigger if exists gym_settings_name on gym_settings;
create trigger gym_settings_name after insert or update of gym_name on gym_settings
  for each row execute function trg_gym_settings_name();

-- The sign-up list gains each gym's public branding (a new return type: drop first).
drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, s.accent
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
revoke all on function list_gyms(text) from public;
grant execute on function list_gyms(text) to anon, authenticated;

-- ---- 7b. the activity log names its gym ----------------------------------------
-- In 0098, not 0103, because a profile created with no caller (today's
-- create-member Edge Function) logs a line and must not fail on the new NOT
-- NULL. The actor's role is their role in that gym (profiles.role is global).

drop function if exists log_activity(text, text, uuid, uuid, text, jsonb);
create function log_activity(
  p_action       text,
  p_subject_type text,
  p_subject_id   uuid,
  p_member_id    uuid,
  p_summary      text,
  p_detail       jsonb default null,
  p_gym          uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_gym   uuid := coalesce(p_gym, acting_gym_id());
  v_role  text;
  v_label text;
begin
  -- Left join semantics by hand: a caller with no profile row (mid-sign-up, or
  -- a pg_cron job with no session at all) still logs, with a null actor.
  select nullif(trim(p.first_name || ' ' || p.last_name), ''),
         (select r.role::text from gym_roles r where r.user_id = p.id and r.gym_id = v_gym)
    into v_label, v_role
    from profiles p
   where p.id = v_actor;

  insert into activity_log (
    gym_id, actor_id, actor_role, actor_label,
    action, subject_type, subject_id, member_id, summary, detail
  ) values (
    v_gym, v_actor, v_role, v_label,
    p_action, p_subject_type, p_subject_id, p_member_id, p_summary, p_detail
  );
end;
$$;

-- A new account is logged in the gym it joined; a change, in the gym of whoever made it.
create or replace function log_profile_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.first_name || ' ' || new.last_name), ''), new.email);
  v_gym  uuid := case when tg_op = 'INSERT' then coalesce(new.active_gym_id, acting_gym_id())
                      else coalesce(acting_gym_id(), new.active_gym_id) end;
begin
  if tg_op = 'INSERT' then
    perform log_activity(
      case when new.status = 'pending_approval' then 'member.registered' else 'account.created' end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      case when new.status = 'pending_approval'
           then v_name || ' registered and is awaiting approval'
           else v_name || ' was added as ' || new.role::text end,
      jsonb_build_object('role', new.role, 'status', new.status, 'email', new.email),
      v_gym);
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity(
      case
        when old.status = 'pending_approval' and new.status = 'active' then 'member.approved'
        when new.status = 'suspended' then 'member.suspended'
        when new.status = 'archived'  then 'member.archived'
        when old.status in ('suspended','archived') and new.status = 'active' then 'member.reinstated'
        else 'account.status_changed'
      end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      v_name || ' — ' || old.status::text || ' → ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'role', new.role),
      v_gym);
  end if;

  -- Rare and significant: someone gained or lost desk access.
  if new.role is distinct from old.role then
    perform log_activity('account.role_changed', 'profile', new.id, null,
      v_name || ' changed from ' || old.role::text || ' to ' || new.role::text,
      jsonb_build_object('from', old.role, 'to', new.role),
      v_gym);
  end if;
  return new;
end;
$$;

-- ---- 8. a new gym starts with Gym #1's rules, not an empty shell ------------------

create or replace function seed_gym_defaults(p_gym uuid, p_from uuid default gym_one()) returns void
language plpgsql security definer set search_path = public as $$
declare
  p record; v_new uuid;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'Only the platform can set up a gym.';
  end if;
  if not exists (select 1 from gyms where id = p_gym) then
    raise exception 'No such gym.';
  end if;
  perform act_as_gym(p_gym);

  -- Settings: the rules travel, the identity does not (name, contacts, logo are the gym's own).
  insert into gym_settings (gym_id, gym_name, activity_options, max_freeze_days_per_year,
                            max_freeze_days_at_once, refund_processing_fee, refund_fee_reason)
  select p_gym, g.name, s.activity_options, s.max_freeze_days_per_year,
         s.max_freeze_days_at_once, s.refund_processing_fee, s.refund_fee_reason
  from gyms g, gym_settings s
  where g.id = p_gym and s.gym_id = p_from
  on conflict (gym_id) do nothing;

  insert into point_rules (gym_id, key, label, points, is_active, sort_order)
  select p_gym, key, label, points, is_active, sort_order from point_rules where gym_id = p_from
  on conflict do nothing;

  insert into cancellation_reasons (gym_id, key, label, applies_to, needs_note, sort_order, is_active)
  select p_gym, key, label, applies_to, needs_note, sort_order, is_active
  from cancellation_reasons where gym_id = p_from
  on conflict do nothing;

  insert into goal_templates (gym_id, key, label, description, measured_as, metric, period_days,
                              target_default, is_active, sort_order)
  select p_gym, key, label, description, measured_as, metric, period_days,
         target_default, is_active, sort_order
  from goal_templates where gym_id = p_from
  on conflict do nothing;

  insert into achievements (gym_id, key, audience, title, description, requirement, icon, tier,
                            category, rule_kind, metric, threshold, metric2, threshold2, active,
                            builtin, sort_order)
  select p_gym, key, audience, title, description, requirement, icon, tier,
         category, rule_kind, metric, threshold, metric2, threshold2, active, builtin, sort_order
  from achievements where gym_id = p_from
  on conflict do nothing;

  insert into refund_rules (gym_id, priority, label, min_days, max_days, requires_visits, percent, is_active)
  select p_gym, priority, label, min_days, max_days, requires_visits, percent, is_active
  from refund_rules where gym_id = p_from
    and not exists (select 1 from refund_rules x where x.gym_id = p_gym);

  -- Plans: new ids; each plan's feature switches copied onto its twin.
  if not exists (select 1 from membership_plans where gym_id = p_gym) then
    for p in select * from membership_plans where gym_id = p_from and is_active loop
      insert into membership_plans (gym_id, name, tier, price, duration_days, description, is_active,
                                    can_book_classes, can_book_pt, class_bookings_per_week,
                                    pt_sessions_per_month)
      values (p_gym, p.name, p.tier, p.price, p.duration_days, p.description, true,
              p.can_book_classes, p.can_book_pt, p.class_bookings_per_week, p.pt_sessions_per_month)
      returning id into v_new;
      insert into plan_features (gym_id, plan_id, feature_key, enabled, quota)
      select p_gym, v_new, feature_key, enabled, quota from plan_features where plan_id = p.id
      on conflict (plan_id, feature_key) do update set enabled = excluded.enabled, quota = excluded.quota;
    end loop;
  end if;

  perform act_as_gym(null);
end;
$$;
revoke all on function seed_gym_defaults(uuid, uuid) from public, anon;

create or replace function migration_0098_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0098_applied() from public, anon;
grant execute on function migration_0098_applied() to authenticated;
comment on function migration_0098_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0098.sql
