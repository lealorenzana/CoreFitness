-- ============================================================================
-- 0166 — Meal guides are retired
-- ============================================================================
--
-- The member app no longer has a Meals tab or meal guides (2026-10-05): the
-- gym asked for a simpler app, and meal guidance was the one feature outside
-- training. 0146 built it as an AI coach proposal ('meals.set') that wrote
-- `ai_meal_guides`. This retires it without deleting anyone's data:
--
--   * a new 'meals.set' proposal is refused, and one still pending can never
--     be applied — a trigger on ai_proposals, so it holds whichever function
--     writes the row (the coach's tool is also removed from ai-coach);
--   * pending meal proposals are discarded;
--   * the coach is no longer sent the member's meal guide (ai_coach_context);
--   * trainers can no longer read a trainee's guide (trainee_meal_guide is
--     revoked) — the member app no longer shows it either.
--
-- `ai_meal_guides` itself stays: a guide a member applied is their data, and
-- the member's data export still includes it (lib/memberDataExport.ts).
-- ============================================================================

create or replace function trg_no_meal_proposals() returns trigger
language plpgsql as $$
begin
  if new.kind = 'meals.set' and (tg_op = 'INSERT' or (new.status = 'applied' and old.status is distinct from 'applied')) then
    raise exception 'Meal guides are no longer part of the app.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ai_proposals_no_meals on ai_proposals;
create trigger ai_proposals_no_meals before insert or update of status on ai_proposals
  for each row execute function trg_no_meal_proposals();

update ai_proposals set status = 'discarded' where kind = 'meals.set' and status = 'pending';

-- 0146's definition, without 'meal_guide'.
create or replace function ai_coach_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id(); p ai_coach_profiles%rowtype; v_profile jsonb;
begin
  select * into p from ai_coach_profiles where gym_id = v_gym and member_id = v_me;
  if p.onboarded_at is not null then
    v_profile := jsonb_build_object('goal', p.goal, 'experience', p.experience, 'days_per_week', p.days_per_week,
      'minutes', p.minutes, 'equipment', to_jsonb(p.equipment), 'likes', p.likes, 'avoid', p.avoid,
      'has_injury', p.has_injury);
  end if;
  if not coalesce(p.consent_reads_data, false) then
    return case when v_profile is null then null else jsonb_build_object('profile', v_profile) end;
  end if;
  return jsonb_build_object(
    'profile', v_profile,
    'first_name', (select pr.first_name from profiles pr where pr.id = v_me),
    'experience_level', (select mp.experience_level from member_profiles mp where mp.profile_id = v_me and mp.gym_id = v_gym),
    'goals', coalesce((select jsonb_agg(g.title order by g.created_at) from fitness_goals g
                        where g.member_id = v_me and g.gym_id = v_gym and g.achieved_on is null), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(r.name order by r.position) from workout_routines r
                           where r.member_id = v_me and r.gym_id = v_gym), '[]'::jsonb),
    'workouts_30d', (select count(*) from workout_logs l
                      where l.member_id = v_me and l.gym_id = v_gym and l.completed_at >= now() - interval '30 days'));
end;
$$;

revoke execute on function trainee_meal_guide(uuid) from authenticated, anon, public;

create or replace function migration_0166_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0166_applied() from public, anon;
grant execute on function migration_0166_applied() to authenticated;
comment on function migration_0166_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';
