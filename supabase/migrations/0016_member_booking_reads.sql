-- 0016 — what a member is allowed to see in order to book something.
--
-- The booking model (0015) gave the admin everything it needed, but a member
-- hits three walls that would otherwise force the phone app to invent data:
--
--   1. Trainer names live in `profiles`, which members cannot select. They can
--      read `trainer_profiles` (bio, specialization) but not the name attached
--      to it — so "with Coach ___" is unfillable.
--   2. `bookings_select_self` means a member sees only their own bookings, so
--      "5 spots left" cannot be computed. The old mock screen made this number
--      up from a hardcoded array.
--   3. Other members' PT sessions are invisible, so every slot looks open and
--      the member only discovers otherwise when the insert is rejected.
--
-- Widening the table policies would leak real data — every member reading every
-- profile row (emails, phone numbers), or the full roster of who trains when.
-- Instead this exposes three narrow read-only views carrying exactly the columns
-- needed and nothing identifying.
--
-- These views are intentionally SECURITY DEFINER (the Postgres default,
-- security_invoker = false): they run as the owner and therefore bypass RLS on
-- the tables underneath. That is the entire point — the view *is* the policy,
-- and its column list is the thing to review. Supabase's linter flags this
-- shape; it is deliberate here.

-- ============ TRAINER DIRECTORY ============
-- Name + bio + photo. Deliberately no email, no phone — a member picking a
-- coach does not need their contact details, and `profiles` holds both.
drop view if exists public_trainers;
create view public_trainers as
select
  p.id,
  p.first_name,
  p.last_name,
  p.photo_url,
  tp.specialization,
  tp.bio,
  tp.availability
from profiles p
join trainer_profiles tp on tp.profile_id = p.id
where p.role = 'trainer'
  and p.status = 'active';

revoke all on public_trainers from anon;
grant select on public_trainers to authenticated;

-- ============ CLASS CAPACITY ============
-- Counts only. Who booked is never exposed — just how many, so the member can
-- see a real "spots left" and a full class can be disabled before they tap it.
-- Cancelled and rejected bookings free their seat back up, hence the filter.
drop view if exists class_availability;
create view class_availability as
select
  c.id as class_id,
  c.capacity,
  count(b.id) filter (where b.status in ('pending', 'approved'))::int as booked_count
from classes c
left join bookings b on b.class_id = c.id
group by c.id, c.capacity;

revoke all on class_availability from anon;
grant select on class_availability to authenticated;

-- ============ TRAINER BUSY SLOTS ============
-- When a trainer is already committed, with no indication of to whom. This is
-- what computeOpenSlots() subtracts from a trainer's availability windows; the
-- trainer's own classes come from `classes`, which members can already read.
--
-- The partial unique index on (trainer_id, starts_at) is still the real
-- guarantee — this view only stops the member being offered a slot that is
-- going to be rejected.
drop view if exists trainer_busy_slots;
create view trainer_busy_slots as
select
  trainer_id,
  starts_at,
  duration_minutes
from pt_sessions
where status in ('pending', 'approved');

revoke all on trainer_busy_slots from anon;
grant select on trainer_busy_slots to authenticated;

-- ============ MEMBER CANCELS THEIR OWN CLASS BOOKING ============
-- `bookings` had insert-self and update-admin, so a member could book a class
-- and then had no way out of it — they'd have to ask the front desk to cancel
-- on their behalf. PT sessions already allow self-withdrawal
-- (pt_sessions_delete_self); this is the class-booking equivalent.
--
-- Cancel, not delete: the seat is released either way, but the row stays so the
-- history the member sees matches the history the gym sees. `with check` pins
-- the only reachable destination to 'cancelled', so this cannot be used to
-- self-approve a pending booking.
drop policy if exists bookings_cancel_self on bookings;
create policy bookings_cancel_self on bookings for update
  using (member_id = auth.uid() and status in ('pending', 'approved'))
  with check (member_id = auth.uid() and status = 'cancelled');

-- ============ A MEMBER OWNS THEIR OWN EXPERIENCE LEVEL ============
-- prevent_member_profile_tamper() (0006) locked both `qr_code` and
-- `experience_level` to admins. That was right when experience level looked
-- like it might gate what a member could book. It doesn't: the decision was
-- "recommend, don't restrict", so the level only reorders a list and adds a
-- badge. There is nothing to gain by lying about it, and the person who knows
-- the answer is the member.
--
-- Onboarding asks for it on signup and, until now, had nowhere real to put it —
-- it went into a localStorage blob no other screen ever read.
--
-- `qr_code` stays admin-only. That one is not a preference; it is the identity
-- the front desk scans to check someone in.
create or replace function prevent_member_profile_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    if new.qr_code is distinct from old.qr_code then
      raise exception 'Only admins can change qr_code';
    end if;
  end if;
  return new;
end;
$$;
