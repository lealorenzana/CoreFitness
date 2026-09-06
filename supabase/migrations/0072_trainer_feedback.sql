-- 0072 — evaluation that is anonymous to the coach and legible to the gym,
--        credentials a member can actually see, and feedback going the other way.
--
-- Four things the panel asked for, all in the same area:
--
--   * a trainer sees their ratings and feedback, but **not who wrote them**;
--   * the admin sees the same rows **with** identity, for monitoring;
--   * members can see a trainer's credentials;
--   * trainers can leave a member feedback and recommendations.
--
-- ## The anonymity one was a real hole, not a UI omission
--
-- 0066 narrowed `trainer_ratings` reads to "your own rows, the trainer being
-- evaluated, or an admin". That policy hands the trainer the **whole row**,
-- `member_id` included. RLS chooses rows, never columns — so hiding the name in
-- JSX would have left it in the network response, and anyone who opened the
-- devtools network tab could match a one-star review to the member who wrote it.
--
-- The fix is to stop giving trainers the base table at all and give them a view
-- with no identity column in it. `security_invoker = false`, so the view can
-- read rows the trainer no longer can.
--
-- ## Why the admin still sees names
--
-- The gym monitors and coaches. An anonymous complaint it cannot follow up is
-- not monitoring — it cannot check whether one member is rating everybody
-- one star, and cannot talk to the member who reported something serious. The
-- asymmetry is the point: the coach is protected from knowing, the gym is not.
--
-- Re-runnable.

-- ============================================================================
-- 1. THE TRAINER'S VIEW OF THEIR OWN RATINGS — NO NAMES
-- ============================================================================
create or replace view trainer_ratings_anon
with (security_invoker = false) as
select
  r.trainer_id,
  r.stars,
  r.comment,
  r.period,
  r.created_at,
  r.updated_at
  -- member_id is deliberately absent. Not aliased, not hashed — a stable hash
  -- would still let a trainer group a member's reviews across months and, with
  -- a small roster, name them.
  from trainer_ratings r;

comment on view trainer_ratings_anon is
  'A trainer reads their own ratings through this and never through the base '
  'table. There is no member_id column, because RLS filters rows and not '
  'columns — hiding a name in the UI leaves it in the network response.';

-- **Nobody may select this view directly.** It is security_invoker = false, so
-- it reads every trainer's rows regardless of who asks — granting it to
-- `authenticated` would let any member read every comment written about every
-- coach, which is a worse leak than the one this file is fixing.
--
-- A view cannot carry an RLS policy, so the filtering lives in the function
-- below and the view is only its plumbing. Revoked from everyone; the function
-- is SECURITY DEFINER and reaches it as the owner.
alter view trainer_ratings_anon set (security_barrier = true);

revoke all on trainer_ratings_anon from public, anon, authenticated;

create or replace function my_trainer_ratings()
returns table (stars smallint, comment text, period date, created_at timestamptz)
language sql stable security definer set search_path = public as $fn$
  select a.stars, a.comment, a.period, a.created_at
    from trainer_ratings_anon a
   where a.trainer_id = auth.uid()
   order by a.period desc, a.created_at desc;
$fn$;

revoke all on function my_trainer_ratings() from public, anon;
grant execute on function my_trainer_ratings() to authenticated;

comment on function my_trainer_ratings() is
  'Every rating written about the signed-in trainer, without a shred of member '
  'identity. Keyed on auth.uid() rather than a parameter, so one trainer cannot '
  'ask for another''s.';

-- ── The base table stops answering to trainers ──────────────────────────────
-- This is the substantive change. `trainer_id = auth.uid()` is removed from the
-- policy, so a trainer selecting `trainer_ratings` directly now gets nothing at
-- all — they go through `my_trainer_ratings()`, which cannot leak a name.
drop policy if exists trainer_ratings_select_own on trainer_ratings;
create policy trainer_ratings_select_own on trainer_ratings for select
  to authenticated
  using (
    member_id = auth.uid()          -- their own review, so they can edit it
    or get_my_role() = 'admin'      -- the gym, for monitoring — see the header
  );

-- ============================================================================
-- 2. CREDENTIALS A MEMBER CAN SEE
-- ============================================================================
-- 0054 restricted `trainer_credentials` to the trainer and an admin. That is
-- right for the *file* — a scan of somebody's certificate is their document and
-- often carries a licence number — and wrong for the *fact*. A member choosing
-- a coach has no way to find out that the coach is NASM certified, which is the
-- single most useful thing on the profile.
--
-- So the fact is public and the file is not: title, status and verification
-- date, with `file_path` absent from the view entirely.
create or replace view public_trainer_credentials
with (security_invoker = false) as
select
  c.trainer_id,
  c.title,
  c.reviewed_at as verified_on
  from trainer_credentials c
 where c.status = 'verified';   -- pending and rejected are nobody else's business

comment on view public_trainer_credentials is
  'What a member may know about a coach''s qualifications: the title and when '
  'the gym verified it. Never file_path — the document itself stays with the '
  'trainer and the admin (0054). Only verified rows: a pending upload is a '
  'claim the gym has not checked, and showing it would launder it into a fact.';

revoke all on public_trainer_credentials from public, anon;
grant select on public_trainer_credentials to authenticated;

-- ============================================================================
-- 3. FEEDBACK GOING THE OTHER WAY
-- ============================================================================
-- Members rate trainers. Nothing let a trainer write anything back — so a coach
-- with something useful to say after a session had to say it out loud and hope
-- it was remembered.
create table if not exists trainer_feedback (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id  uuid not null references member_profiles(profile_id)  on delete cascade,
  /** What happened / how it went. */
  note       text not null check (length(btrim(note)) between 1 and 2000),
  /** What the member should do next. Separate from the note because it is the
      part the member acts on, and a screen should be able to show it alone. */
  recommendation text check (recommendation is null or length(recommendation) <= 2000),
  /** The session it followed, when it followed one. NULL is normal — a coach
      may write to a member they train in classes rather than 1-on-1. */
  pt_session_id uuid references pt_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trainer_feedback_member
  on trainer_feedback(member_id, created_at desc);
create index if not exists idx_trainer_feedback_trainer
  on trainer_feedback(trainer_id, created_at desc);

alter table trainer_feedback enable row level security;

do $$
begin
  if not exists (select 1 from pg_tables
                  where schemaname = 'public' and tablename = 'trainer_feedback' and rowsecurity) then
    raise exception 'RLS is not enabled on trainer_feedback.';
  end if;
end
$$;

-- Not anonymous in this direction, and deliberately so. A member being told to
-- change something needs to know which coach said it, or they cannot ask a
-- follow-up question. The asymmetry with ratings is the point: anonymity
-- protects the person with less power in the exchange, which is the member
-- when they are grading, and the coach is not in that position here.
drop policy if exists trainer_feedback_select_member on trainer_feedback;
create policy trainer_feedback_select_member on trainer_feedback for select
  using (member_id = auth.uid());

drop policy if exists trainer_feedback_select_trainer on trainer_feedback;
create policy trainer_feedback_select_trainer on trainer_feedback for select
  using (trainer_id = auth.uid());

drop policy if exists trainer_feedback_select_admin on trainer_feedback;
create policy trainer_feedback_select_admin on trainer_feedback for select
  using (get_my_role() = 'admin');

-- A trainer writes only as themselves. Without the `with check`, the row's
-- `trainer_id` is whatever the client sent, and anyone could sign a note with
-- a colleague's name.
drop policy if exists trainer_feedback_insert_own on trainer_feedback;
create policy trainer_feedback_insert_own on trainer_feedback for insert
  to authenticated
  with check (trainer_id = auth.uid());

drop policy if exists trainer_feedback_update_own on trainer_feedback;
create policy trainer_feedback_update_own on trainer_feedback for update
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

drop policy if exists trainer_feedback_delete_own on trainer_feedback;
create policy trainer_feedback_delete_own on trainer_feedback for delete
  using (trainer_id = auth.uid());

create or replace function trg_touch_trainer_feedback() returns trigger
language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists touch_trainer_feedback on trainer_feedback;
create trigger touch_trainer_feedback
  before update on trainer_feedback
  for each row execute function trg_touch_trainer_feedback();

-- The member hears about it. Feedback nobody is told about is a note in a
-- drawer — and this is the half of the loop the panel asked for.
create or replace function trg_notify_trainer_feedback() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_name text;
begin
  select nullif(btrim(p.first_name || ' ' || p.last_name), '')
    into v_name
    from profiles p where p.id = new.trainer_id;

  perform notify_once(
    new.member_id, 'system',
    'Feedback from your coach',
    coalesce(v_name, 'Your coach') || ' left you a note after your session.',
    '/member/progress',
    'feedback:' || new.id);
  return new;
end;
$fn$;

drop trigger if exists notify_trainer_feedback on trainer_feedback;
create trigger notify_trainer_feedback
  after insert on trainer_feedback
  for each row execute function trg_notify_trainer_feedback();

-- ============================================================================
-- 4. WHAT THE ADMIN MONITORS
-- ============================================================================
-- One row per trainer per month: how many rated them, the average, and how many
-- left words. Admin only — it is built on identity-bearing rows.
--
-- The average is NOT withheld below three ratings here, unlike the member-facing
-- summary (0042). The gym needs to see a coach who has one two-star review; it
-- is the *public* number that must not be swung by a single opinion.
create or replace view trainer_evaluation_summary
with (security_invoker = false) as
select
  r.trainer_id,
  r.period,
  count(*)::int                       as rating_count,
  round(avg(r.stars)::numeric, 2)     as average_stars,
  count(*) filter (where r.comment is not null and btrim(r.comment) <> '')::int
                                      as comment_count
  from trainer_ratings r
 group by r.trainer_id, r.period;

comment on view trainer_evaluation_summary is
  'Per trainer, per month, for the admin''s monitoring screen. Unlike the '
  'member-facing summary this does not withhold an average below three '
  'ratings: the gym needs to see one bad review, it is the public number that '
  'must not swing on a single opinion.';

revoke all on trainer_evaluation_summary from public, anon, authenticated;

-- Handed out through a function that checks the role, since a view cannot.
create or replace function admin_trainer_evaluations(p_trainer uuid default null)
returns table (
  trainer_id uuid, period date, rating_count int,
  average_stars numeric, comment_count int
)
language plpgsql stable security definer set search_path = public as $fn$
begin
  -- `auth.uid() is not null and` first, so the SQL Editor is not the one caller
  -- refused. 0055 and 0062 both shipped that bug.
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can read trainer evaluations.';
  end if;

  return query
    select s.trainer_id, s.period, s.rating_count, s.average_stars, s.comment_count
      from trainer_evaluation_summary s
     where p_trainer is null or s.trainer_id = p_trainer
     order by s.period desc, s.trainer_id;
end;
$fn$;

revoke all on function admin_trainer_evaluations(uuid) from public, anon;
grant execute on function admin_trainer_evaluations(uuid) to authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   -- As a TRAINER. The base table must now return nothing:
--   select count(*) from trainer_ratings;            -- expected: 0
--   select * from my_trainer_ratings();              -- their reviews, no names
--   -- and there must be no member_id column in that result at all.
--
--   -- As a MEMBER:
--   select count(*) from trainer_ratings;            -- only their own rows
--   select * from public_trainer_credentials where trainer_id = '<trainer>';
--   -- verified rows only, and no file_path column.
--
--   -- As an ADMIN:
--   select * from admin_trainer_evaluations();
--   select * from admin_trainer_evaluations('<trainer>');
--
--   -- As a TRAINER, signing a note with a colleague's name: refused.
--   insert into trainer_feedback (trainer_id, member_id, note)
--   values ('<another trainer>', '<member>', 'test');
--   -- expected: new row violates row-level security policy
--
--   -- The member-facing average still works — trainer_rating_summary is
--   -- security_invoker = false (0066) and is untouched by the policy change:
--   select * from trainer_rating_summary;
