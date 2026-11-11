-- ============================================================================
-- 0243 — The owner decides what an online plan switch does (2026-11-11)
-- ============================================================================
--
-- 0193 sent every mid-term plan switch to the desk. The owner (2026-11-11): a member should be able to switch
-- online, and the gym owner chooses how — keep the days already paid, or start the new plan now.
--
--   gym_settings.plan_switch_mode:
--     'keep_days'  (default) the new plan's term starts when the current one ends: nothing paid is lost —
--                  the same carry-over the desk's recordPayment does;
--     'start_now'  the new plan starts today; the days left on the old plan end (the member is told so in the
--                  app BEFORE paying, and the Terms say a gym may choose this);
--     'desk'       0193 as it was: online renews the same plan only.
--
--   paymongo_prepare_member(): a mid-term switch is allowed unless the rule is 'desk'; the rule in force is
--     stored on the checkout (details.switch, from_plan, from_until), so a later change by the owner never
--     alters what a member already agreed to.
--   paymongo_settle(): a checkout carrying details.switch switches the plan FIRST, then records the payment and
--     sets the term by that rule. A checkout without it (opened before 0243, or under 'desk') keeps 0193's
--     behaviour: recorded, not applied, the desk told.
--
-- Both functions are redefined in full from their last definitions (0194, 0224) with only those changes.
-- Same-plan renewals, day passes, coaching, gym subscriptions and applications are untouched.
-- ============================================================================

alter table gym_settings add column if not exists plan_switch_mode text not null default 'keep_days';
alter table gym_settings drop constraint if exists gym_settings_plan_switch_mode_check;
alter table gym_settings add constraint gym_settings_plan_switch_mode_check
  check (plan_switch_mode in ('keep_days', 'start_now', 'desk'));
comment on column gym_settings.plan_switch_mode is
  '0243: a member switching plans online while a paid plan still runs — keep_days (new term after the current end), start_now (new term today, days left end) or desk (online refuses; the desk switches).';

create or replace function paymongo_prepare_member(p_purpose text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_me uuid := auth.uid(); v_details jsonb := coalesce(p_details, '{}'::jsonb);
        v_plan membership_plans; v_cur record; v_account uuid; v_amount numeric; v_desc text; c coachings; v_id uuid;
        v_mode text; v_switch text;
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
    -- 0193 made a DIFFERENT plan while a paid one still runs the desk's. 0243: the owner's rule decides
    -- (gym_settings.plan_switch_mode) — 'keep_days' (the new term starts when this one ends), 'start_now' (it
    -- starts today and the days left end) or 'desk' (0193's refusal). The rule in force NOW is stored on the
    -- checkout, so what the member was shown before paying is what happens, whatever the owner changes later.
    if v_cur.plan_id is not null and v_plan.id <> v_cur.plan_id
       and membership_is_usable(v_cur.status, v_cur.expiry_date, v_cur.never_expires)
       and coalesce((select p.price from membership_plans p where p.id = v_cur.plan_id), 0) > 0 then
      v_mode := coalesce((select s.plan_switch_mode from gym_settings s where s.gym_id = v_gym), 'desk');
      if v_mode not in ('keep_days', 'start_now') then
        raise exception 'You are on % until %. Renew it now, or switch plans at the desk so nothing you have paid is lost.',
          (select p.name from membership_plans p where p.id = v_cur.plan_id),
          coalesce(to_char(v_cur.expiry_date, 'FMMonth FMDD'), 'it ends');
      end if;
      v_switch := v_mode;
    end if;
    v_account := payment_account_of(v_gym);
    v_amount := v_plan.price;
    v_details := jsonb_build_object('plan_id', v_plan.id)
      || case when v_switch is null then '{}'::jsonb
              else jsonb_build_object('switch', v_switch, 'from_plan', v_cur.plan_id, 'from_until', v_cur.expiry_date) end;
    v_desc := v_plan.name || case when v_switch is null then '' else ' (switch from '
              || (select p.name from membership_plans p where p.id = v_cur.plan_id) || ')' end
              || ' — ' || (select name from gyms where id = v_gym);
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

create or replace function paymongo_settle(p_session text, p_payment text, p_amount_centavos int, p_method text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare c paymongo_checkouts; v_from date; v_until date; v_result uuid; v_owner record; v_msg text;
        m memberships; v_plan membership_plans; v_today date := manila_today(); v_new_expiry date; k coachings;
        v_switch text; v_note text;
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

  if c.purpose = 'application' then
    -- 0224: paid before the gym exists. A reference sent meanwhile is not needed any more;
    -- a second online payment is recorded as a duplicate, to refund, never applied twice.
    update application_payments set status = 'refused', reason = 'Paid online instead — this one was not needed.',
                                    decided_at = now()
     where application_id = c.application_id and status = 'pending';
    insert into application_payments (application_id, plan_key, months, amount, method, method_label, reference, status,
                                      checkout_id, submitted_by, decided_at)
    values (c.application_id, c.details->>'plan', (c.details->>'months')::int, c.amount, 'paymongo', v_label, p_payment,
            case when exists (select 1 from application_payments where application_id = c.application_id and status = 'paid')
                 then 'duplicate' else 'paid' end,
            c.id, c.created_by, now())
    returning id into v_result;
    if (select status from application_payments where id = v_result) = 'duplicate' then
      perform platform_log(null, 'application.payment_duplicate',
        c.description || ' — paid online a second time, ₱' || c.amount || '. Refund it.',
        jsonb_build_object('checkout', c.id, 'payment', p_payment, 'application', c.application_id));
    end if;
    v_msg := 'Payment received.';
  elsif c.purpose = 'gym_subscription' then
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
          and coalesce((select p.price from membership_plans p where p.id = m.plan_id), 0) > 0
          and coalesce(c.details->>'switch', '') in ('keep_days', 'start_now') then
      -- 0243: a mid-term switch under the gym's rule, as stored when the member opened the checkout. Only the plan
      -- changes here; the payment and the term are the common path's below, so it is recorded once.
      v_switch := c.details->>'switch';
      v_note := 'Paid online — switched from ' || (select p.name from membership_plans p where p.id = m.plan_id) || ' to ' || v_plan.name
                || case when v_switch = 'start_now' then ', starting today (the days left ended)'
                        else ', starting when it ended (days kept)' end || ' · ' || p_payment;
      update memberships set plan_id = v_plan.id where id = m.id;
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
                         when v_switch = 'start_now' then v_today + v_plan.duration_days   -- 0243: starts today
                         else (case when m.status::text = 'active' and m.expiry_date > v_today then m.expiry_date else v_today end)
                              + v_plan.duration_days end;
    insert into payments (gym_id, member_id, membership_id, amount, method, status, notes, recorded_by, paid_on, plan_id, plan_name)
    values (c.gym_id, c.member_id, m.id, c.amount, v_label, 'completed', coalesce(v_note, 'Paid online · ' || p_payment), null, v_today, v_plan.id, v_plan.name)
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

revoke all on function paymongo_prepare_member(text, jsonb) from public, anon;
grant execute on function paymongo_prepare_member(text, jsonb) to authenticated;
revoke all on function paymongo_settle(text, text, int, text) from public, anon, authenticated;
grant execute on function paymongo_settle(text, text, int, text) to service_role;

create or replace function migration_0243_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0243_applied() to anon, authenticated;
