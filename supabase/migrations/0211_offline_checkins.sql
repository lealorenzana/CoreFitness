-- ============================================================================
-- 0211 — A check-in scanned with no connection is recorded when it comes back
-- ============================================================================
-- The kiosk and the desk check members in against the database, so when the
-- gym's internet dropped, the door stopped: every scan failed. The member app's
-- QR code carries the member's id and when it was made, and the desk already
-- holds its roster, so a scan can be *read* offline — it just cannot be
-- checked against the rules until the connection is back.
--
-- record_offline_checkin() is that check, run later: the desk's device sends
-- each saved scan with the time it was scanned, and this records it as a visit
-- at THAT time — or says why not — applying the rules to the scanned day:
--
--   * the member belongs to this gym (an active member here);
--   * not already checked in that Manila day (the desk's own rule, enforced here);
--   * a usable membership on that day (active and not past expiry, or cancelled
--     but paid up to then — as membership_is_usable() reads today), or a day
--     pass for that day (0194);
--   * scanned no more than 72 hours ago and not in the future (5 minutes of
--     clock grace) — a queue is for an outage, not a backlog to rewrite history.
--
-- It answers in one word the desk shows in a sentence: recorded, duplicate,
-- frozen, no_membership, not_member, too_old, future. Front desk only.
-- ============================================================================

create or replace function record_offline_checkin(
  p_member uuid, p_scanned_at timestamptz, p_method text default 'qr', p_source text default 'kiosk', p_activity text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_day date;
  m record;
  v_ok boolean;
begin
  if not is_front_desk() or not gym_writable() then
    raise exception 'Only the front desk records check-ins.' using errcode = '42501';
  end if;
  if p_scanned_at is null or p_scanned_at > now() + interval '5 minutes' then return 'future'; end if;
  if p_scanned_at < now() - interval '72 hours' then return 'too_old'; end if;

  -- One scan of one member at a time, so two devices flushing at once cannot both record the day.
  perform pg_advisory_xact_lock(hashtext('offline_checkin:' || p_member::text));
  perform act_as_gym(v_gym);

  if not exists (select 1 from member_profiles mp
                   join gym_roles r on r.user_id = mp.profile_id and r.gym_id = mp.gym_id
                  where mp.profile_id = p_member and mp.gym_id = v_gym and r.role = 'member' and r.status = 'active') then
    return 'not_member';
  end if;

  v_day := (p_scanned_at at time zone 'Asia/Manila')::date;
  if exists (select 1 from attendance a
              where a.gym_id = v_gym and a.member_id = p_member
                and (a.check_in_time at time zone 'Asia/Manila')::date = v_day) then
    return 'duplicate';
  end if;

  select * into m from current_membership_of(p_member);
  v_ok := m.status is not null and case m.status::text
    when 'active'    then coalesce(m.never_expires, false) or (m.expiry_date is not null and m.expiry_date >= v_day)
    when 'cancelled' then m.expiry_date is not null and m.expiry_date >= v_day
    else false end;
  if not v_ok then
    v_ok := coalesce(has_day_pass(p_member, v_gym, v_day), false);
  end if;
  if not v_ok then
    return case when m.status::text = 'frozen' then 'frozen' else 'no_membership' end;
  end if;

  insert into attendance (gym_id, member_id, check_in_time, method, recorded_by, activity, source)
  values (v_gym, p_member, p_scanned_at,
          (case when p_method = 'manual' then 'manual' else 'qr' end)::checkin_method,
          auth.uid(), nullif(btrim(p_activity), ''),
          case when p_source = 'desk' then 'desk' else 'kiosk' end);
  return 'recorded';
end;
$$;
revoke all on function record_offline_checkin(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function record_offline_checkin(uuid, timestamptz, text, text, text) to authenticated;

create or replace function migration_0211_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0211_applied() to anon, authenticated;
