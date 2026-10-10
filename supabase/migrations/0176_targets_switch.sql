-- ============================================================================
-- 0176 — Goals are Targets, and a gym can switch them off
-- ============================================================================
--
-- Members asked what Goals were for. They are targets a member sets — a
-- weight, a lift, visits a week — that the database checks and rewards (0087),
-- and that their coach can see. On screen they are TARGETS now, under
-- Progress, and a gym that does not want them switches them off like any other
-- part of the app (a child of Progress, 0141): off, the tab and every link to
-- it disappear; a member's targets are kept, and come back when it is on.
-- ============================================================================

insert into platform_features (key, label, description, sort_order, parent_key) values
  ('targets', 'Targets',
   'Members set targets — a weight, a lift, visits a week. The app checks them, and their coach can see them if shared.',
   63, 'progress')
on conflict (key) do nothing;

create or replace function migration_0176_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0176_applied() from public, anon;
grant execute on function migration_0176_applied() to authenticated;
comment on function migration_0176_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0176.sql
