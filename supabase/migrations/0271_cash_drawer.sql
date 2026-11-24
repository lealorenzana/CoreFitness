-- ============================================================================
-- 0271 — The cash drawer: carry over, cash taken out, and an automatic close.
--
-- The owner (2026-11-24): "the owner collects the cash, so the drawer is empty
-- but the system still says ₱3,000". Three changes, each the owner's pick:
--
-- 1. CARRY OVER. A day starts with what was left at the last close (its count),
--    not ₱0. Closes made before 0271 have `carried` NULL: they were counted
--    under the old rule (the drawer emptied every night), so they carry ₱0.
--    Cash that moves on a day AFTER that day was closed early (a payment, a
--    refund, a hand over at 10 pm) is carried into the next day too:
--      opening(D) = last close L before D: L.carried + (L.opening + net(L.day) − L.expected)
--                   + net of every unclosed day between L and D.
-- 2. CASH TAKEN OUT (`cash_outs`): "Handed to the owner" (a collection) or
--    "Paid out" (spent from the drawer, with what for). Written only by definer
--    functions, logged in the activity log, voided (never deleted) by an admin
--    with a reason. drawer = opening + cash in − refunds − handed over − paid out.
-- 3. AUTOMATIC CLOSE. A past day with cash movement and no close is closed at
--    the expected amount and marked `auto` ("nobody counted"). pg_cron is
--    optional here (CLAUDE.md, Notifications): the job runs at 00:05 Manila
--    when pg_cron exists, AND the admin's Payments page runs the same sweep for
--    its gym on load, so a gym without pg_cron is closed the next time anyone
--    opens Money. Only the last 7 days are swept (the date picker's reach).
--    The desk may replace an automatic close with a real count, once, without
--    an admin; the automatic one is kept in `previous`.
--
-- Paste after 0270. Re-runnable.
-- ============================================================================

alter table cash_closeouts
  add column if not exists opening numeric(12,2),
  add column if not exists carried numeric(12,2),
  add column if not exists handed_over numeric(12,2) not null default 0,
  add column if not exists paid_out numeric(12,2) not null default 0,
  add column if not exists auto boolean not null default false;

-- ---- 1. cash taken out of the drawer -------------------------------------------------------------------
create table if not exists cash_outs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('handed_over', 'paid_out')),
  amount      numeric(12,2) not null check (amount > 0),
  /** Who took the cash (handed over: the owner or staff who collected it). */
  taken_by    uuid references profiles(id) on delete set null,
  note        text check (note is null or length(note) <= 300),
  recorded_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid references profiles(id) on delete set null,
  void_reason text
);
create index if not exists cash_outs_gym_day on cash_outs (gym_id, day);

alter table cash_outs enable row level security;
drop policy if exists cash_outs_read_desk on cash_outs;
create policy cash_outs_read_desk on cash_outs for select using (is_front_desk());
drop policy if exists tenant_select on cash_outs;
create policy tenant_select on cash_outs as restrictive for select using (gym_id = current_gym_id());
drop policy if exists staff_area_read on cash_outs;
create policy staff_area_read on cash_outs as restrictive for select using (staff_may('payments'));
-- No insert/update/delete policy for anyone: record_cash_out() and void_cash_out() only.
revoke all on cash_outs from anon;
grant select on cash_outs to authenticated;

-- ---- 2. what moved through the drawer, over a range of days (internal) ---------------------------------
create or replace function cash_moves(p_gym uuid, p_from date, p_to date)
returns table (cash_in numeric, payment_count int, refunds_out numeric, handed_over numeric, paid_out numeric)
language sql stable security definer set search_path = public as $$
  select
    (select coalesce(sum(p.amount), 0) from payments p
      where p.gym_id = p_gym and p.status = 'completed' and lower(p.method) = 'cash'
        and coalesce(p.paid_on, (p.created_at at time zone 'Asia/Manila')::date) between p_from and p_to)
    + (select coalesce(sum(s.total), 0) from shop_sales s
        where s.gym_id = p_gym and s.sale_day between p_from and p_to and s.voided_at is null)
    + (select coalesce(sum(v.amount), 0) from guest_visits v
        where v.gym_id = p_gym and v.visit_day between p_from and p_to and v.voided_at is null and v.method = 'cash'),
    ((select count(*) from payments p
       where p.gym_id = p_gym and p.status = 'completed' and lower(p.method) = 'cash'
         and coalesce(p.paid_on, (p.created_at at time zone 'Asia/Manila')::date) between p_from and p_to)
     + (select count(*) from shop_sales s
         where s.gym_id = p_gym and s.sale_day between p_from and p_to and s.voided_at is null)
     + (select count(*) from guest_visits v
         where v.gym_id = p_gym and v.visit_day between p_from and p_to and v.voided_at is null and v.method = 'cash' and v.amount > 0))::int,
    (select coalesce(sum(e.refund_amount), 0) from membership_events e
      where e.gym_id = p_gym and e.refund_amount is not null
        and (e.created_at at time zone 'Asia/Manila')::date between p_from and p_to),
    (select coalesce(sum(o.amount), 0) from cash_outs o
      where o.gym_id = p_gym and o.kind = 'handed_over' and o.voided_at is null and o.day between p_from and p_to),
    (select coalesce(sum(o.amount), 0) from cash_outs o
      where o.gym_id = p_gym and o.kind = 'paid_out' and o.voided_at is null and o.day between p_from and p_to);
$$;

create or replace function cash_net(p_gym uuid, p_from date, p_to date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(m.cash_in - m.refunds_out - m.handed_over - m.paid_out, 0) from cash_moves(p_gym, p_from, p_to) m;
$$;

-- What the drawer held when day p_day began (see the header for the rule).
create or replace function cash_opening(p_gym uuid, p_day date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  l cash_closeouts;
  v numeric := 0;
begin
  select * into l from cash_closeouts where gym_id = p_gym and day < p_day order by day desc limit 1;
  if l.day is null then return 0; end if;
  if l.carried is not null then
    v := l.carried + (coalesce(l.opening, 0) + cash_net(p_gym, l.day, l.day) - l.expected);
  end if;
  if l.day + 1 <= p_day - 1 then
    v := v + cash_net(p_gym, l.day + 1, p_day - 1);
  end if;
  return v;
end;
$$;

revoke all on function cash_moves(uuid, date, date) from public, anon, authenticated;
revoke all on function cash_net(uuid, date, date) from public, anon, authenticated;
revoke all on function cash_opening(uuid, date) from public, anon, authenticated;

-- ---- 3. the day's summary (the screen) -----------------------------------------------------------------
drop function if exists cash_day_summary(date);
create function cash_day_summary(p_day date)
returns table (day date, opening numeric, cash_in numeric, refunds_out numeric, handed_over numeric, paid_out numeric,
               expected numeric, payment_count integer, closed boolean, auto boolean, counted numeric, difference numeric,
               note text, closed_by_name text, closed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_open numeric;
  m record;
begin
  if auth.uid() is null or not is_front_desk() or not staff_may('payments') then
    raise exception 'Only the front desk can see the cash drawer' using errcode = '42501';
  end if;
  v_open := cash_opening(v_gym, p_day);
  select * into m from cash_moves(v_gym, p_day, p_day);
  return query
  select p_day, v_open, m.cash_in, m.refunds_out, m.handed_over, m.paid_out,
         v_open + m.cash_in - m.refunds_out - m.handed_over - m.paid_out, m.payment_count,
         c.day is not null, coalesce(c.auto, false), c.counted, c.difference, c.note,
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), c.closed_at
    from (select 1) one
    left join cash_closeouts c on c.gym_id = v_gym and c.day = p_day
    left join profiles pr on pr.id = c.closed_by;
end;
$$;
revoke all on function cash_day_summary(date) from public, anon;
grant execute on function cash_day_summary(date) to authenticated;

-- ---- 4. closing a day by hand ("Close the day now") ----------------------------------------------------
create or replace function close_cash_day(p_day date, p_counted numeric, p_note text default null)
returns cash_closeouts
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_open numeric;
  m record;
  v_expected numeric;
  existing cash_closeouts;
  result cash_closeouts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not is_front_desk() or not staff_may('payments') then
    raise exception 'Only the front desk can close the cash drawer' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now, so the drawer cannot be closed.';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Type the amount counted in the drawer';
  end if;
  if p_day > (now() at time zone 'Asia/Manila')::date then
    raise exception 'That day has not happened yet';
  end if;
  v_open := cash_opening(v_gym, p_day);
  select * into m from cash_moves(v_gym, p_day, p_day);
  v_expected := v_open + m.cash_in - m.refunds_out - m.handed_over - m.paid_out;
  if p_counted <> v_expected and v_note is null then
    raise exception 'The count is off by %. Add a note saying why before closing.', abs(p_counted - v_expected);
  end if;
  select * into existing from cash_closeouts where gym_id = v_gym and day = p_day;
  if existing.day is not null then
    -- An automatic close is the system's guess: the desk may put a real count over it.
    if not existing.auto then
      if coalesce(get_my_role()::text, '') <> 'admin' then
        raise exception 'This day is already closed. Only an admin can redo it.';
      end if;
      if v_note is null then
        raise exception 'Redoing a close needs a note saying why';
      end if;
    end if;
    update cash_closeouts
       set expected = v_expected, counted = p_counted, payment_count = m.payment_count,
           refunds_out = m.refunds_out, handed_over = m.handed_over, paid_out = m.paid_out,
           opening = v_open, carried = p_counted, auto = false,
           note = v_note, closed_by = auth.uid(), closed_at = now(),
           previous = jsonb_build_object('counted', existing.counted, 'expected', existing.expected,
                                         'note', existing.note, 'closed_by', existing.closed_by,
                                         'closed_at', existing.closed_at, 'auto', existing.auto)
     where gym_id = v_gym and day = p_day
     returning * into result;
  else
    insert into cash_closeouts (gym_id, day, expected, counted, payment_count, refunds_out, handed_over, paid_out,
                                opening, carried, auto, note, closed_by)
    values (v_gym, p_day, v_expected, p_counted, m.payment_count, m.refunds_out, m.handed_over, m.paid_out,
            v_open, p_counted, false, v_note, auth.uid())
    returning * into result;
  end if;
  perform log_activity('cash.close', 'cash_closeouts', null, null,
    'Closed the drawer for ' || to_char(p_day, 'Mon FMDD') || ': counted ₱' || to_char(p_counted, 'FM999,999,990.00')
      || case when p_counted = v_expected then ', matches' else ', expected ₱' || to_char(v_expected, 'FM999,999,990.00') end,
    jsonb_build_object('day', p_day, 'counted', p_counted, 'expected', v_expected), v_gym);
  return result;
end;
$$;
revoke all on function close_cash_day(date, numeric, text) from public, anon;
grant execute on function close_cash_day(date, numeric, text) to authenticated;

-- ---- 5. the automatic close ----------------------------------------------------------------------------
-- Internal: closes one gym's past days (the last 7) that moved cash and were never closed, oldest first,
-- so each one's opening is the day before's close.
create or replace function auto_close_cash_days_for(p_gym uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  d date;
  v_open numeric;
  m record;
  v_expected numeric;
  n int := 0;
begin
  if p_gym is null or not gym_writable(p_gym) then return 0; end if;
  for d in select g::date from generate_series(v_today - 7, v_today - 1, interval '1 day') g order by 1 loop
    continue when exists (select 1 from cash_closeouts where gym_id = p_gym and day = d);
    select * into m from cash_moves(p_gym, d, d);
    continue when m.cash_in = 0 and m.refunds_out = 0 and m.handed_over = 0 and m.paid_out = 0;
    v_open := cash_opening(p_gym, d);
    v_expected := v_open + m.cash_in - m.refunds_out - m.handed_over - m.paid_out;
    insert into cash_closeouts (gym_id, day, expected, counted, payment_count, refunds_out, handed_over, paid_out,
                                opening, carried, auto, note, closed_by)
    values (p_gym, d, v_expected, greatest(v_expected, 0), m.payment_count, m.refunds_out, m.handed_over, m.paid_out,
            v_open, greatest(v_expected, 0), true, null, null)
    on conflict do nothing;
    if found then
      n := n + 1;
      perform log_activity('cash.auto_close', 'cash_closeouts', null, null,
        'The drawer for ' || to_char(d, 'Mon FMDD') || ' closed automatically at ₱' || to_char(v_expected, 'FM999,999,990.00') || ' (nobody counted)',
        jsonb_build_object('day', d, 'expected', v_expected), p_gym);
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function auto_close_cash_days_for(uuid) from public, anon, authenticated;

-- The screen's sweep: the caller's own gym.
create or replace function auto_close_cash_days() returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_front_desk() then return 0; end if;
  return auto_close_cash_days_for(current_gym_id());
end;
$$;
revoke all on function auto_close_cash_days() from public, anon;
grant execute on function auto_close_cash_days() to authenticated;

-- pg_cron's: every gym.
create or replace function auto_close_cash_days_all() returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; n int := 0;
begin
  for g in select id from gyms loop
    n := n + auto_close_cash_days_for(g);
  end loop;
  return n;
end;
$$;
revoke all on function auto_close_cash_days_all() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 00:05 Manila = 16:05 UTC.
    perform cron.schedule('cash-auto-close', '5 16 * * *', $inner$ select auto_close_cash_days_all(); $inner$);
  end if;
exception when others then
  null;
end
$cron$;

-- ---- 6. taking cash out ---------------------------------------------------------------------------------
create or replace function record_cash_out(p_kind text, p_amount numeric, p_taken_by uuid default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_who text;
begin
  if auth.uid() is null or not is_front_desk() or not staff_may('payments') then
    raise exception 'Only the front desk can take cash out of the drawer' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.';
  end if;
  if p_kind not in ('handed_over', 'paid_out') then
    raise exception 'Pick handed over or paid out.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Type the amount taken out.';
  end if;
  if p_kind = 'handed_over' then
    if p_taken_by is null or not exists (select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = p_taken_by
                                           and r.role in ('admin', 'staff') and r.status = 'active') then
      raise exception 'Pick who took the cash.';
    end if;
  elsif v_note is null then
    raise exception 'Say what the cash was spent on.';
  end if;
  -- Today may already be closed early: the cash out is still today's, and cash_opening carries it into tomorrow.
  insert into cash_outs (gym_id, day, kind, amount, taken_by, note, recorded_by)
  values (v_gym, v_today, p_kind, p_amount, p_taken_by, v_note, auth.uid())
  returning id into v_id;
  v_who := display_name_of(p_taken_by);
  perform log_activity('cash.' || p_kind, 'cash_outs', v_id, null,
    case when p_kind = 'handed_over'
      then '₱' || to_char(p_amount, 'FM999,999,990.00') || ' handed to ' || coalesce(v_who, 'someone') || ' from the drawer'
      else '₱' || to_char(p_amount, 'FM999,999,990.00') || ' paid out of the drawer: ' || v_note end,
    jsonb_build_object('amount', p_amount, 'kind', p_kind, 'taken_by', p_taken_by, 'note', v_note), v_gym);
  return v_id;
end;
$$;
revoke all on function record_cash_out(text, numeric, uuid, text) from public, anon;
grant execute on function record_cash_out(text, numeric, uuid, text) to authenticated;

create or replace function void_cash_out(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  o cash_outs;
begin
  if auth.uid() is null or coalesce(get_my_role()::text, '') <> 'admin' then
    raise exception 'Only an admin can undo a cash out.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why it is being undone.';
  end if;
  update cash_outs set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_id and gym_id = v_gym and voided_at is null
   returning * into o;
  if o.id is null then raise exception 'That cash out was not found, or is already undone.'; end if;
  perform log_activity('cash.void', 'cash_outs', o.id, null,
    'Undid ₱' || to_char(o.amount, 'FM999,999,990.00') || ' taken out on ' || to_char(o.day, 'Mon FMDD') || ': ' || btrim(p_reason),
    jsonb_build_object('amount', o.amount, 'reason', btrim(p_reason)), v_gym);
end;
$$;
revoke all on function void_cash_out(uuid, text) from public, anon;
grant execute on function void_cash_out(uuid, text) to authenticated;

-- ---- 7. tenancy: cash_outs is one gym's ---------------------------------------------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments',
    -- 0245: reels.
    'gym_reels','reel_likes',
    -- 0246: the gym chat.
    'gym_chat_messages','gym_chat_reactions','gym_chat_people','gym_chat_reports',
    -- 0259: time slots.
    'slot_templates','slot_bookings',
    -- 0260: repeats and pauses.
    'booking_repeats','booking_repeat_weeks','booking_pauses',
    -- 0271: cash taken out of the drawer.
    'cash_outs']::text[]
$$;

create or replace function migration_0271_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0271_applied() to anon, authenticated;

-- ============================================================================
-- VERIFICATION (in Core Fitness Lab, signed in as its owner)
--   select * from cash_day_summary((now() at time zone 'Asia/Manila')::date);
--   select record_cash_out('handed_over', 100, auth.uid(), 'test');  -- expected drops by 100
--   select auto_close_cash_days();                                   -- run twice; the second returns 0
-- ============================================================================
