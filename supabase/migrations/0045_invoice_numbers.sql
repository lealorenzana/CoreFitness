-- 0045 — invoice numbers that cannot collide, scoped to the year.
--
-- The client generated these, in two places, with the same expression:
--
--     invoice_number: `INV-${String(Date.now()).slice(-6)}`
--
-- The last six digits of a millisecond clock is a space of 1,000,000 values
-- that **cycles every 16 minutes and 40 seconds**. Two payments recorded 16m40s
-- apart get byte-identical invoice numbers. Measured on the real expression:
--
--     P(duplicate) at   200 payments    1.97%
--     P(duplicate) at 1,000 payments   39.32%
--     P(duplicate) at 3,000 payments   98.89%
--
-- At roughly a hundred payments a month this gym reaches coin-flip odds inside
-- the first year. And because `invoice_number` carried no unique constraint
-- (0001), the collision was **silent**: two members walk out holding receipts
-- bearing the same invoice number and nothing anywhere objects. For a record
-- that exists to identify one payment uniquely, that is the whole job failing.
--
-- ---------------------------------------------------------------------------
-- Why this lives in SQL and ignores whatever the client sends
-- ---------------------------------------------------------------------------
-- Same rule as `achievement_unlocks`, `freemium_trials` and `activity_log`:
-- anything a browser could forge or skip belongs in the database. An invoice
-- number is a financial identifier, so the trigger **overwrites** any value the
-- client supplies rather than filling in only when it is null. A front desk
-- cannot hand-pick an invoice number, and a bug in a future page cannot
-- reintroduce a colliding one.
--
-- The sequence is a counter table rather than a Postgres SEQUENCE because it
-- must **reset each January** and a sequence does not reset by itself. The
-- upsert takes a row lock on the year's counter, which serialises concurrent
-- inserts; two staff recording payments at the same instant queue rather than
-- collide.
--
-- ---------------------------------------------------------------------------
-- The year comes from paid_on, and paid_on needed fixing first
-- ---------------------------------------------------------------------------
-- The invoice year must match the date printed on the receipt, so it is derived
-- from `paid_on` — the day the cash arrived (0008) — never from `created_at`.
--
-- But `paid_on` defaulted to `current_date`, which on Supabase is evaluated in
-- **UTC**. Manila is UTC+8, so for the first eight hours of every local day the
-- UTC date is still yesterday. That is the exact trap this project has already
-- been bitten by in admin Attendance. Left alone it would mis-date roughly a
-- third of every day's payments, and on New Year's morning it would number a
-- payment taken at 3am on 1 January as `INV-2026-...`. The default is corrected
-- here because the year-scoped numbering below is built directly on it.
--
-- Existing rows are not re-dated: 0008 already backfilled them through
-- `at time zone 'Asia/Manila'`, which was correct.

-- ---------------------------------------------------------------------------
-- 1. paid_on defaults to the Manila date, not the UTC one
-- ---------------------------------------------------------------------------
alter table payments
  alter column paid_on set default (now() at time zone 'Asia/Manila')::date;

-- ---------------------------------------------------------------------------
-- 2. The per-year counter
-- ---------------------------------------------------------------------------
create table if not exists invoice_counters (
  year     int  primary key,
  last_seq int  not null default 0
);

comment on table invoice_counters is
  'One row per calendar year holding the last invoice sequence issued. Written '
  'only by next_invoice_number(). RLS is on with no policies at all, so no '
  'browser can read or advance it whatever role it holds.';

alter table invoice_counters enable row level security;
-- Deliberately no policies. The only writer is a SECURITY DEFINER function,
-- which bypasses RLS; every client sees an empty table and can change nothing.

-- ---------------------------------------------------------------------------
-- 3. The generator
-- ---------------------------------------------------------------------------
create or replace function next_invoice_number(p_year int) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  -- The upsert is the lock. On conflict Postgres takes a row-level lock on the
  -- year's counter, so concurrent inserts serialise instead of both reading the
  -- same last_seq. `returning` gives 1 on the insert path and the incremented
  -- value on the update path.
  insert into invoice_counters (year, last_seq)
  values (p_year, 1)
  on conflict (year) do update
    set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  -- Four digits carries 9,999 payments in a year and simply grows past it
  -- rather than wrapping or truncating, which is the failure being fixed.
  return 'INV-' || p_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- Nobody calls this from a browser. Left executable, it would let any caller
-- burn sequence numbers, producing gaps in a financial record.
--
-- Revoking from `public` alone is NOT enough here, and this is the trap: Supabase
-- ships `alter default privileges in schema public grant all on functions to
-- anon, authenticated, service_role`, so a function created by this migration
-- arrives with **explicit** grants to those roles. An explicit grant is not
-- removed by revoking from `public` — the two are separate entries in the ACL.
-- Measured: without the loop below, `authenticated` could still call this.
--
-- The roles are named rather than assumed present so the migration also applies
-- to a bare Postgres (a local container, a future self-hosted move).
revoke all on function next_invoice_number(int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function next_invoice_number(int) from %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Seed the counters from any numbers already in the new format
-- ---------------------------------------------------------------------------
-- Makes the migration safe to re-run. The old format (`INV-523853`) cannot match
-- this pattern, so a first run finds nothing and every counter starts at zero.
insert into invoice_counters (year, last_seq)
select (m[1])::int, max((m[2])::int)
  from (select regexp_match(invoice_number, '^INV-(\d{4})-(\d+)$') as m
          from payments
         where invoice_number ~ '^INV-\d{4}-\d+$') s
 where m is not null
 group by (m[1])::int
    on conflict (year) do update
   set last_seq = greatest(invoice_counters.last_seq, excluded.last_seq);

-- ---------------------------------------------------------------------------
-- 5. Repair what is already there, before the constraint can reject it
-- ---------------------------------------------------------------------------
-- A UNIQUE constraint cannot be added NOT VALID, so existing duplicates have to
-- go first. The **earliest** row of each duplicated number keeps it — that
-- receipt is most likely the one already handed to a member — and the later
-- ones are renumbered under the year they were actually paid.
with ranked as (
  select id,
         row_number() over (partition by invoice_number
                            order by created_at, id) as rn,
         coalesce(paid_on, (created_at at time zone 'Asia/Manila')::date) as eff_date
    from payments
   where invoice_number is not null
)
update payments p
   set invoice_number = next_invoice_number(extract(year from r.eff_date)::int)
  from ranked r
 where p.id = r.id
   and r.rn > 1;

-- Rows that never had a number at all. The admin table was papering over these
-- at render time with `INV-${id.slice(0,8)}`, which is a display fallback
-- pretending to be a record — the number was never stored, so two people
-- reading the same payment from different screens could disagree.
update payments
   set invoice_number = next_invoice_number(
         extract(year from coalesce(paid_on,
                                    (created_at at time zone 'Asia/Manila')::date))::int)
 where invoice_number is null;

-- ---------------------------------------------------------------------------
-- 6. Make a collision impossible rather than merely unlikely
-- ---------------------------------------------------------------------------
create unique index if not exists payments_invoice_number_key
  on payments (invoice_number);

alter table payments alter column invoice_number set not null;

comment on column payments.invoice_number is
  'INV-<year>-<4-digit sequence>, assigned by trg_set_payment_invoice_number on '
  'insert and unique across the whole table. The sequence restarts at 0001 each '
  'January. Any value sent by a client is overwritten - this is a financial '
  'identifier and is not the browsers to choose.';

-- ---------------------------------------------------------------------------
-- 7. Assign on every insert
-- ---------------------------------------------------------------------------
create or replace function set_payment_invoice_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `new.paid_on` is already defaulted by the time a BEFORE INSERT trigger runs,
  -- so the coalesce only covers an explicit NULL. Note this reads `new` only:
  -- `old` is unassigned in an INSERT trigger, and touching it aborts the insert.
  new.invoice_number := next_invoice_number(
    extract(year from coalesce(new.paid_on,
                               (now() at time zone 'Asia/Manila')::date))::int);
  return new;
end;
$$;

drop trigger if exists trg_set_payment_invoice_number on payments;
create trigger trg_set_payment_invoice_number
before insert on payments
for each row execute function set_payment_invoice_number();
