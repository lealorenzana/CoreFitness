-- ============================================================================
-- 0168 — Remove demo data also removes part 3
-- ============================================================================
--
-- scripts/demo-data/part3 gives one real member two years of history and fills
-- the gym's newer parts (shop, seasons, squads, rooms, chat, programs). Every
-- row it writes carries a demo id, 5eed3___-0000-4000-8000-…, but 0117's
-- remove_demo_data() only knew the tables parts 1 and 2 filled, and it finds
-- rows mostly by *demo people* — part 3's rows belong to a real member, so
-- they would have stayed behind.
--
-- 0117's function is kept, renamed, and called last; the new remove_demo_data()
-- first deletes part 3's rows by id, children before parents, with user
-- triggers off as 0117 does (a delete must not award points or write the log).
-- Only rows with a part 3 id are touched: the member's own real check-ins,
-- payments and membership stay exactly as they were.
--
-- It also fixes 0117 on today's schema. Everything built after it — rooms,
-- chat, squads, programs, the shop… — can point at a demo person, and 0117
-- deletes the demo people last, so the first such row (live: 168 rooms run by
-- demo coaches) made the whole removal fail. Before 0117's part runs, every
-- foreign key that points at a person is swept: a row that cannot exist
-- without the demo person is deleted, a nullable "recorded by" is cleared.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_proc where proname = 'remove_demo_data' and pronamespace = 'public'::regnamespace)
     and not exists (select 1 from pg_proc where proname = 'remove_demo_data_parts_1_2' and pronamespace = 'public'::regnamespace) then
    alter function remove_demo_data() rename to remove_demo_data_parts_1_2;
  end if;
end $$;
revoke all on function remove_demo_data_parts_1_2() from public, anon, authenticated;

create or replace function remove_demo_data() returns text
language plpgsql security definer set search_path = public as $fn$
declare
  t text;
  v_n bigint;
  v_total bigint := 0;
  v_rest text;
  v_people uuid[];
  v_pass int;
  fk record;
  -- Children before parents, so no foreign key refuses a delete.
  v_tables text[] := array[
    'messages', 'conversations', 'room_submissions', 'room_assignments', 'room_posts', 'rooms',
    'trainer_feedback', 'pt_sessions', 'bookings', 'program_enrolments',
    'workout_sets', 'workout_logs', 'workout_routine_exercises', 'workout_routines', 'gym_plans',
    'point_ledger', 'achievement_unlocks', 'body_measurements', 'fitness_goals',
    'payments', 'memberships', 'attendance',
    'stock_moves', 'shop_sale_items', 'shop_sales', 'shop_products',
    'season_claims', 'season_tiers', 'squad_weeks', 'squad_members', 'squads',
    'reward_redemptions', 'event_registrations', 'streak_milestones', 'notifications'];
begin
  if not is_platform_admin() then
    raise exception 'Only Core Fitness can remove the demo data.' using errcode = '42501';
  end if;
  foreach t in array v_tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I disable trigger user', t);
    execute format('delete from %I where id::text like %L', t, '5eed3___-0000-4000-8000-%');
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    execute format('alter table %I enable trigger user', t);
  end loop;
  -- Every table that points at a person, swept for demo people, a few passes
  -- so a row blocked by its own children goes once they have.
  select coalesce(array_agg(id), '{}') into v_people from profiles
   where id::text like '5eed____-0000-4000-8000-%' and email like '%@seed.corefitness-test.com';
  if cardinality(v_people) > 0 then
    for v_pass in 1..4 loop
      for fk in
        select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
          from pg_constraint c
          cross join lateral unnest(c.conkey, c.confkey) as k(att, fatt)
          join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = k.att
          join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.fatt
         where c.contype = 'f'
           and c.confrelid in ('public.profiles'::regclass, 'public.member_profiles'::regclass, 'public.trainer_profiles'::regclass)
           and fa.attname in ('id', 'profile_id')
           and c.conrelid not in ('public.profiles'::regclass, 'public.member_profiles'::regclass, 'public.trainer_profiles'::regclass)
           and c.connamespace = 'public'::regnamespace
      loop
        begin
          execute format('alter table %s disable trigger user', fk.tbl);
          if fk.notnull then
            execute format('delete from %s where %I = any($1)', fk.tbl, fk.col) using v_people;
          else
            execute format('update %s set %I = null where %I = any($1)', fk.tbl, fk.col, fk.col) using v_people;
          end if;
          execute format('alter table %s enable trigger user', fk.tbl);
        exception when foreign_key_violation or not_null_violation or check_violation then
          -- Its children go first on a later pass.
          execute format('alter table %s enable trigger user', fk.tbl);
        end;
      end loop;
    end loop;
  end if;

  v_rest := remove_demo_data_parts_1_2();
  return case when v_total > 0 then 'Removed ' || v_total || ' rows of the member history demo. ' else '' end || coalesce(v_rest, '');
end;
$fn$;
revoke all on function remove_demo_data() from public, anon;
grant execute on function remove_demo_data() to authenticated;

create or replace function migration_0168_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0168_applied() from public, anon;
grant execute on function migration_0168_applied() to authenticated;
comment on function migration_0168_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0168.sql
