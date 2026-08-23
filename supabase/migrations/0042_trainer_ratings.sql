-- 0042 — members rate the coaches they actually trained with.
--
-- The trainer profile this replaces is instructive: it showed **4.9 stars and
-- two five-star reviews from "John Doe" and "Maria Santos"**, hardcoded, with no
-- table behind any of it. 0041 gave the trainer's background real columns and
-- deliberately left ratings out, because a rating needs two things a text field
-- does not: a rule about who may leave one, and protection against a single bad
-- afternoon becoming somebody's permanent public score.
--
-- Both are here.
--
-- ---------------------------------------------------------------------------
-- Who may rate
-- ---------------------------------------------------------------------------
-- **A member may rate a trainer once they have completed a session with them.**
-- Not "once they have been a member for a month" — that would let someone rate a
-- coach they have never met, which is the single thing a rating system most
-- needs to prevent. Completed means the booking was *approved* and the session
-- time has *passed*; a pending request and a no-show-in-advance are not
-- experience of a coach.
--
-- Both kinds of session count: a group class that trainer taught, and a 1-on-1.
--
-- The rule lives in one function on purpose. A gym that wants to require three
-- sessions, or a month of tenure, edits `may_rate_trainer()` and nothing else.
--
-- ---------------------------------------------------------------------------
-- What is shown
-- ---------------------------------------------------------------------------
-- `trainer_rating_summary` hides the average until **at least 3 ratings** exist.
-- Core Fitness has four trainers. With a threshold of one, a member having a bad
-- week hands a coach a 2.0 that every future member sees and that the coach
-- cannot answer. Below the threshold the view still returns the row — with a
-- null average — so the app can say "not rated yet" rather than rendering
-- nothing and leaving the member to wonder whether it failed to load.
--
-- The **count is public even below the threshold**, because "2 people have rated
-- this coach" is honest and tells a member the feature works.

-- ============ THE RATINGS ============
create table if not exists trainer_ratings (
  member_id  uuid not null references member_profiles(profile_id)  on delete cascade,
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  -- Optional. A star with no words is still a rating; forcing a comment gets you
  -- "ok" and "good" rather than anything a coach can act on.
  comment    text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One rating per member per trainer, **editable**. Not an append-only log: a
  -- member whose opinion changes after ten more sessions should be able to say
  -- so, and stacking their old and new opinions would double their weight.
  primary key (member_id, trainer_id)
);

comment on table trainer_ratings is
  'One editable rating per member per trainer. Insert/update gated by '
  'may_rate_trainer() in the RLS policy - a member who never trained with the '
  'coach cannot rate them, whatever the client sends.';

create index if not exists idx_trainer_ratings_trainer on trainer_ratings(trainer_id);

create or replace function touch_trainer_rating() returns trigger
language plpgsql as $$
begin
  -- NEW is populated for both INSERT and UPDATE, so OLD is never read here.
  -- Reading OLD during an INSERT raises "record old is not assigned yet" and
  -- aborts the statement - the trap that would have broken every booking in 0037.
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_trainer_rating on trainer_ratings;
create trigger trg_touch_trainer_rating
before insert or update on trainer_ratings
for each row execute function touch_trainer_rating();

-- ============ ELIGIBILITY ============
-- SECURITY DEFINER because it reads other members' bookings to answer a question
-- about *this* member: `classes` alone cannot tell you who taught a session
-- without joining rows the caller may not select. It leaks nothing — the answer
-- is a boolean about the caller's own history.
--
-- `p_member` defaults to the caller. Passing someone else's id is allowed only
-- for the front desk, checked below, so a member cannot probe another member's
-- training history one trainer at a time.
create or replace function may_rate_trainer(p_trainer uuid, p_member uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  target uuid := coalesce(p_member, auth.uid());
begin
  -- `is distinct from` and not `<>`: for a caller with no profile row
  -- `get_my_role()` is NULL, and `NULL <> 'admin'` is NULL, which plpgsql treats
  -- as not-true — so a `<>` guard here would be skipped entirely. That exact
  -- hole shipped live in 0038 and was fixed in 0039.
  if target is distinct from auth.uid() and not is_front_desk() then
    return false;
  end if;
  if target is null then
    return false;
  end if;

  return exists (
    -- A group class this trainer taught, already finished.
    select 1
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = target
       and c.trainer_id = p_trainer
       and b.status = 'approved'
       and c.scheduled_at is not null
       and c.scheduled_at < now()
  ) or exists (
    -- A 1-on-1 with this trainer, already finished.
    select 1
      from pt_sessions s
     where s.member_id = target
       and s.trainer_id = p_trainer
       and s.status = 'approved'
       and s.starts_at < now()
  );
end;
$$;

-- ============ RLS ============
alter table trainer_ratings enable row level security;

-- Everyone signed in reads ratings. The aggregate view is what the app shows,
-- but a member must be able to read *their own* row to edit it, and the simplest
-- honest rule is that a rating is a public statement.
drop policy if exists trainer_ratings_select_authenticated on trainer_ratings;
create policy trainer_ratings_select_authenticated on trainer_ratings for select
  to authenticated using (true);

-- **The eligibility rule is the policy, not a client check.** A member calling
-- PostgREST directly with someone else's trainer id still fails here.
drop policy if exists trainer_ratings_insert_self on trainer_ratings;
create policy trainer_ratings_insert_self on trainer_ratings for insert
  to authenticated
  with check (member_id = auth.uid() and may_rate_trainer(trainer_id));

drop policy if exists trainer_ratings_update_self on trainer_ratings;
create policy trainer_ratings_update_self on trainer_ratings for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and may_rate_trainer(trainer_id));

-- A member may withdraw their own rating. The desk may not delete one it merely
-- dislikes — that is what would make the whole score untrustworthy.
drop policy if exists trainer_ratings_delete_self on trainer_ratings;
create policy trainer_ratings_delete_self on trainer_ratings for delete
  to authenticated using (member_id = auth.uid());

-- ============ WHAT MEMBERS SEE ============
-- `security_invoker` so the SELECT policy above still applies through the view.
-- Without it the view runs as its owner and silently bypasses RLS — the same
-- requirement `activity_feed` carries in 0037.
drop view if exists trainer_rating_summary;
create view trainer_rating_summary
with (security_invoker = true) as
select
  t.profile_id as trainer_id,
  count(r.stars)::int as rating_count,
  -- Withheld below the threshold. NULL here means "not enough to show yet",
  -- which the app renders as "Not rated yet" — never as 0 stars, which would be
  -- a score nobody gave.
  case when count(r.stars) >= 3
       then round(avg(r.stars)::numeric, 1)
       else null
  end as average_stars
from trainer_profiles t
left join trainer_ratings r on r.trainer_id = t.profile_id
group by t.profile_id;

revoke all on trainer_rating_summary from anon;
grant select on trainer_rating_summary to authenticated;

comment on view trainer_rating_summary is
  'Public per-trainer score. average_stars is NULL until rating_count >= 3, so '
  'one bad afternoon cannot become a coach permanent public number. The count '
  'is always shown.';
