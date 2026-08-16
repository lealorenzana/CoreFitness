-- 0018 — two points of panel feedback, made concrete.
--
--   "Cancellation process (Freeze frequency)"      → a real, enforced limit
--   "Attendance: Pre-defined format or User-based   → a pre-defined list, but one
--    inputs"                                          the gym defines itself

-- ============ FREEZE FREQUENCY ============
-- 0017 added freezing with no limit, which leaves the obvious loophole open: a
-- member freezes the day before expiry, unfreezes for one workout, freezes
-- again, and stretches a 30-day membership across a year while the credited
-- days keep pushing expiry out. That is exactly what "freeze frequency" was
-- asking about.
--
-- One freeze per membership period. The counter lives on the membership row, so
-- it resets naturally on renewal — a renewal creates a new row, and the member
-- gets their one freeze back. No scheduled job, no period arithmetic.
alter table memberships
  add column if not exists freeze_count int not null default 0;

-- Enforced in the database, not the button. Staff take the request in person
-- and the front desk is who freezes, so a client-side check would be the only
-- thing standing between a busy receptionist and an unlimited freeze.
--
-- Admins can override. The split is the same one drawn for the staff role:
-- staff perform recorded, reversible transactions; changing the rules for a
-- particular member is an admin decision, made deliberately.
create or replace function enforce_freeze_frequency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only a transition *into* frozen counts. Editing a row that is already
  -- frozen (say, correcting the expiry) must not burn another freeze.
  if new.status = 'frozen' and old.status is distinct from 'frozen' then
    if old.freeze_count >= 1 and get_my_role() <> 'admin' then
      raise exception 'This membership has already been frozen once this period. An admin can override.';
    end if;
    new.freeze_count := old.freeze_count + 1;
    new.frozen_at := coalesce(new.frozen_at, (now() at time zone 'Asia/Manila')::date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_freeze_frequency on memberships;
create trigger trg_enforce_freeze_frequency
before update on memberships
for each row execute function enforce_freeze_frequency();

-- ============ ATTENDANCE ACTIVITY ============
-- The panel's question was pre-defined format *or* user input. This is the
-- reasoned middle: pre-defined at the point of check-in, so the data stays
-- aggregatable ("legs", "Leg day" and "lower body" would otherwise be three
-- different things and no chart could ever be built on them) — but the list
-- itself is the gym's, editable in Settings rather than compiled in.
alter table attendance
  add column if not exists activity text;

alter table gym_settings
  add column if not exists activity_options text[] not null
    default array['Strength', 'Cardio', 'Group Class', 'Personal Training', 'Other'];

-- Existing check-ins keep `activity` NULL rather than being back-filled with a
-- guess. Nobody recorded what those members did, and inventing it would put
-- fiction into the one table the gym uses to prove who was in the building.

-- gym_settings is already selectable by any authenticated user (0013), so the
-- member app can read the list too. No new policy needed.
