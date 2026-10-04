-- 0152: THE STREAK'S LAST TWELVE WEEKS
--
-- The streak screen draws the member's recent weeks as tokens — reached, frozen,
-- missed, this week — so the run has a shape rather than only a number. Which
-- weeks counted is the database's call (0151's one definition), never the phone's,
-- so streak_card() gains a `history` array computed by the same rules:
--
--   hit      training days >= the member's target
--   frozen   not reached, and the member was frozen that week (it never broke a run)
--   miss     not reached, not frozen, after they joined
--   before   an empty week that ended before they joined here (drawn faint) —
--            never a week with training on record, whatever the join date says
--   current  this week, not reached yet — in progress, never a miss
--
-- Oldest first, twelve weeks including this one. Everything else in the card is
-- 0151's, byte for byte.

create or replace function streak_card(p_member uuid, p_gym uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_week date := manila_week_start();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_days int;
  v_left int;
  v_frozen boolean;
  v_dots jsonb;
  v_next int;
  v_nudges boolean;
  v_since date;
  v_history jsonb;
begin
  select * into s from streak_weeks(p_member, p_gym);
  v_days := training_days_between(p_member, p_gym, v_week, v_week + 6);
  v_left := (v_week + 6) - v_today + 1;                       -- today included
  v_frozen := exists (select 1 from memberships m where m.member_id = p_member and m.gym_id = p_gym and m.status = 'frozen');
  -- Monday to Sunday: was it a training day?
  select jsonb_agg(
           exists (select 1 from attendance a where a.member_id = p_member and a.gym_id = p_gym
                      and (a.check_in_time at time zone 'Asia/Manila')::date = g.d::date)
           or exists (select 1 from workout_logs l where l.member_id = p_member and l.gym_id = p_gym
                         and l.performed_on = g.d::date)
           order by g.d)
    into v_dots from generate_series(v_week::timestamp, (v_week + 6)::timestamp, interval '1 day') g(d);
  select min(m) into v_next from unnest(array[4, 12, 26, 52]) m where m > s.best_run;
  select streak_nudges, (created_at at time zone 'Asia/Manila')::date into v_nudges, v_since
    from member_profiles where gym_id = p_gym and profile_id = p_member;

  -- The last twelve weeks, oldest first, by 0151's rules (see the header).
  select jsonb_agg(jsonb_build_object(
           'week', w.wk,
           'days', w.days,
           'state', case
             when w.days >= s.target then 'hit'
             when w.wk = v_week then 'current'
             when w.wk in (select f from member_frozen_weeks(p_member, p_gym) f) then 'frozen'
             -- Only an empty week: training on record means they were here, whatever the join date says.
             when w.days = 0 and v_since is not null and w.wk + 6 < v_since then 'before'
             else 'miss' end)
         order by w.wk)
    into v_history
    from (select (v_week - 7 * i) as wk,
                 training_days_between(p_member, p_gym, v_week - 7 * i, v_week - 7 * i + 6) as days
            from generate_series(0, 11) i) w;

  return jsonb_build_object(
    'target', s.target,
    'current', s.current_run,
    'best', s.best_run,
    'days_this_week', v_days,
    'needed', greatest(s.target - v_days, 0),
    'days_left', v_left,
    'week', v_dots,
    'today_index', v_today - v_week,
    'frozen', v_frozen,
    -- At risk: a streak to lose, and exactly as many days left as it still needs —
    -- every remaining day counts. More needed than left is already out of reach,
    -- and a nudge then would promise something that can no longer happen.
    'at_risk', s.current_run > 0 and not v_frozen and s.target - v_days > 0 and s.target - v_days = v_left,
    -- Out of reach this week: more days needed than remain.
    'out_of_reach', not v_frozen and s.target - v_days > v_left,
    'next_milestone', v_next,
    'nudges', coalesce(v_nudges, true),
    'history', coalesce(v_history, '[]'::jsonb));
end;
$$;
revoke all on function streak_card(uuid, uuid) from public, anon, authenticated;

create or replace function migration_0152_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0152_applied() from public, anon;
grant execute on function migration_0152_applied() to authenticated;
comment on function migration_0152_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0152.sql
