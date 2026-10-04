-- 0155 — Which words a member agreed to, not only when.
--
-- 0079 made the sign-up checkbox a record: `member_profiles.terms_accepted_at`,
-- stamped by the server. It said, in its own header, what it could not do yet:
-- "the pages carry a 'last updated' date and nothing reads it. When the gym
-- starts versioning the terms, that table is the right shape and this column is
-- what it backfills from." This is that table.
--
-- The member Terms and Privacy Policy now carry a version — the date printed at
-- the top, kept in one place in the member app (lib/legalVersions.ts) — and a
-- member's agreement records it. "Agreed on 14 March" means nothing if the
-- words could change on the 15th; 0119 made the same rule for waivers.
--
-- ---- TWO WAYS IN, ONE WRITER EACH --------------------------------------------------------
--
--   at sign-up   Register sends `terms_version` and `privacy_version` in the
--                signup metadata beside 0079's `terms_accepted`. A trigger on
--                member_profiles — not another rewrite of handle_new_member_signup(),
--                whose chain (0005 → … → 0079 → 0100) has cost two repairs already —
--                copies them into this table when 0079's stamp is set.
--   in the app   accept_member_terms(terms, privacy) for a member who reads a newer
--                version. The member app offers it on the page itself and on Today.
--
-- **No INSERT policy for anyone** — a consent the client can write is not a
-- record (CLAUDE.md: anything the client can grant or skip proves nothing). The
-- member reads their own; the desk reads its gym's, beside 0079's date.
--
-- ---- WHAT THE PAST GETS ------------------------------------------------------------------
--
-- Every member 0079 stamped is backfilled as version 'unversioned', at the time
-- 0079 recorded: they agreed, and nobody can say to which words. Writing the
-- current date in would invent the one fact this table exists to keep.
--
-- Re-runnable.

create table if not exists terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  document    text not null check (document in ('member_terms', 'member_privacy')),
  /** The date printed at the top of the document, or 'unversioned' (before 0155). */
  version     text not null check (version = 'unversioned' or version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  source      text not null check (source in ('signup', 'in_app', 'backfill')),
  unique (gym_id, profile_id, document, version)
);
create index if not exists idx_terms_acceptances_member on terms_acceptances (gym_id, profile_id, accepted_at desc);

alter table terms_acceptances enable row level security;

drop policy if exists terms_acceptances_self on terms_acceptances;
create policy terms_acceptances_self on terms_acceptances for select
  using (profile_id = auth.uid());

drop policy if exists terms_acceptances_desk on terms_acceptances;
create policy terms_acceptances_desk on terms_acceptances for select
  using (is_front_desk());

grant select on terms_acceptances to authenticated;

comment on table terms_acceptances is
  'Which version of the member Terms / Privacy Policy a member agreed to, and how (0155). '
  'RLS on, select only: written by trg_member_terms_from_signup() and accept_member_terms().';

-- ============================================================================
-- 1. AT SIGN-UP
-- ============================================================================
-- After 0079's stamp lands on member_profiles. Reads the version the form sent
-- from the auth user's metadata; a missing or malformed one is 'unversioned' —
-- the consent is still real, the words are unknown. Never raises: a sign-up is
-- not the place to lose a member over a record about the sign-up.
create or replace function trg_member_terms_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb; v_terms text; v_privacy text;
begin
  if new.terms_accepted_at is null then return new; end if;
  begin
    select coalesce(u.raw_user_meta_data, '{}'::jsonb) into meta from auth.users u where u.id = new.profile_id;
    v_terms   := case when meta->>'terms_version'   ~ '^\d{4}-\d{2}-\d{2}$' then meta->>'terms_version'   else 'unversioned' end;
    v_privacy := case when meta->>'privacy_version' ~ '^\d{4}-\d{2}-\d{2}$' then meta->>'privacy_version' else 'unversioned' end;
    insert into terms_acceptances (gym_id, profile_id, document, version, accepted_at, source)
    values (new.gym_id, new.profile_id, 'member_terms',   v_terms,   new.terms_accepted_at, 'signup'),
           (new.gym_id, new.profile_id, 'member_privacy', v_privacy, new.terms_accepted_at, 'signup')
    on conflict (gym_id, profile_id, document, version) do nothing;
  exception when others then
    -- Deliberately swallowed, like 0125's bad referral code: the account matters more.
    raise warning 'terms_acceptances not written for %: %', new.profile_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists member_terms_from_signup on member_profiles;
create trigger member_terms_from_signup
  after insert or update of terms_accepted_at on member_profiles
  for each row execute function trg_member_terms_from_signup();

-- ============================================================================
-- 2. IN THE APP
-- ============================================================================
create or replace function accept_member_terms(p_terms text default null, p_privacy text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_n int := 0; v_m int := 0; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from member_profiles m where m.gym_id = v_gym and m.profile_id = auth.uid()) then
    raise exception 'Only a member of this gym can agree to its member terms.' using errcode = '42501';
  end if;
  if p_terms is null and p_privacy is null then
    raise exception 'Nothing to agree to.';
  end if;
  if (p_terms is not null and (p_terms !~ '^\d{4}-\d{2}-\d{2}$' or p_terms::date > v_today))
     or (p_privacy is not null and (p_privacy !~ '^\d{4}-\d{2}-\d{2}$' or p_privacy::date > v_today)) then
    raise exception 'That is not a published version.';
  end if;

  if p_terms is not null then
    insert into terms_acceptances (gym_id, profile_id, document, version, source)
    values (v_gym, auth.uid(), 'member_terms', p_terms, 'in_app')
    on conflict (gym_id, profile_id, document, version) do nothing;
    get diagnostics v_n = row_count;
  end if;
  if p_privacy is not null then
    insert into terms_acceptances (gym_id, profile_id, document, version, source)
    values (v_gym, auth.uid(), 'member_privacy', p_privacy, 'in_app')
    on conflict (gym_id, profile_id, document, version) do nothing;
    get diagnostics v_m = row_count;
  end if;
  -- How many new agreements were recorded; 0 when they had already agreed to these versions.
  return v_n + v_m;
end;
$$;
revoke all on function accept_member_terms(text, text) from public, anon;
grant execute on function accept_member_terms(text, text) to authenticated;

-- ============================================================================
-- 3. THE PAST, AND TENANCY
-- ============================================================================
insert into terms_acceptances (gym_id, profile_id, document, version, accepted_at, source)
select m.gym_id, m.profile_id, d.document, 'unversioned', m.terms_accepted_at, 'backfill'
  from member_profiles m
 cross join (values ('member_terms'), ('member_privacy')) d(document)
 where m.terms_accepted_at is not null
   -- Only where nothing is recorded for that document yet: a re-run must not give
   -- a member who signed up under a version an 'unversioned' row beside it.
   and not exists (select 1 from terms_acceptances t
                    where t.gym_id = m.gym_id and t.profile_id = m.profile_id and t.document = d.document)
on conflict (gym_id, profile_id, document, version) do nothing;

-- 0146's list plus terms_acceptances.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
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
    'squad_members','squad_weeks','squads','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text := 'terms_acceptances';
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

create or replace function migration_0155_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0155_applied() from public, anon;
grant execute on function migration_0155_applied() to authenticated;
comment on function migration_0155_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0155.sql
