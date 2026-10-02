-- ============================================================================
-- 0144 — the coach's profile of a member (AI coach, Phase 2)
-- ============================================================================
-- What a member tells the coach when it sets them up. Given to the coach
-- whether or not they let it read their training (they wrote it for the
-- coach); their history from the rest of the app still needs that consent.
-- An injury is kept as yes/no only — never the words — and a yes makes the
-- coach refer, never change exercises (CLAUDE.md).
-- ============================================================================

alter table ai_coach_profiles add column if not exists goal text;
alter table ai_coach_profiles add column if not exists experience text;
alter table ai_coach_profiles add column if not exists days_per_week int;
alter table ai_coach_profiles add column if not exists minutes int;
alter table ai_coach_profiles add column if not exists equipment text[];
alter table ai_coach_profiles add column if not exists likes text;
alter table ai_coach_profiles add column if not exists avoid text;
alter table ai_coach_profiles add column if not exists has_injury boolean;
alter table ai_coach_profiles add column if not exists onboarded_at timestamptz;

alter table ai_coach_profiles drop constraint if exists ai_coach_profiles_answers_check;
alter table ai_coach_profiles add constraint ai_coach_profiles_answers_check check (
  (goal is null or goal in ('strength','muscle','fat_loss','fitness','sport','health'))
  and (experience is null or experience in ('new','some','experienced'))
  and (days_per_week is null or days_per_week between 1 and 7)
  and (minutes is null or minutes between 15 and 180)
  and (equipment is null or (cardinality(equipment) between 1 and 6
       and equipment <@ array['full_gym','machines','barbell','dumbbells','bodyweight','cardio']))
  and (likes is null or char_length(likes) <= 200)
  and (avoid is null or char_length(avoid) <= 200));

create or replace function save_ai_coach_profile(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_equipment text[]; v_days int; v_minutes int; v_injury boolean;
        v_goal text; v_exp text; v_likes text; v_avoid text; v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- Members only: a desk account has no coach to set up.
  if not exists (select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
                    and r.role = 'member' and r.status = 'active') then
    raise exception 'Only members can set up the coach.' using errcode = '42501';
  end if;
  -- The row is made by the consent choice. Saving before it would record a consent
  -- the member was never asked for, so refuse until it exists.
  if not exists (select 1 from ai_coach_profiles where gym_id = v_gym and member_id = auth.uid()) then
    raise exception 'Answer the coach''s first question first.';
  end if;
  if p is null or not (p ? 'goal' and p ? 'experience' and p ? 'days_per_week' and p ? 'minutes'
                       and p ? 'equipment' and p ? 'has_injury') then
    raise exception 'Please answer every question first.';
  end if;
  if jsonb_typeof(p -> 'equipment') <> 'array' then
    raise exception 'Choose the equipment you can use.';
  end if;
  select array_agg(e) into v_equipment from jsonb_array_elements_text(p -> 'equipment') e;
  if v_equipment is null or cardinality(v_equipment) = 0 then
    raise exception 'Choose the equipment you can use.';
  end if;
  -- a JSON null passes `?`, and a bad number would surface as a raw cast error
  begin
    v_days := (p ->> 'days_per_week')::int;
    v_minutes := (p ->> 'minutes')::int;
    v_injury := (p ->> 'has_injury')::boolean;
  exception when others then
    raise exception 'Please answer every question first.';
  end;
  v_goal := p ->> 'goal'; v_exp := p ->> 'experience';
  if v_goal is null or v_exp is null or v_days is null or v_minutes is null or v_injury is null then
    raise exception 'Please answer every question first.';
  end if;
  -- Plain sentences for out-of-range values, before the table's check would speak.
  if v_goal not in ('strength','muscle','fat_loss','fitness','sport','health') then
    raise exception 'Choose one of the goals listed.';
  end if;
  if v_exp not in ('new','some','experienced') then
    raise exception 'Choose how long you have been training from the list.';
  end if;
  if v_days not between 1 and 7 then
    raise exception 'Training days a week must be between 1 and 7.';
  end if;
  if v_minutes not between 15 and 180 then
    raise exception 'A session must be between 15 and 180 minutes.';
  end if;
  if cardinality(v_equipment) > 6
     or not (v_equipment <@ array['full_gym','machines','barbell','dumbbells','bodyweight','cardio']) then
    raise exception 'Choose equipment from the list (up to 6 items).';
  end if;
  v_likes := nullif(btrim(p ->> 'likes'), ''); v_avoid := nullif(btrim(p ->> 'avoid'), '');
  if char_length(coalesce(v_likes, '')) > 200 or char_length(coalesce(v_avoid, '')) > 200 then
    raise exception 'Keep what you enjoy and what you avoid to 200 characters each.';
  end if;
  -- UPDATE only: the consent choice made this row, and this must never write a consent.
  update ai_coach_profiles set
      goal = v_goal, experience = v_exp, days_per_week = v_days, minutes = v_minutes,
      equipment = v_equipment, likes = v_likes, avoid = v_avoid, has_injury = v_injury,
      onboarded_at = now()
   where gym_id = v_gym and member_id = auth.uid();
end;
$$;
revoke all on function save_ai_coach_profile(jsonb) from public, anon;
grant execute on function save_ai_coach_profile(jsonb) to authenticated;

-- ---- status: 0143's body, plus whether the member has been set up ------------------------------
create or replace function ai_coach_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_gym uuid := current_gym_id();
  v_daily int; v_monthly int; v_today int; v_month int; v_consent boolean; v_reason text;
  v_onboarded boolean;
begin
  select coalesce(s.ai_daily_messages, 30), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = v_gym;
  v_daily := coalesce(v_daily, 30); v_monthly := coalesce(v_monthly, 1500);

  select coalesce(sum(u.messages), 0) into v_today from ai_usage_days u
   where u.gym_id = v_gym and u.member_id = v_me and u.day = manila_today();
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = v_gym and u.day >= date_trunc('month', manila_today())::date;
  select p.consent_reads_data into v_consent from ai_coach_profiles p
   where p.gym_id = v_gym and p.member_id = v_me;
  v_onboarded := exists (select 1 from ai_coach_profiles p
   where p.gym_id = v_gym and p.member_id = v_me and p.onboarded_at is not null);

  v_reason := case
    when v_me is null or v_gym is null or not exists (
      select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = v_me
         and r.role = 'member' and r.status = 'active') then 'not_member'
    when not gym_module_on(v_gym, 'assistant') then 'switched_off'
    when not plan_allows(v_me, 'ai_model') then 'no_plan'
    when v_month >= v_monthly then 'monthly_limit'
    when v_today >= v_daily then 'daily_limit'
  end;

  return jsonb_build_object('gym_id', v_gym, 'allowed', v_reason is null, 'reason', v_reason,
    'used_today', v_today, 'daily_limit', v_daily, 'used_month', v_month, 'monthly_limit', v_monthly,
    'consent', v_consent, 'onboarded', v_onboarded);
end;
$$;

-- ---- context: the profile always; history only with a yes ---------------------------------------
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

create or replace function migration_0144_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0144_applied() from public, anon;
grant execute on function migration_0144_applied() to authenticated;
comment on function migration_0144_applied() is 'Probe marker: 0144 (AI coach profile) is live.';
