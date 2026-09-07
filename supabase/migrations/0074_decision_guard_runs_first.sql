-- 0074 — the trainer guard has to run before the early return, not after it.
--
-- Found by running 0071 against a real Postgres as a real `authenticated`
-- role, rather than reading it. Both stamp triggers open with:
--
--     if new.status is not distinct from old.status then
--       return new;   -- not a decision; nothing to stamp
--     end if;
--
-- which is correct about *stamping* and wrong about *pinning*. The column
-- checks below it — "a trainer may accept or decline a booking, not reassign
-- it" — are on the other side of that return, so they never run for an update
-- that leaves `status` alone.
--
-- That is not a theoretical path. `bookings_update_trainer` (0071) lets a
-- trainer update any booking on a class they teach, and RLS chooses rows, not
-- columns. So today:
--
--     update bookings set member_id = '<someone else>' where id = '<mine>';
--
-- succeeds. A trainer can move a seat from the member who booked it to anyone
-- they like, and the row keeps the original `decided_by` stamp, so the audit
-- trail says the swap never happened. The same shape on `pt_sessions` lets a
-- trainer move `starts_at` — rescheduling somebody's session without telling
-- them, and past 0068's conflict guard, which fires on
-- `update of status, starts_at, duration_minutes, trainer_id` and would catch
-- a clash but has nothing to say about consent.
--
-- The fix is ordering, not new rules: resolve the caller's role first, pin the
-- columns a trainer may not touch, and only then decide whether there is a
-- decision to stamp.
--
-- Why the pins are unconditional rather than "only when something changed":
-- `is distinct from` is already the comparison, so an update that rewrites
-- `member_id` to the value it already held passes, as it should. What is no
-- longer possible is changing it.
--
-- Re-runnable: `create or replace` on two functions, no schema change. The
-- triggers 0071 created already point at these names.

-- ============================================================================
-- 1. CLASS BOOKINGS
-- ============================================================================
create or replace function trg_stamp_booking_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  -- Resolved first, because the pins below need it and the early return is no
  -- longer allowed to skip them.
  select role::text into v_role from profiles where id = auth.uid();

  -- ── What a trainer may never change, decision or not ────────────────────
  -- A policy can say *who* may update a row. It cannot say *which columns*, so
  -- this is the only place the answer can live. It runs before the "nothing to
  -- stamp" return: an update that changes `member_id` and leaves `status`
  -- alone is exactly the reassignment this exists to stop, and that update
  -- took the early exit for three migrations.
  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.class_id is distinct from old.class_id then
      raise exception 'A trainer may accept or decline a booking, not reassign it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;   -- not a decision; nothing to stamp
  end if;

  -- An automatic expiry has no author. Recording the admin who happened to
  -- have the page open would read as "the desk declined this", which is a
  -- different and false statement about why the member did not get their
  -- session. Set only by sweep_stale_requests(), which is SECURITY DEFINER and
  -- front-desk gated; a client cannot reach set_config through PostgREST.
  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    if new.status = 'rejected' then
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
    return new;
  end if;

  -- A trainer decides, and the only decisions are yes and no. Cancelling on a
  -- member's behalf is the desk's job.
  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a booking.';
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  -- Kept in step so the existing screens, which read approved_at, keep working.
  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  elsif new.status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;

  return new;
end;
$fn$;

-- ============================================================================
-- 2. PERSONAL TRAINING
-- ============================================================================
-- Same reordering. The stakes here are higher, because the pinned column that
-- was reachable is `starts_at`: a trainer could move a member's session to
-- another time without a decision, and the member's only notice would be the
-- new time appearing in their list.
create or replace function trg_stamp_pt_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();

  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.trainer_id is distinct from old.trainer_id
       or new.starts_at is distinct from old.starts_at then
      raise exception 'A trainer may accept or decline a session, not move it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    return new;
  end if;

  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a session.';
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;

  return new;
end;
$fn$;

-- ============================================================================
-- 3. A SENTENCE THE DESK READS OUT LOUD
-- ============================================================================
-- Also found by running it: 0069 raises
--
--     'A reason is required to % an account.', p_status
--
-- and `p_status` is the *past participle* — so the desk sees "A reason is
-- required to suspended an account." Cosmetic, and it is the exact sentence a
-- panel reads off the screen. The status still has to appear, because
-- suspending and archiving are different things to be asked about; it just
-- cannot be the verb.
--
-- Only that one line differs from 0069. Everything else here is 0069 verbatim.
create or replace function set_account_status(
  p_profile uuid,
  p_status  text,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_prev text;
begin
  -- `auth.uid() is not null and` first. Outside a browser session auth.uid() is
  -- NULL and a bare not-admin test is true, which would refuse the SQL Editor —
  -- the exact bug 0055 and 0062 both shipped. Inside a session, a non-admin is
  -- still refused.
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can change an account status.';
  end if;

  if p_status not in ('active', 'pending_approval', 'suspended', 'archived') then
    raise exception 'Unknown account status: %', p_status;
  end if;

  -- A suspension with no reason is the thing 0069 exists to prevent.
  if p_status in ('suspended', 'archived')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to set an account to %.', p_status;
  end if;

  select status into v_prev from profiles where id = p_profile;
  if v_prev is null then
    raise exception 'No such account.';
  end if;

  -- Nothing to record and nothing to change. Returning quietly rather than
  -- raising keeps a double-click idempotent instead of alarming.
  if v_prev = p_status then
    return;
  end if;

  update profiles set status = p_status where id = p_profile;

  insert into account_status_events
    (profile_id, status, previous_status, reason, recorded_by)
  values
    (p_profile, p_status, v_prev, nullif(btrim(p_reason), ''), auth.uid());
end;
$fn$;

revoke all on function set_account_status(uuid, text, text) from public, anon;
grant execute on function set_account_status(uuid, text, text) to authenticated;

-- ============================================================================
-- VERIFICATION — as a real trainer, not as the owner.
-- ============================================================================
--   -- On a class they teach, with the status left alone. Must now raise.
--   update bookings set member_id = '<somebody else>' where id = '<their own>';
--   -- expected: 'A trainer may accept or decline a booking, not reassign it.'
--
--   -- Their own PT session, moved two hours later. Must now raise.
--   update pt_sessions set starts_at = starts_at + interval '2 hours'
--    where id = '<one of theirs>';
--   -- expected: 'A trainer may accept or decline a session, not move it.'
--
--   -- Still allowed, and still stamped:
--   update bookings set status = 'approved' where id = '<theirs>';
--   select decided_by_role from bookings where id = '<same>';   -- 'trainer'
--
--   -- The sweep still stamps 'system' rather than a person:
--   select sweep_stale_requests();
--   select decided_by, decided_by_role from pt_sessions where status = 'rejected';
