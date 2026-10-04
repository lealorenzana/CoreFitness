-- 0152 — The gym documents take effect when the platform publishes them, and
-- every gym's owner agrees to the version in effect.
--
-- 0150 recorded an *applicant's* agreement, and left two things to a constant
-- in the website's source: whether the documents were in effect at all
-- (IN_EFFECT), and nothing whatever for the gyms that were already here before
-- there were documents to agree to. A contract coming into force is not a code
-- change, and a gym that joined in September is as bound as one that applies
-- in December.
--
--   platform_billing.gym_terms_published   the version (the date printed on the
--       documents) that is in effect, or NULL while they are drafts. Set from the
--       platform app's Settings by platform_publish_gym_terms(). The website reads
--       it through platform_public_terms() and calls its own text "in effect"
--       only when its VERSION is this one — so a site deployed with newer, unpublished
--       wording says "draft" about that wording, never the reverse.
--
--   gym_terms_acceptances   one row per gym per version: which owner agreed, when.
--       The admin app asks a gym's owners (never its desk) for the published
--       version until one of them agrees; the platform sees it per gym.
--
-- **No write policy for anyone** — agreement goes through
-- accept_gym_terms_owner(), which only an owner of the current gym can call, and
-- only for the version that is published. First owner wins; the row cannot be
-- moved afterwards.
--
-- Re-runnable.

alter table platform_billing add column if not exists gym_terms_published text;
alter table platform_billing drop constraint if exists platform_billing_terms_version_check;
alter table platform_billing add constraint platform_billing_terms_version_check
  check (gym_terms_published is null or gym_terms_published ~ '^\d{4}-\d{2}-\d{2}$');

comment on column platform_billing.gym_terms_published is
  'The version of the gym documents in effect (0152), or NULL while they are drafts. '
  'Set only by platform_publish_gym_terms().';

-- ============================================================================
-- 1. PUBLISHING
-- ============================================================================
create or replace function platform_publish_gym_terms(p_version text) returns void
language plpgsql security definer set search_path = public as $$
declare v_was text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can publish the gym documents.' using errcode = '42501';
  end if;
  if p_version is not null and p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'A version is the date printed on the documents, like 2026-10-03.';
  end if;
  if p_version is not null and p_version::date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'A version cannot take effect before its date.';
  end if;
  select gym_terms_published into v_was from platform_billing where id;
  update platform_billing set gym_terms_published = p_version, updated_at = now() where id;
  perform platform_log(null,
    case when p_version is null then 'legal.withdrawn' else 'legal.published' end,
    case when p_version is null then 'The gym documents were set back to draft'
         else 'The gym documents of ' || p_version || ' were put in effect' end,
    jsonb_build_object('version', p_version, 'was', v_was));
end;
$$;
revoke all on function platform_publish_gym_terms(text) from public, anon;
grant execute on function platform_publish_gym_terms(text) to authenticated;

-- 0150's reader, plus the version in effect.
create or replace function platform_public_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'business_name', b.business_name, 'business_address', b.business_address,
           'business_email', b.business_email, 'business_phone', b.business_phone,
           'grace_days', b.grace_days, 'reminder_days', to_jsonb(b.reminder_days),
           'gym_terms_published', b.gym_terms_published)
    from platform_billing b
   where b.id;
$$;
revoke all on function platform_public_terms() from public;
grant execute on function platform_public_terms() to anon, authenticated;

-- ============================================================================
-- 2. A GYM'S OWNER AGREES
-- ============================================================================
create table if not exists gym_terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  version     text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_by uuid not null references profiles(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  unique (gym_id, version)
);
alter table gym_terms_acceptances enable row level security;

-- A gym's owners read their own gym's; the desk has no need to.
drop policy if exists gym_terms_acceptances_owner on gym_terms_acceptances;
create policy gym_terms_acceptances_owner on gym_terms_acceptances for select
  using (get_my_role() = 'admin');
grant select on gym_terms_acceptances to authenticated;

comment on table gym_terms_acceptances is
  'Which version of the gym documents each gym agreed to, and which owner (0152). RLS on, '
  'select for the gym''s owners only; written by accept_gym_terms_owner(), read by the platform '
  'through platform_gym_terms().';

create or replace function accept_gym_terms_owner(p_version text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_published text; v_id uuid;
begin
  -- An *active* owner of this gym: get_my_role() ignores status, and an archived or
  -- suspended owner is not somebody who can bind the gym.
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
          and r.role = 'admin' and r.status = 'active') then
    raise exception 'Only the gym''s owner can agree to the gym documents.' using errcode = '42501';
  end if;
  select gym_terms_published into v_published from platform_billing where id;
  if v_published is null then
    raise exception 'The gym documents are not in effect yet.';
  end if;
  if p_version is distinct from v_published then
    raise exception 'That is not the version in effect. Reload and read the current one.';
  end if;

  insert into gym_terms_acceptances (gym_id, version, accepted_by)
  values (v_gym, v_published, auth.uid())
  on conflict (gym_id, version) do nothing
  returning id into v_id;

  if v_id is not null then
    perform platform_log(v_gym, 'legal.accepted',
      'Agreed to the gym documents of ' || v_published, jsonb_build_object('version', v_published));
  end if;
  return v_id is not null;
end;
$$;
revoke all on function accept_gym_terms_owner(text) from public, anon;
grant execute on function accept_gym_terms_owner(text) to authenticated;

-- What the admin app needs to decide whether to ask: the version in effect, and
-- this gym's agreement to it (if any). For anyone but an owner, nothing to ask.
create or replace function my_gym_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when get_my_role() is distinct from 'admin' then null else jsonb_build_object(
    'published', b.gym_terms_published,
    'accepted_version', a.version,
    'accepted_at', a.accepted_at,
    'accepted_by', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''))
  end
    from platform_billing b
    left join gym_terms_acceptances a on a.gym_id = current_gym_id() and a.version = b.gym_terms_published
    left join profiles p on p.id = a.accepted_by
   where b.id;
$$;
revoke all on function my_gym_terms() from public, anon;
grant execute on function my_gym_terms() to authenticated;

-- ============================================================================
-- 3. THE PLATFORM SEES EVERY GYM
-- ============================================================================
create or replace function platform_gym_terms()
returns table (gym_id uuid, gym_name text, published text, accepted_version text,
               accepted_at timestamptz, accepted_by text, from_application text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, b.gym_terms_published,
         latest.version, latest.accepted_at,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         -- What the owner agreed to when they applied (0150), if they did.
         (select ga.terms_version from gym_applications ga
           where ga.gym_id = g.id and ga.terms_version is not null
           order by ga.terms_accepted_at desc limit 1)
    from gyms g
    cross join platform_billing b
    left join lateral (select a.version, a.accepted_at, a.accepted_by from gym_terms_acceptances a
                        where a.gym_id = g.id order by a.version desc limit 1) latest on true
    left join profiles p on p.id = latest.accepted_by
   where is_platform_admin() and b.id
   order by g.name;
$$;
revoke all on function platform_gym_terms() from public, anon;
grant execute on function platform_gym_terms() to authenticated;

-- ============================================================================
-- 4. TENANCY
-- ============================================================================
-- 0151's list plus gym_terms_acceptances.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text := 'gym_terms_acceptances';
begin
  execute format('drop policy if exists tenant_select on %I', t);
  execute format('drop policy if exists tenant_insert on %I', t);
  execute format('drop policy if exists tenant_update on %I', t);
  execute format('drop policy if exists tenant_delete on %I', t);
  execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                    using (gym_id = current_gym_id())', t);
  execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                    with check (gym_id = current_gym_id() and gym_writable())', t);
  execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                    using (gym_id = current_gym_id() and gym_writable())
                    with check (gym_id = current_gym_id())', t);
  execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                    using (gym_id = current_gym_id() and gym_writable())', t);
end $$;

create or replace function migration_0152_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0152_applied() from public, anon;
grant execute on function migration_0152_applied() to authenticated;
comment on function migration_0152_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0152.sql
