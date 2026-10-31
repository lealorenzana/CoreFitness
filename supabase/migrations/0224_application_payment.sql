-- 0224 — paying before approval (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part C).
--
-- A gym used to be let in on the free trial and pay afterwards. Now an applicant
-- who chose a PAID plan pays for it on their application page, once all six
-- documents are verified, and only then can the platform let them in:
--
--   * online through PayMongo (Core Fitness's own account) — the amount is read
--     here, never the page's; PayMongo's webhook (or the page's reconcile on the
--     way back) records it as paid;
--   * or by GCash, Maya or bank to the details on Settings → How gyms pay, then a
--     reference number; the platform finds it in its own history and confirms it
--     (or says it could not, and why — the applicant can send it again).
--
-- The free trial pays nothing, and so does a plan with no price ("Talk to us" —
-- agreed in the conversation, billed after, as before). create_gym() refuses a
-- paid plan with no payment, and on approval the payment becomes the gym's first
-- gym_payments row: the plan starts that day, covering a month (or a year for
-- yearly billing). paymongo_prepare_platform() and paymongo_settle() are 0191's
-- and 0194's, redefined in full with `application` added.
-- Safe to paste again.

alter table paymongo_checkouts add column if not exists application_id uuid references gym_applications(id) on delete cascade;
alter table paymongo_checkouts drop constraint if exists paymongo_checkouts_purpose_check;
alter table paymongo_checkouts add constraint paymongo_checkouts_purpose_check
  check (purpose in ('gym_subscription', 'ai_topup', 'custom_colours', 'membership', 'day_pass', 'coaching', 'application'));

create table if not exists application_payments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references gym_applications(id) on delete cascade,
  plan_key       text not null references platform_plans(key) on update cascade,
  months         int not null check (months between 1 and 12),
  amount         numeric(10,2) not null check (amount > 0),
  method         text not null check (method in ('paymongo', 'gcash', 'maya', 'bank', 'other')),
  method_label   text not null check (length(method_label) between 2 and 80),
  reference      text not null check (length(btrim(reference)) between 4 and 80),
  -- duplicate: paid online a second time — recorded so it can be refunded, never applied.
  status         text not null default 'pending' check (status in ('pending', 'paid', 'refused', 'duplicate')),
  reason         text check (reason is null or length(reason) <= 500),
  checkout_id    uuid references paymongo_checkouts(id) on delete set null,
  gym_payment_id uuid references gym_payments(id) on delete set null,
  submitted_by   uuid references profiles(id) on delete set null default auth.uid(),
  decided_by     uuid references profiles(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  constraint application_payments_reason check (status <> 'refused' or coalesce(length(btrim(reason)), 0) > 0)
);
create index if not exists idx_application_payments_app on application_payments(application_id, created_at desc);
-- One payment at a time: a pending or paid one holds the application.
create unique index if not exists uq_application_payments_live on application_payments(application_id)
  where status in ('pending', 'paid');
-- One transfer, one claim (as 0148's gym claims; a refused one frees its reference).
create unique index if not exists uq_application_payments_reference on application_payments(lower(btrim(reference)))
  where status <> 'refused';
alter table application_payments enable row level security;   -- no policy: definer functions only

/** What an application must pay before approval: nothing (no row) for the trial or a plan with no price. */
create or replace function application_plan_due(p_application uuid)
returns table (plan_key text, plan_name text, months int, amount numeric)
language sql stable security definer set search_path = public as $$
  select p.key, p.name,
         case when a.billing = 'yearly' and coalesce(p.price_yearly, 0) > 0 then 12 else 1 end,
         case when a.billing = 'yearly' and coalesce(p.price_yearly, 0) > 0 then p.price_yearly else p.price_monthly end
    from gym_applications a
    join platform_plans p on p.key = a.plan_key
   where a.id = p_application
     and p.key <> 'trial'
     and coalesce(p.price_monthly, 0) > 0;
$$;
revoke all on function application_plan_due(uuid) from public, anon, authenticated;

/** May this caller pay for this application, right now? Raises the reason if not. */
create or replace function application_payment_check(p_application uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not may_file_for_application(p_application) then
    raise exception 'You cannot pay for that application.' using errcode = '42501';
  end if;
  if (select status from gym_applications where id = p_application) is distinct from 'pending' then
    raise exception 'This application is no longer open.';
  end if;
  if not exists (select 1 from application_plan_due(p_application)) then
    raise exception 'Your plan has nothing to pay before we let you in.';
  end if;
  if cardinality(coalesce(application_documents_missing(p_application), '{}')) > 0 then
    raise exception 'You can pay once all six documents are verified.';
  end if;
  if exists (select 1 from application_payments where application_id = p_application and status = 'paid') then
    raise exception 'Your plan is already paid.';
  end if;
  if exists (select 1 from application_payments where application_id = p_application and status = 'pending') then
    raise exception 'We are checking the payment you sent. We will tell you here once it is confirmed.';
  end if;
end;
$$;
revoke all on function application_payment_check(uuid) from public, anon, authenticated;

/**
 * The application's page: what is due, whether it can be paid yet, and the
 * latest payment (with the reason when one was refused). Applicant or platform.
 */
create or replace function application_payment_state(p_application uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d record; v_last application_payments; v_paid application_payments;
begin
  if not (is_platform_admin() or may_file_for_application(p_application) or is_my_application(p_application)) then
    return null;
  end if;
  select * into d from application_plan_due(p_application);
  select * into v_paid from application_payments where application_id = p_application and status = 'paid' limit 1;
  select * into v_last from application_payments where application_id = p_application and status <> 'duplicate'
   order by created_at desc limit 1;
  return jsonb_build_object(
    'due', d.plan_key is not null,
    'plan_name', d.plan_name, 'months', d.months, 'amount', d.amount,
    'ready', cardinality(coalesce(application_documents_missing(p_application), '{}')) = 0,
    'paid', v_paid.id is not null,
    'last', case when v_last.id is null then null else jsonb_build_object(
      'id', v_last.id, 'status', v_last.status, 'method_label', v_last.method_label, 'reference', v_last.reference,
      'amount', v_last.amount, 'reason', v_last.reason, 'created_at', v_last.created_at, 'decided_at', v_last.decided_at) end);
end;
$$;
revoke all on function application_payment_state(uuid) from public, anon;
grant execute on function application_payment_state(uuid) to authenticated;

/** "I paid by GCash/Maya/bank" — with the reference. The amount is the plan's, read here. */
create or replace function claim_application_payment(p_application uuid, p_method uuid, p_reference text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d record; m platform_payment_methods; v_id uuid; v_ref text := btrim(coalesce(p_reference, ''));
begin
  perform application_payment_check(p_application);
  select * into m from platform_payment_methods where id = p_method and active;
  if m.id is null then raise exception 'Choose how you paid.'; end if;
  if length(v_ref) < 4 then raise exception 'Enter the reference number from your GCash, Maya or bank receipt.'; end if;
  if exists (select 1 from application_payments where lower(btrim(reference)) = lower(v_ref) and status <> 'refused')
     or exists (select 1 from gym_payment_claims where lower(btrim(reference)) = lower(v_ref) and status <> 'rejected') then
    raise exception 'That reference number has already been sent to us. If this is a different payment, check the number.';
  end if;
  select * into d from application_plan_due(p_application);
  insert into application_payments (application_id, plan_key, months, amount, method, method_label, reference)
  values (p_application, d.plan_key, d.months, d.amount, m.kind, m.label, v_ref)
  returning id into v_id;
  perform platform_log(null, 'application.payment_claimed',
    (select gym_name from gym_applications where id = p_application) || ' says it paid ₱' || d.amount || ' by ' || m.label || ' (ref ' || v_ref || ')',
    jsonb_build_object('application', p_application, 'payment', v_id));
  return v_id;
end;
$$;
revoke all on function claim_application_payment(uuid, uuid, text) from public, anon;
grant execute on function claim_application_payment(uuid, uuid, text) to authenticated;

/** The platform found the money (or did not, and says why). */
create or replace function confirm_application_payment(p_payment uuid, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare x application_payments;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform confirms a payment.' using errcode = '42501';
  end if;
  select * into x from application_payments where id = p_payment for update;
  if x.id is null then raise exception 'That payment does not exist.'; end if;
  if x.status <> 'pending' then raise exception 'That payment has already been answered.'; end if;
  if not p_ok and coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'Say why, for them to read.';
  end if;
  update application_payments
     set status = case when p_ok then 'paid' else 'refused' end,
         reason = case when p_ok then null else btrim(p_reason) end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_payment;
  perform platform_log(null, case when p_ok then 'application.payment_confirmed' else 'application.payment_refused' end,
    (select gym_name from gym_applications where id = x.application_id)
      || case when p_ok then ': payment confirmed (ref ' || x.reference || ')' else ': payment not found (ref ' || x.reference || ') — ' || btrim(p_reason) end,
    jsonb_build_object('application', x.application_id, 'payment', x.id));
end;
$$;
revoke all on function confirm_application_payment(uuid, boolean, text) from public, anon;
grant execute on function confirm_application_payment(uuid, boolean, text) to authenticated;

drop function if exists platform_application_payments();
/**
 * The platform's Applications: each application with something to pay — what is
 * due, and its latest payment (none yet, being checked, paid, or not found).
 */
create or replace function platform_application_payments()
returns table (application_id uuid, plan_name text, amount numeric, months int,
               payment_id uuid, status text, method_label text, reference text, reason text,
               created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, d.plan_name, d.amount, d.months,
         x.id, x.status, x.method_label, x.reference, x.reason, x.created_at, x.decided_at
    from gym_applications a
    cross join lateral application_plan_due(a.id) d
    left join lateral (select * from application_payments p
                        where p.application_id = a.id and p.status <> 'duplicate'
                        order by (p.status = 'paid') desc, p.created_at desc limit 1) x on true
   where is_platform_admin()
   order by a.created_at desc
   limit 500;
$$;
revoke all on function platform_application_payments() from public, anon;
grant execute on function platform_application_payments() to authenticated;

-- ---- PayMongo: 0191's prepare with `application` added ----------------------------------------------------
/**
 *   gym_subscription  details: {months: 1 | 12}
 *   ai_topup          details: {packs: 1..20}
 *   custom_colours    details: {}
 *   application       details: {application: uuid} — the applicant, before their gym exists (0224)
 */
create or replace function paymongo_prepare_platform(p_purpose text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); g gyms; pp platform_plans; b platform_billing;
        v_amount numeric; v_desc text; v_details jsonb := coalesce(p_details, '{}'::jsonb); v_id uuid; n int;
        v_app uuid; d record;
begin
  if p_purpose = 'application' then
    v_app := nullif(v_details->>'application', '')::uuid;
    perform application_payment_check(v_app);
    select * into d from application_plan_due(v_app);
    insert into paymongo_checkouts (account, gym_id, application_id, purpose, details, amount, description)
    values ('platform', null, v_app, 'application',
            jsonb_build_object('application', v_app, 'plan', d.plan_key, 'months', d.months), d.amount,
            d.plan_name || ' plan, ' || d.months || case when d.months = 1 then ' month' else ' months' end
              || ' — ' || (select gym_name from gym_applications where id = v_app))
    returning id, amount, description into v_id, v_amount, v_desc;
    return jsonb_build_object('id', v_id, 'amount', v_amount, 'description', v_desc);
  end if;

  if storage_role_here() is distinct from 'admin' then
    raise exception 'The gym''s owner pays Core Fitness.' using errcode = '42501';
  end if;
  select * into g from gyms where id = v_gym;
  select * into b from platform_billing limit 1;
  if p_purpose = 'gym_subscription' then
    select * into pp from platform_plans where key = g.plan;
    n := coalesce((v_details->>'months')::int, 1);
    if n = 12 and pp.price_yearly is not null and pp.price_yearly > 0 then
      v_amount := pp.price_yearly;
    elsif n between 1 and 12 and pp.price_monthly is not null and pp.price_monthly > 0 then
      v_amount := pp.price_monthly * n;
    else
      raise exception 'Your plan has no price to pay online yet. Ask Core Fitness in Support.';
    end if;
    v_details := jsonb_build_object('months', n, 'plan', g.plan);
    v_desc := coalesce(pp.name, 'Core Fitness') || ' plan, ' || n || case when n = 1 then ' month' else ' months' end || ' — ' || g.name;
  elsif p_purpose = 'ai_topup' then
    n := coalesce((v_details->>'packs')::int, 1);
    if n not between 1 and 20 then raise exception 'Choose 1 to 20 packs.'; end if;
    v_amount := n * coalesce(b.ai_topup_price, 699);
    v_details := jsonb_build_object('packs', n, 'messages', n * coalesce(b.ai_topup_messages, 500));
    v_desc := (n * coalesce(b.ai_topup_messages, 500)) || ' AI coach messages — ' || g.name;
  elsif p_purpose = 'custom_colours' then
    if gym_has_custom_colours(v_gym) then raise exception 'This gym already has custom colours.'; end if;
    v_amount := coalesce(b.custom_colours_price, 499);
    v_details := '{}'::jsonb;
    v_desc := 'Custom colours (one-time) — ' || g.name;
  else
    raise exception 'Unknown payment.';
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'There is nothing to pay.'; end if;
  insert into paymongo_checkouts (account, gym_id, purpose, details, amount, description)
  values ('platform', v_gym, p_purpose, v_details, v_amount, v_desc)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount', v_amount, 'description', v_desc);
end;
$$;
revoke all on function paymongo_prepare_platform(text, jsonb) from public, anon;
grant execute on function paymongo_prepare_platform(text, jsonb) to authenticated;

-- ---- PayMongo: 0194's settle with `application` added -----------------------------------------------------
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

-- ---- create_gym: 0222's, plus the payment ------------------------------------------------------------------
create or replace function create_gym(p_name text, p_slug text, p_application uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid;
  v_owner uuid;
  d record;
  x application_payments;
  v_today date := manila_today();
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can create a gym.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The gym needs a name.';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 then
    raise exception 'The link name can use small letters, numbers and dashes only.';
  end if;
  if exists (select 1 from gyms where slug = p_slug) then
    raise exception 'Another gym already uses the link name "%".', p_slug;
  end if;

  -- The owner comes with the application: its own account, with a confirmed email.
  if p_application is not null then
    select u.id into v_owner
      from gym_applications a
      join auth.users u on u.email_confirmed_at is not null
                       and (u.id = a.applicant_id
                            or (a.applicant_id is null and lower(btrim(u.email)) = lower(btrim(a.email))))
     where a.id = p_application
     order by (u.id = a.applicant_id) desc
     limit 1;
    if v_owner is null then
      raise exception 'Their email is not confirmed yet — they must open the link we sent them (or sign in with Google) before their gym can be let in.';
    end if;
    -- 0224: a paid plan is paid before approval; the trial and a plan with no price are not.
    -- While documents are missing, 0187's trigger below says so first.
    select * into d from application_plan_due(p_application);
    if d.plan_key is not null and cardinality(coalesce(application_documents_missing(p_application), '{}')) = 0 then
      select * into x from application_payments where application_id = p_application and status = 'paid' limit 1;
      if x.id is null then
        raise exception 'They have not paid for % yet — approval waits for the payment.', d.plan_name;
      end if;
    end if;
  end if;

  insert into gyms (name, slug, status, plan) values (btrim(p_name), p_slug, 'active', coalesce(x.plan_key, 'trial'))
  returning id into v_gym;

  -- Its own plans, point rules, reasons, goal templates, badges and settings,
  -- copied from Gym #1 so the gym opens working rather than empty (0098).
  perform seed_gym_defaults(v_gym);

  if p_application is not null then
    -- 0187's trigger refuses this until all six documents are verified and in date.
    update gym_applications
       set status = 'approved', gym_id = v_gym, decided_by = auth.uid(), decided_at = now(),
           applicant_id = coalesce(applicant_id, v_owner)
     where id = p_application and status = 'pending';

    insert into gym_roles (gym_id, user_id, role, status)
    values (v_gym, v_owner, 'admin', 'active')
    on conflict (gym_id, user_id) do update set role = 'admin', status = 'active';
    update profiles set active_gym_id = v_gym where id = v_owner;

    -- The payment becomes the gym's first: the plan starts today.
    if x.id is not null then
      update application_payments
         set gym_payment_id = record_gym_payment(v_gym, x.amount,
               (v_today + make_interval(months => x.months))::date - 1,
               coalesce((x.decided_at at time zone 'Asia/Manila')::date, v_today), v_today,
               x.method_label, x.reference, 'Paid before approval')
       where id = x.id;
    end if;
  end if;

  perform platform_log(v_gym, 'gym.created', btrim(p_name) || ' was let in',
                       jsonb_build_object('slug', p_slug, 'application', p_application, 'owner', v_owner));
  return v_gym;
end;
$$;
revoke all on function create_gym(text, text, uuid) from public, anon;
grant execute on function create_gym(text, text, uuid) to authenticated;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0224_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0224_applied() to anon, authenticated;
