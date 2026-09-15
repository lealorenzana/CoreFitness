-- ============================================================================
-- 0083  THE DESK CAN SEE, AND FIX, A BOOKING NOBODY ANSWERED
-- ============================================================================
-- Re-runnable.
--
-- ## What already existed, and is not rebuilt here
--
-- 0071's `sweep_stale_requests()` is a full escalation ladder and it works: it
-- nudges the trainer at 24 hours, tells the member at 48, **notifies every
-- active admin at 72**, tells everyone when the session is inside a day, and
-- closes a request the start time has passed. The brief asks for admin
-- monitoring of unconfirmed bookings and that is most of it, already shipping.
--
-- What was missing is the other half: the admin was *told* and then had nowhere
-- to go. The notification points at `/bookings`, which is the approve/decline
-- queue — it does not say how long anyone has waited, and offers no way to move
-- the session to a coach who is actually free. Three things close that:
--
--   * a view the desk can sort by urgency,
--   * suggestions that come from real availability rather than a guess,
--   * a reassignment that is checked, recorded and reversible.
--
-- ## The audit trail
--
-- A reassignment is not an edit. "This session used to be Tere's" is a fact the
-- member and both coaches may need later, and `trainer_id` alone cannot answer
-- it once overwritten.
alter table pt_sessions
  add column if not exists previous_trainer_id uuid references trainer_profiles(profile_id),
  add column if not exists reassigned_at timestamptz,
  add column if not exists reassigned_by uuid references profiles(id);

comment on column pt_sessions.previous_trainer_id is
  'Who this session was with before the desk moved it. Null for the usual case.';

-- ============================================================================
-- 1. WHAT NEEDS ATTENTION
-- ============================================================================
-- `security_invoker`, so the desk's own policies decide what it may read — the
-- same rule `activity_feed` follows. A view that bypassed RLS here would hand a
-- trainer the whole gym's pending queue, which is the hole 0082 just closed.
--
-- Only rows still in the future. The sweep closes anything whose start time has
-- passed, and a list of problems nobody can act on any more is not a worklist.
create or replace view bookings_needing_attention
with (security_invoker = true) as
select
  'pt'::text                                     as kind,
  s.id,
  s.member_id,
  trim(mp.first_name || ' ' || mp.last_name)     as member_name,
  s.trainer_id,
  trim(tp.first_name || ' ' || tp.last_name)     as trainer_name,
  coalesce(s.notes, 'Personal training')         as what,
  s.requested_at,
  s.starts_at,
  -- Whole days, rounded down: "3 days waiting" is what the desk says out loud,
  -- and 2.97 days is the same sentence with a worse number in it.
  floor(extract(epoch from (now() - s.requested_at)) / 86400)::int as days_waiting,
  floor(extract(epoch from (s.starts_at - now())) / 3600)::int     as hours_until,
  -- One word the UI can sort and colour by, decided here rather than in two
  -- different screens that would eventually disagree.
  case
    when s.starts_at - now() < interval '24 hours' then 'urgent'
    when now() - s.requested_at >= interval '72 hours' then 'overdue'
    when now() - s.requested_at >= interval '24 hours' then 'waiting'
    else 'new'
  end                                            as urgency
  from pt_sessions s
  join profiles mp on mp.id = s.member_id
  left join profiles tp on tp.id = s.trainer_id
 where s.status = 'pending'
   and s.starts_at > now()
union all
select
  'class'::text,
  b.id,
  b.member_id,
  trim(mp.first_name || ' ' || mp.last_name),
  c.trainer_id,
  trim(tp.first_name || ' ' || tp.last_name),
  c.name,
  b.requested_at,
  c.scheduled_at,
  floor(extract(epoch from (now() - b.requested_at)) / 86400)::int,
  floor(extract(epoch from (c.scheduled_at - now())) / 3600)::int,
  case
    when c.scheduled_at - now() < interval '24 hours' then 'urgent'
    when now() - b.requested_at >= interval '72 hours' then 'overdue'
    when now() - b.requested_at >= interval '24 hours' then 'waiting'
    else 'new'
  end
  from bookings b
  join classes c on c.id = b.class_id
  join profiles mp on mp.id = b.member_id
  left join profiles tp on tp.id = c.trainer_id
 where b.status = 'pending'
   and c.scheduled_at is not null
   and c.scheduled_at > now();

comment on view bookings_needing_attention is
  'Pending bookings still ahead of now, with how long the member has waited. '
  'security_invoker: the caller''s own policies decide what they see.';

grant select on bookings_needing_attention to authenticated;

-- ============================================================================
-- 2. WHO ELSE COULD TAKE IT
-- ============================================================================
-- **Availability is the rule; everything else is a tiebreak.** A coach who does
-- not work that hour cannot take the session however well they match, so the
-- WHERE clause is about hours and clashes only, and the ranking is advisory.
--
-- What it deliberately does NOT do is invent a qualification match. There is no
-- "requested service" on a PT session — only free-text `notes` — so scoring a
-- trainer against it would be a guess dressed as a recommendation. The one real
-- signal is `trainer_profiles.focus_areas` against the member's own
-- `interests`, and it is used as a tiebreak and labelled as one.
create or replace function suggest_trainers_for_session(p_session uuid)
returns table (
  trainer_id uuid,
  trainer_name text,
  specialization text,
  /** Overlapping focus areas with what the member said they are here for. */
  shared_focus int,
  /** Sessions already on their book in the next week — a load signal. */
  upcoming_load int
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_starts   timestamptz;
  v_minutes  int;
  v_current  uuid;
  v_member   uuid;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can look for another trainer.';
  end if;

  select s.starts_at, s.duration_minutes, s.trainer_id, s.member_id
    into v_starts, v_minutes, v_current, v_member
    from pt_sessions s where s.id = p_session;

  if v_starts is null then
    raise exception 'That session could not be found.';
  end if;

  return query
  select
    t.profile_id,
    trim(p.first_name || ' ' || p.last_name),
    t.specialization,
    coalesce(cardinality(
      array(select unnest(coalesce(t.focus_areas, '{}'::text[]))
            intersect
            select unnest(coalesce(m.interests, '{}'::text[])))
    ), 0),
    (select count(*)::int from pt_sessions o
      where o.trainer_id = t.profile_id
        and o.status in ('pending', 'approved')
        and o.starts_at between now() and now() + interval '7 days')
    from trainer_profiles t
    join profiles p on p.id = t.profile_id
    left join member_profiles m on m.profile_id = v_member
   where p.status = 'active'
     and t.profile_id is distinct from v_current
     -- Works that weekday, and the whole session fits inside the window.
     and exists (
       select 1 from trainer_availability a
        where a.trainer_id = t.profile_id
          and a.day_of_week = extract(dow from v_starts)::int
          and a.start_time <= v_starts::time
          and a.end_time   >= (v_starts + make_interval(mins => v_minutes))::time
     )
     -- Free then. Half-open overlap, never `starts_at = starts_at`: a 60-minute
     -- session at 10:00 collides with one at 10:30, which equality misses.
     and not exists (
       select 1 from pt_sessions o
        where o.trainer_id = t.profile_id
          and o.status in ('pending', 'approved')
          and (o.starts_at, o.starts_at + make_interval(mins => o.duration_minutes))
              overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
     )
     -- And not teaching a class at the same time.
     and not exists (
       select 1 from classes c
        where c.trainer_id = t.profile_id
          and c.scheduled_at is not null
          and (c.scheduled_at, c.scheduled_at + make_interval(mins => c.duration_minutes))
              overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
     )
   order by 4 desc, 5 asc, 2;
end;
$fn$;

revoke all on function suggest_trainers_for_session(uuid) from public, anon;
grant execute on function suggest_trainers_for_session(uuid) to authenticated;

comment on function suggest_trainers_for_session(uuid) is
  'Coaches who are actually free for this session: works that weekday, the '
  'session fits their window, and nothing overlaps. Ranked by shared focus and '
  'then by how busy their week already is — advisory, never the filter.';

-- ============================================================================
-- 3. MOVING IT
-- ============================================================================
-- The desk decides; the new coach still accepts. Status is left exactly as it
-- was (pending), because a reassignment is not a decision and marking it
-- approved would tell the member their session is confirmed by someone who has
-- not seen it yet — the two-stage approval 0071 removed for good reason.
--
-- `requested_at` is NOT reset. The member really has been waiting since they
-- asked, and restarting the clock would hide the delay from the very queue that
-- exists to surface it.
create or replace function reassign_pt_session(
  p_session uuid,
  p_trainer uuid
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_starts  timestamptz;
  v_minutes int;
  v_current uuid;
  v_member  uuid;
  v_status  booking_status;
  v_name    text;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can reassign a session.';
  end if;

  select s.starts_at, s.duration_minutes, s.trainer_id, s.member_id, s.status
    into v_starts, v_minutes, v_current, v_member, v_status
    from pt_sessions s where s.id = p_session;

  if v_starts is null then
    raise exception 'That session could not be found.';
  end if;
  if v_status not in ('pending', 'approved') then
    raise exception 'That session is already closed, so it cannot be reassigned.';
  end if;
  if v_starts <= now() then
    raise exception 'That session has already started.';
  end if;
  if p_trainer = v_current then
    raise exception 'That is already the trainer on this session.';
  end if;
  if not exists (select 1 from trainer_profiles where profile_id = p_trainer) then
    raise exception 'That trainer could not be found.';
  end if;

  -- Re-checked at the moment of the write, not trusted from the list the desk
  -- was looking at: someone may have booked that hour while the dialog was open.
  if exists (
    select 1 from pt_sessions o
     where o.trainer_id = p_trainer
       and o.id <> p_session
       and o.status in ('pending', 'approved')
       and (o.starts_at, o.starts_at + make_interval(mins => o.duration_minutes))
           overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
  ) then
    raise exception 'That trainer is no longer free at this time.';
  end if;

  update pt_sessions
     set previous_trainer_id = v_current,
         trainer_id          = p_trainer,
         reassigned_at       = now(),
         reassigned_by       = auth.uid()
   where id = p_session;

  select trim(first_name || ' ' || last_name) into v_name from profiles where id = p_trainer;

  perform notify_once(p_trainer, 'booking', 'A session was assigned to you',
    'The front desk moved a personal training request to you. Please accept or decline it.',
    '/trainer/bookings', 'reassign:' || p_session::text || ':' || p_trainer::text);

  perform notify_once(v_member, 'booking', 'Your session moved to another coach',
    'The gym assigned your request to ' || coalesce(v_name, 'another coach')
      || ', who will confirm it shortly.',
    '/member/bookings', 'reassign:' || p_session::text || ':member');

  if v_current is not null then
    perform notify_once(v_current, 'booking', 'A session was moved off your book',
      'The front desk reassigned a request that had not been answered.',
      '/trainer/bookings', 'reassign:' || p_session::text || ':former');
  end if;
end;
$fn$;

revoke all on function reassign_pt_session(uuid, uuid) from public, anon;
grant execute on function reassign_pt_session(uuid, uuid) to authenticated;

-- ============================================================================
-- 4. A NUDGE THE DESK SENDS BY HAND
-- ============================================================================
-- The ladder in 0071 is automatic and deliberately quiet — `notify_once` means
-- a trainer is told about a given session once and not again. That is right for
-- a sweep and wrong for a person deciding to chase someone, so this one is
-- dedupe-keyed **by day**: the desk can nudge again tomorrow, never twice in one
-- afternoon.
--
-- Returns whether a message was actually created, so the screen can say "already
-- reminded today" rather than claiming to have sent something it did not.
create or replace function remind_trainer(p_kind text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_trainer uuid;
  v_what    text;
  v_when    timestamptz;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can send a reminder.';
  end if;

  if p_kind = 'pt' then
    select s.trainer_id, 'a personal training request', s.starts_at
      into v_trainer, v_what, v_when
      from pt_sessions s where s.id = p_id and s.status = 'pending';
  elsif p_kind = 'class' then
    select c.trainer_id, coalesce(c.name, 'a class'), c.scheduled_at
      into v_trainer, v_what, v_when
      from bookings b join classes c on c.id = b.class_id
     where b.id = p_id and b.status = 'pending';
  else
    raise exception 'Unknown booking type.';
  end if;

  if v_trainer is null then
    -- Either it is not pending any more, or the class has no trainer. Neither
    -- is an error worth throwing at the desk; there is simply nobody to remind.
    return false;
  end if;

  return notify_once(
    v_trainer, 'booking', 'Please review this booking',
    'A booking for ' || v_what || ' is still waiting on you'
      || case when v_when is not null
              then ', and the session is on ' || to_char(v_when at time zone 'Asia/Manila', 'FMDay FMDD Mon at FMHH12:MI am')
              else '' end
      || '. Please accept or decline it.',
    '/trainer/bookings',
    -- The date is in the key, so one reminder a day and no more.
    'remind:' || p_kind || ':' || p_id::text || ':'
      || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'));
end;
$fn$;

revoke all on function remind_trainer(text, uuid) from public, anon;
grant execute on function remind_trainer(text, uuid) to authenticated;

comment on function remind_trainer(text, uuid) is
  'A reminder the desk sends by hand. Dedupe-keyed by Manila day, so it can be '
  'repeated tomorrow but not twice in an afternoon. Returns false when there '
  'was nobody to remind or one had already gone today.';

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0083_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0083_applied() from public, anon;
grant execute on function migration_0083_applied() to authenticated;

comment on function migration_0083_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   select kind, member_name, days_waiting, urgency from bookings_needing_attention
--    order by urgency, days_waiting desc;
--   select * from suggest_trainers_for_session('<pending session id>');
--   select reassign_pt_session('<id>', '<trainer who is busy then>');
--     -> 'That trainer is no longer free at this time.'
--   select remind_trainer('pt', '<id>');   -- true once, false again the same day
