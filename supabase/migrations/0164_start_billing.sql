-- ============================================================================
-- 0164 — The platform can start (or pause) billing a gym
-- ============================================================================
--
-- A gym locks only when it has a paid_until and that date plus the grace days
-- has passed (gym_lock_reason, 0111/0138). G Fitness — Gym #1, the founding
-- gym — has none, so Your plan said "Covered until —" and "Never locks", and
-- only a recorded payment could ever set one.
--
-- platform_set_billing(): the platform owner gives a gym a covered-until date
-- (start billing: it is covered until then, reminded before, read-only after
-- the grace days), or clears it (no billing — a founding or partner gym). The
-- gym's owner is told, with the date, and it is in the platform log.
-- ============================================================================

create or replace function platform_set_billing(p_gym uuid, p_paid_until date, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; a uuid;
begin
  if not is_platform_admin() then raise exception 'Only the platform sets a gym''s billing.' using errcode = '42501'; end if;
  select name into v_name from gyms where id = p_gym;
  if v_name is null then raise exception 'That gym does not exist.'; end if;
  if p_paid_until is not null and p_paid_until < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Covered-until is today or later — a past date would lock the gym at once.';
  end if;
  update gyms set paid_until = p_paid_until where id = p_gym;
  perform platform_log(p_gym, case when p_paid_until is null then 'billing.cleared' else 'billing.started' end,
    case when p_paid_until is null then v_name || ' needs no billing'
         else v_name || ' is billed — covered until ' || to_char(p_paid_until, 'Mon DD, YYYY') end
      || case when coalesce(btrim(p_note), '') = '' then '' else ': ' || btrim(p_note) end,
    jsonb_build_object('paid_until', p_paid_until));
  for a in select user_id from gym_roles where gym_id = p_gym and role = 'admin' and status = 'active' loop
    perform notify_once(a, 'system',
      case when p_paid_until is null then 'No billing for your gym' else 'Your Core Fitness plan is covered until ' || to_char(p_paid_until, 'Mon DD') end,
      case when p_paid_until is null then 'Core Fitness has set your gym as one that is not billed.'
           else 'Pay before then from Your plan to keep everything open. ' || coalesce(btrim(p_note), '') end,
      '/subscription', 'billing-set:' || p_gym || ':' || coalesce(p_paid_until::text, 'none'), p_gym);
  end loop;
end;
$$;
revoke all on function platform_set_billing(uuid, date, text) from public, anon;
grant execute on function platform_set_billing(uuid, date, text) to authenticated;

create or replace function migration_0164_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0164_applied() from public, anon;
grant execute on function migration_0164_applied() to authenticated;
comment on function migration_0164_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';
