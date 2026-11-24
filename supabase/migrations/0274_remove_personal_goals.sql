-- 0274 — Personal goals (Targets) removed (owner, 2026-11-24: "whole goals feature").
--
-- PASTE ONLY AFTER, in this order: the admin and member apps without goals are deployed, then the
-- ai-coach Edge Function without propose_goal is deployed, then 0271, 0272 and 0273. The old apps
-- read fitness_goals and goal_templates, and the old ai-coach proposes goal.create, which this refuses.
--
-- WHAT THIS DELETES, FOR GOOD — it cannot be undone:
--   • every member's goals (fitness_goals; live on 2026-11-24: 3 rows, all Core Fitness Lab) and every
--     gym's goal list (goal_templates: the "Goals members pick" an owner edited);
--   • the thirteen goal functions, the goal triggers and policies, and the settle-goals cron job;
--   • the "goal_achieved" points rule at every gym (no points were ever paid by it);
--   • the "First goal" and "Three goals" badges at every gym, G Fitness included (owner, 2026-11-24),
--     with their one unlock (Core Fitness Lab), and the "goals reached" metric badges and challenges count;
--   • the AI coach's "goal.create" proposal kind;
--   • the Targets switch (platform_features "targets"), and the "Goals" sharing switch
--     (member_share_prefs.share_goals): trainer_may_see() no longer has a goals category.
-- WHAT STAYS: the gym goal (gym_goals, 0124) and the self-declared aim members give at sign-up, in
-- onboarding and to the AI coach (ai_coach_profiles.goal). Those are not personal goals.
--
-- Shared functions are edited in place, as 0273 does: the goal parts are cut out of each function's
-- live definition, so 0271–0273's redefinitions survive, and the migration stops before dropping
-- anything if a goal table, column or kind is still named in one of them.
--
-- 1. Shared functions without goals
-- 2. The proposal kind, the cron job, badges, points, notifications
-- 3. Tables and functions dropped
-- 4. The switches removed
-- 5. What's new, marker

-- ============================================================================
-- 1. SHARED FUNCTIONS WITHOUT GOALS
-- ============================================================================
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_acl aclitem[];
  v_who text;
  v_left constant text := '(fitness_goals|goal_templates|goals_achieved|goal\.create|share_goals|goal_value_of|settle_goals|settle_my_goals)';
begin
  for r in select * from (values
      ('tenancy_gym_tables()',                         $p$'fitness_goals',\s*$p$, ''),
      ('tenancy_gym_tables()',                         $p$'goal_templates',\s*$p$, ''),
      ('remove_demo_data()',                           $p$'fitness_goals',\s*$p$, ''),
      ('ai_coach_context()',                           $p$'goals', coalesce\(\(select jsonb_agg\(g\.title.*?'\[\]'::jsonb\),$p$, ''),
      ('ai_coach_progress()',                          $p$,\s*'targets', coalesce\(\(.*?from fitness_goals g where[^)]*\), '\[\]'::jsonb\)$p$, ''),
      ('challenge_progress(uuid, uuid)',               $p$when 'goals_achieved'\s+then \(select count\(\*\) from fitness_goals g[^)]*\)$p$, ''),
      ('complete_gym_switch(uuid)',                    $p$update fitness_goals g set gym_id = b,.*?where g\.gym_id = a and g\.member_id = m;$p$, ''),
      ('complete_gym_switch(uuid)',                    $p$body readings, targets, photos$p$, 'body readings, photos'),
      ('erase_account(uuid)',                          $p$delete from fitness_goals where member_id = p;$p$, ''),
      ('exercise_used_outside(uuid, uuid)',            $p$,\s*'fitness_goals'$p$, ''),
      ('seed_gym_defaults(uuid, uuid)',                $p$insert into goal_templates .*?on conflict do nothing;$p$, ''),
      ('trainer_may_see(uuid, text)',                  $p$when 'goals'\s+then p\.share_goals\s*$p$, ''),
      ('trainer_may_see(uuid, text)',                  $p$'measurements', 'goals', 'workouts'$p$, $p$'measurements', 'workouts'$p$),
      ('notify_coaches_of_win(uuid, uuid, text, text, text, text, text)', $p$\s*when 'goals' then p\.share_goals$p$, ''),
      ('ai_proposal_check_v1(text, jsonb, uuid, uuid)', $p$elsif p_kind = 'goal\.create' then.*?(?=elsif |else\s+raise exception)$p$, ''),
      ('apply_ai_proposal_v1(uuid)',                   $p$elsif p\.kind = 'goal\.create' then.*?v_undo := jsonb_build_object\('goal_id', v_goal\);$p$, ''),
      ('undo_ai_proposal_v1(uuid)',                    $p$elsif p\.kind = 'goal\.create' then.*?delete from fitness_goals where id = v_goal[^;]*;$p$, '')
    ) as t(fn, pat, rep)
  loop
    if to_regprocedure(r.fn) is null then continue; end if;
    v_def := pg_get_functiondef(to_regprocedure(r.fn));
    v_new := regexp_replace(v_def, r.pat, r.rep, 'g');
    if v_new <> v_def then execute v_new; end if;
  end loop;

  -- member_training_stats() loses a column, so it is dropped and made again (its callers read it
  -- as a row, by column name, so none of them names goals_achieved). Who may call it is copied
  -- back exactly as it was: a new function would otherwise be open to PUBLIC.
  if to_regprocedure('member_training_stats(uuid)') is not null then
    v_def := pg_get_functiondef('member_training_stats(uuid)'::regprocedure);
    select proacl into v_acl from pg_proc where oid = 'member_training_stats(uuid)'::regprocedure;
    v_new := regexp_replace(v_def, $p$goals_achieved integer,\s*$p$, '', 'g');
    v_new := regexp_replace(v_new, $p$\(\s*select count\(\*\) from fitness_goals g, gym\s+where[^)]*\)::int,\s*$p$, '', 'g');
    if v_new <> v_def then
      drop function member_training_stats(uuid);
      execute v_new;
      if v_acl is not null then
        revoke all on function member_training_stats(uuid) from public;
        for v_who in select distinct case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end
                       from aclexplode(v_acl) a where a.privilege_type = 'EXECUTE' loop
          execute format('grant execute on function member_training_stats(uuid) to %s', v_who);
        end loop;
      end if;
    end if;
  end if;

  -- Nothing may still name a goal table, column or kind.
  for r in select p.oid::regprocedure as fn from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname not in ('goal_current_value', 'goal_is_reached', 'goal_progress', 'goal_template_count',
                                    'goal_value_of', 'settle_goals', 'settle_goals_for', 'settle_my_goals',
                                    'trg_guard_goal_achieved', 'trg_notify_goal_reached', 'trg_points_back_goal', 'trg_points_goal',
                                    'trg_win_target')
              and p.prosrc ~ v_left
  loop
    raise exception '0274: % still names a goal table, column or kind after the edit; nothing was dropped.', r.fn;
  end loop;
end $$;

-- ============================================================================
-- 2. THE PROPOSAL KIND, THE CRON JOB, BADGES, POINTS, NOTIFICATIONS
-- ============================================================================
delete from ai_proposals where kind = 'goal.create';
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.ai_proposals'::regclass and conname = 'ai_proposals_kind_check';
  if v_def is not null and v_def like '%goal.create%' then
    alter table ai_proposals drop constraint ai_proposals_kind_check;
    execute 'alter table ai_proposals add constraint ai_proposals_kind_check '
         || regexp_replace(v_def, $p$'goal\.create'::text,\s*$p$, '', 'g');
  end if;
end $$;

-- pg_cron is optional here (0030): only when it is installed.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'settle-goals'$q$;
  end if;
end $$;

delete from achievement_unlocks where achievement_key in
  (select key from achievements where metric = 'goals_achieved' or metric2 = 'goals_achieved');
delete from achievements where metric = 'goals_achieved' or metric2 = 'goals_achieved';
delete from challenge_participants where challenge_id in (select id from challenges where metric_key = 'goals_achieved');
delete from challenges where metric_key = 'goals_achieved';
delete from achievement_metrics where key = 'goals_achieved';

delete from point_ledger where rule_key = 'goal_achieved' or source_table = 'fitness_goals';
delete from point_rules where key = 'goal_achieved';

delete from notifications
 where action_url like '/member/targets%' or action_url like '/member/progress/reached%'
    or action_url like '%tab=goals%';
delete from activity_log where action like 'goal.%';

-- ============================================================================
-- 3. TABLES AND FUNCTIONS DROPPED
-- ============================================================================
-- Their policies and triggers go with them; only fitness_goals points at goal_templates.
drop table if exists fitness_goals;
drop table if exists goal_templates;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname = any (array[
                'goal_current_value', 'goal_is_reached', 'goal_progress', 'goal_template_count', 'goal_value_of',
                'settle_goals', 'settle_goals_for', 'settle_my_goals',
                'trg_guard_goal_achieved', 'trg_notify_goal_reached', 'trg_points_back_goal', 'trg_points_goal',
                -- 0218's trainee win for a target reached: its only trigger was on fitness_goals.
                'trg_win_target']) loop
    execute format('drop function %s', f);
  end loop;
end $$;

-- ============================================================================
-- 4. THE SWITCHES REMOVED
-- ============================================================================
alter table member_share_prefs drop column if exists share_goals;
delete from plan_features where feature_key = 'targets';
delete from gym_modules where feature_key = 'targets';
delete from platform_features where key = 'targets';

-- ============================================================================
-- 5. WHAT'S NEW, MARKER
-- ============================================================================
insert into app_releases (app, title, items)
select 'member', 'Targets are gone', array[
  'Personal targets are removed from You → Progress. Your body readings, records and streak stay.',
  'To work toward a number, join a challenge in Rewards.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'Targets are gone');

insert into app_releases (app, title, items)
select 'admin', 'Goals members pick are gone', array[
  'Personal goals are removed: the list in Challenges, the goal badges and the goal points rule.',
  'The gym goal stays in Challenges.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'Goals members pick are gone');

create or replace function migration_0274_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0274_applied() to anon, authenticated;
