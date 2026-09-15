-- ============================================================================
-- 0082  A TRAINER SEES THEIR OWN MEMBERS, NOT THE GYM'S ROSTER
-- ============================================================================
-- Re-runnable.
--
-- ## The hole
--
-- Since 0006, `member_profiles_select_trainer` has read:
--
--     using (get_my_role() = 'trainer')
--
-- Every trainer could select every member row in the gym. Nothing narrowed it in
-- the seventy-six migrations since. The trainer app made it visible rather than
-- caused it — `TrainerMembers` calls `listMembers()` and renders whatever comes
-- back — but the frontend was never the boundary here, and filtering there would
-- have left the same rows one `curl` away.
--
-- 0032 is the reason this matters more than it looks: members choose what a
-- trainer may see (measurements, goals, workout logs), and `trainer_may_see()`
-- gates those tables properly. That care was undone one level up by a policy
-- that handed over the whole member list, including names, gym ids, birth dates
-- and experience levels, for members who had never met the coach.
--
-- ## What "my member" means
--
-- Deliberately derived, not stored. There is no trainer↔member assignment table
-- in this schema and inventing one would mean maintaining a second source of
-- truth for a fact the bookings already state. A member is this trainer's when
-- they have a PT session with them, or a booking on a class they teach — the
-- same two joins `may_rate_trainer()` (0042) already treats as "you two have
-- trained together", so eligibility to rate and visibility stay consistent by
-- construction rather than by coincidence.
--
-- Any status counts, including cancelled and pending. A trainer needs to see who
-- asked and who called it off, and narrowing to 'approved' would make a member
-- disappear from the roster the moment they cancelled — taking the coach's
-- notes about them with it.

create or replace function is_my_trainee(p_member uuid, p_trainer uuid default null)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from pt_sessions s
     where s.member_id = p_member
       and s.trainer_id = coalesce(p_trainer, auth.uid())
  ) or exists (
    select 1
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = p_member
       and c.trainer_id = coalesce(p_trainer, auth.uid())
  );
$fn$;

revoke all on function is_my_trainee(uuid, uuid) from public, anon;
grant execute on function is_my_trainee(uuid, uuid) to authenticated;

comment on function is_my_trainee(uuid, uuid) is
  'True when the member has a PT session with this trainer, or a booking on a '
  'class they teach. The same relationship may_rate_trainer() uses, so who a '
  'coach may see and who may rate them cannot drift apart.';

-- ============================================================================
-- THE POLICY THAT WAS WRONG
-- ============================================================================
drop policy if exists member_profiles_select_trainer on member_profiles;
create policy member_profiles_select_trainer on member_profiles for select
  using (get_my_role() = 'trainer' and is_my_trainee(profile_id));

-- `profiles` is the other half of the same read: the trainer app joins
-- `member_profiles` to `profiles!inner(*)` for the name, so narrowing only one
-- of the two would leave the roster correct and every detail screen still able
-- to fetch a stranger by id.
--
-- **It has to REPLACE `profiles_select_trainer`, not sit beside it.** Policies
-- for the same command are OR'd: adding a narrow one next to 0006's
-- `using (get_my_role() = 'trainer')` grants nothing new and forbids nothing,
-- and the first version of this migration did exactly that — the member rows
-- stayed visible and the suite caught it.
--
-- Careful with the shape: this table holds admins, staff and trainers as well
-- as members, so a blanket `is_my_trainee(id)` would hide the trainer's own row
-- and every colleague, breaking their profile screen. Members are narrowed;
-- everyone else is left exactly as they were.
drop policy if exists profiles_select_trainer_members on profiles;
drop policy if exists profiles_select_trainer on profiles;
create policy profiles_select_trainer on profiles for select
  using (
    get_my_role() = 'trainer'
    and (role::text is distinct from 'member' or is_my_trainee(id))
  );

-- ============================================================================
-- THE SAME HOLE, IN TWO MORE TABLES
-- ============================================================================
-- `memberships_select_trainer` and `attendance_select_trainer` are the same
-- sentence as the one above — `using (get_my_role() = 'trainer')` — and the
-- trainer roster reads both. Narrowing only `member_profiles` would have left
-- every membership (plan, price tier, expiry, freeze history) and every
-- check-in in the gym readable by any coach, which is most of what the roster
-- was leaking in the first place.
--
-- Found by following the screen's own three reads rather than the one the
-- complaint named.
drop policy if exists memberships_select_trainer on memberships;
create policy memberships_select_trainer on memberships for select
  using (get_my_role() = 'trainer' and is_my_trainee(member_id));

drop policy if exists attendance_select_trainer on attendance;
create policy attendance_select_trainer on attendance for select
  using (get_my_role() = 'trainer' and is_my_trainee(member_id));

-- ============================================================================
-- THE ROSTER, AS ONE READ
-- ============================================================================
-- The trainer app was assembling its roster from three unfiltered table reads
-- (`listMembers`, `listMemberships`, `listAttendance`) and joining them on the
-- phone. With the policies above those reads now return only what they should,
-- but the screen still asks for the whole attendance table to count visits.
--
-- `security_invoker` so the view is subject to the caller's own policies rather
-- than the definer's — the same rule `activity_feed` follows (0037). A view that
-- bypassed RLS here would re-open the hole it exists to close.
create or replace view my_trainer_members
with (security_invoker = true) as
select
  mp.profile_id                                  as member_id,
  trim(p.first_name || ' ' || p.last_name)       as name,
  p.photo_url,
  mp.experience_level,
  (select max(a.check_in_time) from attendance a where a.member_id = mp.profile_id)
                                                 as last_visit,
  (select count(*) from attendance a
    where a.member_id = mp.profile_id
      and a.check_in_time >= now() - interval '30 days')
                                                 as visits_last_30,
  (select count(*) from pt_sessions s
    where s.member_id = mp.profile_id and s.trainer_id = auth.uid()
      and s.status = 'approved' and s.starts_at >= now())
                                                 as upcoming_with_me
  from member_profiles mp
  join profiles p on p.id = mp.profile_id
 where p.status <> 'archived';

comment on view my_trainer_members is
  'The signed-in trainer''s own members. security_invoker, so the narrowed '
  'member_profiles policy does the filtering — the view adds no reach of its own.';

grant select on my_trainer_members to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0082_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0082_applied() from public, anon;
grant execute on function migration_0082_applied() to authenticated;

comment on function migration_0082_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION (as a real trainer session, never as the table owner)
--   select count(*) from member_profiles;   -- only their own trainees
--   select count(*) from my_trainer_members;
--   select * from member_profiles where profile_id = '<another trainer''s member>';
--     -- 0 rows, and NO error: RLS filters, it does not raise.
--   As admin, the same count is unchanged.
