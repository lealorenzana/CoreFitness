-- 0208: a squad week and a gym goal pay by the member's plan, not the caller's role (2026-10-20)
--
-- settle_squads() and settle_gym_goals() (0124, 0125) filter their payout with
-- plan_allows(member, 'points_earn'). plan_allows() answers true whenever the
-- CALLER is admin or staff (0049: "the gym is never gated by a member's tier"),
-- which is right for screens and wrong for paying a member. Both sweeps run on
-- page load in the admin app (Challenges → Gym goal and Squads, the TV board), so
-- the owner opening the page paid every member, whether their plan earns points
-- or not; the same sweep run by a member paid correctly. Found writing 0206.
--
-- 0125's bodies exactly, with plan_allows → member_plan_allows (0206: plan_allows()'s
-- body without the caller's shortcut). Both functions are SECURITY DEFINER, so
-- they may call member_plan_allows, which no signed-in role can.

create or replace function settle_squads() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  s record; wk date; v_days int; v_week uuid; v_pts int; n int := 0;
begin
  for s in select * from squads where archived_at is null and (v_only is null or gym_id = v_only) loop
    perform act_as_gym(s.gym_id);
    foreach wk in array array[manila_week_start(), manila_week_start(-1)] loop
      v_days := squad_days(s.id, wk);
      continue when v_days < s.weekly_target;
      insert into squad_weeks (gym_id, squad_id, week_start, days)
      values (s.gym_id, s.id, wk, v_days)
      on conflict (squad_id, week_start) do nothing
      returning id into v_week;
      continue when v_week is null;
      select points into v_pts from point_rules where gym_id = s.gym_id and key = 'squad_week' and is_active;
      if v_pts is not null then
        insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
        select s.gym_id, m.member_id, 'squad_week', v_pts, 'squad_weeks', v_week
          from squad_members m
         where m.squad_id = s.id and m.left_at is null and member_plan_allows(m.member_id, 'points_earn')
        on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      end if;
      n := n + 1;
    end loop;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;

create or replace function settle_gym_goals() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  g record; n int := 0;
begin
  for g in select * from gym_goals
            where is_active and reached_at is null and (v_only is null or gym_id = v_only)
              and starts_on <= (now() at time zone 'Asia/Manila')::date
              and ends_on >= (now() at time zone 'Asia/Manila')::date - 7 loop
    perform act_as_gym(g.gym_id);
    continue when (select progress from gym_goal_progress(g.id)) < g.target;
    update gym_goals set reached_at = now() where id = g.id and reached_at is null;
    if g.reward_points > 0 then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      select g.gym_id, r.user_id, 'gym_goal', g.reward_points, 'gym_goals', g.id
        from gym_roles r
       where r.gym_id = g.gym_id and r.role = 'member'
         and gym_goal_contribution(g.id, r.user_id) > 0 and member_plan_allows(r.user_id, 'points_earn')
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    end if;
    n := n + 1;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;

create or replace function migration_0208_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0208_applied() from public, anon;
grant execute on function migration_0208_applied() to authenticated;
comment on function migration_0208_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0208.sql
