-- ============================================================================
-- 0194 — Day passes, bought in the app
-- ============================================================================
--
-- C8b. Someone without a running membership (expired, on the free tier, or new)
-- buys a day pass in the app — through the gym's own PayMongo account (0192), at
-- the gym's day-pass price (Settings → Walk-ins, 0185). For that Manila day:
--   * the desk and kiosk let them in (has_day_pass(), read by the check-in);
--   * they may book a class held that same day, if the owner allows it
--     (gym_settings.day_pass_classes, off by default) — no plan, no weekly quota,
--     the waiver still applies (enforce_class_booking_entitlement, 0119's, with
--     the day-pass door added first);
--   * they keep what the free tier gives (0186) and never coaching.
-- The money is an ordinary completed payment (revenue, their history), the pass
-- a `day_passes` row (RLS on, no policy — read through definer functions).
-- prepare/settle are 0193's, redefined in full with the day pass added.
-- ============================================================================

alter table gym_settings add column if not exists day_pass_classes boolean not null default false;

create table if not exists day_passes (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  member_id   uuid not null references profiles(id) on delete cascade,
  day         date not null,
  payment_id  uuid references payments(id) on delete set null,
  checkout_id uuid references paymongo_checkouts(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (gym_id, member_id, day)
);
alter table day_passes enable row level security;   -- no policy

create or replace function has_day_pass(p_member uuid, p_gym uuid, p_day date default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from day_passes d where d.member_id = p_member and d.gym_id = p_gym
                   and d.day = coalesce(p_day, manila_today()));
$$;
revoke all on function has_day_pass(uuid, uuid, date) from public, anon, authenticated;

/** For the desk and kiosk: does this member hold today's day pass at this gym? */
create or replace function member_has_day_pass(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_front_desk() and has_day_pass(p_member, current_gym_id());
$$;
revoke all on function member_has_day_pass(uuid) from public, anon;
grant execute on function member_has_day_pass(uuid) to authenticated;

/** For the member: today's pass, and whether one can be bought here (and for how much). */
create or replace function my_day_pass() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); s gym_settings; v_cur record; v_running boolean;
begin
  if auth.uid() is null then return null; end if;
  select * into s from gym_settings where gym_id = v_gym;
  perform act_as_gym(v_gym);
  select * into v_cur from current_membership_of(auth.uid());
  v_running := v_cur.status is not null and membership_is_usable(v_cur.status, v_cur.expiry_date, v_cur.never_expires)
               and coalesce((select p.price from membership_plans p where p.id = v_cur.plan_id), 0) > 0;
  return jsonb_build_object(
    'today', has_day_pass(auth.uid(), v_gym),
    'on', coalesce(s.day_pass_on, false) and coalesce(s.day_pass_price, 0) > 0,
    'price', s.day_pass_price,
    'classes', coalesce(s.day_pass_classes, false),
    'online', payment_account_of(v_gym) is not null,
    'needed', not v_running);
end;
$$;
revoke all on function my_day_pass() from public, anon;
grant execute on function my_day_pass() to authenticated;

/** The owner: may a day-pass guest book a class that day? */
create or replace function set_day_pass_classes(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'admin' then
    raise exception 'The owner decides this.' using errcode = '42501';
  end if;
  update gym_settings set day_pass_classes = coalesce(p_on, false) where gym_id = current_gym_id();
end;
$$;
revoke all on function set_day_pass_classes(boolean) from public, anon;
grant execute on function set_day_pass_classes(boolean) to authenticated;

create or replace function paymongo_prepare_member(p_purpose text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_me uuid := auth.uid(); v_details jsonb := coalesce(p_details, '{}'::jsonb);
        v_plan membership_plans; v_cur record; v_account uuid; v_amount numeric; v_desc text; c coachings; v_id uuid;
begin
  if v_me is null or storage_role_here() is distinct from 'member' then
    raise exception 'Only a member pays here.' using errcode = '42501';
  end if;
  perform act_as_gym(v_gym);
  if p_purpose = 'membership' then
    select * into v_cur from current_membership_of(v_me);
    if v_cur.status is not null and v_cur.status::text = 'frozen' then
      raise exception 'Your membership is frozen. Ask the desk to unfreeze it first.';
    end if;
    select * into v_plan from membership_plans
     where id = coalesce(nullif(v_details->>'plan_id', '')::uuid, v_cur.plan_id) and gym_id = v_gym;
    if v_plan.id is null or not v_plan.is_active or coalesce(v_plan.price_unset, false) then
      raise exception 'That plan is not on sale.';
    end if;
    if coalesce(v_plan.price, 0) <= 0 then raise exception 'That plan is free — there is nothing to pay.'; end if;
    -- 0193: a DIFFERENT plan while a paid one is still running is a switch, and a switch mid-term is the
    -- desk's (a refund or a credit for the days left). Online: renew the same plan any time, or switch once
    -- the current one has ended (or from the free tier).
    if v_cur.plan_id is not null and v_plan.id <> v_cur.plan_id
       and membership_is_usable(v_cur.status, v_cur.expiry_date, v_cur.never_expires)
       and coalesce((select p.price from membership_plans p where p.id = v_cur.plan_id), 0) > 0 then
      raise exception 'You are on % until %. Renew it now, or switch plans at the desk so nothing you have paid is lost.',
        (select p.name from membership_plans p where p.id = v_cur.plan_id),
        coalesce(to_char(v_cur.expiry_date, 'FMMonth FMDD'), 'it ends');
    end if;
    v_account := payment_account_of(v_gym);
    v_amount := v_plan.price;
    v_details := jsonb_build_object('plan_id', v_plan.id);
    v_desc := v_plan.name || ' — ' || (select name from gyms where id = v_gym);
  elsif p_purpose = 'day_pass' then
    -- 0194: a day of the gym for someone without a running membership, at the gym's own price.
    if not coalesce((select s.day_pass_on from gym_settings s where s.gym_id = v_gym), false)
       or coalesce((select s.day_pass_price from gym_settings s where s.gym_id = v_gym), 0) <= 0 then
      raise exception 'This gym does not sell day passes in the app.';
    end if;
    select * into v_cur from current_membership_of(v_me);
    if v_cur.status is not null and membership_is_usable(v_cur.status, v_cur.expiry_date, v_cur.never_expires)
       and coalesce((select p.price from membership_plans p where p.id = v_cur.plan_id), 0) > 0 then
      raise exception 'Your membership is running — no day pass needed.';
    end if;
    if has_day_pass(v_me, v_gym) then raise exception 'You already have today''s day pass.'; end if;
    v_account := payment_account_of(v_gym);
    v_amount := (select s.day_pass_price from gym_settings s where s.gym_id = v_gym);
    v_details := jsonb_build_object('day', manila_today());
    v_desc := 'Day pass, ' || to_char(manila_today(), 'FMMonth FMDD') || ' — ' || (select name from gyms where id = v_gym);
  elsif p_purpose = 'coaching' then
    select * into c from coachings where id = nullif(v_details->>'coaching_id', '')::uuid and gym_id = v_gym;
    if c.id is null or c.member_id is distinct from v_me then raise exception 'That is not your coaching.' using errcode = '42501'; end if;
    if c.status not in ('awaiting_payment', 'payment_sent') then raise exception 'Nothing to pay on this one.'; end if;
    if c.fee_mode not in ('gym_priced', 'trainer_direct') or coalesce(c.price, 0) <= 0 then
      raise exception 'This coaching has no price to pay online.';
    end if;
    v_account := payment_account_of(v_gym, case when c.fee_mode = 'trainer_direct' then c.trainer_id end);
    v_amount := c.price;
    v_details := jsonb_build_object('coaching_id', c.id);
    v_desc := 'Coaching, ' || c.months || ' month' || case when c.months = 1 then '' else 's' end || ' with ' || display_name_of(c.trainer_id);
  else
    raise exception 'Unknown payment.';
  end if;
  if v_account is null then
    raise exception 'Online payment is not set up for this yet. Pay at the desk, or send the reference instead.';
  end if;
  insert into paymongo_checkouts (account, gym_id, member_id, purpose, details, amount, description)
  values (v_account::text, v_gym, v_me, p_purpose, v_details, v_amount, v_desc)
  returning id into v_id;
  perform act_as_gym(null);
  return jsonb_build_object('id', v_id, 'amount', v_amount, 'description', v_desc);
end;
$$;
revoke all on function paymongo_prepare_member(text, jsonb) from public, anon;
grant execute on function paymongo_prepare_member(text, jsonb) to authenticated;

create or replace function paymongo_settle(p_session text, p_payment text, p_amount_centavos int, p_method text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare c paymongo_checkouts; v_from date; v_until date; v_result uuid; v_owner record; v_msg text;
        m memberships; v_plan membership_plans; v_today date := manila_today(); v_new_expiry date; k coachings;
        v_label text := 'PayMongo' || coalesce(' · ' || p_method, '');
begin
  select * into c from paymongo_checkouts where checkout_session_id = p_session for update;
  if c.id is null then return 'unknown session'; end if;
  if c.status = 'paid' then return 'already settled'; end if;
  if exists (select 1 from paymongo_checkouts where payment_id = p_payment) then return 'payment already used'; end if;
  if p_amount_centavos is distinct from (c.amount * 100)::int then
    update paymongo_checkouts set status = 'failed' where id = c.id;
    perform platform_log(c.gym_id, 'paymongo.amount_mismatch',
      'A PayMongo payment did not match its checkout (' || p_amount_centavos || ' centavos for ' || c.amount || ')',
      jsonb_build_object('checkout', c.id, 'payment', p_payment));
    return 'amount mismatch';
  end if;
  perform act_as_gym(c.gym_id);

  if c.purpose = 'gym_subscription' then
    v_from := greatest(coalesce((select paid_until from gyms where id = c.gym_id), v_today - 1), v_today - 1) + 1;
    v_until := (v_from + make_interval(months => (c.details->>'months')::int))::date - 1;
    insert into gym_payments (gym_id, amount, paid_on, covers_from, covers_until, method, reference, note, plan_key, recorded_by)
    values (c.gym_id, c.amount, v_today, v_from, v_until, v_label, p_payment, 'Paid online', c.details->>'plan', null)
    returning id into v_result;
    update gyms set paid_until = greatest(coalesce(paid_until, v_until), v_until) where id = c.gym_id;
    v_msg := 'Payment received — your plan is covered until ' || to_char(v_until, 'FMMonth FMDD, YYYY') || '.';
  elsif c.purpose = 'ai_topup' then
    insert into ai_topups (gym_id, packs, messages, amount, reference, status, decided_at, requested_by)
    values (c.gym_id, (c.details->>'packs')::int, (c.details->>'messages')::int, c.amount, p_payment, 'paid', now(), c.created_by)
    returning id into v_result;
    insert into gym_ai_credits (gym_id, balance) values (c.gym_id, (c.details->>'messages')::int)
    on conflict (gym_id) do update set balance = gym_ai_credits.balance + excluded.balance, updated_at = now();
    v_msg := (c.details->>'messages') || ' AI coach messages added. They never expire.';
  elsif c.purpose = 'custom_colours' then
    insert into gym_theme_unlocks (gym_id, theme_key, how, checkout_id) values (c.gym_id, 'custom_colours', 'paymongo', c.id)
    on conflict do nothing;
    v_msg := 'Custom colours are yours — set any colour code on Your app.';
  elsif c.purpose = 'membership' then
    -- The desk's renewal (recordPayment): a different plan first, then the payment, then the term.
    select * into v_plan from membership_plans where id = (c.details->>'plan_id')::uuid;
    select * into m from memberships where member_id = c.member_id and gym_id = c.gym_id order by created_at desc limit 1 for update;
    if m.id is null then
      insert into memberships (member_id, gym_id, plan_id, status, start_date)
      values (c.member_id, c.gym_id, v_plan.id, 'active', v_today) returning * into m;
    elsif m.plan_id is distinct from v_plan.id
          and membership_is_usable(m.status, m.expiry_date, m.never_expires)
          and coalesce((select p.price from membership_plans p where p.id = m.plan_id), 0) > 0 then
      -- 0193: paid for a different plan while a paid one still runs (a checkout opened before this rule).
      -- The money is recorded; the plan is not changed — the desk decides how to apply it.
      insert into payments (gym_id, member_id, membership_id, amount, method, status, notes, recorded_by, paid_on, plan_id, plan_name)
      values (c.gym_id, c.member_id, m.id, c.amount, v_label, 'completed',
              'Paid online for ' || v_plan.name || ' while on ' || (select p.name from membership_plans p where p.id = m.plan_id)
                || ' — not applied; the desk decides · ' || p_payment, null, v_today, v_plan.id, v_plan.name)
      returning id into v_result;
      update paymongo_checkouts set status = 'paid', payment_id = p_payment, method = p_method, paid_at = now(), result_id = v_result
       where id = c.id;
      perform notify_once(c.member_id, 'payment', 'Payment received',
        'We received ₱' || c.amount || ' for ' || v_plan.name || '. You are still on your current plan — the front desk will apply it with you.',
        '/member/membership', 'paymongo-' || c.id, c.gym_id);
      for v_owner in select user_id from gym_roles where gym_id = c.gym_id and role in ('admin', 'staff') and status = 'active' loop
        perform notify_once(v_owner.user_id, 'payment', 'Plan switch paid online',
          display_name_of(c.member_id) || ' paid ₱' || c.amount || ' for ' || v_plan.name || ' while their current plan is still running. Nothing was changed — decide how to apply it.',
          '/payments', 'paymongo-' || c.id || '-' || v_owner.user_id, c.gym_id);
      end loop;
      perform act_as_gym(null);
      return 'settled — switch left to the desk';
    elsif m.plan_id is distinct from v_plan.id then
      update memberships set plan_id = v_plan.id where id = m.id;
    end if;
    v_new_expiry := case when v_plan.duration_days is null then null
                         else (case when m.status::text = 'active' and m.expiry_date > v_today then m.expiry_date else v_today end)
                              + v_plan.duration_days end;
    insert into payments (gym_id, member_id, membership_id, amount, method, status, notes, recorded_by, paid_on, plan_id, plan_name)
    values (c.gym_id, c.member_id, m.id, c.amount, v_label, 'completed', 'Paid online · ' || p_payment, null, v_today, v_plan.id, v_plan.name)
    returning id into v_result;
    update memberships set status = 'active', expiry_date = v_new_expiry, never_expires = (v_plan.duration_days is null),
                           start_date = coalesce(start_date, v_today)
     where id = m.id;
    v_msg := 'Payment received — ' || v_plan.name || case when v_new_expiry is null then ' is yours.'
             else ' runs until ' || to_char(v_new_expiry, 'FMMonth FMDD, YYYY') || '.' end;
  elsif c.purpose = 'day_pass' then
    insert into payments (gym_id, member_id, amount, method, status, notes, recorded_by, paid_on)
    values (c.gym_id, c.member_id, c.amount, v_label, 'completed', 'Day pass · ' || to_char(v_today, 'FMMonth FMDD') || ' · paid online ' || p_payment, null, v_today)
    returning id into v_result;
    insert into day_passes (gym_id, member_id, day, payment_id, checkout_id)
    values (c.gym_id, c.member_id, v_today, v_result, c.id)
    on conflict (gym_id, member_id, day) do nothing;
    v_msg := 'Payment received — your day pass for today is ready. Show your check-in code at the desk.';
  elsif c.purpose = 'coaching' then
    select * into k from coachings where id = (c.details->>'coaching_id')::uuid for update;
    if k.fee_mode = 'gym_priced' then
      insert into payments (gym_id, member_id, amount, method, status, notes, recorded_by, paid_on)
      values (c.gym_id, c.member_id, c.amount, v_label, 'completed',
              'Coaching: ' || k.months || ' month' || case when k.months = 1 then '' else 's' end || ' with ' || display_name_of(k.trainer_id)
                || ' · paid online ' || p_payment, null, v_today)
      returning id into v_result;
    end if;
    update coachings set paid_at = now(), pay_reference = p_payment, payment_id = v_result, updated_at = now() where id = k.id;
    perform coaching_activate(k.id);
    v_msg := 'Payment received — your coaching with ' || display_name_of(k.trainer_id) || ' has started.';
  else
    return 'unknown purpose';
  end if;

  update paymongo_checkouts set status = 'paid', payment_id = p_payment, method = p_method, paid_at = now(), result_id = v_result
   where id = c.id;
  if c.member_id is not null then
    perform notify_once(c.member_id, 'payment', 'Payment received', v_msg,
      case when c.purpose = 'coaching' then '/member/coach' when c.purpose = 'day_pass' then '/member/home' else '/member/membership' end, 'paymongo-' || c.id, c.gym_id);
    for v_owner in select user_id from gym_roles where gym_id = c.gym_id and role in ('admin', 'staff') and status = 'active' loop
      perform notify_once(v_owner.user_id, 'payment', 'Paid online',
        display_name_of(c.member_id) || ' paid ₱' || c.amount || ' online: ' || c.description || '.',
        case when c.purpose = 'coaching' then '/coaching' else '/payments' end, 'paymongo-' || c.id || '-' || v_owner.user_id, c.gym_id);
    end loop;
  else
    for v_owner in select user_id from gym_roles where gym_id = c.gym_id and role = 'admin' and status = 'active' loop
      perform notify_once(v_owner.user_id, 'system', 'Payment received', v_msg, '/subscription', 'paymongo-' || c.id, c.gym_id);
    end loop;
    perform platform_log(c.gym_id, 'paymongo.paid', c.description || ' — paid online, ₱' || c.amount,
      jsonb_build_object('checkout', c.id, 'payment', p_payment, 'method', p_method));
  end if;
  perform act_as_gym(null);
  return 'settled';
end;
$$;
revoke all on function paymongo_settle(text, text, int, text) from public, anon, authenticated;
grant execute on function paymongo_settle(text, text, int, text) to service_role;

create or replace function enforce_class_booking_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_week date;
  block text;
begin
  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  -- 0194: a day-pass guest books a class on the pass's own day, where the owner allows it — no plan, no quota.
  if (m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires))
     and coalesce((select s.day_pass_classes from gym_settings s where s.gym_id = new.gym_id), false)
     and has_day_pass(new.member_id, new.gym_id,
                      (select (c.scheduled_at at time zone 'Asia/Manila')::date from classes c where c.id = new.class_id)) then
    block := waiver_blocks(new.member_id, new.gym_id);
    if block is not null then raise exception '%', block; end if;
    return new;
  end if;
  if m is null then
    raise exception 'You need an active membership to book a class.';
  end if;
  if not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_classes then
    raise exception 'Your plan does not include class booking. Upgrade at the front desk.';
  end if;

  if p.class_bookings_per_week is not null then
    select date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date
      into slot_week
      from classes c where c.id = new.class_id;

    select count(*) into used
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = new.member_id
       and b.gym_id = new.gym_id
       and b.status in ('pending', 'approved')
       and date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date = slot_week;

    if used >= p.class_bookings_per_week then
      raise exception 'Your plan allows % class(es) per week. You have already booked that week.',
        p.class_bookings_per_week;
    end if;
  end if;

  -- 0119, last: a member with no plan hears about the plan first.
  block := waiver_blocks(new.member_id, new.gym_id);
  if block is not null then raise exception '%', block; end if;

  return new;
end;
$$;

create or replace function migration_0194_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0194_applied() from public, anon;
grant execute on function migration_0194_applied() to authenticated;
comment on function migration_0194_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0194.sql
