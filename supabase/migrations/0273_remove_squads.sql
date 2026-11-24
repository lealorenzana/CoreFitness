-- 0273 — Squads (teams) removed (owner, 2026-11-24: "not really needed").
--
-- PASTE ONLY AFTER the admin and member apps without squads are deployed: the old apps call
-- settle_squads(), squad_board() and my_squad() and would show errors once these are gone.
--
-- WHAT THIS DELETES, FOR GOOD — it cannot be undone:
--   • every squad, its members and its paid weeks (0124), the squad streak (0153);
--   • every function those made, their policies and the squad.created activity trigger;
--   • the "squad_week" points rule at every gym, and the points it paid (live on 2026-11-24:
--     8 ledger rows, all in Core Fitness Lab, the platform owner's test gym; no other gym had any);
--   • the Teams switch (platform_features "squads" and every gym_modules row for it);
--   • "squads" from each gym's lobby TV panels;
--   • squad notifications and squad activity rows.
-- WHAT STAYS: the gym goal (gym_goals, current_gym_goal, settle_gym_goals). It was shown with
-- squads but never gated by them in SQL; the member app now shows it under Engagement.
--
-- Shared functions are edited in place, not retyped: 0271 and 0272 were written at the same time
-- and may redefine tenancy_gym_tables(), remove_demo_data() or streak_nudge_sweep(). Each
-- function's live definition has only its squad parts cut out, and the migration stops if
-- any squad is left in it, before anything is dropped.
--
-- 1. Shared functions without squads
-- 2. Data that pointed at squads
-- 3. Tables and functions dropped
-- 4. The switch removed
-- 5. What's new, marker

-- ============================================================================
-- 1. SHARED FUNCTIONS WITHOUT SQUADS
-- ============================================================================
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in select * from (values
      -- 0220/0260's list of gym tables
      ('tenancy_gym_tables()',          $p$'squad_members',\s*'squad_weeks',\s*'squads',\s*$p$, ''),
      -- 0168's demo removal
      ('remove_demo_data()',            $p$'squad_weeks',\s*'squad_members',\s*'squads',\s*$p$, ''),
      -- the platform's feature counts (0136/0140/0149)
      ('platform_feature_adoption()',   $p$\('squads',[^)]*\),\s*$p$, ''),
      ('platform_gym_features(uuid)',   $p$\('squads',[^)]*\),\s*$p$, ''),
      ('platform_gym_usage(integer)',   $p$\('squads',[^)]*\),\s*$p$, ''),
      -- 0209's TV panels
      ('trg_tv_design()',               $p$'squads',\s*$p$, ''),
      -- 0153's second loop: a squad's streak about to end
      ('streak_nudge_sweep()',          $p$\s*-- The squad's streak \(0153\).*?end loop;$p$, '')
    ) as t(fn, pat, rep)
  loop
    if to_regprocedure(r.fn) is null then continue; end if;
    v_def := pg_get_functiondef(to_regprocedure(r.fn));
    v_new := regexp_replace(v_def, r.pat, r.rep, 'g');
    if v_new ilike '%squad%' then
      raise exception '0273: % still mentions squads after the edit; nothing was dropped. Its body: %', r.fn, v_new;
    end if;
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- ============================================================================
-- 2. DATA THAT POINTED AT SQUADS
-- ============================================================================
-- The TV's own check (just redefined) refuses a "squads" panel, so take it out of every design first.
update gym_settings
   set tv_design = jsonb_set(tv_design, '{panels}', (tv_design -> 'panels') - 'squads')
 where jsonb_typeof(tv_design -> 'panels') = 'array' and tv_design -> 'panels' ? 'squads';

-- point_ledger references point_rules (gym_id, key), so its rows go first.
delete from point_ledger where rule_key = 'squad_week';
delete from point_rules where key = 'squad_week';

delete from notifications where action_url like '/member/squad%';
delete from activity_log where action like 'squad.%';

-- ============================================================================
-- 3. TABLES AND FUNCTIONS DROPPED
-- ============================================================================
-- Their policies and the squad.created trigger go with them. No other table or function uses
-- their row types (pg_depend, 2026-11-24).
drop table if exists squad_weeks;
drop table if exists squad_members;
drop table if exists squads;

-- Every function 0124 and 0153 made for squads; none is called anywhere else after section 1.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname = any (array[
                'create_squad', 'join_squad', 'leave_squad', 'log_squad_activity', 'my_squad', 'my_squad_id',
                'member_squad', 'squad_days', 'squad_board', 'settle_squads',
                'squad_streak_card', 'my_squad_streak', 'squad_streaks', 'member_squad_streak']) loop
    execute format('drop function %s', f);
  end loop;
end $$;

-- ============================================================================
-- 4. THE SWITCH REMOVED
-- ============================================================================
delete from gym_modules where feature_key = 'squads';
delete from platform_features where key = 'squads';

-- ============================================================================
-- 5. WHAT'S NEW, MARKER
-- ============================================================================
insert into app_releases (app, title, items)
select 'admin', 'Teams are gone', array[
  'Teams (squads) are removed from the app, the lobby TV and Your app.',
  'The gym goal stays: set it in Challenges, and members see it on Today.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'Teams are gone');

create or replace function migration_0273_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0273_applied() to anon, authenticated;
