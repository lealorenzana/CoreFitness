-- 0038 — achievements become data the admin owns, instead of code a developer owns.
--
-- 0028 hardcoded 33 earning rules as `if s.training_days >= 25 then …` inside
-- `sync_my_achievements()`, and their titles/icons in a TypeScript file. Adding
-- one meant editing two files in two languages and shipping a deploy, so in
-- practice the gym could never add one at all.
--
-- What does NOT change, because it is the whole point of 0028: **a badge still
-- cannot be granted from a browser.** `achievement_unlocks` still has no INSERT
-- policy. The evaluator is still SECURITY DEFINER and still grades only the
-- caller. What moves is *which rules it evaluates* — from function body to a
-- table an admin can edit. An admin editing the rules is a different act from a
-- member awarding themselves a badge, and only the second one was ever the
-- threat.
--
-- Three rule kinds, because one shape does not honestly cover all 33:
--
--   'metric'  — a named stat vs a number. Covers 31 of them, and is the only
--               kind the admin UI can create.
--   'builtin' — evaluated by hardcoded logic that a metric+threshold cannot
--               express. Exactly two: the level badges, which must agree with
--               `level_thresholds()` or Home and the gallery contradict each
--               other. Editable copy, locked rule.
--   'manual'  — no rule at all. An admin hands it to one person: "Member of the
--               Month", "Most Improved". Earned by judgement, not arithmetic.

-- ============================================================================
-- 1. THE METRIC WHITELIST
-- ============================================================================
-- Every column an admin may build a rule on. A table rather than a CHECK
-- constraint so the admin UI can populate its dropdown from the database and
-- cannot offer a metric the evaluator would fail to read.
--
-- These are exactly the output columns of `member_training_stats()` and
-- `trainer_stats()` (0028), minus `member_since`: that one is a date, and a
-- date cannot be compared to a threshold. It is exposed below as the derived
-- `days_as_member` instead, which is the question anybody actually asks of it.

create table if not exists achievement_metrics (
  key        text primary key,
  audience   text not null check (audience in ('member', 'trainer')),
  label      text not null,
  /** Shown after the number in the admin rule builder: "25 days". */
  unit       text,
  /** TRUE for yes/no stats. The evaluator coerces true→1, false→0, so the
   *  threshold for these is always 1 — the UI hides the number box. */
  is_boolean boolean not null default false,
  sort_order int not null default 0
);

insert into achievement_metrics (key, audience, label, unit, is_boolean, sort_order) values
  ('training_days',        'member', 'Training days',                'days',       false,  1),
  ('verified_days',        'member', 'Verified check-ins at the desk','days',      false,  2),
  ('logged_days',          'member', 'Self-logged workout days',     'days',       false,  3),
  ('consistent_weeks',     'member', 'Consistent weeks (2+ sessions)','weeks',     false,  4),
  ('current_week_streak',  'member', 'Current weekly streak',        'weeks',      false,  5),
  ('best_week_streak',     'member', 'Best weekly streak',           'weeks',      false,  6),
  ('weekend_days',         'member', 'Weekend training days',        'days',       false,  7),
  ('early_checkins',       'member', 'Check-ins before 7am',         'check-ins',  false,  8),
  ('late_checkins',        'member', 'Check-ins after 8pm',          'check-ins',  false,  9),
  ('distinct_activities',  'member', 'Different activities tried',   'activities', false, 10),
  ('goals_achieved',       'member', 'Fitness goals reached',        'goals',      false, 11),
  ('measurements',         'member', 'Body measurements logged',     'entries',    false, 12),
  ('classes_attended',     'member', 'Group classes attended',       'classes',    false, 13),
  ('pt_sessions_done',     'member', 'PT sessions completed',        'sessions',   false, 14),
  ('days_as_member',       'member', 'Days since joining',           'days',       false, 15),
  ('sessions_delivered',   'trainer','PT sessions delivered',        'sessions',   false,  1),
  ('distinct_members',     'trainer','Different members trained',    'members',    false,  2),
  ('classes_led',          'trainer','Attended classes led',         'classes',    false,  3),
  ('notes_sent',           'trainer','Recommendations sent',         'notes',      false,  4),
  ('availability_windows', 'trainer','Bookable hour windows',        'windows',    false,  5),
  ('profile_complete',     'trainer','Profile fully filled in',      null,         true,   6),
  ('days_active',          'trainer','Days on the team',             'days',       false,  7)
on conflict (key) do update
  set audience = excluded.audience, label = excluded.label,
      unit = excluded.unit, is_boolean = excluded.is_boolean,
      sort_order = excluded.sort_order;

-- ============================================================================
-- 2. THE CATALOGUE
-- ============================================================================

create table if not exists achievements (
  -- Stable, and the join to `achievement_unlocks.achievement_key`. Renaming one
  -- would orphan every unlock, so the UI never lets an existing key change.
  key         text primary key,
  audience    text not null check (audience in ('member', 'trainer')),

  title       text not null,
  /** Past tense, addressed to whoever earned it. */
  description text not null,
  /** What it takes, shown while still locked. A locked badge that will not say
   *  what it wants is a tease. */
  requirement text not null,
  /** Name from the app's icon registry, not a URL. Unknown names fall back to a
   *  default rather than rendering a hole. */
  icon        text not null default 'Award',
  tier        text not null default 'bronze'
                check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  category    text not null default 'General',

  rule_kind   text not null default 'metric'
                check (rule_kind in ('metric', 'builtin', 'manual')),
  metric      text references achievement_metrics(key),
  threshold   numeric,
  -- Optional second condition, ANDed with the first. Nothing seeded uses it —
  -- the two rules that need two conditions are 'builtin' — but the admin UI
  -- offers it, e.g. "50 training days AND 8 consistent weeks".
  metric2     text references achievement_metrics(key),
  threshold2  numeric,

  /** Retired achievements stay in the table so past unlocks still render; they
   *  are simply no longer awarded and are hidden from the locked list. */
  active      boolean not null default true,
  /** Seeded by this migration. Their rules are expected by the app, so the UI
   *  warns before retiring one — but does not forbid it. */
  builtin     boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,

  -- A 'metric' rule without a metric is a badge nobody can earn, and a 'manual'
  -- rule with one is a lie about how it is granted. Enforced here rather than
  -- trusted to the form.
  constraint achievements_rule_shape check (
    (rule_kind = 'metric'  and metric is not null and threshold is not null) or
    (rule_kind = 'builtin') or
    (rule_kind = 'manual'  and metric is null and threshold is null)
  ),
  constraint achievements_second_condition check (
    (metric2 is null and threshold2 is null) or
    (metric2 is not null and threshold2 is not null and rule_kind = 'metric')
  )
);

create index if not exists idx_achievements_audience
  on achievements(audience, sort_order) where active;

alter table achievements enable row level security;
alter table achievement_metrics enable row level security;

-- Everyone signed in reads the catalogue — members need it to see what is left
-- to earn, and the gallery would be empty otherwise.
drop policy if exists achievements_select_all on achievements;
create policy achievements_select_all on achievements for select
  using (auth.uid() is not null);

drop policy if exists achievement_metrics_select_all on achievement_metrics;
create policy achievement_metrics_select_all on achievement_metrics for select
  using (auth.uid() is not null);

-- Writing the catalogue is an admin act. Deliberately NOT `is_front_desk()`:
-- inventing a badge changes what the gym rewards, which is the same class of
-- decision as plan pricing, and staff do not get that.
drop policy if exists achievements_write_admin on achievements;
create policy achievements_write_admin on achievements for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- The metric list is fixed by what the stats functions actually compute. There
-- is no write policy at all: adding a row here without a matching column would
-- produce a rule that silently never fires.

-- ----------------------------------------------------------------- deletion --
-- An achievement somebody has already earned must not vanish: the unlock row
-- would survive with nothing to render, and a member would lose a badge they
-- were shown. Retire it instead (`active = false`), which keeps past unlocks
-- displayable and stops new ones.
create or replace function guard_achievement_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from achievement_unlocks u where u.achievement_key = old.key;
  if n > 0 then
    raise exception
      'Cannot delete "%": % member(s) have already earned it. Retire it instead so their badge still shows.',
      old.key, n
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_achievement_delete on achievements;
create trigger trg_guard_achievement_delete before delete on achievements
  for each row execute function guard_achievement_delete();

-- ============================================================================
-- 3. SEED — the 33 that 0028 hardcoded
-- ============================================================================
-- Copy, tier, category and icon transcribed from
-- `g-fitness-member/src/data/achievements.ts`; metric and threshold from the
-- `if` ladder in `sync_my_achievements()`. Nothing new is invented here — this
-- is the same catalogue, relocated.
--
-- `do update` on conflict so re-running repairs drift, but **only for builtin
-- rows**: an admin's edits to their own achievements must survive a re-run.

insert into achievements
  (key, audience, title, description, requirement, icon, tier, category, rule_kind, metric, threshold, builtin, sort_order)
values
  ('first_checkin','member','First Step','You checked in at the gym for the first time.','Check in at the front desk once.','Footprints','bronze','Getting started','metric','verified_days',1,true,1),
  ('days_10','member','Getting Into It','10 training days behind you.','Train on 10 separate days.','Dumbbell','bronze','Milestones','metric','training_days',10,true,2),
  ('days_25','member','Regular','25 training days. This is a habit now.','Train on 25 separate days.','CalendarCheck','silver','Milestones','metric','training_days',25,true,3),
  ('days_50','member','Half Century','50 training days logged.','Train on 50 separate days.','Medal','gold','Milestones','metric','training_days',50,true,4),
  ('days_100','member','Centurion','100 training days. Very few people get here.','Train on 100 separate days.','Trophy','platinum','Milestones','metric','training_days',100,true,5),
  ('streak_4','member','Month of Momentum','Four weeks in a row, twice a week or better.','Train at least twice a week, 4 weeks running.','Flame','silver','Consistency','metric','best_week_streak',4,true,6),
  ('streak_12','member','Quarter Strong','Twelve straight weeks of showing up.','Train at least twice a week, 12 weeks running.','Zap','platinum','Consistency','metric','best_week_streak',12,true,7),
  ('early_bird','member','Early Bird','Five sessions done before 7am.','Check in before 7:00am on 5 occasions.','Sunrise','silver','Habits','metric','early_checkins',5,true,8),
  ('night_owl','member','Night Owl','Five late sessions, after 8pm.','Check in at 8:00pm or later on 5 occasions.','Moon','silver','Habits','metric','late_checkins',5,true,9),
  ('weekend_warrior','member','Weekend Warrior','Eight weekend training days.','Train on 8 Saturdays or Sundays.','CalendarHeart','silver','Habits','metric','weekend_days',8,true,10),
  ('all_rounder','member','All-Rounder','You have trained three different ways.','Record 3 different activities.','Shapes','bronze','Habits','metric','distinct_activities',3,true,11),
  ('goal_first','member','Goal Getter','You set a goal and reached it.','Reach one of your fitness goals.','Target','bronze','Progress','metric','goals_achieved',1,true,12),
  ('goal_three','member','Triple Threat','Three goals set and reached.','Reach 3 fitness goals.','Star','gold','Progress','metric','goals_achieved',3,true,13),
  ('measure_first','member','Baseline','You recorded your first measurement.','Log a body measurement.','Ruler','bronze','Progress','metric','measurements',1,true,14),
  ('measure_ten','member','Tracked','Ten measurements — enough to see a real trend.','Log 10 body measurements.','ClipboardList','silver','Progress','metric','measurements',10,true,15),
  ('class_first','member','Joined In','You attended your first group class.','Attend a group class.','Users','bronze','Training','metric','classes_attended',1,true,16),
  ('class_ten','member','Class Regular','Ten group classes attended.','Attend 10 group classes.','HeartHandshake','gold','Training','metric','classes_attended',10,true,17),
  ('pt_first','member','Coached','You completed a session with a personal trainer.','Complete a personal training session.','GraduationCap','silver','Training','metric','pt_sessions_done',1,true,18),
  ('loyal_six_months','member','Half a Year','Six months a member of Core Fitness.','Stay a member for 6 months.','Repeat','silver','Loyalty','metric','days_as_member',180,true,19),
  ('loyal_one_year','member','One of the Family','A full year with us.','Stay a member for 1 year.','Gem','platinum','Loyalty','metric','days_as_member',365,true,20),
  ('level_intermediate','member','Intermediate','You trained your way up to Intermediate.','20 training days and 6 consistent weeks.','Award','gold','Level','builtin',null,null,true,21),
  ('level_advanced','member','Advanced','You reached Advanced. That is a year of real work.','60 training days and 16 consistent weeks.','Sparkles','platinum','Level','builtin',null,null,true,22),
  ('coach_open_for_business','trainer','Open for Business','You published your bookable hours.','Add at least one availability window.','CalendarCheck','bronze','Setup','metric','availability_windows',1,true,1),
  ('coach_full_profile','trainer','Full Profile','Specialisation, bio and photo — members know who they are booking.','Fill in your specialisation, bio and photo.','UserCheck','bronze','Setup','metric','profile_complete',1,true,2),
  ('coach_first_session','trainer','First Client','You delivered your first personal training session.','Deliver 1 personal training session.','GraduationCap','bronze','Coaching','metric','sessions_delivered',1,true,3),
  ('coach_sessions_25','trainer','Twenty-Five Down','25 personal training sessions delivered.','Deliver 25 personal training sessions.','Dumbbell','silver','Coaching','metric','sessions_delivered',25,true,4),
  ('coach_sessions_100','trainer','Centurion Coach','100 sessions delivered. A real practice.','Deliver 100 personal training sessions.','Trophy','platinum','Coaching','metric','sessions_delivered',100,true,5),
  ('coach_members_10','trainer','Ten Trained','Ten different members have trained with you.','Train 10 different members.','Users','silver','Reach','metric','distinct_members',10,true,6),
  ('coach_members_25','trainer','Well Known','Twenty-five different members have trained with you.','Train 25 different members.','HeartHandshake','gold','Reach','metric','distinct_members',25,true,7),
  ('coach_first_class','trainer','Class Act','You led your first group class with members in it.','Lead 1 attended group class.','CalendarHeart','bronze','Classes','metric','classes_led',1,true,8),
  ('coach_classes_50','trainer','Fifty Classes','Fifty attended group classes led.','Lead 50 attended group classes.','Medal','gold','Classes','metric','classes_led',50,true,9),
  ('coach_notes_10','trainer','In Their Corner','Ten recommendations sent to the members you coach.','Send 10 recommendations to members.','Target','silver','Coaching','metric','notes_sent',10,true,10),
  ('coach_one_year','trainer','A Year In','One year on the Core Fitness team.','Be a trainer here for 1 year.','Gem','gold','Loyalty','metric','days_active',365,true,11)
on conflict (key) do update set
  audience    = excluded.audience,
  title       = excluded.title,
  description = excluded.description,
  requirement = excluded.requirement,
  icon        = excluded.icon,
  tier        = excluded.tier,
  category    = excluded.category,
  rule_kind   = excluded.rule_kind,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order
where achievements.builtin;   -- never clobber an admin's own achievement

-- ============================================================================
-- 4. THE EVALUATOR, NOW DATA-DRIVEN
-- ============================================================================
-- Same contract as 0028: SECURITY DEFINER, grades **only the caller**, no uid
-- parameter, returns just the newly inserted keys so the celebration fires once.
-- The 33-branch `if` ladder is replaced by one loop over the catalogue.
--
-- The trick that makes it generic: `to_jsonb(stats_record) ->> metric_name`
-- reads a column chosen at runtime. Everything is then coerced to numeric, so a
-- boolean metric (`profile_complete`) compares against a threshold of 1 without
-- needing its own branch.

-- Reads one stat out of the record-as-jsonb and normalises it to a number.
-- Booleans become 1/0 so `profile_complete >= 1` works without a special case;
-- an unknown, null or non-numeric metric becomes 0, so a misconfigured rule
-- simply never fires instead of aborting everyone's sync.
--
-- Pattern-matched rather than wrapped in an EXCEPTION block on purpose: a
-- plpgsql exception handler opens a subtransaction on every call, and this is
-- called once per rule per sync. Declared here, above its only caller.
create or replace function jsonb_metric_value(stats jsonb, metric_name text)
returns numeric
language sql immutable set search_path = public as $$
  select case
    when metric_name is null then 0
    when stats ->> metric_name is null then 0
    when stats ->> metric_name = 'true' then 1
    when stats ->> metric_name = 'false' then 0
    when stats ->> metric_name ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (stats ->> metric_name)::numeric
    else 0
  end;
$$;

create or replace function sync_my_achievements()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  role_name  text;
  earned     text[] := '{}';
  s          record;
  t          record;
  stats      jsonb;
  a          record;
  lvl_days   int;
  lvl_weeks  int;
begin
  if uid is null then
    return;
  end if;

  select p.role::text into role_name from profiles p where p.id = uid;

  if role_name = 'member' then
    select * into s from member_training_stats(uid);
    -- `member_since` is a date and cannot meet a numeric threshold. Replace it
    -- with the derived stat the loyalty badges actually want.
    -- `row_to_json(record)::jsonb` rather than `to_jsonb(s)`: to_jsonb takes
    -- `anyelement`, and resolving that against a plpgsql RECORD variable is
    -- fragile. row_to_json is declared to take `record` outright.
    stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
      'days_as_member',
      case when s.member_since is null then 0 else (current_date - s.member_since) end);

    -- The two rules a metric+threshold cannot express. Kept as code so they
    -- read from `level_thresholds()` — the same source `member_progression()`
    -- uses for the level shown on Home. Duplicating those numbers into the
    -- table would let the badge and the level disagree.
    select days, weeks into lvl_days, lvl_weeks from level_thresholds('intermediate');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_intermediate'::text;
    end if;
    select days, weeks into lvl_days, lvl_weeks from level_thresholds('advanced');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_advanced'::text;
    end if;

  elsif role_name = 'trainer' then
    select * into t from trainer_stats(uid);
    stats := row_to_json(t)::jsonb;
  else
    -- Admin and staff have no achievement set. Front-desk work is measured by
    -- the transactions it records, not by badges.
    return;
  end if;

  -- One pass over every active metric rule for this audience. A retired
  -- achievement is skipped, so retiring one stops new unlocks without
  -- disturbing anybody who already has it.
  for a in
    select ac.key, ac.metric, ac.threshold, ac.metric2, ac.threshold2
      from achievements ac
     where ac.audience = role_name
       and ac.active
       and ac.rule_kind = 'metric'
  loop
    if jsonb_metric_value(stats, a.metric) >= a.threshold
       and (a.metric2 is null
            or jsonb_metric_value(stats, a.metric2) >= a.threshold2) then
      earned := earned || a.key;
    end if;
  end loop;

  return query
  with ins as (
    insert into achievement_unlocks (user_id, achievement_key)
    select uid, k from unnest(earned) as k
    on conflict (user_id, achievement_key) do nothing
    returning achievement_key
  )
  select ins.achievement_key from ins;
end;
$$;

-- ============================================================================
-- 5. MANUAL AWARDS
-- ============================================================================
-- The one new write path, and it is admin-only and server-side. `achievement_
-- unlocks` still has no INSERT policy, so this function is the only way a row
-- can appear other than the member earning it.

create or replace function award_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  target_role text;
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only an admin can award an achievement' using errcode = 'insufficient_privilege';
  end if;

  select * into a from achievements where key = p_key;
  if not found then
    raise exception 'No such achievement: %', p_key;
  end if;

  select role::text into target_role from profiles where id = p_user;
  if target_role is null then
    raise exception 'No such account';
  end if;
  -- A coaching badge on a member's profile would render under the wrong
  -- catalogue and read as a bug.
  if target_role <> a.audience then
    raise exception 'That achievement belongs to the % catalogue, but this account is a %',
      a.audience, target_role;
  end if;

  insert into achievement_unlocks (user_id, achievement_key)
  values (p_user, p_key)
  on conflict (user_id, achievement_key) do nothing;
end;
$$;

-- Taking one back. Only meaningful for a manual award — a metric-based one the
-- member still qualifies for is simply re-granted on their next sync, which the
-- admin UI says out loud rather than pretending otherwise.
create or replace function revoke_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only an admin can revoke an achievement' using errcode = 'insufficient_privilege';
  end if;
  delete from achievement_unlocks where user_id = p_user and achievement_key = p_key;
end;
$$;

-- ============================================================================
-- 6. AUDIT
-- ============================================================================
-- Awarding and revoking by hand is exactly what an owner would want to review.
-- Guarded so 0038 still applies cleanly on a database where 0037 has not run.

do $$
begin
  if to_regclass('public.activity_log') is not null then
    execute $fn$
      create or replace function log_achievement_activity() returns trigger
      language plpgsql security definer set search_path = public as $body$
      declare
        v_title text;
        v_who   text;
      begin
        if tg_op = 'INSERT' then
          select title into v_title from achievements where key = new.achievement_key;
          v_who := coalesce(activity_member_name(new.user_id), 'someone');
          -- Only a hand-award has an actor; the nightly self-sync runs as the
          -- member themselves, and logging those would bury the log in badges.
          if auth.uid() is not null and auth.uid() <> new.user_id then
            perform log_activity('achievement.awarded', 'achievement', null, new.user_id,
              'Awarded "' || coalesce(v_title, new.achievement_key) || '" to ' || v_who,
              jsonb_build_object('achievement_key', new.achievement_key));
          end if;
          return new;
        end if;

        select title into v_title from achievements where key = old.achievement_key;
        perform log_activity('achievement.revoked', 'achievement', null, old.user_id,
          'Removed "' || coalesce(v_title, old.achievement_key) || '" from '
            || coalesce(activity_member_name(old.user_id), 'someone'),
          jsonb_build_object('achievement_key', old.achievement_key));
        return old;
      end;
      $body$;
    $fn$;

    execute 'drop trigger if exists trg_log_achievement on achievement_unlocks';
    execute 'create trigger trg_log_achievement after insert or delete on achievement_unlocks
             for each row execute function log_achievement_activity()';
  end if;
end $$;
