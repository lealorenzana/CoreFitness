-- 0275 — The monthly season removed (owner, 2026-11-24: "remove the monthly season feature, I don't need it").
--
-- PASTE ONLY AFTER the admin and member apps without the season are deployed, and after 0271, 0272,
-- 0273 and 0274: the old apps call my_season(), season_board() and open_season_claims(), which this drops.
--
-- WHAT THIS DELETES, FOR GOOD — it cannot be undone:
--   • every gym's season tiers and every claim of a tier's reward (live on 2026-11-24: 3 tiers and
--     3 claims, all in Core Fitness Lab; no other gym had any);
--   • the nine season functions and the season-claim activity trigger;
--   • the Seasons switch (platform_features "seasons", its gym_modules and plan_features rows);
--   • "season" from each gym's lobby TV panels.
-- WHAT STAYS: points and the ledger, personal records, the opt-in record wall (pr_wall,
-- show_on_boards) and weekly quests. A record's notification now opens /member/records.
--
-- Shared functions are edited in place from their live definitions, as 0273 and 0274 do, so
-- 0271–0274's redefinitions survive; it stops before dropping anything if one still names the season.
-- tenancy_gym_tables() loses only the two season tables from its live list (as 0276 adds cash_outs),
-- so 0275 and 0276 work in either order and every other table, cash_outs included, stays listed.

-- ============================================================================
-- 1. SHARED FUNCTIONS WITHOUT THE SEASON
-- ============================================================================
do $$
declare
  r record;
  v_def text;
  v_new text;
  l text[];
begin
  l := tenancy_gym_tables();
  if l && array['season_claims', 'season_tiers'] then
    l := array_remove(array_remove(l, 'season_claims'), 'season_tiers');
    execute format('create or replace function tenancy_gym_tables() returns text[] language sql immutable as $f$ select %L::text[] $f$', l);
  end if;

  for r in select * from (values
      ('remove_demo_data()',            $p$'season_claims',\s*'season_tiers',\s*$p$, ''),
      ('trg_tv_design()',               $p$'season',\s*$p$, ''),
      ('trg_detect_personal_record()',  $p$'/member/season'$p$, $p$'/member/records'$p$)
    ) as t(fn, pat, rep)
  loop
    if to_regprocedure(r.fn) is null then continue; end if;
    v_def := pg_get_functiondef(to_regprocedure(r.fn));
    v_new := regexp_replace(v_def, r.pat, r.rep, 'g');
    if v_new <> v_def then execute v_new; end if;
  end loop;

  for r in select p.oid::regprocedure as fn from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname not in ('claim_season_reward', 'hand_over_season_claim', 'log_season_claim_activity',
                                    'my_season', 'open_season_claims', 'season_board', 'season_overview',
                                    'season_score', 'season_start')
              and p.prosrc ~* 'season'
  loop
    raise exception '0275: % still names the season after the edit; nothing was dropped.', r.fn;
  end loop;
end $$;

-- ============================================================================
-- 2. DATA THAT POINTED AT THE SEASON
-- ============================================================================
-- The TV's own check (just redefined) refuses a "season" panel, so take it out of every design first.
update gym_settings
   set tv_design = jsonb_set(tv_design, '{panels}', (tv_design -> 'panels') - 'season')
 where jsonb_typeof(tv_design -> 'panels') = 'array' and tv_design -> 'panels' ? 'season';

delete from activity_log where action like 'season.%';

-- ============================================================================
-- 3. TABLES AND FUNCTIONS DROPPED
-- ============================================================================
-- Their policies and triggers go with them; claims point at tiers, so claims go first.
drop table if exists season_claims;
drop table if exists season_tiers;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname = any (array[
                'claim_season_reward', 'hand_over_season_claim', 'log_season_claim_activity',
                'my_season', 'open_season_claims', 'season_board', 'season_overview',
                'season_score', 'season_start']) loop
    execute format('drop function %s', f);
  end loop;
end $$;

-- ============================================================================
-- 4. THE SWITCH REMOVED
-- ============================================================================
delete from plan_features where feature_key = 'seasons';
delete from gym_modules where feature_key = 'seasons';
delete from platform_features where key = 'seasons';

-- ============================================================================
-- 5. WHAT'S NEW, MARKER
-- ============================================================================
insert into app_releases (app, title, items)
select 'admin', 'The monthly season is gone', array[
  'Rewards has no Monthly season tab, and the lobby TV no season board.',
  'Points, rewards, personal records and the record wall stay.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'The monthly season is gone');

insert into app_releases (app, title, items)
select 'member', 'Records have their own page', array[
  'The monthly season is gone. Your records and this week''s record wall are under Rewards, Records.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'Records have their own page');

create or replace function migration_0275_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0275_applied() to anon, authenticated;
