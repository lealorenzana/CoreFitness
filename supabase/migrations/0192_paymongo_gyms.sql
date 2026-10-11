-- ============================================================================
-- 0192 — PayMongo, part 2a: members pay their gym, online
-- ============================================================================
--
-- F2. A gym connects ITS OWN PayMongo account on Your app; a coach paid
-- directly (coaching fee mode trainer_direct, 0181) may connect theirs. Money
-- goes straight to that account — Core Fitness never holds a gym's money.
--
-- KEYS. The `paymongo-connect` Edge Function checks the secret key with
-- PayMongo, creates that account's own webhook
-- (…/paymongo-webhook?account=<id>), and stores the secret key and the
-- webhook's secret in Supabase Vault. No function returns either to a screen:
-- payment_account_secret() is for the service role only. A screen sees
-- connected or not, test or live, and the key's last four characters.
--
-- WHAT A MEMBER PAYS FOR, priced by the database (paymongo_prepare_member):
--   * membership — their plan, or another the gym sells (renewal; a different
--     plan is applied before the payment, as at the desk);
--   * coaching   — a coaching term's own price (gym_priced → the gym's
--     account; trainer_direct → the coach's).
-- The webhook settles them the way the desk does: a `payments` row (receipt
-- number by trigger) and the membership extended from its end date if still
-- running, from today if not (lib/api/payments.ts recordPayment); coaching is
-- marked paid and started (coaching_activate). The member is told, and so is
-- the desk. GCash-proof payments (0167) stay for gyms without PayMongo.
-- ============================================================================

create table if not exists payment_accounts (
  id                uuid primary key,
  gym_id            uuid not null references gyms(id) on delete cascade,
  owner_kind        text not null check (owner_kind in ('gym', 'trainer')),
  trainer_id        uuid references profiles(id) on delete cascade,
  public_key        text check (public_key ~ '^pk_(test|live)_'),
  key_last4         text not null,
  secret_id         uuid not null,
  webhook_secret_id uuid,
  webhook_id        text,
  live              boolean not null,
  connected_by      uuid references profiles(id) on delete set null,
  connected_at      timestamptz not null default now(),
  disconnected_at   timestamptz,
  constraint payment_accounts_trainer check ((owner_kind = 'trainer') = (trainer_id is not null))
);
create unique index if not exists uq_payment_accounts_live
  on payment_accounts (gym_id, owner_kind, coalesce(trainer_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where disconnected_at is null;
alter table payment_accounts enable row level security;   -- no policy

/** Who may connect which account: the owner the gym's; a coach their own. Returns {gym_id, trainer_id}. */
create or replace function may_connect_payment_account(p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'gym' and storage_role_here() = 'admin' then
    return jsonb_build_object('gym_id', current_gym_id(), 'trainer_id', null);
  elsif p_kind = 'trainer' and storage_role_here() = 'trainer' then
    return jsonb_build_object('gym_id', current_gym_id(), 'trainer_id', auth.uid());
  end if;
  raise exception 'Only the gym''s owner connects the gym''s account, and a coach their own.' using errcode = '42501';
end;
$$;
revoke all on function may_connect_payment_account(text) from public, anon;
grant execute on function may_connect_payment_account(text) to authenticated;

/** The Edge Function stores a checked key (service role). An older connection for the same owner ends. */
create or replace function payment_account_store(p_id uuid, p_gym uuid, p_kind text, p_trainer uuid, p_public text,
                                                 p_secret text, p_webhook_id text, p_webhook_secret text, p_by uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_secret uuid; v_whsec uuid;
begin
  update payment_accounts set disconnected_at = now()
   where gym_id = p_gym and owner_kind = p_kind and trainer_id is not distinct from p_trainer and disconnected_at is null;
  v_secret := vault.create_secret(p_secret, 'paymongo-secret-' || p_id, 'PayMongo secret key for payment account ' || p_id);
  if p_webhook_secret is not null then
    v_whsec := vault.create_secret(p_webhook_secret, 'paymongo-webhook-' || p_id, 'PayMongo webhook secret for payment account ' || p_id);
  end if;
  insert into payment_accounts (id, gym_id, owner_kind, trainer_id, public_key, key_last4, secret_id, webhook_secret_id,
                                webhook_id, live, connected_by)
  values (p_id, p_gym, p_kind, p_trainer, nullif(btrim(coalesce(p_public, '')), ''), right(p_secret, 4), v_secret, v_whsec,
          p_webhook_id, p_secret like 'sk_live_%', p_by);
  perform platform_log(p_gym, 'paymongo.connected',
    case when p_kind = 'gym' then 'The gym connected its PayMongo account' else display_name_of(p_trainer) || ' connected a PayMongo account' end
      || case when p_secret like 'sk_live_%' then ' (live)' else ' (test)' end,
    jsonb_build_object('account', p_id));
  return p_id;
end;
$$;
revoke all on function payment_account_store(uuid, uuid, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function payment_account_store(uuid, uuid, text, uuid, text, text, text, text, uuid) to service_role;

/** For the Edge Functions only: an account's keys, out of the Vault. */
create or replace function payment_account_secret(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a payment_accounts;
begin
  select * into a from payment_accounts where id = p_account;
  if a.id is null then return null; end if;
  return jsonb_build_object(
    'gym_id', a.gym_id, 'owner_kind', a.owner_kind, 'trainer_id', a.trainer_id, 'live', a.live,
    'active', a.disconnected_at is null, 'webhook_id', a.webhook_id,
    'secret', (select decrypted_secret from vault.decrypted_secrets where id = a.secret_id),
    'webhook_secret', (select decrypted_secret from vault.decrypted_secrets where id = a.webhook_secret_id));
end;
$$;
revoke all on function payment_account_secret(uuid) from public, anon, authenticated;
grant execute on function payment_account_secret(uuid) to service_role;

/** What the owner (kind 'gym') or a coach (kind 'trainer') sees of their connection — never a key. */
create or replace function my_payment_account(p_kind text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('connected', true, 'live', a.live, 'key_last4', a.key_last4, 'connected_at', a.connected_at,
                            'account_id', a.id)
    from payment_accounts a
   where a.gym_id = current_gym_id() and a.disconnected_at is null and a.owner_kind = p_kind
     and ((p_kind = 'gym' and storage_role_here() = 'admin') or (p_kind = 'trainer' and a.trainer_id = auth.uid()))
   limit 1;
$$;
revoke all on function my_payment_account(text) from public, anon;
grant execute on function my_payment_account(text) to authenticated;

create or replace function disconnect_payment_account(p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform may_connect_payment_account(p_kind);
  update payment_accounts set disconnected_at = now()
   where gym_id = current_gym_id() and owner_kind = p_kind and disconnected_at is null
     and (p_kind = 'gym' or trainer_id = auth.uid())
  returning id into v_id;
  if v_id is null then raise exception 'Nothing is connected.'; end if;
  perform platform_log(current_gym_id(), 'paymongo.disconnected', 'A PayMongo account was disconnected', jsonb_build_object('account', v_id));
  return v_id;
end;
$$;
revoke all on function disconnect_payment_account(text) from public, anon;
grant execute on function disconnect_payment_account(text) to authenticated;

/** The live account of a gym, or of one of its coaches. */
create or replace function payment_account_of(p_gym uuid, p_trainer uuid default null) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from payment_accounts a
   where a.gym_id = p_gym and a.disconnected_at is null
     and (case when p_trainer is null then a.owner_kind = 'gym' else a.owner_kind = 'trainer' and a.trainer_id = p_trainer end)
   limit 1;
$$;
revoke all on function payment_account_of(uuid, uuid) from public, anon, authenticated;

/** For the member's screens: can they pay their gym — or a coach — online? */
create or replace function gym_online_pay() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gym', payment_account_of(current_gym_id()) is not null,
    'trainers', coalesce((select jsonb_agg(a.trainer_id) from payment_accounts a
                           where a.gym_id = current_gym_id() and a.owner_kind = 'trainer' and a.disconnected_at is null), '[]'::jsonb));
$$;
revoke all on function gym_online_pay() from public, anon;
grant execute on function gym_online_pay() to authenticated;

-- ---- a member's checkout: priced by the database ------------------------------------------------------
/**
 *   membership  details: {plan_id?}   (default: the member's current plan)
 *   coaching    details: {coaching_id}
 */
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
    v_account := payment_account_of(v_gym);
    v_amount := v_plan.price;
    v_details := jsonb_build_object('plan_id', v_plan.id);
    v_desc := v_plan.name || ' — ' || (select name from gyms where id = v_gym);
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

/** A member's own online payments (their screens wait on these after PayMongo). */
create or replace function my_member_checkouts()
returns table (id uuid, purpose text, description text, amount numeric, status text, method text, created_at timestamptz, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.purpose, c.description, c.amount, c.status, c.method, c.created_at, c.paid_at
    from paymongo_checkouts c
   where c.member_id = auth.uid() and c.gym_id = current_gym_id()
     and (c.status <> 'pending' or c.created_at > now() - interval '1 day')
   order by c.created_at desc limit 20;
$$;
revoke all on function my_member_checkouts() from public, anon;
grant execute on function my_member_checkouts() to authenticated;

-- ---- settling: 0191's, plus a member's payments ----------------------------------------------------------
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
      case when c.purpose = 'coaching' then '/member/coach' else '/member/membership' end, 'paymongo-' || c.id, c.gym_id);
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

/** For the gym's screens: what members paid online (the desk sees them as ordinary payments too). */
create or replace function gym_online_payments()
returns table (id uuid, member_name text, purpose text, description text, amount numeric, status text, method text, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, display_name_of(c.member_id), c.purpose, c.description, c.amount, c.status, c.method, c.paid_at
    from paymongo_checkouts c
   where c.gym_id = current_gym_id() and c.member_id is not null and c.status = 'paid'
     and coalesce(storage_role_here(), '') in ('admin', 'staff')
   order by c.paid_at desc limit 100;
$$;
revoke all on function gym_online_payments() from public, anon;
grant execute on function gym_online_payments() to authenticated;

create or replace function migration_0192_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0192_applied() from public, anon;
grant execute on function migration_0192_applied() to authenticated;
comment on function migration_0192_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0192.sql
