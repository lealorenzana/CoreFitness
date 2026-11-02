-- 0232 — Fairer tiers: retention for every gym (2026-11-02).
--
-- 0230's Starter was too bare: an owner could not tell members "closed tomorrow",
-- members saw no points or challenges, and the retention view — the reason a gym
-- pays for this at all — sat in Pro. The owner's call: keeping members is what
-- every gym needs. Now:
--
--   Starter  runs the gym, and members get a real app: announcements and push,
--            points, challenges, weekly quests, invite-a-friend, coach chat, and analytics and
--            retention. (Not: package rooms, the shop, Lobby TV, classes,
--            seasons and teams, events, online payments, the assistant.)
--   Growth   everything but the assistant — packages, the shop, Lobby TV, classes,
--            online payments.
--   Pro      everything, the AI assistant (it costs Core Fitness per message), no limit.
--
-- Prices and member limits are 0230's. Only platform_plan_features changes; the
-- platform can still tick any box on Plans → What each plan unlocks. Safe to paste again.

select sync_platform_plan_features();
update platform_plan_features set enabled = (feature_key in (
  'front_desk', 'checkin', 'requests', 'coaching', 'chat', 'progress', 'programs', 'photos', 'targets', 'equipment',
  'push', 'engagement', 'points', 'quests', 'referrals', 'analytics'))
 where plan_key = 'starter';
update platform_plan_features set enabled = (feature_key <> 'assistant') where plan_key = 'growth';
update platform_plan_features set enabled = true where plan_key in ('trial', 'pro');

create or replace function migration_0232_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0232_applied() to anon, authenticated;
