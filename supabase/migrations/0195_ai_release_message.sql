-- ============================================================================
-- 0195 — A coach message that never reached the model is given back
-- ============================================================================
--
-- ai-coach claims a message (ai_claim_message, 0143/0189) BEFORE calling the
-- model, so parallel requests cannot slip under the limit. When the model call
-- then fails before a single token (an outage, a refused request — on
-- 2026-10-10/11 every request was refused for a schema the API rejected), the
-- member was still charged a message and the gym a month's message or a prepaid
-- top-up. ai_release_message() undoes exactly one claim: today's count goes
-- down by one, and if that claim had spent a top-up (the month was already at
-- its allowance) the top-up comes back. Service role only, like the claim.
-- ============================================================================

create or replace function ai_release_message(p_gym uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_monthly int; v_month int; v_done int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_claim:' || p_gym::text));
  update ai_usage_days set messages = messages - 1
   where gym_id = p_gym and member_id = p_member and day = manila_today() and messages > 0
  returning 1 into v_done;
  if v_done is null then return; end if;
  select coalesce(s.ai_monthly_messages, 1500) into v_monthly from gym_settings s where s.gym_id = p_gym;
  v_monthly := coalesce(v_monthly, 1500);
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = p_gym and u.day >= date_trunc('month', manila_today())::date;
  -- At or past the allowance even without this message: it was paid from a top-up.
  if v_month >= v_monthly then
    update gym_ai_credits set balance = balance + 1, updated_at = now() where gym_id = p_gym;
  end if;
end;
$$;
revoke all on function ai_release_message(uuid, uuid) from public, anon, authenticated;
grant execute on function ai_release_message(uuid, uuid) to service_role;

create or replace function migration_0195_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0195_applied() from public, anon;
grant execute on function migration_0195_applied() to authenticated;
comment on function migration_0195_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0195.sql
