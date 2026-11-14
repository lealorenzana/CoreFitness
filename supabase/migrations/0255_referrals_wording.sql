-- 0255 — Invite a friend's own description says what 0253 made true (2026-11-14).
--
-- Your app → What you run shows each part's `platform_features.description`. Invite a friend's still said
-- "both earn points when the friend first pays", but since 0253 a gym that runs no points gives its desk
-- reward instead (or nothing). Copy is a claim: the words follow the rule.

update platform_features
   set description = 'Members share a code; when the friend first pays, both are rewarded — points, or your desk reward if you run no points.'
 where key = 'referrals';

create or replace function migration_0255_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0255_applied() to anon, authenticated;
