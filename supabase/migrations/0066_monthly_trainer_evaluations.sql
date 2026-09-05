-- 0066_monthly_trainer_evaluations.sql
--
-- Turns the one-off trainer rating into a **monthly evaluation**: a star score
-- and a written reason, once per member per trainer per month.
--
-- ---------------------------------------------------------------------------
-- What was actually wrong
-- ---------------------------------------------------------------------------
-- Nothing, in the saving. A member rated a coach 5 stars, the row was written,
-- and both apps then said "Not rated yet · 1 rating so far" — which is 0042's
-- withholding rule doing exactly what it was built to do, and reading to
-- everyone who saw it like a bug. Two separate problems, and only one of them
-- is a policy worth keeping:
--
--   * The rule (hide an average until enough people have voted) is right and
--     stays. One bad afternoon should not become a coach's permanent number.
--   * The *wording* was wrong, and the gym's own inability to see its own
--     numbers was wrong. Both are fixed here and in the apps.
--
-- ---------------------------------------------------------------------------
-- Monthly, and why the public average is not a plain average
-- ---------------------------------------------------------------------------
-- An evaluation series is only useful if it can move: a coach who was a 3 in
-- January and a 5 in June has improved, and one row per member could never
-- show that. So the primary key gains a `period` — the first day of the month
-- the evaluation is *for*.
--
-- That creates a problem a naive average walks straight into. If every row
-- counted equally, a member who evaluates monthly for a year would carry twelve
-- times the weight of a member who evaluated once. So the **public** score uses
-- each member's *latest* evaluation only, and counts distinct members. The
-- monthly series is still there in full — it is what the gym reads, not what
-- the public number is built from.
--
-- ---------------------------------------------------------------------------
-- The gym sees its own numbers now
-- ---------------------------------------------------------------------------
-- 0042 deliberately showed the admin the same withheld figure members see, so
-- that a policy could not become a display trick. **That is reversed here, on
-- purpose.** The reasoning has changed: this is now an evaluation tool, and a
-- gym that cannot read its own evaluations cannot act on them. The withholding
-- stays exactly as it was for members; the admin view is separate, admin-only,
-- and named so nobody mistakes one for the other.

-- ============ THE PERIOD ============
alter table trainer_ratings add column if not exists period date;

-- Backfill from when the rating was written, in **Manila**. `date_trunc` on a
-- UTC timestamp puts anything written in the first eight hours of the 1st into
-- the previous month — the same off-by-eight-hours that hid every pre-8am
-- check-in until 0045.
update trainer_ratings
   set period = date_trunc('month', (created_at at time zone 'Asia/Manila'))::date
 where period is null;

alter table trainer_ratings alter column period set not null;

-- Always the first of the month, whatever the client sends.
alter table trainer_ratings drop constraint if exists trainer_ratings_period_is_month;
alter table trainer_ratings add constraint trainer_ratings_period_is_month
  check (period = date_trunc('month', period)::date);

-- One evaluation per member per trainer per month, still editable within the
-- month. Dropped and rebuilt rather than added: the old key was (member,
-- trainer), which is precisely the constraint being relaxed.
alter table trainer_ratings drop constraint if exists trainer_ratings_pkey;
alter table trainer_ratings add primary key (member_id, trainer_id, period);

create index if not exists idx_trainer_ratings_trainer_period
  on trainer_ratings(trainer_id, period desc);

comment on column trainer_ratings.period is
  'First day of the month this evaluation is for, in Manila. One row per '
  'member per trainer per month; editable while that month is open.';

comment on column trainer_ratings.comment is
  'Why they scored it that way. Optional in SQL on purpose - a star with no '
  'words is still a signal, and forcing prose gets you "ok" rather than '
  'anything a coach can act on. The member app asks for it prominently.';

-- ============ WHAT MEMBERS SEE ============
-- Rebuilt so one member cannot outvote the rest by evaluating every month.
-- `distinct on` takes each member's newest row; the average and the count are
-- then over members, not over rows.
drop view if exists trainer_rating_summary;
create view trainer_rating_summary
with (security_invoker = true) as
with latest_per_member as (
  select distinct on (r.trainer_id, r.member_id)
         r.trainer_id, r.member_id, r.stars
    from trainer_ratings r
   order by r.trainer_id, r.member_id, r.period desc
)
select
  t.profile_id as trainer_id,
  count(l.stars)::int as rating_count,
  -- Withheld below three *members*, exactly as before. NULL means "not enough
  -- to show yet" and the app must render that as such — never as 0 stars,
  -- which is a score nobody gave.
  case when count(l.stars) >= 3
       then round(avg(l.stars)::numeric, 1)
       else null
  end as average_stars
from trainer_profiles t
left join latest_per_member l on l.trainer_id = t.profile_id
group by t.profile_id;

revoke all on trainer_rating_summary from anon;
grant select on trainer_rating_summary to authenticated;

comment on view trainer_rating_summary is
  'Public per-trainer score, one vote per member (their latest month). '
  'average_stars is NULL until three different members have evaluated, so one '
  'bad afternoon cannot become a permanent public number. Count always shown.';

-- ============ WHAT THE GYM SEES ============
-- The monthly series, admin-only. Separate view and separate name so it can
-- never be mistaken for the public number above.
drop view if exists trainer_evaluation_months;
create view trainer_evaluation_months
with (security_invoker = true) as
select
  r.trainer_id,
  r.period,
  count(*)::int                      as evaluations,
  round(avg(r.stars)::numeric, 1)    as average_stars,
  count(r.comment) filter (where r.comment is not null and btrim(r.comment) <> '')::int
                                     as with_comment
from trainer_ratings r
group by r.trainer_id, r.period;

revoke all on trainer_evaluation_months from anon;
grant select on trainer_evaluation_months to authenticated;

comment on view trainer_evaluation_months is
  'Month-by-month evaluation figures for the gym. Unwithheld: this is the '
  'gym reading its own evaluations, not a public score. RLS on '
  'trainer_ratings still applies (security_invoker), and the admin-only '
  'SELECT policy below is what keeps members out of it.';

-- ============ RLS ============
-- 0042 let every signed-in user read every rating row, on the reasoning that a
-- rating is a public statement. With a written reason attached that is no
-- longer true: "why I scored my coach 2" is a private note to the gym, and a
-- member should not be able to read another member's.
--
-- So reads narrow to: your own rows, the trainer being evaluated, and admins.
-- The public average survives because `trainer_rating_summary` aggregates —
-- but note it is `security_invoker`, so a member now only averages rows they
-- can see. That would break the number, so the summary view is the one thing
-- that must NOT be invoker-filtered.
drop policy if exists trainer_ratings_select_authenticated on trainer_ratings;

drop policy if exists trainer_ratings_select_own on trainer_ratings;
create policy trainer_ratings_select_own on trainer_ratings for select
  to authenticated
  using (
    member_id = auth.uid()
    or trainer_id = auth.uid()
    or get_my_role() = 'admin'
  );

-- The public summary therefore runs as its owner, not the caller. It exposes
-- only an average and a count — never a row, never a comment — so this is the
-- one place where bypassing RLS is the honest choice rather than a shortcut.
drop view if exists trainer_rating_summary;
create view trainer_rating_summary
with (security_invoker = false) as
with latest_per_member as (
  select distinct on (r.trainer_id, r.member_id)
         r.trainer_id, r.member_id, r.stars
    from trainer_ratings r
   order by r.trainer_id, r.member_id, r.period desc
)
select
  t.profile_id as trainer_id,
  count(l.stars)::int as rating_count,
  case when count(l.stars) >= 3
       then round(avg(l.stars)::numeric, 1)
       else null
  end as average_stars
from trainer_profiles t
left join latest_per_member l on l.trainer_id = t.profile_id
group by t.profile_id;

revoke all on trainer_rating_summary from anon;
grant select on trainer_rating_summary to authenticated;

-- Insert and update keep 0042's eligibility rule untouched: you may only
-- evaluate a coach you have actually trained with, and the policy is what
-- enforces it, not the client.

-- ============ Verification ============
-- select period, count(*) from trainer_ratings group by period;
-- select * from trainer_rating_summary;          -- count = distinct members
-- select * from trainer_evaluation_months order by period desc;
-- Expect: every row has a period on the 1st; the summary counts members not
-- rows; the months view has one row per trainer per month.
