-- 0283 — Help for the owner and the front desk: an assistant in the admin app that answers "how do I…"
-- from the setup guides and the gym's documents (0282's search), with links (plan
-- docs/superpowers/plans/2026-11-27-rag.md). Owner's decisions, 2026-11-27:
--
--   * It uses the gym's AI messages: the same monthly allowance and prepaid top-ups as the member
--     Assistant (0143, 0189), counted in the same ai_usage_days, so Your app shows one total.
--   * Its own daily limit per staff account, an owner setting (gym_settings.ai_staff_daily_messages,
--     20 to start), so one busy desk cannot use the members' month.
--   * Only the gym's owner and front desk (gym_roles admin or staff, active). It is on when the gym's
--     Assistant is on: one switch for the gym's AI.
-- Safe to paste again.

alter table gym_settings add column if not exists ai_staff_daily_messages int not null default 20;
alter table gym_settings drop constraint if exists gym_settings_ai_staff_daily_check;
alter table gym_settings add constraint gym_settings_ai_staff_daily_check check (ai_staff_daily_messages between 1 and 200);

/** As the caller: may they ask Help now, and how much is left today. */
create or replace function staff_help_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_gym uuid := current_gym_id();
  v_daily int; v_monthly int; v_today int; v_month int; v_credits int; v_reason text;
begin
  select coalesce(s.ai_staff_daily_messages, 20), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = v_gym;
  v_daily := coalesce(v_daily, 20); v_monthly := coalesce(v_monthly, 1500);
  select coalesce(sum(u.messages), 0) into v_today from ai_usage_days u
   where u.gym_id = v_gym and u.member_id = v_me and u.day = manila_today();
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = v_gym and u.day >= date_trunc('month', manila_today())::date;
  select coalesce((select balance from gym_ai_credits where gym_id = v_gym), 0) into v_credits;
  v_reason := case
    when v_me is null or v_gym is null or not exists (
      select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = v_me
         and r.role in ('admin', 'staff') and r.status = 'active') then 'not_staff'
    when not gym_module_on(v_gym, 'assistant') then 'switched_off'
    when v_month >= v_monthly and v_credits <= 0 then 'monthly_limit'
    when v_today >= v_daily then 'daily_limit'
  end;
  return jsonb_build_object('gym_id', v_gym, 'allowed', v_reason is null, 'reason', v_reason,
    'used_today', v_today, 'daily_limit', v_daily);
end;
$$;
revoke all on function staff_help_status() from public, anon;
grant execute on function staff_help_status() to authenticated;

/**
 * For staff-help (service role): claim one message before the model is called, atomically with the
 * limits. The staff daily limit replaces the members' one; the monthly allowance and top-ups are
 * the gym's, exactly as ai_claim_message spends them.
 */
create or replace function staff_help_claim(p_gym uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_daily int; v_monthly int; v_today int; v_month int; v_left int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_claim:' || p_gym::text));   -- the same lock as members' claims
  if not exists (select 1 from gym_roles r where r.gym_id = p_gym and r.user_id = p_user
                   and r.role in ('admin', 'staff') and r.status = 'active') then
    return false;
  end if;
  select coalesce(s.ai_staff_daily_messages, 20), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = p_gym;
  v_daily := coalesce(v_daily, 20); v_monthly := coalesce(v_monthly, 1500);
  select coalesce(sum(u.messages), 0) into v_today from ai_usage_days u
   where u.gym_id = p_gym and u.member_id = p_user and u.day = manila_today();
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = p_gym and u.day >= date_trunc('month', manila_today())::date;
  if v_today >= v_daily then return false; end if;
  if v_month >= v_monthly then
    update gym_ai_credits set balance = balance - 1, updated_at = now()
     where gym_id = p_gym and balance > 0 returning balance into v_left;
    if v_left is null then return false; end if;
  end if;
  insert into ai_usage_days (gym_id, member_id, day, messages) values (p_gym, p_user, manila_today(), 1)
  on conflict (gym_id, member_id, day) do update set messages = ai_usage_days.messages + 1;
  return true;
end;
$$;
revoke all on function staff_help_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function staff_help_claim(uuid, uuid) to service_role;

/** The owner's setting: Help messages per staff account per day (Your app → the AI card). */
create or replace function set_staff_help_limit(p_daily int) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_n int;
begin
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid() and r.role = 'admin' and r.status = 'active') then
    raise exception 'Only the gym''s owner can change Help''s limit.' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.' using errcode = '42501';
  end if;
  if p_daily is null or p_daily not between 1 and 200 then
    raise exception 'Help''s daily limit is 1 to 200 messages.' using errcode = '22023';
  end if;
  update gym_settings set ai_staff_daily_messages = p_daily where gym_id = v_gym;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'This gym has no settings yet. Finish setting it up first.'; end if;
end;
$$;
revoke all on function set_staff_help_limit(int) from public, anon;
grant execute on function set_staff_help_limit(int) to authenticated;

create or replace function migration_0283_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0283_applied() to anon, authenticated;
