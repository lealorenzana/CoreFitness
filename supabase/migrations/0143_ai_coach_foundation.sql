-- ============================================================================
-- 0143 — the AI coach, foundation: who may use it, how much, what it may read
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-29-ai-coach-design.md.
--
-- A real model now answers members (the Edge Function `ai-coach`), so four
-- things have to be true in SQL rather than in the app:
--   1. Only an entitled member at a gym that runs the assistant may use it —
--      ai_coach_status() is asked by the function *as the member*.
--   2. It costs the gym money per message, so there are two limits the gym
--      sets, counted per Manila day and month, and the count is written only by
--      the service role: a member who could write it could reset their limit.
--   3. It reads a member's history only after they say yes, and the yes can be
--      withdrawn — ai_coach_context() returns NULL without it.
--   4. What it reads is a short allow-list. Never health or waiver answers,
--      payments, contact details, coach chat or photos.
-- Conversations stay in 0046's assistant_conversations/messages, which are
-- already the member's alone.
-- ============================================================================

alter table gym_settings add column if not exists ai_daily_messages int not null default 30;
alter table gym_settings add column if not exists ai_monthly_messages int not null default 1500;
alter table gym_settings drop constraint if exists gym_settings_ai_daily_check;
alter table gym_settings add constraint gym_settings_ai_daily_check check (ai_daily_messages between 1 and 500);
alter table gym_settings drop constraint if exists gym_settings_ai_monthly_check;
alter table gym_settings add constraint gym_settings_ai_monthly_check check (ai_monthly_messages between 1 and 100000);

-- Which side of the assistant wrote a reply: the rules or the model.
alter table assistant_messages add column if not exists source text;
alter table assistant_messages drop constraint if exists assistant_messages_source_check;
alter table assistant_messages add constraint assistant_messages_source_check
  check (source is null or source in ('rules', 'coach'));

create table if not exists ai_coach_profiles (
  gym_id             uuid not null default acting_gym_id() references gyms(id),
  member_id          uuid not null references profiles(id) on delete cascade,
  consent_reads_data boolean not null,
  consented_at       timestamptz not null default now(),
  primary key (gym_id, member_id)
);

create table if not exists ai_usage_days (
  gym_id     uuid not null references gyms(id),
  member_id  uuid not null references profiles(id) on delete cascade,
  day        date not null,
  messages   int not null default 0 check (messages >= 0),
  tokens_in  bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  primary key (gym_id, member_id, day)
);
create index if not exists ai_usage_days_gym_day on ai_usage_days (gym_id, day);

alter table ai_coach_profiles enable row level security;
alter table ai_usage_days     enable row level security;
grant select on ai_coach_profiles, ai_usage_days to authenticated;

-- The member's own rows, and nobody else's — not the desk, not the owner
-- (the owner gets gym totals from a function in Phase 5).
drop policy if exists ai_coach_profiles_own on ai_coach_profiles;
create policy ai_coach_profiles_own on ai_coach_profiles for select to authenticated
  using (member_id = auth.uid());
drop policy if exists ai_usage_days_own on ai_usage_days;
create policy ai_usage_days_own on ai_usage_days for select to authenticated
  using (member_id = auth.uid());
-- No insert/update/delete policy on either, for any role: writes are functions.

-- ---- status: every gate in one answer -----------------------------------------------------------
create or replace function ai_coach_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_gym uuid := current_gym_id();
  v_daily int; v_monthly int; v_today int; v_month int; v_consent boolean; v_reason text;
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
    'consent', v_consent);
end;
$$;

create or replace function set_ai_coach_consent(p_reads_data boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_gym_id() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into ai_coach_profiles (gym_id, member_id, consent_reads_data, consented_at)
  values (current_gym_id(), auth.uid(), coalesce(p_reads_data, false), now())
  on conflict (gym_id, member_id) do update
    set consent_reads_data = excluded.consent_reads_data, consented_at = now();
end;
$$;

-- ---- what the coach may read: a short allow-list, and only with a yes --------------------------
create or replace function ai_coach_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id();
begin
  if not exists (select 1 from ai_coach_profiles p
                  where p.gym_id = v_gym and p.member_id = v_me and p.consent_reads_data) then
    return null;
  end if;
  return jsonb_build_object(
    'first_name', (select pr.first_name from profiles pr where pr.id = v_me),
    'experience_level', (select mp.experience_level from member_profiles mp where mp.profile_id = v_me),
    'goals', coalesce((select jsonb_agg(g.title order by g.created_at) from fitness_goals g
                        where g.member_id = v_me and g.achieved_on is null), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(r.name order by r.position) from workout_routines r
                           where r.member_id = v_me), '[]'::jsonb),
    'workouts_30d', (select count(*) from workout_logs l
                      where l.member_id = v_me and l.completed_at >= now() - interval '30 days'));
end;
$$;

-- ---- usage: the service role only ---------------------------------------------------------------
create or replace function ai_record_usage(p_gym uuid, p_member uuid, p_in int, p_out int) returns void
language sql security definer set search_path = public as $$
  insert into ai_usage_days (gym_id, member_id, day, messages, tokens_in, tokens_out)
  values (p_gym, p_member, manila_today(), 1, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0))
  on conflict (gym_id, member_id, day) do update
    set messages = ai_usage_days.messages + 1,
        tokens_in = ai_usage_days.tokens_in + excluded.tokens_in,
        tokens_out = ai_usage_days.tokens_out + excluded.tokens_out;
$$;

revoke all on function ai_coach_status(), set_ai_coach_consent(boolean), ai_coach_context()
  from public, anon;
grant execute on function ai_coach_status(), set_ai_coach_consent(boolean), ai_coach_context()
  to authenticated;
revoke all on function ai_record_usage(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function ai_record_usage(uuid, uuid, int, int) to service_role;

-- ---- tenancy: both tables are the gym's --------------------------------------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['ai_coach_profiles', 'ai_usage_days'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
  end loop;
end $$;

create or replace function migration_0143_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0143_applied() from public, anon;
grant execute on function migration_0143_applied() to authenticated;
comment on function migration_0143_applied() is 'Probe marker: 0143 (AI coach foundation) is live.';
