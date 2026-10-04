-- 0157 — A gym's own house rules: written by the owner, versioned, and agreed
-- to by members word for word.
--
-- The member Terms (section 6, "Using the gym") are the same for every gym —
-- attire, equipment, respect, no photos of other people. A gym also has rules
-- of its own: towels on benches, no chalk on the platform, the 90-minute limit
-- at peak hours. Until now those could only live on a sign by the door.
--
-- They are the gym's to write — but a member's agreement has to point at
-- words that cannot change afterwards, which is exactly 0119's rule for the
-- waiver and 0155's for the Terms. So:
--
--   gym_house_rules         one row per published version, immutable (a
--                           trigger refuses every update, the owner included);
--                           writing new rules publishes the next version.
--                           An empty body is a real version: "no house rules".
--   house_rules_acceptances which member agreed to which version, by a
--                           composite key to the exact row — a Gym B member
--                           cannot point at a Gym A version even if every policy
--                           were wrong.
--
-- They are a member document like the Terms, shown inside the Terms, and the
-- member app asks for them the same way (Today's "Updated for you to read").
-- They are not a gate: nothing waits for them — the waiver is the one
-- document that can (0119).
--
-- Re-runnable.

create table if not exists gym_house_rules (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  version      int  not null check (version >= 1),
  -- Empty is allowed: publishing nothing is how a gym withdraws its rules.
  body         text not null check (char_length(body) <= 4000),
  published_at timestamptz not null default now(),
  published_by uuid references profiles(id),
  unique (gym_id, version),
  unique (gym_id, id)
);
alter table gym_house_rules enable row level security;

-- Everyone signed in at the gym reads them (the tenancy policy below keeps it
-- to their own gym): members must be able to re-read what they agreed to.
drop policy if exists gym_house_rules_read on gym_house_rules;
create policy gym_house_rules_read on gym_house_rules for select
  using (auth.uid() is not null);
grant select on gym_house_rules to authenticated;

create or replace function trg_house_rules_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception
    'Published house rules cannot be edited. Publish a new version instead — '
    'members agreed to the words that were on screen.';
end;
$$;
drop trigger if exists house_rules_frozen on gym_house_rules;
create trigger house_rules_frozen before update on gym_house_rules
  for each row execute function trg_house_rules_frozen();

create table if not exists house_rules_acceptances (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  rules_id    uuid not null,
  profile_id  uuid not null references profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  unique (rules_id, profile_id),
  foreign key (gym_id, rules_id) references gym_house_rules (gym_id, id) on delete cascade
);
alter table house_rules_acceptances enable row level security;

drop policy if exists house_rules_acceptances_self on house_rules_acceptances;
create policy house_rules_acceptances_self on house_rules_acceptances for select
  using (profile_id = auth.uid());
drop policy if exists house_rules_acceptances_desk on house_rules_acceptances;
create policy house_rules_acceptances_desk on house_rules_acceptances for select
  using (is_front_desk());
-- No write policy on either table: the two functions below are the only writers.
grant select on house_rules_acceptances to authenticated;

-- ============================================================================
-- 1. THE OWNER PUBLISHES
-- ============================================================================
create or replace function publish_house_rules(p_body text) returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_ver int; v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
          and r.role = 'admin' and r.status = 'active') then
    raise exception 'Only the gym''s owner can publish house rules.' using errcode = '42501';
  end if;
  if not gym_writable() then
    raise exception 'This gym is read-only right now, so its house rules cannot change.' using errcode = '42501';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'House rules can be at most 4000 characters.';
  end if;
  -- Publishing the words already in effect would ask every member to agree again for nothing.
  if v_body = coalesce((select h.body from gym_house_rules h where h.gym_id = v_gym order by h.version desc limit 1), '')
     and exists (select 1 from gym_house_rules h where h.gym_id = v_gym) then
    raise exception 'These are the house rules already in effect.';
  end if;
  if v_body = '' and not exists (select 1 from gym_house_rules h where h.gym_id = v_gym) then
    raise exception 'Write the rules first.';
  end if;

  select coalesce(max(version), 0) + 1 into v_ver from gym_house_rules where gym_id = v_gym;
  insert into gym_house_rules (gym_id, version, body, published_by)
  values (v_gym, v_ver, v_body, auth.uid())
  returning id into v_id;

  perform log_activity('gym.house_rules_published', 'gym_house_rules', v_id, null,
    case when v_body = '' then 'House rules withdrawn (version ' || v_ver || ')'
         else 'House rules version ' || v_ver || ' published — members are asked to agree to it' end,
    jsonb_build_object('version', v_ver), v_gym);
  return v_ver;
end;
$$;
revoke all on function publish_house_rules(text) from public, anon;
grant execute on function publish_house_rules(text) to authenticated;

-- ============================================================================
-- 2. A MEMBER AGREES
-- ============================================================================
-- The rules in effect at this gym, and this person's agreement to them.
create or replace function my_house_rules() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when cur.id is null then null else jsonb_build_object(
    'id', cur.id, 'version', cur.version, 'body', cur.body, 'published_at', cur.published_at,
    'accepted_at', (select a.accepted_at from house_rules_acceptances a
                     where a.rules_id = cur.id and a.profile_id = auth.uid()),
    'agreed_version', (select max(h.version) from house_rules_acceptances a
                         join gym_house_rules h on h.id = a.rules_id
                        where a.profile_id = auth.uid() and a.gym_id = cur.gym_id))
  end
  from (select h.* from gym_house_rules h where h.gym_id = current_gym_id()
         order by h.version desc limit 1) cur
  right join (select 1) one on true
  where auth.uid() is not null;
$$;
revoke all on function my_house_rules() from public, anon;
grant execute on function my_house_rules() to authenticated;

create or replace function accept_house_rules(p_rules uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_current uuid; v_id uuid;
begin
  if auth.uid() is null or not exists (
       select 1 from member_profiles m where m.gym_id = v_gym and m.profile_id = auth.uid()) then
    raise exception 'Only a member of this gym can agree to its house rules.' using errcode = '42501';
  end if;
  select h.id into v_current from gym_house_rules h where h.gym_id = v_gym order by h.version desc limit 1;
  if v_current is null or p_rules is distinct from v_current then
    raise exception 'Those are not the house rules in effect. Reload and read the current ones.';
  end if;
  insert into house_rules_acceptances (gym_id, rules_id, profile_id)
  values (v_gym, v_current, auth.uid())
  on conflict (rules_id, profile_id) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function accept_house_rules(uuid) from public, anon;
grant execute on function accept_house_rules(uuid) to authenticated;

-- ============================================================================
-- 3. THE DESK SEES WHO HAS AGREED
-- ============================================================================
-- Every version, newest first, with how many members agreed to it.
create or replace function house_rules_history()
returns table (id uuid, version int, body text, published_at timestamptz, published_by text, agreed int)
language sql stable security definer set search_path = public as $$
  select h.id, h.version, h.body, h.published_at,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         (select count(*)::int from house_rules_acceptances a where a.rules_id = h.id)
    from gym_house_rules h
    left join profiles p on p.id = h.published_by
   where h.gym_id = current_gym_id() and is_front_desk()
   order by h.version desc;
$$;
revoke all on function house_rules_history() from public, anon;
grant execute on function house_rules_history() to authenticated;

-- ============================================================================
-- 4. TENANCY
-- ============================================================================
-- 0156's list plus the two tables.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
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
declare t text;
begin
  foreach t in array array['gym_house_rules', 'house_rules_acceptances'] loop
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
  end loop;
end $$;

create or replace function migration_0157_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0157_applied() from public, anon;
grant execute on function migration_0157_applied() to authenticated;
comment on function migration_0157_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0157.sql
