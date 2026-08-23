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
