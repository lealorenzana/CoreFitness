-- 0088 — a coach's note is read, and a recommendation is done.
--
-- `trainer_feedback` (0072) carries a note and, separately, a recommendation:
-- "what to do next". The member could read it; nothing else happened. The coach
-- never learned whether it was seen, and the member had no way to say "done" —
-- so advice was a message, not a step. (The gym asked for the Coach tab to be
-- reworked, 2026-09-18.)
--
--   seen_at   stamped the first time the member opens the note
--   done_at   stamped when the member ticks the recommendation done (and
--             cleared if they untick it)
--
-- Both are the member's to set, and **only** those two columns: the note and
-- the recommendation stay the coach's words. RLS chooses rows, never columns,
-- so the member does not get an UPDATE policy on this table at all — they call
-- `mark_feedback()`, which checks the row is theirs and touches nothing else.
-- The coach reads both through their existing select policy.

alter table trainer_feedback
  add column if not exists seen_at timestamptz,
  add column if not exists done_at timestamptz;

create or replace function mark_feedback(p_id uuid, p_seen boolean default true, p_done boolean default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  n int;
begin
  update trainer_feedback f
     set seen_at = case when p_seen then coalesce(f.seen_at, now()) else f.seen_at end,
         done_at = case
                     when p_done is null then f.done_at
                     when p_done and f.recommendation is not null then coalesce(f.done_at, now())
                     when not p_done then null
                     else f.done_at
                   end
   where f.id = p_id
     and f.member_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That note is not yours to mark.';
  end if;
end;
$fn$;

revoke all on function mark_feedback(uuid, boolean, boolean) from public, anon;
grant execute on function mark_feedback(uuid, boolean, boolean) to authenticated;

-- The coach's own trigger touches updated_at on every update; a member marking
-- a note seen is not the coach editing it, so that stamp is left alone here.
create or replace function trg_touch_trainer_feedback() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if new.note is distinct from old.note or new.recommendation is distinct from old.recommendation then
    new.updated_at := now();
  end if;
  return new;
end;
$fn$;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0088_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0088_applied() from public, anon;
grant execute on function migration_0088_applied() to authenticated;

-- VERIFICATION — as the member the note was written to:
--   select mark_feedback('<id>');                 -- seen_at set
--   select mark_feedback('<id>', true, true);     -- done_at set (only if it has a recommendation)
--   select mark_feedback('<id>', true, false);    -- done_at cleared
--   as anyone else: select mark_feedback('<id>'); -- raises
