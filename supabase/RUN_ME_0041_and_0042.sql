-- 0041 — who a trainer actually is, and a trial that can only be taken once.
--
-- Two unrelated gaps, both raised in panel feedback, both small enough that a
-- second migration file would be ceremony.
--
-- ===========================================================================
-- 1. Trainer background
-- ===========================================================================
-- `trainer_profiles` has carried three columns since 0001: specialization, bio,
-- availability. The member-facing profile therefore shows a name, one line of
-- job title, and a paragraph — which is less than the *fake* profile it
-- replaced, and that fake version is instructive. It claimed "8 years
-- experience", a certifications list and a 4.9 rating, all hardcoded, because
-- those are the things a person actually wants to know before trusting a coach
-- with their training. The right response is to give them somewhere to live,
-- not to keep pretending.
--
-- Ratings are still absent on purpose: they need reviews, reviews need
-- moderation, and an unmoderated rating on a four-trainer gym is a way for one
-- bad afternoon to become permanent. Everything added here is the trainer's own
-- statement about themselves, which is a different kind of claim.
--
-- ===========================================================================
-- 2. The Freemium trial, once per member
-- ===========================================================================
-- 0004 seeded 'Freemium Trial' as a 90-day zero-peso plan. Nothing stopped a
-- member taking it again — and a trial you can retake is not a trial, it is an
-- indefinite free tier that duplicates Free Access while carrying the class
-- entitlements Free Access deliberately does not have.
--
-- The lock lives here rather than in the admin UI because the front desk grants
-- plans under time pressure and should not have to remember who had a trial
-- eighteen months ago.

-- ============ TRAINER BACKGROUND ============
alter table trainer_profiles
  add column if not exists years_experience int,
  -- Arrays rather than newline-delimited text. `membership_plans.description`
  -- is the cautionary tale: it stores one feature per line, some rows hold a
  -- real newline and some a literal backslash-n, and every consumer now splits
  -- on both to undo the ambiguity. A text[] cannot develop that problem.
  add column if not exists certifications text[],
  add column if not exists focus_areas text[],
  add column if not exists achievements text;

-- 70 is not a real ceiling on a career; it is a typo catch. Someone entering a
-- birth year instead of a duration should be stopped at the door.
alter table trainer_profiles drop constraint if exists trainer_profiles_years_sane;
alter table trainer_profiles
  add constraint trainer_profiles_years_sane
    check (years_experience is null or (years_experience >= 0 and years_experience <= 70))
    not valid;

comment on column trainer_profiles.years_experience is
  'Years coaching, self-declared. NULL = not stated, which renders as nothing '
  'rather than as "0 years".';
comment on column trainer_profiles.certifications is
  'e.g. {NASM-CPT,"First Aid / CPR"}. Self-declared; the gym does not verify.';
comment on column trainer_profiles.focus_areas is
  'What they coach best — {"Weight Loss",Strength}. Distinct from the single '
  'free-text specialization, which is the one-line title under their name.';
comment on column trainer_profiles.achievements is
  'Competitions, athletic background, notable results. Free text, one paragraph.';

-- The view is what members read; the table itself stays behind RLS. Dropped and
-- recreated rather than `create or replace` — replace refuses any change to the
-- column list beyond appending, and pinning that down is not worth the risk.
--
-- The grants must be restated: dropping the view drops them with it, and 0016's
-- whole point is that this is readable by authenticated users and by nobody
-- else. `anon` must not get the gym's staff list.
drop view if exists public_trainers;
create view public_trainers as
select
  p.id,
  p.first_name,
  p.last_name,
  p.photo_url,
  tp.specialization,
  tp.bio,
  tp.availability,
  tp.years_experience,
  tp.certifications,
  tp.focus_areas,
  tp.achievements
from profiles p
join trainer_profiles tp on tp.profile_id = p.id
where p.role = 'trainer'
  and p.status = 'active';

revoke all on public_trainers from anon;
grant select on public_trainers to authenticated;

-- No new policies needed. `trainer_profiles_update_self` (0010) and
-- `trainer_profiles_write_admin` (0006) are both written without a column list,
-- so they cover columns added after the fact. Noted so the next person does not
-- go hunting for a policy that was never required.

-- ============ FREEMIUM TRIAL, CLAIMED ONCE ============
-- One row per member, forever. The primary key *is* the rule — no counter to
-- drift, no window to race.
create table if not exists freemium_trials (
  member_id uuid primary key references member_profiles(profile_id) on delete cascade,
  -- Which membership row consumed it. This is what separates "this member is
  -- still on the trial they started" from "this member is starting a second
  -- one", and without it every later write to an active trial membership would
  -- collide with the member's own claim and be rejected as a repeat.
  membership_id uuid not null references memberships(id) on delete cascade,
  plan_id uuid not null references membership_plans(id),
  claimed_at timestamptz not null default now()
);

comment on table freemium_trials is
  'One Freemium trial per member, ever. Written only by claim_freemium_trial() '
  '- there is no INSERT policy, so it cannot be forged from a browser. To grant '
  'a second trial deliberately, an admin deletes the row in the SQL editor; '
  'that is meant to be a decision, not a button.';

alter table freemium_trials enable row level security;

-- Readable by the desk and by the member it concerns. Writable by nobody: the
-- SECURITY DEFINER trigger below is the only writer, exactly like
-- `activity_log` (0037) and `achievement_unlocks` (0038).
drop policy if exists freemium_trials_select_self on freemium_trials;
create policy freemium_trials_select_self on freemium_trials for select
  using (member_id = auth.uid());

drop policy if exists freemium_trials_select_desk on freemium_trials;
create policy freemium_trials_select_desk on freemium_trials for select
  using (is_front_desk());

create or replace function claim_freemium_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_tier plan_tier;
  entering boolean;
begin
  select tier into new_tier from membership_plans where id = new.plan_id;

  -- `is distinct from` and not `<>`: a membership pointing at a missing plan
  -- leaves new_tier NULL, and `NULL <> 'freemium'` is NULL, which plpgsql
  -- treats as not-true — so the early return would be skipped and a member with
  -- no plan at all would burn their trial. That exact three-valued-logic hole
  -- shipped live in 0038 and was fixed in 0039; it is not making a comeback.
  if new_tier is distinct from 'freemium' then
    return new;
  end if;

  -- Only *moving onto* the trial consumes it. Every other write to a membership
  -- already sitting on the trial — activating it, recording a zero-peso
  -- payment, freezing, unfreezing — must pass through untouched.
  --
  -- OLD is unassigned during an INSERT and reading it aborts the statement, so
  -- TG_OP is checked before OLD is named at all.
  --
  -- Activation deliberately does NOT count as entering. It is tempting to claim
  -- the trial at the moment it starts being usable rather than when it is
  -- granted, so an unapproved registration cannot burn it — but no membership
  -- row exists before approval (0036 creates the member row at signup and no
  -- membership with it), so the INSERT already *is* the admin's decision. And
  -- claiming on activation would mean a freeze/unfreeze cycle re-enters the
  -- trial the member is presently on.
  if tg_op = 'INSERT' then
    entering := true;
  else
    entering := old.plan_id is distinct from new.plan_id;
  end if;

  if not entering then
    return new;
  end if;

  -- No escape hatch on conflict. An earlier draft let the write through when
  -- the existing claim named this same membership row, on the theory that it
  -- was the same trial continuing — but a plan change is an in-place UPDATE of
  -- one row, so Freemium -> Premium -> Freemium is all the same `id` and the
  -- exemption handed back the second trial the table exists to prevent.
  -- Caught by the round-trip assertion in the container, not by reading.
  insert into freemium_trials (member_id, membership_id, plan_id)
  values (new.member_id, new.id, new.plan_id)
  on conflict (member_id) do nothing;

  if not found then
    raise exception 'This member has already used the Freemium trial. Choose Free Access or Premium.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- AFTER, not BEFORE: `freemium_trials.membership_id` carries a foreign key, and
-- on a BEFORE INSERT the membership row does not exist yet. An exception raised
-- in an AFTER trigger still aborts the whole statement, so the guarantee is
-- unchanged.
drop trigger if exists trg_claim_freemium_trial on memberships;
create trigger trg_claim_freemium_trial
after insert or update on memberships
for each row execute function claim_freemium_trial();

-- ============ BACKFILL ============
-- Members already sitting on a freemium plan have plainly used their trial.
-- Recording that now means the rule starts from today's reality rather than
-- handing every existing trial member a second one.
insert into freemium_trials (member_id, membership_id, plan_id, claimed_at)
select distinct on (m.member_id) m.member_id, m.id, m.plan_id, m.created_at
from memberships m
join membership_plans p on p.id = m.plan_id
where p.tier = 'freemium'
order by m.member_id, m.created_at asc
on conflict (member_id) do nothing;
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
