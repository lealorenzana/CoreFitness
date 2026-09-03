-- 0055 — the goals people actually have.
--
-- `fitness_goals` (0020) models a **number moving towards another number**:
-- weight_kg, body_fat_pct, waist_cm, workouts_per_week, or `custom`. That is
-- the right shape for "get to 75 kg" and the wrong shape for almost everything
-- a member says out loud.
--
-- Panel feedback listed five: improve fitness, build consistency, increase
-- strength, improve endurance, maintain an active routine. Not one of them is a
-- number a member can type. Under the current schema all five collapse to
-- `custom`, which stores the words and computes no progress — so the app shows
-- a goal and can never tell you how you are doing against it.
--
-- ---------------------------------------------------------------------------
-- The fix is not "let the member type a target"
-- ---------------------------------------------------------------------------
-- "Improve endurance" has no obvious unit, and asking a member to invent one is
-- how you get goals nobody can be measured against. Instead each template
-- carries its own definition: a metric the system already counts, a window, and
-- a default target the member can adjust.
--
-- So "build consistency" is not a mood. It is: **weeks with at least two
-- training days, over the last eight weeks.** The member sees that sentence, so
-- the goal cannot mean one thing on screen and another in the database.
--
-- Numeric goals are untouched. A member tracking weight keeps exactly what they
-- had; `template_key` is null for those rows and every existing row stays valid.

-- ============================================================================
-- 1. THE TEMPLATES
-- ============================================================================
create table if not exists goal_templates (
  key            text primary key,
  label          text not null,
  /** The promise, in the member's words. */
  description    text not null,
  /** How it is measured, in plain language. Shown on the goal card so the rule
      is never hidden — the same reason `features.description` exists (0049). */
  measured_as    text not null,
  /** Counted with the same definitions as achievement_metrics and challenges,
      so a member's badge, challenge and goal can never disagree. */
  metric         text not null,
  /** Rolling window. 56 = the last eight weeks. */
  period_days    int not null check (period_days > 0),
  target_default int not null check (target_default > 0),
  is_active      boolean not null default true,
  sort_order     int not null default 0
);

insert into goal_templates
  (key, label, description, measured_as, metric, period_days, target_default, sort_order) values
  ('build_consistency', 'Build consistency',
   'Turn training into a habit rather than a burst.',
   'Weeks with at least two training days, over the last 8 weeks.',
   'consistent_weeks', 56, 6, 1),
  ('stay_active', 'Maintain an active routine',
   'Keep ticking over without pushing for more.',
   'Days you trained in the last 30 days.',
   'training_days', 30, 12, 2),
  ('improve_fitness', 'Improve overall fitness',
   'Train more often than you do now.',
   'Days you trained in the last 30 days.',
   'training_days', 30, 16, 3),
  ('increase_strength', 'Increase strength',
   'Move more weight than you could before.',
   'Sets recorded at or above 80% of your best load, in the last 30 days.',
   'heavy_sets', 30, 20, 4),
  ('improve_endurance', 'Improve endurance',
   'Last longer, breathe easier.',
   'Minutes of cardio recorded in the last 30 days.',
   'cardio_minutes', 30, 300, 5)
on conflict (key) do update
  set label = excluded.label, description = excluded.description,
      measured_as = excluded.measured_as, metric = excluded.metric,
      period_days = excluded.period_days, target_default = excluded.target_default,
      sort_order = excluded.sort_order;

-- ============================================================================
-- 2. THE LINK
-- ============================================================================
alter table fitness_goals
  add column if not exists template_key text references goal_templates(key);

comment on column fitness_goals.template_key is
  'Set for a preset goal, whose progress is computed. NULL for the numeric '
  'goals 0020 already supported, which keep start_value/target_value.';

create index if not exists idx_fitness_goals_template
  on fitness_goals(member_id) where template_key is not null;

-- ============================================================================
-- 3. PROGRESS
-- ============================================================================
-- Two of these metrics are new and only became computable in 0050:
--
--   * `heavy_sets` needs per-set weight, which `workout_sets` added.
--   * `cardio_minutes` needs to know which exercises are cardio, which the
--     `exercises` catalogue answers.
--
-- Before that migration, "increase strength" genuinely could not be measured
-- here, and offering it would have been a promise the schema could not keep.
create or replace function goal_progress(p_goal uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
  t record;
  since date;
  n int := 0;
begin
  select * into g from fitness_goals where id = p_goal;
  if g is null or g.template_key is null then
    return 0;
  end if;

  if g.member_id is distinct from auth.uid()
     and not trainer_may_see(g.member_id, 'goals') then
    return 0;
  end if;

  select * into t from goal_templates where key = g.template_key;
  if t is null then
    return 0;
  end if;

  since := (now() at time zone 'Asia/Manila')::date - t.period_days;

  if t.metric = 'training_days' then
    select count(*) into n from (
      select (a.check_in_time at time zone 'Asia/Manila')::date as d
        from attendance a
       where a.member_id = g.member_id
         and (a.check_in_time at time zone 'Asia/Manila')::date >= since
      union
      select w.performed_on from workout_logs w
       where w.member_id = g.member_id and w.performed_on >= since
    ) s;

  elsif t.metric = 'consistent_weeks' then
    select count(*) into n from (
      select date_trunc('week', d)::date as wk
        from (
          select (a.check_in_time at time zone 'Asia/Manila')::date as d
            from attendance a
           where a.member_id = g.member_id
             and (a.check_in_time at time zone 'Asia/Manila')::date >= since
          union
          select w.performed_on from workout_logs w
           where w.member_id = g.member_id and w.performed_on >= since
        ) days
       group by 1
      having count(*) >= 2
    ) weeks;

  elsif t.metric = 'heavy_sets' then
    -- Relative to the member's own best, not to a table of standards. A number
    -- from a chart would tell a beginner they are failing at something they are
    -- doing correctly.
    select count(*) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = g.member_id
       and l.performed_on >= since
       and s.weight_kg is not null
       and s.exercise_id is not null
       and s.weight_kg >= 0.8 * (
             select max(s2.weight_kg)
               from workout_sets s2
               join workout_logs l2 on l2.id = s2.log_id
              where l2.member_id = g.member_id
                and s2.exercise_id = s.exercise_id
           );

  elsif t.metric = 'cardio_minutes' then
    select coalesce(sum(s.duration_seconds) / 60, 0) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
      join exercises e on e.id = s.exercise_id
     where l.member_id = g.member_id
       and l.performed_on >= since
       and e.muscle_group = 'cardio'
       and s.duration_seconds is not null;
  end if;

  return coalesce(n, 0);
end;
$fn$;

-- ============================================================================
-- 4. REACHING ONE
-- ============================================================================
-- `achieved_on` is set here, not by the client — the goal notification (0053)
-- and the 100 points (0051) both hang off that column, so a member who could
-- write it could award themselves both.
create or replace function settle_goals() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  g record;
  n int := 0;
begin
  -- Announce that this write is the settler's, so the guard below lets it
  -- through. Transaction-local (`true`), so it cannot leak into the next
  -- statement on a pooled connection, and unreachable from a client: PostgREST
  -- exposes RPC, not arbitrary SQL, and `set_config` is not one of the
  -- functions granted to `authenticated`.
  --
  -- The obvious alternative — let the guard pass anyone whose role is not a
  -- member — does not work here. This function runs from pg_cron with no
  -- `auth.uid()`, so `get_my_role()` is NULL, and the guard refused its own
  -- writer. That is not hypothetical: it is what the first version of this
  -- migration did, and every preset goal would have stayed unreached for ever
  -- while the SQL compiled and deployed perfectly.
  perform set_config('app.goal_settling', 'on', true);

  for g in
    select f.id, f.member_id, f.target_value
      from fitness_goals f
     where f.template_key is not null
       and f.achieved_on is null
       and f.target_value is not null
  loop
    if goal_progress(g.id) >= g.target_value then
      update fitness_goals
         set achieved_on = (now() at time zone 'Asia/Manila')::date
       where id = g.id;
      n := n + 1;
    end if;
  end loop;

  perform set_config('app.goal_settling', 'off', true);
  return n;
end;
$fn$;

-- ============================================================================
-- 5. RLS
-- ============================================================================
alter table goal_templates enable row level security;

drop policy if exists goal_templates_select_authenticated on goal_templates;
create policy goal_templates_select_authenticated on goal_templates
  for select to authenticated using (true);

drop policy if exists goal_templates_write_admin on goal_templates;
create policy goal_templates_write_admin on goal_templates
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

-- `fitness_goals` keeps the policies 0020 and 0032 gave it. A member owns their
-- own rows, so they can create a preset goal and set its target — that is a
-- choice, not a claim. What they cannot do is declare it reached, because
-- `settle_goals()` owns `achieved_on`.
create or replace function trg_guard_goal_achieved() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- The settler's own write. Set transaction-locally by settle_goals() and by
  -- nothing else; see the note there for why a role check cannot do this job.
  if current_setting('app.goal_settling', true) = 'on' then
    return new;
  end if;

  if get_my_role() in ('admin','staff') then
    return new;
  end if;
  -- Only guards template goals. A numeric goal has always been the member's to
  -- mark done — nothing is awarded for it beyond what 0051 and 0053 now attach,
  -- and taking that away would be a regression for a feature that predates all
  -- of this.
  if new.template_key is not null
     and new.achieved_on is distinct from old.achieved_on then
    raise exception 'A preset goal is marked reached by the gym system, not by hand.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists fitness_goals_guard_achieved on fitness_goals;
create trigger fitness_goals_guard_achieved
  before update on fitness_goals
  for each row execute function trg_guard_goal_achieved();

revoke all on function settle_goals() from public, anon, authenticated;
revoke all on function goal_progress(uuid) from public, anon;
grant execute on function goal_progress(uuid) to authenticated;

-- ============================================================================
-- 6. SCHEDULE (optional, as everywhere else)
-- ============================================================================
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('settle-goals', '45 * * * *',
      $inner$ select settle_goals(); $inner$);
  end if;
exception when others then
  null;
end
$cron$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select key, label, measured_as from goal_templates order by sort_order;
--   select goal_progress('<a template goal>');
--   select settle_goals();        -- run twice; the second returns 0
--
-- As the member who owns it (must fail):
--   update fitness_goals set achieved_on = current_date where template_key is not null;
