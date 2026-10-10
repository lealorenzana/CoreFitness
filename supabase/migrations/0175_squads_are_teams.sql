-- ============================================================================
-- 0175 — Squads are called Teams
-- ============================================================================
--
-- "Squad" (0124: 2–5 friends scored on training days) read like a coaching
-- group, which is a different thing — a coach and the people they coach
-- together. On screen it is a TEAM now (2026-10-10). Tables, keys and routes
-- keep the word squad; only the words people read change: the switch's label,
-- the point rule's default label, and the messages the database says out loud
-- (refusals the app shows word for word, and the activity log line).
--
-- The functions are rewritten from their own current definitions with only
-- those phrases replaced, so nothing else in them can drift.
-- ============================================================================

update platform_features
   set label = 'Teams and gym goal',
       description = 'Teams of 2–5 friends training together, and one goal for the whole gym.'
 where key = 'squads' and label = 'Squads and gym goal';

-- Only a gym that never renamed it: an owner's own wording stays.
update point_rules set label = 'Your team hit its weekly target'
 where key = 'squad_week' and label = 'Your squad hit its weekly target';

do $$
declare
  f text;
  def text;
  pairs text[][] := array[
    array['can start a squad.', 'can start a team.'],
    array['can join a squad.', 'can join a team.'],
    array['already in a squad.', 'already in a team.'],
    array['No squad here has that code.', 'No team here has that code.'],
    array['That squad is full', 'That team is full'],
    array['Could not make a squad code.', 'Could not make a team code.'],
    array['You are not in a squad.', 'You are not in a team.'],
    array[' started the squad ', ' started the team '],
    array[' joined the squad ', ' joined the team '],
    array[' left the squad ', ' left the team '],
    array['Your squad hit its weekly target', 'Your team hit its weekly target']
  ];
  i int;
begin
  foreach f in array array['create_squad', 'join_squad', 'leave_squad', 'log_squad_activity', 'settle_squad_weeks', 'seed_point_rules'] loop
    for def in
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f
    loop
      for i in 1 .. array_length(pairs, 1) loop
        def := replace(def, pairs[i][1], pairs[i][2]);
      end loop;
      execute def;
    end loop;
  end loop;
end
$$;

create or replace function migration_0175_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0175_applied() from public, anon;
grant execute on function migration_0175_applied() to authenticated;
comment on function migration_0175_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0175.sql
