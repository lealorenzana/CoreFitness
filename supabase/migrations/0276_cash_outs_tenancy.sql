-- 0276: put cash_outs (0271) back on tenancy_gym_tables().
--
-- 0272 was written before 0271 and rewrote the whole list without cash_outs; 0271 to 0274 were pasted in that order,
-- so the live list lost it. Nothing in RLS reads the list (platform_gym_footprint() does, so the platform's per-gym
-- count missed the cash drawer). This adds the one entry to whatever the list is when it runs, so it is right after
-- 0275 too, and running it twice changes nothing.

do $$
declare
  l text[] := tenancy_gym_tables();
begin
  if not ('cash_outs' = any (l)) then
    l := array_append(l, 'cash_outs');
    execute format('create or replace function tenancy_gym_tables() returns text[] language sql immutable as $f$ select %L::text[] $f$', l);
  end if;
end $$;

create or replace function migration_0276_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0276_applied() to anon, authenticated;

-- Check: expect true.
select 'cash_outs' = any (tenancy_gym_tables()) as cash_outs_listed;
