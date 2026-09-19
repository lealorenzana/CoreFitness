-- 0099 — One same-gym layer on every gym table.
--
-- RESTRICTIVE policies are ANDed with the permissive ones, so every existing
-- rule keeps exactly its meaning and simply stops at the gym's edge: "an admin
-- may edit memberships" becomes "an admin may edit their own gym's
-- memberships" without that policy being touched. get_my_role() already means
-- "my role in my current gym" (0097).
--
-- A gym that is suspended, or more than 7 days past its paid-until date,
-- keeps reading (and exporting) but cannot write. SECURITY DEFINER functions
-- run as the table owner and are not subject to these policies; 0100–0103
-- scope each of them to one gym.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 4)

-- ---- read-only when locked ------------------------------------------------------

create or replace function gym_lock_reason(p_gym uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case
           when g.status = 'suspended' then 'suspended'
           when g.paid_until is not null
                and g.paid_until < (now() at time zone 'Asia/Manila')::date - 7 then 'overdue'
         end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

create or replace function gym_writable(p_gym uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_gym, current_gym_id()) is not null and gym_lock_reason(p_gym) is null;
$$;

-- ---- the same-gym layer ---------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array tenancy_gym_tables() loop
    execute format('alter table %I enable row level security', t);
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

-- ---- the shared library ---------------------------------------------------------
-- NULL rows are the Core Fitness library every gym reads (the free workout
-- library, 0019, stays free). A gym adds and edits its own rows. The shared
-- rows are curated by the platform and — as they are today, on the Exercises
-- page — by Gym #1's own staff, who built the library.

create or replace function may_curate_library() returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or current_gym_id() = gym_one();
$$;

do $$
declare t text;
begin
  foreach t in array array['exercises', 'workout_resources'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id is null or gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_writable() and (gym_id = current_gym_id() or (gym_id is null and may_curate_library())))', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_writable() and (gym_id = current_gym_id() or (gym_id is null and may_curate_library())))
                      with check (gym_id = current_gym_id() or (gym_id is null and may_curate_library()))', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_writable() and (gym_id = current_gym_id() or (gym_id is null and may_curate_library())))', t);
  end loop;
end $$;

-- Gym #1's staff add to the shared library, as today: their additions stay
-- shared rather than becoming Gym #1-only (the acting-gym default would file
-- them under Gym #1).
create or replace function trg_library_row_gym() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.gym_id = gym_one() then
    new.gym_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists library_row_gym on exercises;
create trigger library_row_gym before insert on exercises
  for each row execute function trg_library_row_gym();
drop trigger if exists library_row_gym on workout_resources;
create trigger library_row_gym before insert on workout_resources
  for each row execute function trg_library_row_gym();

-- ---- crash reports ----------------------------------------------------------------
-- A gym sees its own; reports from before sign-in (no gym) are the platform's.
-- The default is the caller's current gym only — never the single-gym fallback,
-- so an anonymous report stays unassigned rather than landing in a gym.
alter table client_errors alter column gym_id set default current_gym_id();
drop policy if exists tenant_select on client_errors;
create policy tenant_select on client_errors as restrictive for select to anon, authenticated
  using (gym_id = current_gym_id() or is_platform_admin());
drop policy if exists tenant_insert on client_errors;
create policy tenant_insert on client_errors as restrictive for insert to anon, authenticated
  with check (gym_id is null or gym_id = current_gym_id());
drop policy if exists tenant_delete on client_errors;
create policy tenant_delete on client_errors as restrictive for delete to anon, authenticated
  using (gym_id = current_gym_id() or is_platform_admin());

-- ---- people ----------------------------------------------------------------------
-- A profile is visible to its owner and to people in a gym it belongs to.
-- "Admin may read profiles" (0006) now reads: admin may read their own gym's people.

create or replace function same_gym_person(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or exists (select 1 from gym_roles where user_id = p_user and gym_id = current_gym_id());
$$;

drop policy if exists tenant_select on profiles;
create policy tenant_select on profiles as restrictive for select to anon, authenticated
  using (same_gym_person(id));
drop policy if exists tenant_update on profiles;
create policy tenant_update on profiles as restrictive for update to anon, authenticated
  using (id = auth.uid() or (same_gym_person(id) and gym_writable()));

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'notification_prefs'] loop
    execute format('drop policy if exists tenant_person on %I', t);
    execute format('create policy tenant_person on %I as restrictive for all to anon, authenticated
                      using (same_gym_person(user_id)) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---- views that run as their owner ------------------------------------------------
-- A view without security_invoker reads as its owner and skips RLS, so each
-- filters to the current gym itself and gains gym_id as its last column
-- (create or replace view may add columns only at the end). The four
-- security_invoker views (activity_feed, bookings_needing_attention,
-- my_trainer_members, trainer_evaluation_months) inherit the layer above.

create or replace view class_availability as
 select c.id as class_id,
    c.capacity,
    count(b.id) filter (where b.status = any (array['pending'::booking_status, 'approved'::booking_status]))::integer as booked_count,
    c.gym_id
   from classes c
     left join bookings b on b.class_id = c.id and b.gym_id = c.gym_id
  where (sees_demo_data() or not is_demo_row(c.id))
    and c.gym_id = current_gym_id()
  group by c.id, c.capacity, c.gym_id;

create or replace view public_trainer_credentials as
 select trainer_id,
    title,
    reviewed_at as verified_on,
    gym_id
   from trainer_credentials c
  where status = 'verified'::text
    and gym_id = current_gym_id();

-- A coach is a coach of this gym: the role and status come from gym_roles.
create or replace view public_trainers as
 select p.id,
    p.first_name,
    p.last_name,
    p.photo_url,
    tp.specialization,
    tp.bio,
    tp.availability,
    tp.years_experience,
    tp.certifications,
    tp.focus_areas,
    tp.achievements,
    tp.gym_id
   from profiles p
     join trainer_profiles tp on tp.profile_id = p.id
  where tp.gym_id = current_gym_id()
    and exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = tp.gym_id
                  and r.role = 'trainer'::user_role and r.status = 'active')
    and (sees_demo_data() or not is_demo_row(p.id));

-- One body: a coach's sessions in every gym block their time, but only coaches
-- of my gym are listed, and nothing but the time is shown.
create or replace view trainer_busy_slots as
 select trainer_id,
    starts_at,
    duration_minutes
   from pt_sessions
  where status = any (array['pending'::booking_status, 'approved'::booking_status])
    and trainer_id in (select user_id from gym_roles where gym_id = current_gym_id() and role = 'trainer');

create or replace view trainer_evaluation_summary as
 select trainer_id,
    period,
    count(*)::integer as rating_count,
    round(avg(stars), 2) as average_stars,
    count(*) filter (where comment is not null and btrim(comment) <> ''::text)::integer as comment_count,
    gym_id
   from trainer_ratings r
  where gym_id = current_gym_id()
  group by trainer_id, period, gym_id;

create or replace view trainer_rating_summary as
 with latest_per_member as (
         select distinct on (r.trainer_id, r.member_id) r.trainer_id,
            r.member_id,
            r.stars
           from trainer_ratings r
          where r.gym_id = current_gym_id()
          order by r.trainer_id, r.member_id, r.period desc
        )
 select t.profile_id as trainer_id,
    count(l.stars)::integer as rating_count,
        case
            when count(l.stars) >= 3 then round(avg(l.stars), 1)
            else null::numeric
        end as average_stars,
    t.gym_id
   from trainer_profiles t
     left join latest_per_member l on l.trainer_id = t.profile_id
  where t.gym_id = current_gym_id()
  group by t.profile_id, t.gym_id;

create or replace view trainer_ratings_anon with (security_barrier = true) as
 select trainer_id,
    stars,
    comment,
    period,
    created_at,
    updated_at,
    gym_id
   from trainer_ratings r
  where gym_id = current_gym_id();

-- activity_feed is security_invoker; it only gains gym_id for the screens.
create or replace view activity_feed with (security_invoker = true) as
 select l.id,
    l.occurred_at,
    l.action,
    l.subject_type,
    l.subject_id,
    l.summary,
    l.detail,
    l.reconstructed,
    l.actor_id,
    l.actor_role,
    coalesce(nullif(trim(both from (ap.first_name || ' '::text) || ap.last_name), ''::text), l.actor_label) as actor_name,
    ap.photo_url as actor_photo_url,
    l.member_id,
    nullif(trim(both from (mp.first_name || ' '::text) || mp.last_name), ''::text) as member_name,
    l.gym_id
   from activity_log l
     left join profiles ap on ap.id = l.actor_id
     left join profiles mp on mp.id = l.member_id;

-- The other security_invoker views: rows already stop at the gym edge; each
-- gains gym_id so every view answers "which gym" the same way.
create or replace view my_trainer_members with (security_invoker = true) as
 select mp.profile_id as member_id,
    trim(both from (p.first_name || ' '::text) || p.last_name) as name,
    p.photo_url,
    mp.experience_level,
    ( select max(a.check_in_time) as max
           from attendance a
          where a.member_id = mp.profile_id and a.gym_id = mp.gym_id) as last_visit,
    ( select count(*) as count
           from attendance a
          where a.member_id = mp.profile_id and a.gym_id = mp.gym_id
            and a.check_in_time >= (now() - '30 days'::interval)) as visits_last_30,
    ( select count(*) as count
           from pt_sessions s
          where s.member_id = mp.profile_id and s.gym_id = mp.gym_id and s.trainer_id = auth.uid()
            and s.status = 'approved'::booking_status and s.starts_at >= now()) as upcoming_with_me,
    mp.gym_id
   from member_profiles mp
     join profiles p on p.id = mp.profile_id
  where p.status <> 'archived'::text;

create or replace view trainer_evaluation_months with (security_invoker = true) as
 select trainer_id,
    period,
    count(*)::integer as evaluations,
    round(avg(stars), 1) as average_stars,
    count(comment) filter (where comment is not null and btrim(comment) <> ''::text)::integer as with_comment,
    gym_id
   from trainer_ratings r
  group by trainer_id, period, gym_id;

create or replace view bookings_needing_attention with (security_invoker = true) as
 select 'pt'::text as kind,
    s.id,
    s.member_id,
    trim(both from (mp.first_name || ' '::text) || mp.last_name) as member_name,
    s.trainer_id,
    trim(both from (tp.first_name || ' '::text) || tp.last_name) as trainer_name,
    coalesce(s.notes, 'Personal training'::text) as what,
    s.requested_at,
    s.starts_at,
    floor(extract(epoch from now() - s.requested_at) / 86400::numeric)::integer as days_waiting,
    floor(extract(epoch from s.starts_at - now()) / 3600::numeric)::integer as hours_until,
        case
            when (s.starts_at - now()) < '24:00:00'::interval then 'urgent'::text
            when (now() - s.requested_at) >= '72:00:00'::interval then 'overdue'::text
            when (now() - s.requested_at) >= '24:00:00'::interval then 'waiting'::text
            else 'new'::text
        end as urgency,
    s.gym_id
   from pt_sessions s
     join profiles mp on mp.id = s.member_id
     left join profiles tp on tp.id = s.trainer_id
  where s.status = 'pending'::booking_status and s.starts_at > now()
union all
 select 'class'::text as kind,
    b.id,
    b.member_id,
    trim(both from (mp.first_name || ' '::text) || mp.last_name) as member_name,
    c.trainer_id,
    trim(both from (tp.first_name || ' '::text) || tp.last_name) as trainer_name,
    c.name as what,
    b.requested_at,
    c.scheduled_at as starts_at,
    floor(extract(epoch from now() - b.requested_at) / 86400::numeric)::integer as days_waiting,
    floor(extract(epoch from c.scheduled_at - now()) / 3600::numeric)::integer as hours_until,
        case
            when (c.scheduled_at - now()) < '24:00:00'::interval then 'urgent'::text
            when (now() - b.requested_at) >= '72:00:00'::interval then 'overdue'::text
            when (now() - b.requested_at) >= '24:00:00'::interval then 'waiting'::text
            else 'new'::text
        end as urgency,
    b.gym_id
   from bookings b
     join classes c on c.id = b.class_id and c.gym_id = b.gym_id
     join profiles mp on mp.id = b.member_id
     left join profiles tp on tp.id = c.trainer_id
  where b.status = 'pending'::booking_status and c.scheduled_at is not null and c.scheduled_at > now();

create or replace function migration_0099_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0099_applied() from public, anon;
grant execute on function migration_0099_applied() to authenticated;
comment on function migration_0099_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0099.sql
