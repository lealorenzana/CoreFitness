-- 0118 — A member can ask to freeze or cancel, and the asking is a row.
--
-- Freezing and cancelling have been front-desk actions since 0057, for a
-- reason that has not changed and is not being changed here:
--
--     "a member who could freeze themselves would freeze on the day they were
--      about to expire and hold the membership indefinitely"
--                                      — g-fitness-admin/src/lib/api/memberships.ts
--
-- So this does **not** make freezing self-serve. It makes *asking* self-serve.
-- The desk still decides, exactly as before; what changes is that the request
-- stops being a Messenger message and becomes a row with a reason, a date and
-- an outcome.
--
-- ---- WHY IT MATTERS MORE THAN IT LOOKS -------------------------------------------------
--
-- 0073 works out what a cancelling member is owed: pro-rata for the unused
-- term, floored at the gym's tier, minus a documented fee, because RA 7394
-- expects pro-rata. It is careful, it is correct, and **the member it protects
-- cannot see it**. `refund_quote()` has been callable by them since 0070 and
-- no member-facing screen has ever called it.
--
-- A refund rule a member only learns about after they have cancelled is a rule
-- they cannot act on. The member app now shows the quote *before* the ask, so
-- the number they are agreeing to is the number the database will produce.
--
-- ---- THE SHAPE IS 0091'S, DELIBERATELY -------------------------------------------------
--
-- `renewal_requests` already established how a member asks the desk for
-- something here: a table with no write policy, three SECURITY DEFINER
-- functions (ask / withdraw / decline), one open request enforced by a partial
-- unique index rather than by hope, and **fulfilment by trigger rather than by
-- hand** — the desk does the real thing, and the request closes itself.
--
-- Two request tables with two different idioms would be two things to learn.
-- This is the same one, and the same rule holds: the desk never marks a
-- request granted; recording the freeze or the cancel is what grants it. A
-- button that only sets a status is a control writing a flag nothing honours.

-- ---- 1. the table ----------------------------------------------------------------------

create table if not exists membership_requests (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  -- `profiles(id)`, not `member_profiles(profile_id)`: since 0098 that table is
  -- keyed `(gym_id, profile_id)` and has no unique on `profile_id` alone (0100
  -- dropped the transitional one). Being a member OF THIS GYM is checked in
  -- `request_membership_change` instead, which is where 0100 moved the same
  -- test for renewals.
  member_id   uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('freeze', 'cancel')),
  -- Required, unlike a renewal's optional note. 0057 already refuses a freeze
  -- or a cancel with no reason; asking for one with no reason would just move
  -- the argument to the desk.
  reason      text not null check (char_length(btrim(reason)) between 1 and 280),
  -- Freeze only, and a hint rather than a promise: the desk sets the real dates
  -- and 0070's yearly ceiling is shown, never enforced (MIGRATION_STATUS).
  requested_days int check (requested_days is null or requested_days between 1 and 90),
  status      text not null default 'open'
              check (status in ('open', 'granted', 'declined', 'withdrawn')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references profiles(id),
  close_note  text check (close_note is null or char_length(close_note) <= 280)
);

-- One open request per member per gym: a constraint, not a hope. `requested_days`
-- on a cancel is meaningless, so the table refuses it rather than leaving a
-- number nobody reads.
create unique index if not exists membership_requests_one_open
  on membership_requests (gym_id, member_id) where status = 'open';
create index if not exists idx_membership_requests_open
  on membership_requests (gym_id, created_at) where status = 'open';

alter table membership_requests drop constraint if exists membership_requests_days_kind;
alter table membership_requests add constraint membership_requests_days_kind
  check (kind = 'freeze' or requested_days is null);

alter table membership_requests enable row level security;

drop policy if exists membership_requests_select_self on membership_requests;
create policy membership_requests_select_self on membership_requests
  for select using (member_id = auth.uid());

drop policy if exists membership_requests_select_desk on membership_requests;
create policy membership_requests_select_desk on membership_requests
  for select using (is_front_desk());

-- No INSERT/UPDATE/DELETE policy for anyone: every write goes through the
-- functions below, which check the rules the table cannot.
grant select on membership_requests to authenticated;

-- It is one gym's table, so it joins the tenancy layer and carries the same
-- four RESTRICTIVE policies as the other fifty.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_invitations','gym_modules','gym_plans','gym_settings','invoice_counters',
    'member_profiles','member_share_prefs','membership_events','membership_plans',
    'membership_requests','memberships',
    'notifications','payments','pending_registrations','plan_features','point_ledger','point_rules',
    'pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','workout_logs','workout_plans','workout_routine_exercises','workout_routines',
    'workout_sets']::text[]
$$;

do $$
begin
  execute 'drop policy if exists tenant_select on membership_requests';
  execute 'drop policy if exists tenant_insert on membership_requests';
  execute 'drop policy if exists tenant_update on membership_requests';
  execute 'drop policy if exists tenant_delete on membership_requests';
  execute 'create policy tenant_select on membership_requests as restrictive for select to anon, authenticated
             using (gym_id = current_gym_id())';
  execute 'create policy tenant_insert on membership_requests as restrictive for insert to anon, authenticated
             with check (gym_id = current_gym_id() and gym_writable())';
  execute 'create policy tenant_update on membership_requests as restrictive for update to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())
             with check (gym_id = current_gym_id())';
  execute 'create policy tenant_delete on membership_requests as restrictive for delete to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())';
end $$;

comment on table membership_requests is
  'A member asking the desk to freeze or cancel (0118). The desk still decides; '
  'recording the freeze or cancel is what grants it, never a button that only '
  'sets a status.';

-- ---- 2. the member asks ----------------------------------------------------------------

create or replace function request_membership_change(
  p_kind text, p_reason text, p_days int default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_me  uuid := auth.uid();
  v_gym uuid := current_gym_id();
  v_m   record;
  v_id  uuid;
  v_who text;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if p_kind not in ('freeze', 'cancel') then
    raise exception 'A request is either a freeze or a cancel.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the desk reads this, and it is on your record.';
  end if;
  if not exists (select 1 from member_profiles
                  where profile_id = v_me and gym_id = v_gym) then
    raise exception 'Only members can ask to change a membership.';
  end if;

  select m.id, m.status, m.expiry_date into v_m
    from memberships m
   where m.member_id = v_me and m.status in ('active', 'frozen')
   order by m.expiry_date desc nulls last
   limit 1;

  -- Said plainly, because the alternative is a member asking to freeze
  -- something that expired in March and hearing nothing back for a week.
  if v_m.id is null then
    raise exception 'You have no membership to change. Renew first, or ask at the desk.';
  end if;
  if p_kind = 'freeze' and v_m.status = 'frozen' then
    raise exception 'Your membership is already frozen.';
  end if;
  if p_kind = 'freeze' and (p_days is null or p_days not between 1 and 90) then
    raise exception 'Say how many days, between 1 and 90.';
  end if;

  -- Asking again replaces the earlier ask rather than failing on the index: a
  -- member who changes their mind should not have to withdraw first. Same rule
  -- as a renewal (0091), including that this covers changing a freeze to a
  -- cancel.
  update membership_requests
     set status = 'withdrawn', closed_at = now(), closed_by = v_me,
         close_note = 'Replaced by a new request'
   where member_id = v_me and gym_id = v_gym and status = 'open';

  insert into membership_requests (gym_id, member_id, kind, reason, requested_days)
  values (v_gym, v_me, p_kind, btrim(p_reason),
          case when p_kind = 'freeze' then p_days end)
  returning id into v_id;

  select coalesce(first_name || ' ' || last_name, 'A member') into v_who
    from profiles where id = v_me;

  -- The desk hears about it, once per request. Staff of THIS gym only: the
  -- 0091 version predates tenancy and notifies every admin on the service.
  perform notify_once(r.user_id, 'system',
           case when p_kind = 'freeze' then 'Freeze request' else 'Cancellation request' end,
           v_who || ': ' || btrim(p_reason),
           '/members', 'membership-request:' || v_id)
    from gym_roles r
   where r.gym_id = v_gym and r.role in ('admin', 'staff') and r.status = 'active';

  return v_id;
end;
$fn$;
revoke all on function request_membership_change(text, text, int) from public, anon;
grant execute on function request_membership_change(text, text, int) to authenticated;

create or replace function withdraw_membership_request() returns void
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  update membership_requests
     set status = 'withdrawn', closed_at = now(), closed_by = auth.uid()
   where member_id = auth.uid() and gym_id = current_gym_id() and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'You have no open request to withdraw.'; end if;
end;
$fn$;
revoke all on function withdraw_membership_request() from public, anon;
grant execute on function withdraw_membership_request() to authenticated;

-- ---- 3. the desk answers ---------------------------------------------------------------

create or replace function decline_membership_request(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can turn a request down.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;
  update membership_requests
     set status = 'declined', closed_at = now(), closed_by = auth.uid(),
         close_note = btrim(p_reason)
   where id = p_id and gym_id = current_gym_id() and status = 'open'
  returning member_id, kind into r;
  if r.member_id is null then raise exception 'That request is not open.'; end if;
  perform notify_once(r.member_id, 'system',
    case when r.kind = 'freeze' then 'Freeze request closed' else 'Cancellation request closed' end,
    btrim(p_reason), '/member/membership', 'membership-request-declined:' || p_id);
end;
$fn$;
revoke all on function decline_membership_request(uuid, text) from public, anon;
grant execute on function decline_membership_request(uuid, text) to authenticated;

-- **Granting is never done by hand.** Recording the freeze or the cancel is
-- what closes the request, the same way recording a payment closes a renewal
-- request (0091). A "mark granted" button would be a flag nothing honours: the
-- member would read "granted" and still be able to book.
create or replace function trg_grant_membership_request() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.kind in ('freeze', 'cancel') then
    update membership_requests
       set status = 'granted', closed_at = now(), closed_by = auth.uid()
     where member_id = new.member_id
       and gym_id = coalesce(new.gym_id, current_gym_id())
       and kind = new.kind
       and status = 'open';
  end if;
  return new;
end;
$fn$;

drop trigger if exists grant_membership_request on membership_events;
create trigger grant_membership_request
  after insert on membership_events
  for each row execute function trg_grant_membership_request();

-- ---- 4. reading it ---------------------------------------------------------------------

-- The member's own latest request, open or not: a declined one has to stay
-- readable, because the reason the desk gave is the whole point of it.
create or replace function my_membership_request()
returns table (id uuid, kind text, reason text, requested_days int, status text,
               created_at timestamptz, closed_at timestamptz, close_note text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.reason, r.requested_days, r.status,
         r.created_at, r.closed_at, r.close_note
    from membership_requests r
   where r.member_id = auth.uid() and r.gym_id = current_gym_id()
   order by r.created_at desc
   limit 1;
$$;
revoke all on function my_membership_request() from public, anon;
grant execute on function my_membership_request() to authenticated;

-- The desk's queue. Carries what the desk needs to decide without opening each
-- member: how long they have been with the gym, when their term ends, and what
-- a cancel would cost the gym under 0073.
create or replace function open_membership_requests()
returns table (id uuid, member_id uuid, member_name text, kind text, reason text,
               requested_days int, created_at timestamptz,
               plan_name text, expiry_date date, membership_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.member_id,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         r.kind, r.reason, r.requested_days, r.created_at,
         mp.name, m.expiry_date, m.id
    from membership_requests r
    join profiles p on p.id = r.member_id
    left join lateral (
      select m2.* from memberships m2
       where m2.member_id = r.member_id and m2.status in ('active', 'frozen')
       order by m2.expiry_date desc nulls last limit 1
    ) m on true
    left join membership_plans mp on mp.id = m.plan_id
   where r.gym_id = current_gym_id() and r.status = 'open'
     and is_front_desk()
   order by r.created_at;
$$;
revoke all on function open_membership_requests() from public, anon;
grant execute on function open_membership_requests() to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0118_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0118_applied() from public, anon;
grant execute on function migration_0118_applied() to authenticated;
comment on function migration_0118_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0118.sql
