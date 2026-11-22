-- ============================================================================
-- 0264 — Clean-ups on Capacity (the owner, 2026-11-22)
-- ============================================================================
--
-- "Clean-ups on Capacity: clear old rows older than a date you pick, with a typed
-- confirmation and a count shown first." Deliberately narrow: only crash reports
-- the platform already marked handled (client_errors.resolved_at, 0109). Not
-- notifications: notify_once() finds an earlier row to avoid sending twice (0053)
-- and Core Fitness's messages to owners count their readers from those rows (0240),
-- so deleting them could resend old reminders and erase history. Not the activity
-- logs: they are the audit trail (0037), the record of who did what.
--
-- The count comes first; the delete needs the word "delete" typed, and is logged.
-- ============================================================================

create or replace function platform_cleanup_preview(p_before date) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_platform_admin() then null else jsonb_build_object(
    'handled_crashes', (select count(*) from client_errors where resolved_at is not null and created_at < p_before::timestamptz),
    'open_crashes',    (select count(*) from client_errors where resolved_at is null),
    'oldest_handled',  (select min(created_at) from client_errors where resolved_at is not null)
  ) end;
$$;
revoke execute on function platform_cleanup_preview(date) from public, anon;
grant execute on function platform_cleanup_preview(date) to authenticated;

create or replace function platform_cleanup_crashes(p_before date, p_confirm text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can clean up.'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> 'delete' then raise exception 'Type delete to confirm.'; end if;
  if p_before > (now() at time zone 'Asia/Manila')::date - 7 then
    raise exception 'Keep at least the last 7 days: pick a date a week ago or earlier.';
  end if;
  delete from client_errors where resolved_at is not null and created_at < p_before::timestamptz;
  get diagnostics n = row_count;
  perform platform_log(null, 'cleanup.crashes', 'Deleted ' || n || ' handled crash report' || case when n = 1 then '' else 's' end || ' from before ' || p_before,
    jsonb_build_object('before', p_before, 'deleted', n));
  return n;
end;
$$;
revoke execute on function platform_cleanup_crashes(date, text) from public, anon;
grant execute on function platform_cleanup_crashes(date, text) to authenticated;

create or replace function migration_0264_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0264_applied() to anon, authenticated;
