-- Core Fitness — separate "when the cash was received" from "when it was keyed in".
--
-- The Record Payment form has always asked for a payment date, but `payments`
-- had nowhere to put it: the only date on the row was `created_at`, which is
-- always the moment the row was inserted. Backdating silently did nothing, and
-- revenue reporting was really reporting data-entry dates.
--
-- That matters here because this gym is cash-only. Money is taken at the desk on
-- a Saturday and keyed in on Monday; the owner reconciles a week at a time. So:
--
--   paid_on    — the business fact: the day the member handed over the cash.
--                This is what revenue and monthly breakdowns are computed from.
--   created_at — the audit fact: when this row was written, never edited.
--
-- Collapsing the two would destroy the audit trail needed for a disputed payment,
-- which is the whole reason `recorded_by` exists alongside it.

alter table payments add column if not exists paid_on date;

-- Backfill from the existing timestamp rather than defaulting to today, which
-- would stamp every historical payment with the migration date and flatten all
-- past revenue into one day. Asia/Manila so the business date matches the day
-- the front desk actually worked, not UTC.
update payments
   set paid_on = (created_at at time zone 'Asia/Manila')::date
 where paid_on is null;

alter table payments alter column paid_on set default current_date;
alter table payments alter column paid_on set not null;

create index if not exists idx_payments_paid_on on payments(paid_on);
