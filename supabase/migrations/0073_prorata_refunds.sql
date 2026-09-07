-- 0073 — the refund the law actually expects.
--
-- 0070 shipped a tiered refund table: 100% inside 7 days unvisited, 50% if
-- they had visited, 25% to 30 days, nothing after. It said in its own header
-- that the numbers were reasoned from the business and **not** from law or
-- literature, and that if a legal floor said otherwise, the law wins.
--
-- It does say otherwise.
--
-- ## What the reading turned up
--
-- Under the Consumer Act of the Philippines (RA 7394), a refund on a prepaid
-- service membership is expected to be **pro-rata for the unused portion**,
-- with only "reasonable and documented" deductions. A "no refund" clause does
-- not remove that: statutory rights survive whatever the contract says, and DTI
-- mediates and can order refunds.
--
-- Set that against 0070's table and the fourth row is the problem: **"cancelled
-- after 30 days — no refund"**. On a 30-day membership cancelled on day 8, the
-- old table paid 25% where pro-rata is roughly 73%. That is not a rounding
-- difference, it is the gym holding money a mediator would order it to return.
--
-- ## What this file does
--
-- Refunds become **pro-rata by default**, and the tiers become a **floor**:
--
--     refund = max(pro-rata for unused days, tier percentage) - documented fee
--
-- Taking the higher of the two means the member never gets less than the law
-- expects, and the gym keeps the ability to be *more* generous than it — which
-- is what the 7-day full refund was always for. A cooling-off period a gym
-- grants voluntarily is good practice; one that pays less than pro-rata is a
-- liability dressed as a policy.
--
-- The deduction is a **single documented fee the admin sets**, defaulting to
-- zero. "Reasonable and documented" is the standard, and a percentage skim with
-- no stated cost behind it is neither.
--
-- ## What this file deliberately does NOT do
--
-- It does not delete the tier rules. They still bind as a minimum, they are
-- still editable, and 0070's `refund_rules` table is unchanged in shape — so a
-- gym that wants a more generous cooling-off week still expresses it there.
--
-- Re-runnable.

-- ============================================================================
-- 1. THE DOCUMENTED DEDUCTION
-- ============================================================================
alter table gym_settings
  /** A flat processing fee, in pesos, deducted from a refund. Zero by default
      and it should stay zero unless the gym can name the cost it covers — the
      Consumer Act standard is "reasonable and documented", and an unexplained
      deduction is exactly the kind of term that gets voided. */
  add column if not exists refund_processing_fee numeric(10,2) not null default 0
    check (refund_processing_fee >= 0),
  /** What the fee is for, printed on the quote. NULL while the fee is zero. */
  add column if not exists refund_fee_reason text;

comment on column gym_settings.refund_processing_fee is
  'Flat peso deduction from a refund. Must correspond to a real, stateable cost '
  '(RA 7394 allows only reasonable and documented deductions). Zero by default.';

-- ============================================================================
-- 2. THE QUOTE, RECOMPUTED
-- ============================================================================
-- Same signature and same result columns as 0070, plus the three the new model
-- needs, so existing callers keep working and the screens can explain the
-- arithmetic instead of announcing a number.
drop function if exists refund_quote(uuid);

create or replace function refund_quote(p_membership uuid)
returns table (
  percent        numeric,   -- the effective percentage actually applied
  amount         numeric,   -- pesos, after the documented fee
  rule_label     text,      -- the sentence that produced it
  days_elapsed   int,
  has_visited    boolean,
  paid_total     numeric,
  -- New in 0073, so a screen can show its working:
  days_total     int,       -- the membership's full term
  days_unused    int,
  prorata_percent numeric,  -- what the law expects on its own
  floor_percent  numeric,   -- what the gym's own tier guarantees
  basis          text,      -- 'prorata' | 'gym_floor' | 'undecided'
  fee_deducted   numeric
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  m record;
  v_days_elapsed int;
  v_days_total   int;
  v_days_unused  int;
  v_visited  boolean;
  v_paid     numeric;
  v_fee      numeric;
  v_prorata  numeric;
  v_floor    numeric;
  v_pct      numeric;
  v_basis    text;
  v_label    text;
  r record;
begin
  select ms.id, ms.member_id, ms.start_date, ms.expiry_date, ms.never_expires, ms.status
    into m
    from memberships ms
   where ms.id = p_membership;

  if m.id is null then
    raise exception 'No such membership.';
  end if;

  -- Self or front desk. `auth.uid() is not null and` first, so the SQL Editor
  -- is not the one caller refused (0055 and 0062 both shipped that bug).
  if auth.uid() is not null
     and m.member_id is distinct from auth.uid()
     and not is_front_desk() then
    raise exception 'You can only see your own refund quote.';
  end if;

  -- Manila, never `current_date`, which is UTC and reads as yesterday for the
  -- first eight hours of every local day — the arithmetic that decides which
  -- side of a boundary somebody falls on.
  v_days_elapsed := greatest(0, (
    (now() at time zone 'Asia/Manila')::date
      - coalesce(m.start_date, (now() at time zone 'Asia/Manila')::date)
  ));

  select exists (
    select 1 from attendance a
     where a.member_id = m.member_id
       and (m.start_date is null
            or (a.check_in_time at time zone 'Asia/Manila')::date >= m.start_date)
  ) into v_visited;

  -- Completed payments only: a pending payment is money the gym has not
  -- received and cannot give back.
  select coalesce(sum(p.amount), 0) into v_paid
    from payments p
   where p.membership_id = m.id and p.status = 'completed';

  select coalesce(refund_processing_fee, 0) into v_fee from gym_settings where id;

  -- ── Pro-rata ────────────────────────────────────────────────────────────
  -- A non-expiring plan has no unused *portion* to compute — there is no term
  -- to divide by. Those are the free tiers, which are never paid for, so the
  -- question does not arise; pro-rata is NULL and the gym floor decides.
  if m.never_expires or m.expiry_date is null or m.start_date is null then
    v_days_total  := null;
    v_days_unused := null;
    v_prorata     := null;
  else
    v_days_total  := greatest(1, m.expiry_date - m.start_date);
    v_days_unused := greatest(0, least(v_days_total, m.expiry_date
                       - (now() at time zone 'Asia/Manila')::date));
    v_prorata     := round(v_days_unused::numeric * 100 / v_days_total, 2);
  end if;

  -- ── The gym's own floor ─────────────────────────────────────────────────
  select * into r
    from refund_rules rr
   where rr.is_active
     and v_days_elapsed >= rr.min_days
     and (rr.max_days is null or v_days_elapsed < rr.max_days)
     and (rr.requires_visits is null or rr.requires_visits = v_visited)
   order by rr.priority
   limit 1;

  v_floor := case when found then r.percent else null end;

  -- ── Whichever is kinder to the member ───────────────────────────────────
  if v_prorata is null and v_floor is null then
    -- Neither a term to divide nor a rule that matches. That is "the gym has
    -- not decided this case", which is a different answer from 0% and must be
    -- worded differently on screen.
    return query select null::numeric, null::numeric,
      'No refund rule covers this case — an admin decides.'::text,
      v_days_elapsed, v_visited, v_paid,
      v_days_total, v_days_unused, v_prorata, v_floor, 'undecided'::text, v_fee;
    return;
  end if;

  if coalesce(v_prorata, -1) >= coalesce(v_floor, -1) then
    v_pct   := v_prorata;
    v_basis := 'prorata';
    v_label := format(
      '%s of %s days unused — pro-rata refund of %s%%. This is the Consumer Act baseline.',
      v_days_unused, v_days_total, trim(to_char(v_prorata, 'FM990.99')));
  else
    v_pct   := v_floor;
    v_basis := 'gym_floor';
    v_label := coalesce(r.label, 'Gym policy') ||
      case when v_prorata is null then ''
           else format(' (more generous than the %s%% pro-rata share)',
                       trim(to_char(v_prorata, 'FM990.99'))) end;
  end if;

  return query select
    v_pct,
    greatest(0, round(v_paid * v_pct / 100, 2) - v_fee),
    v_label,
    v_days_elapsed, v_visited, v_paid,
    v_days_total, v_days_unused, v_prorata, v_floor, v_basis, v_fee;
end;
$fn$;

revoke all on function refund_quote(uuid) from public, anon;
grant execute on function refund_quote(uuid) to authenticated;

comment on function refund_quote(uuid) is
  'Pro-rata for the unused term (the RA 7394 baseline) or the gym''s own tier '
  'floor, whichever favours the member, less a documented processing fee. '
  'Returns its working so a screen can show the arithmetic rather than announce '
  'a number. NULL percent means no rule covers the case and an admin decides — '
  'which is not the same answer as 0%%.';

-- ============================================================================
-- 3. THE TIER THAT IS NOW UNLAWFUL AS WRITTEN
-- ============================================================================
-- 0070's fourth rule said "cancelled after 30 days — none". As a *floor* under
-- the max() above it is now harmless: pro-rata wins wherever there are unused
-- days. But it still reads as gym policy on the Settings screen and in the
-- printed policy, so its wording is corrected rather than left to mislead
-- whoever reads the table.
--
-- Guarded on the old text, so a gym that has already edited it keeps their words.
update refund_rules
   set label = 'After 30 days — the unused part of the term, pro-rata'
 where label = 'Cancelled after 30 days — no refund; unused whole months may be frozen instead';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   -- A 30-day membership cancelled on day 8, ₱1,200 paid, one visit:
--   --   pro-rata  = 22/30 = 73.33%  -> ₱880
--   --   gym floor = 25%             -> ₱300
--   --   expected: percent 73.33, basis 'prorata'
--   select percent, amount, basis, rule_label from refund_quote('<membership>');
--
--   -- Day 2, never visited: the gym's 100% beats pro-rata's ~93%, so
--   -- basis flips to 'gym_floor' and the label says it is the more generous one.
--
--   -- A processing fee is subtracted, never below zero:
--   update gym_settings set refund_processing_fee = 100,
--          refund_fee_reason = 'Cash handling and receipt reprint' where id;
--   select amount, fee_deducted from refund_quote('<membership>');
--
--   -- A non-expiring free plan has no term to divide: prorata_percent is NULL
--   -- and the floor decides.
--
--   -- Still self-or-desk only:
--   select * from refund_quote('<another member''s membership>');   -- raises
