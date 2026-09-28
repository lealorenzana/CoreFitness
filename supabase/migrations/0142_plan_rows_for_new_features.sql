-- ============================================================================
-- 0142 — a plan never has holes, whichever side grows
-- ============================================================================
-- 0108 promised that every platform plan has one row per feature, and kept the
-- promise from one side only: a trigger fills a *new plan*. Nothing filled a
-- *new feature*, so when 0141 added ten switches, every plan was left with ten
-- missing rows. Nothing broke — a missing row reads as "included" in
-- gym_plan_allows() and on the platform's Plans page alike — but the rule the
-- tenancy harness asserts ("every plan opens including everything") was false,
-- and the next feature would widen the gap.
--
-- Two things:
--   1. Fill the holes. A child copies its parent's answer for that plan, so a
--      plan that does not sell Coaches does not appear to sell Coach chat.
--   2. A trigger on platform_features, the other half of 0108's trigger, so a
--      feature added later arrives with a row on every plan — again copying its
--      parent where it has one, and included otherwise.
--
-- Changes nothing any gym can see: every row written here says what the
-- missing row already meant.
-- ============================================================================

insert into platform_plan_features (plan_key, feature_key, enabled)
select p.key, f.key,
       coalesce((select pf.enabled from platform_plan_features pf
                  where pf.plan_key = p.key and pf.feature_key = f.parent_key), true)
  from platform_plans p cross join platform_features f
on conflict (plan_key, feature_key) do nothing;

create or replace function trg_platform_feature_seeded() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into platform_plan_features (plan_key, feature_key, enabled)
  select p.key, new.key,
         coalesce((select pf.enabled from platform_plan_features pf
                    where pf.plan_key = p.key and pf.feature_key = new.parent_key), true)
    from platform_plans p
  on conflict (plan_key, feature_key) do nothing;
  return new;
end;
$fn$;

drop trigger if exists platform_feature_seeded on platform_features;
create trigger platform_feature_seeded after insert on platform_features
  for each row execute function trg_platform_feature_seeded();

create or replace function migration_0142_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0142_applied() from public, anon;
grant execute on function migration_0142_applied() to authenticated;
comment on function migration_0142_applied() is 'Probe marker: 0142 (plan rows for new features) is live.';
