-- 0226 — the platform suspends an account (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part E).
--
-- Core Fitness's super admin can block one PERSON across every gym and every
-- app, with a reason — abuse, fraud, a court order. A gym's own suspension
-- (gym_roles.status) stays a gym's business; this one is the platform's, and
-- only the platform lifts it.
--
--   * AT ONCE: every session is signed out; current_gym_id(), get_my_role() and
--     role_in_gym() answer nothing for them, so every gym-scoped rule (RLS and
--     definer guards alike) refuses their next request, on any open device;
--     my_gym_context() says lock_reason 'platform_suspended'.
--   * THEY see the reason when they sign in (my_platform_suspension()), and by
--     email (the platform app sends it, kind 'account_suspended').
--   * EACH GYM they belong to is told "Suspended by Core Fitness" — never the
--     reason — and sees the mark on them (gym_suspended_people()).
-- Safe to paste again.

create table if not exists platform_suspensions (
  id           uuid primary key default gen_random_uuid(),
  person       uuid not null references profiles(id) on delete cascade,
  reason       text not null check (length(btrim(reason)) between 3 and 500),
  suspended_by uuid references profiles(id) on delete set null,
  suspended_at timestamptz not null default now(),
  lifted_by    uuid references profiles(id) on delete set null,
  lifted_at    timestamptz
);
create unique index if not exists uq_platform_suspensions_open on platform_suspensions(person) where lifted_at is null;
alter table platform_suspensions enable row level security;   -- no policy: definer functions only

create or replace function is_platform_suspended(p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_person is not null and exists (select 1 from platform_suspensions s where s.person = p_person and s.lifted_at is null);
$$;
revoke all on function is_platform_suspended(uuid) from public, anon;
grant execute on function is_platform_suspended(uuid) to authenticated;

-- ---- the three helpers every gym-scoped rule rests on: nothing for a suspended account ----
create or replace function current_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case when is_platform_suspended(auth.uid()) then null else coalesce(
    (select p.active_gym_id from profiles p where p.id = auth.uid()),
    support_session_gym()
  ) end;
$$;

create or replace function get_my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select r.role from gym_roles r
  join profiles p on p.id = r.user_id and p.active_gym_id = r.gym_id
  where r.user_id = auth.uid() and not is_platform_suspended(auth.uid());
$$;

create or replace function role_in_gym(p_gym uuid) returns text
language sql stable security definer set search_path = public as $$
  select role::text from gym_roles where user_id = auth.uid() and gym_id = p_gym and not is_platform_suspended(auth.uid());
$$;

-- 0104's context, with the platform's lock first.
create or replace function my_gym_context()
returns table (gym_id uuid, gym_name text, slug text, role user_role, status text, lock_reason text, short_name text,
               logo_url text, accent text, gym_count integer, onboarded boolean, onboarding_step text, gym_state text, accent_action text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         case when is_platform_suspended(auth.uid()) then 'platform_suspended' else gym_lock_reason(g.id) end,
         s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         (select count(*)::int from gym_roles x where x.user_id = auth.uid() and x.status <> 'archived'),
         g.onboarded_at is not null,
         g.onboarding_step,
         gym_state(g.id),
         s.accent_action
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
    left join gym_settings s on s.gym_id = g.id
   where p.id = auth.uid();
$$;

/** For the suspended person: why, and since when (shown at sign-in). Null when not suspended. */
create or replace function my_platform_suspension() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at)
    from platform_suspensions s where s.person = auth.uid() and s.lifted_at is null;
$$;
revoke all on function my_platform_suspension() from public, anon;
grant execute on function my_platform_suspension() to authenticated;

/** A gym's staff and coaches: which of their people Core Fitness has suspended. Never the reason. */
create or replace function gym_suspended_people() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.person from platform_suspensions s
   where s.lifted_at is null
     and exists (select 1 from gym_roles r where r.user_id = s.person and r.gym_id = current_gym_id())
     and get_my_role() in ('admin', 'staff', 'trainer');
$$;
revoke all on function gym_suspended_people() from public, anon;
grant execute on function gym_suspended_people() to authenticated;

-- ---- the platform's People page ----------------------------------------------------------------------
/** Find anyone, across every gym: name or email. */
create or replace function platform_search_people(p_q text)
returns table (id uuid, name text, email text, gyms jsonb, applicant boolean, platform_admin boolean,
               suspended_reason text, suspended_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, nullif(btrim(p.first_name || ' ' || p.last_name), ''), p.email,
         coalesce((select jsonb_agg(jsonb_build_object('gym', g.name, 'role', r.role, 'status', r.status) order by g.name)
                     from gym_roles r join gyms g on g.id = r.gym_id where r.user_id = p.id), '[]'::jsonb),
         exists (select 1 from gym_applications a where a.applicant_id = p.id),
         exists (select 1 from platform_admins x where x.user_id = p.id),
         s.reason, s.suspended_at
    from profiles p
    left join platform_suspensions s on s.person = p.id and s.lifted_at is null
   where is_platform_admin()
     and length(btrim(coalesce(p_q, ''))) >= 2
     and (p.email ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%'
          or (p.first_name || ' ' || p.last_name) ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%')
   order by s.suspended_at desc nulls last, p.first_name, p.last_name
   limit 50;
$$;
revoke all on function platform_search_people(text) from public, anon;
grant execute on function platform_search_people(text) to authenticated;

/** Everyone suspended now, newest first. */
create or replace function platform_suspended_people()
returns table (id uuid, name text, email text, reason text, suspended_at timestamptz, gyms text[])
language sql stable security definer set search_path = public as $$
  select p.id, nullif(btrim(p.first_name || ' ' || p.last_name), ''), p.email, s.reason, s.suspended_at,
         coalesce(array(select g.name from gym_roles r join gyms g on g.id = r.gym_id where r.user_id = p.id order by g.name), '{}')
    from platform_suspensions s join profiles p on p.id = s.person
   where is_platform_admin() and s.lifted_at is null
   order by s.suspended_at desc;
$$;
revoke all on function platform_suspended_people() from public, anon;
grant execute on function platform_suspended_people() to authenticated;

/** Tell each gym the person belongs to — the fact, never the reason. */
create or replace function suspension_tell_gyms(p_person uuid, p_title text, p_body text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct gr.gym_id from gym_roles gr where gr.user_id = p_person and gr.status <> 'archived' loop
    perform act_as_gym(r.gym_id);
    perform notify_once(o.user_id, 'system', p_title, p_body, '/members', p_key || ':' || o.user_id, r.gym_id)
      from gym_roles o where o.gym_id = r.gym_id and o.role = 'admin' and o.status = 'active' and o.user_id <> p_person;
  end loop;
  perform act_as_gym(null);
end;
$$;
revoke all on function suspension_tell_gyms(uuid, text, text, text) from public, anon, authenticated;

create or replace function platform_suspend(p_person uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness suspends an account.' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Say why — they are shown the reason.'; end if;
  if exists (select 1 from platform_admins where user_id = p_person) then
    raise exception 'A Core Fitness admin account cannot be suspended here.';
  end if;
  if not exists (select 1 from profiles where id = p_person) then raise exception 'That account does not exist.'; end if;
  if is_platform_suspended(p_person) then raise exception 'That account is already suspended.'; end if;
  insert into platform_suspensions (person, reason, suspended_by) values (p_person, btrim(p_reason), auth.uid()) returning id into v_id;
  v_name := display_name_of(p_person);
  perform suspension_tell_gyms(p_person, 'Suspended by Core Fitness',
    v_name || '''s account was suspended by Core Fitness. They cannot use any Core Fitness app until Core Fitness lifts it. Their records with you are unchanged.',
    'platform-suspended:' || v_id);
  perform platform_log(null, 'account.suspended', v_name || ' suspended: ' || btrim(p_reason), jsonb_build_object('person', p_person));
  -- Signed out everywhere, now.
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_person;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_person;
  end if;
end;
$$;
revoke all on function platform_suspend(uuid, text) from public, anon;
grant execute on function platform_suspend(uuid, text) to authenticated;

create or replace function platform_lift_suspension(p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness lifts a suspension.' using errcode = '42501'; end if;
  update platform_suspensions set lifted_at = now(), lifted_by = auth.uid()
   where person = p_person and lifted_at is null returning id into v_id;
  if v_id is null then raise exception 'That account is not suspended.'; end if;
  v_name := display_name_of(p_person);
  perform suspension_tell_gyms(p_person, 'Suspension lifted',
    'Core Fitness lifted the suspension on ' || v_name || '''s account. They can sign in again.', 'platform-lifted:' || v_id);
  perform platform_log(null, 'account.unsuspended', v_name || '''s suspension was lifted', jsonb_build_object('person', p_person));
end;
$$;
revoke all on function platform_lift_suspension(uuid) from public, anon;
grant execute on function platform_lift_suspension(uuid) to authenticated;

-- The email to the person (sent from the platform app through send-email).
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check
  check (kind in ('owner_credentials', 'password_reset', 'invitation', 'application_approved', 'application_rejected',
                  'application_message', 'application_documents', 'account_suspended', 'test'));

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0226_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0226_applied() to anon, authenticated;
