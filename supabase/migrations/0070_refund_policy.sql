-- 0070 — what happens to the money.
--
-- 0057 gave freezing and cancelling a reason and a paper trail, and recorded
-- whether a refund was *asked for*. What no part of the system could answer was
-- the question that follows: **how much?**
--
-- The panel asked for exactly that — cancel after paying, is there a refund,
-- all of it or half, what percentage in which situation, and how long a freeze
-- may last. Right now the honest answer is that the gym decides at the desk,
-- differently each time, with nothing written down. That is the gap.
--
-- ## Rules as data, not as a constant in the app
--
-- The percentages below are a *starting proposal for the gym to approve*, not
-- numbers this file is authoritative about. They live in a table the admin
-- edits, for the same reason plan entitlements do (0017): a rule baked into the
-- frontend is one the gym cannot change without a developer, and one the member
-- cannot be shown the source of.
--
-- ## The quote explains itself
--
-- `refund_quote()` returns the percentage **and the rule that produced it**. A
-- number with no reason cannot be argued with at a front desk, and "the system
-- says 25%" is not something a member can accept or dispute. Every quote names
-- the rule, so the conversation is about the rule.
--
-- ## Cash-only
--
-- This gym takes cash (see docs/BUSINESS_MODEL.md). A refund is a recorded desk
-- transaction, not a gateway reversal — so this file computes and records an
-- amount, and never pretends to move money.
--
-- Re-runnable.

-- ============================================================================
-- 1. THE RULES
-- ============================================================================
create table if not exists refund_rules (
  id           uuid primary key default gen_random_uuid(),
  /** Lowest number wins when several match, so the specific rules are checked
      before the catch-all. Sparse (10, 20, 30…) so a rule can be inserted
      between two others without renumbering. */
  priority     int not null,
  /** Shown to the member and printed on the desk's copy. This is the sentence
      that has to survive being read out loud in an argument. */
  label        text not null,
  /** Inclusive lower bound in days since the membership started. */
  min_days     int not null default 0,
  /** Exclusive upper bound; NULL means "and everything after". */
  max_days     int,
  /** NULL = the rule does not care whether they have visited. TRUE = it applies
      only when they have; FALSE = only when they have not. */
  requires_visits boolean,
  /** 0–100. 0 is a real answer — "no refund" — and is not the same as no rule
      matching, which means the gym has not decided this case. */
  percent      numeric(5,2) not null check (percent >= 0 and percent <= 100),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table refund_rules enable row level security;

do $$
begin
  if not exists (select 1 from pg_tables
                  where schemaname = 'public' and tablename = 'refund_rules' and rowsecurity) then
    raise exception 'RLS is not enabled on refund_rules.';
  end if;
end
$$;

-- Members read the rules that bind them. A rule enforced only in SQL the user
-- cannot read ambushes them — the lesson of 0017 → 0041.
drop policy if exists refund_rules_select_authenticated on refund_rules;
create policy refund_rules_select_authenticated on refund_rules for select
  using (auth.uid() is not null);

drop policy if exists refund_rules_write_admin on refund_rules;
create policy refund_rules_write_admin on refund_rules for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- The proposal. Seeded only when the table is empty, so a gym that has already
-- set its own policy keeps it on a re-run.
insert into refund_rules (priority, label, min_days, max_days, requires_visits, percent)
select * from (values
  (10, 'Cancelled within 7 days and never visited — full refund',        0,   7,    false, 100.00),
  (20, 'Cancelled within 7 days after visiting — half refund',           0,   7,    true,   50.00),
  (30, 'Cancelled between 8 and 30 days — quarter refund',               7,   30,   null,   25.00),
  (40, 'Cancelled after 30 days — no refund; unused months may be frozen instead',
                                                                         30,  null, null,    0.00)
) as v(priority, label, min_days, max_days, requires_visits, percent)
where not exists (select 1 from refund_rules);

comment on table refund_rules is
  'The gym''s refund policy, as data the admin edits. The seeded rows are a '
  'proposal, not a decision — docs/MEMBERSHIP_POLICY.md is the human copy and '
  'the two must be changed together.';

-- ============================================================================
-- 2. THE FREEZE CEILING
-- ============================================================================
-- 0057 caps freezes at two per calendar month. The panel also asked for a
-- maximum *duration*, which nothing expressed: a membership could be frozen and
-- simply never unfrozen, which is a cancellation the gym never recorded and the
-- member never agreed to.
alter table gym_settings
  add column if not exists max_freeze_days_per_year int not null default 60,
  /** A single freeze longer than this needs an admin, not the front desk. */
  add column if not exists max_freeze_days_at_once  int not null default 30;

comment on column gym_settings.max_freeze_days_per_year is
  'Total days a membership may spend frozen in a rolling year. 60 is a proposal '
  'for the gym to confirm, not a number this migration is authoritative about.';

-- Days already spent frozen in the last year, so the ceiling can be enforced
-- and, more usefully, *shown* before a freeze is agreed.
--
-- A freeze with no matching unfreeze is still running, and is counted up to
-- today. That is the case the ceiling exists for.
create or replace function frozen_days_last_year(p_member uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  with spans as (
    select e.created_at as started,
           (select min(u.created_at)
              from membership_events u
             where u.member_id = e.member_id
               and u.kind = 'unfreeze'
               and u.created_at > e.created_at) as ended
      from membership_events e
     where e.member_id = p_member
       and e.kind = 'freeze'
       and e.created_at > now() - interval '1 year'
  )
  select coalesce(sum(
    extract(epoch from (coalesce(ended, now()) - started)) / 86400
  ), 0)::int
  from spans;
$fn$;

revoke all on function frozen_days_last_year(uuid) from public, anon;
grant execute on function frozen_days_last_year(uuid) to authenticated;

-- ============================================================================
-- 3. THE QUOTE
-- ============================================================================
-- What this member would get back if they cancelled today, and why.
--
-- Returns a row rather than a number so the caller has the rule text. A refund
-- figure with no rule behind it is not something a member can accept or
-- dispute, and the desk would be left defending an unexplained number.
create or replace function refund_quote(p_membership uuid)
returns table (
  percent      numeric,
  amount       numeric,
  rule_label   text,
  days_elapsed int,
  has_visited  boolean,
  paid_total   numeric
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  m record;
  v_days int;
  v_visited boolean;
  v_paid numeric;
  r record;
begin
  select ms.id, ms.member_id, ms.start_date, ms.status
    into m
    from memberships ms
   where ms.id = p_membership;

  if m.id is null then
    raise exception 'No such membership.';
  end if;

  -- Self or front desk. SECURITY DEFINER bypasses RLS, so the guard is here;
  -- `auth.uid() is not null and` first so the SQL Editor is not refused.
  if auth.uid() is not null
     and m.member_id is distinct from auth.uid()
     and not is_front_desk() then
    raise exception 'You can only see your own refund quote.';
  end if;

  -- Manila, not UTC. `current_date` is UTC here and would read as yesterday for
  -- the first eight hours of every local day — which is exactly the arithmetic
  -- that decides whether somebody is inside the 7-day window.
  v_days := greatest(0, (
    (now() at time zone 'Asia/Manila')::date - coalesce(m.start_date, (now() at time zone 'Asia/Manila')::date)
  ));

  select exists (
    select 1 from attendance a
     where a.member_id = m.member_id
       and (m.start_date is null or (a.check_in_time at time zone 'Asia/Manila')::date >= m.start_date)
  ) into v_visited;

  -- What they actually paid against this membership. Completed payments only:
  -- a pending payment is money the gym has not received and cannot give back.
  select coalesce(sum(p.amount), 0) into v_paid
    from payments p
   where p.membership_id = m.id
     and p.status = 'completed';

  select * into r
    from refund_rules rr
   where rr.is_active
     and v_days >= rr.min_days
     and (rr.max_days is null or v_days < rr.max_days)
     and (rr.requires_visits is null or rr.requires_visits = v_visited)
   order by rr.priority
   limit 1;

  if not found then
    -- No rule matched. That is NOT "no refund" — it is "the gym has not decided
    -- this case", and the two must never be shown as the same answer. NULL
    -- percent, and the caller is expected to say so in words.
    return query select null::numeric, null::numeric,
                        'No refund rule covers this case — an admin decides.'::text,
                        v_days, v_visited, v_paid;
    return;
  end if;

  return query select
    r.percent,
    round(v_paid * r.percent / 100, 2),
    r.label,
    v_days,
    v_visited,
    v_paid;
end;
$fn$;

revoke all on function refund_quote(uuid) from public, anon;
grant execute on function refund_quote(uuid) to authenticated;

comment on function refund_quote(uuid) is
  'What this membership would be refunded today, and the rule that says so. A '
  'NULL percent means no rule covers the case and an admin must decide — which '
  'is a different answer from 0%% and must be worded differently on screen.';

-- ============================================================================
-- 4. RECORDING WHAT WAS ACTUALLY GIVEN BACK
-- ============================================================================
-- The quote is what the policy says. This is what the gym did — and they are
-- allowed to differ, because a manager can make an exception. Both are kept, so
-- "we refunded less than the policy" is visible rather than invisible.
alter table membership_events
  add column if not exists refund_percent numeric(5,2)
    check (refund_percent is null or (refund_percent >= 0 and refund_percent <= 100)),
  add column if not exists refund_amount numeric(10,2)
    check (refund_amount is null or refund_amount >= 0),
  /** The rule text as it stood when the refund was agreed. Copied, not joined:
      if the gym edits its policy next year, this row must still say what the
      member was actually told. */
  add column if not exists refund_rule text;

comment on column membership_events.refund_rule is
  'The rule text as it stood at the time, copied rather than joined — editing '
  'the policy later must not rewrite what a member was told last year.';

-- ============================================================================
-- 5. A PERSONAL TRAINING SESSION THE MEMBER CAN SEE IS PAID
-- ============================================================================
-- Payments have carried `membership_id` since 0001, so a membership renewal is
-- traceable. A PT session had no link at all — the money appeared in the ledger
-- and the session it bought said nothing, so a member asking "have I paid for
-- Thursday" had to be answered from memory.
alter table pt_sessions
  add column if not exists payment_id uuid references payments(id);

create index if not exists idx_pt_sessions_payment on pt_sessions(payment_id);

comment on column pt_sessions.payment_id is
  'The payment that covers this session, when one exists. NULL is normal and '
  'means unpaid *or* covered by the plan''s monthly allowance — the screens '
  'must distinguish those two rather than printing "unpaid" for both.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select * from refund_rules order by priority;
--
--   -- As the member who owns it, and as an admin: both allowed.
--   select * from refund_quote('<membership>');
--   -- Expect percent + a rule sentence + days_elapsed computed in Manila time.
--
--   -- As a different member: refused.
--   select * from refund_quote('<someone else''s membership>');
--
--   -- A membership older than every rule's window still returns a row —
--   -- the catch-all at priority 40. Deactivate it and the same call returns
--   -- a NULL percent with 'an admin decides', which is the case the screens
--   -- must word differently from 0%:
--   update refund_rules set is_active = false where priority = 40;
--   select percent, rule_label from refund_quote('<old membership>');
--   update refund_rules set is_active = true where priority = 40;
--
--   select frozen_days_last_year('<member>');   -- 0 for someone never frozen
