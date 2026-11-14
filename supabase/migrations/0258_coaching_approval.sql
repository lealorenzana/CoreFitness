-- 0258 — gym styles phase 2: who approves a member's pick of a coach (2026-11-14).
--
-- The owner (the G Fitness way): a member looks at the coaches, taps "I want <coach> as my coach" for a package,
-- and "the coach/desk confirms then the coach is assigned — and there should be a customizable setting for whether
-- the desk approves also before assigning". Until now only the coach answered (0181). The owner now picks, like
-- 'Who approves bookings' (0180):
--   coach       the coach decides (today's behaviour, the default — nothing changes for any gym until it chooses)
--   desk        the owner or the front desk decides
--   coach_desk  the coach says yes first, then the desk confirms; only then is the coach assigned
-- A decline by either is final and the member is told. The coach's yes is kept on the row (coach_ok_at), so the
-- desk sees "<coach> said yes" and nothing is decided twice.

alter table gym_settings add column if not exists coaching_approval text not null default 'coach';
alter table gym_settings drop constraint if exists gym_settings_coaching_approval_check;
alter table gym_settings add constraint gym_settings_coaching_approval_check
  check (coaching_approval in ('coach', 'desk', 'coach_desk'));
alter table coachings add column if not exists coach_ok_at timestamptz;

create or replace function coaching_approval_mode(p_gym uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coaching_approval from gym_settings where gym_id = p_gym), 'coach');
$$;
revoke all on function coaching_approval_mode(uuid) from public, anon, authenticated;

-- What the screens show (the member's request, the coach's answer, the desk's queue): read by anyone in the gym.
create or replace function my_coaching_approval() returns text
language sql stable security definer set search_path = public as $$
  select coaching_approval_mode(current_gym_id());
$$;
revoke all on function my_coaching_approval() from public, anon;
grant execute on function my_coaching_approval() to authenticated;

create or replace function set_coaching_approval(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets who approves a coach.' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('coach', 'desk', 'coach_desk') then
    raise exception 'Choose the coach, the desk, or the coach then the desk.';
  end if;
  update gym_settings set coaching_approval = p_mode where gym_id = acting_gym_id();
end;
$$;
revoke all on function set_coaching_approval(text) from public, anon;
grant execute on function set_coaching_approval(text) to authenticated;

-- Tell the owner and the front desk (each their own row; the desk never reads the owner's, 0242).
create or replace function coaching_tell_desk(p_id uuid, p_title text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare c coachings; u record;
begin
  select * into c from coachings where id = p_id;
  for u in select gr.user_id from gym_roles gr
            where gr.gym_id = c.gym_id and gr.role in ('admin', 'staff') and gr.status = 'active' loop
    perform notify_once(u.user_id, 'booking', p_title, p_message, '/personal-training',
      'coaching:desk:' || p_id || ':' || u.user_id, c.gym_id);
  end loop;
end;
$$;
revoke all on function coaching_tell_desk(uuid, text, text) from public, anon, authenticated;

-- 0181's answer, now following the gym's choice. The member's answer to a coach's invitation is unchanged.
create or replace function respond_coaching(p_id uuid, p_accept boolean, p_price numeric default null) returns text
language plpgsql security definer set search_path = public as $$
declare c coachings; v_me uuid := auth.uid(); v_mode text;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.id is null then raise exception 'That request is not here any more.'; end if;
  if c.status = 'requested' and c.trainer_id = v_me then
    v_mode := coaching_approval_mode(c.gym_id);
    if v_mode = 'desk' then
      raise exception 'At this gym the front desk decides package requests.' using errcode = '42501';
    end if;
    if c.coach_ok_at is not null then
      raise exception 'You already said yes — the front desk confirms next.';
    end if;
    if not p_accept then
      update coachings set status = 'declined', updated_at = now() where id = p_id;
      perform notify_once(c.member_id, 'booking', 'Coaching request declined',
        display_name_of(v_me) || ' cannot take you on right now. Try another coach.', '/member/coach', 'coaching:no:' || p_id, c.gym_id);
      return 'declined';
    end if;
    if c.fee_mode = 'trainer_direct' then
      if p_price is null or p_price < 0 then raise exception 'Say what you charge for the % months (₱0 if nothing).', c.months; end if;
      update coachings set price = p_price where id = p_id;
    end if;
    if v_mode = 'coach_desk' then
      update coachings set coach_ok_at = now(), updated_at = now() where id = p_id;
      perform coaching_tell_desk(p_id, 'A coach said yes — confirm it',
        display_name_of(v_me) || ' will coach ' || display_name_of(c.member_id) || ' for ' || c.months || ' month'
          || case when c.months = 1 then '' else 's' end || '. Confirm it on Personal training.');
      perform notify_once(c.member_id, 'booking', 'Your coach said yes',
        display_name_of(v_me) || ' said yes. The front desk confirms next.', '/member/coach', 'coaching:coachok:' || p_id, c.gym_id);
      return 'coach_ok';
    end if;
    perform coaching_after_yes(p_id);
    return (select status from coachings where id = p_id);
  elsif c.status = 'invited' and c.member_id = v_me then
    if not p_accept then
      update coachings set status = 'declined', updated_at = now() where id = p_id;
      return 'declined';
    end if;
    perform coaching_after_yes(p_id);
    return (select status from coachings where id = p_id);
  end if;
  raise exception 'That is not yours to answer.' using errcode = '42501';
end;
$$;
revoke all on function respond_coaching(uuid, boolean, numeric) from public, anon;
grant execute on function respond_coaching(uuid, boolean, numeric) to authenticated;

-- The desk's answer: 'desk' decides alone; 'coach_desk' confirms after the coach's yes (or declines any time);
-- under 'coach' the desk steps in only when the coach is no longer active at the gym, so nothing is stranded (0203).
create or replace function desk_decide_coaching(p_id uuid, p_accept boolean, p_price numeric default null) returns text
language plpgsql security definer set search_path = public as $$
declare c coachings; v_mode text; v_role text;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.id is null then raise exception 'That request is not here any more.'; end if;
  v_role := role_in_gym(c.gym_id);
  if auth.uid() is null or v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the owner or the front desk decides here.' using errcode = '42501';
  end if;
  if c.status <> 'requested' then raise exception 'That request was already answered.'; end if;
  v_mode := coaching_approval_mode(c.gym_id);
  if v_mode = 'coach' and exists (select 1 from gym_roles gr where gr.gym_id = c.gym_id and gr.user_id = c.trainer_id
                                     and gr.role = 'trainer' and gr.status = 'active') then
    raise exception 'At this gym the coach decides package requests.' using errcode = '42501';
  end if;
  if not p_accept then
    update coachings set status = 'declined', updated_at = now() where id = p_id;
    perform notify_once(c.member_id, 'booking', 'Coaching request declined',
      'The front desk could not set up your package with ' || display_name_of(c.trainer_id) || '. Ask at the desk.',
      '/member/coach', 'coaching:no:' || p_id, c.gym_id);
    return 'declined';
  end if;
  if v_mode = 'coach_desk' and c.coach_ok_at is null then
    raise exception 'The coach says yes first. Then you confirm.';
  end if;
  if c.fee_mode = 'trainer_direct' and c.price is null then
    if p_price is null or p_price < 0 then
      raise exception 'Enter what % charges for the % months (₱0 if nothing).', display_name_of(c.trainer_id), c.months;
    end if;
    update coachings set price = p_price where id = p_id;
  end if;
  perform coaching_after_yes(p_id);
  perform notify_once(c.trainer_id, 'booking', 'A trainee is yours',
    'The front desk confirmed ' || display_name_of(c.member_id) || ' with you for ' || c.months || ' month'
      || case when c.months = 1 then '' else 's' end || '.', '/trainer/home', 'coaching:assigned:' || p_id, c.gym_id);
  return (select status from coachings where id = p_id);
end;
$$;
revoke all on function desk_decide_coaching(uuid, boolean, numeric) from public, anon;
grant execute on function desk_decide_coaching(uuid, boolean, numeric) to authenticated;

-- The member's and coach's own list, now with the coach's yes (0181's columns, plus coach_ok_at at the end).
drop function if exists my_coachings();
create function my_coachings() returns table (
  id uuid, member_id uuid, member_name text, member_photo text, trainer_id uuid, trainer_name text, trainer_photo text,
  kind text, room_id uuid, months int, status text, fee_mode text, price numeric, pay_reference text,
  pay_sent_at timestamptz, starts_on date, ends_on date, started_by text, created_at timestamptz,
  standin_id uuid, standin_trainer_id uuid, standin_name text, standin_from date, standin_to date,
  group_code text, i_am text, coach_ok_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.member_id, display_name_of(c.member_id), pm.photo_url, c.trainer_id, display_name_of(c.trainer_id), pt.photo_url,
         c.kind, c.room_id, c.months, c.status, c.fee_mode, c.price, c.pay_reference,
         c.pay_sent_at, c.starts_on, c.ends_on, c.started_by, c.created_at,
         s.id, s.trainer_id, case when s.id is null then null else display_name_of(s.trainer_id) end, s.starts_on, s.ends_on,
         case when c.kind = 'group' then r.join_code end,
         case when c.member_id = auth.uid() then 'member' when c.trainer_id = auth.uid() then 'coach' else 'standin' end,
         c.coach_ok_at
    from coachings c
    join profiles pm on pm.id = c.member_id
    join profiles pt on pt.id = c.trainer_id
    left join rooms r on r.id = c.room_id
    left join lateral (select * from coaching_standins x where x.coaching_id = c.id and x.ends_on >= manila_today()
                        order by x.starts_on limit 1) s on true
   where c.gym_id = current_gym_id()
     and (c.member_id = auth.uid() or c.trainer_id = auth.uid() or s.trainer_id = auth.uid())
   order by case c.status when 'active' then 0 when 'payment_sent' then 1 when 'awaiting_payment' then 2
                          when 'requested' then 3 when 'invited' then 3 else 9 end, c.created_at desc;
$$;
revoke all on function my_coachings() from public, anon;
grant execute on function my_coachings() to authenticated;

create or replace function migration_0258_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0258_applied() to anon, authenticated;
