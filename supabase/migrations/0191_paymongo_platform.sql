-- ============================================================================
-- 0191 — PayMongo, part 1: a gym pays Core Fitness online
-- ============================================================================
--
-- F1. A gym's owner pays Core Fitness by GCash, Maya, card or online banking
-- through a PayMongo Checkout Session, for:
--   * its plan (1 month, or the yearly price for 12);
--   * AI coach top-ups (0189's pack size and price);
--   * custom colours — a gym's own colour codes are a one-time purchase; the
--     presets stay free, and a gym already using its own code keeps it.
--
-- THE SHAPE. The price is always the database's: paymongo_prepare_platform()
-- writes a pending `paymongo_checkouts` row with the amount and returns it; the
-- `paymongo-checkout` Edge Function opens the session with Core Fitness's key
-- (a Supabase secret) and attaches the session id; PayMongo's webhook, signature
-- checked, calls paymongo_settle(), which records the result the way the
-- manual path does (a gym_payments row and paid_until; ai_topups + credits; the
-- colours unlock) — once per PayMongo payment (unique payment id), and only if
-- the amount paid is the amount asked. The reference-and-screenshot path stays
-- for anyone who prefers it.
-- ============================================================================

create table if not exists paymongo_checkouts (
  id                  uuid primary key default gen_random_uuid(),
  -- 'platform' = Core Fitness's own account. Part 2 adds gyms' and trainers' accounts.
  account             text not null default 'platform',
  gym_id              uuid references gyms(id) on delete cascade,
  member_id           uuid references profiles(id) on delete set null,
  purpose             text not null check (purpose in ('gym_subscription', 'ai_topup', 'custom_colours',
                                                       'membership', 'day_pass', 'coaching')),
  details             jsonb not null default '{}'::jsonb,
  amount              numeric(10,2) not null check (amount > 0),
  description         text not null,
  checkout_session_id text unique,
  checkout_url        text,
  payment_id          text unique,
  method              text,
  status              text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  result_id           uuid,
  created_by          uuid references profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists idx_paymongo_checkouts_gym on paymongo_checkouts(gym_id, created_at desc);
alter table paymongo_checkouts enable row level security;   -- no policy: definer functions only

-- ---- custom colours: a one-time purchase ------------------------------------------------------------
alter table platform_billing add column if not exists custom_colours_price numeric(10,2) not null default 499
  check (custom_colours_price >= 0);

create table if not exists gym_theme_unlocks (
  gym_id      uuid not null references gyms(id) on delete cascade,
  theme_key   text not null check (theme_key in ('custom_colours')),
  unlocked_at timestamptz not null default now(),
  how         text not null check (how in ('kept', 'paymongo', 'platform')),
  checkout_id uuid references paymongo_checkouts(id) on delete set null,
  primary key (gym_id, theme_key)
);
alter table gym_theme_unlocks enable row level security;

-- Gyms already on their own code keep it, for good.
insert into gym_theme_unlocks (gym_id, theme_key, how)
select s.gym_id, 'custom_colours', 'kept' from gym_settings s
 where s.accent ~ '^#' or coalesce(s.accent_action, '') ~ '^#'
on conflict do nothing;

create or replace function gym_has_custom_colours(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_theme_unlocks where gym_id = p_gym and theme_key = 'custom_colours');
$$;
revoke all on function gym_has_custom_colours(uuid) from public, anon;
grant execute on function gym_has_custom_colours(uuid) to authenticated;

-- A colour code (#…) set where there was none needs the unlock. A preset never does,
-- and a gym's code it already has is left alone.
create or replace function trg_custom_colours_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((new.accent ~ '^#' and new.accent is distinct from (case when tg_op = 'UPDATE' then old.accent end))
      or (coalesce(new.accent_action, '') ~ '^#'
          and new.accent_action is distinct from (case when tg_op = 'UPDATE' then old.accent_action end)))
     and not gym_has_custom_colours(new.gym_id) then
    raise exception 'Your own colour codes are a one-time purchase. Pick a preset, or buy custom colours on Your app.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists a_custom_colours_paid on gym_settings;
create trigger a_custom_colours_paid before insert or update of accent, accent_action on gym_settings
  for each row execute function trg_custom_colours_paid();

/** The platform gives custom colours to a gym (a goodwill gesture, a demo). */
create or replace function platform_grant_custom_colours(p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform.' using errcode = '42501'; end if;
  insert into gym_theme_unlocks (gym_id, theme_key, how) values (p_gym, 'custom_colours', 'platform') on conflict do nothing;
  perform platform_log(p_gym, 'theme.granted', 'Custom colours given to ' || (select name from gyms where id = p_gym), null);
end;
$$;
revoke all on function platform_grant_custom_colours(uuid) from public, anon;
grant execute on function platform_grant_custom_colours(uuid) to authenticated;

-- ---- preparing a checkout: the price is the database's ----------------------------------------------------
/**
 * The owner asks to pay Core Fitness for something. Returns the pending
 * checkout's id, amount and description for the Edge Function to open.
 *   gym_subscription  details: {months: 1 | 12}
 *   ai_topup          details: {packs: 1..20}
 *   custom_colours    details: {}
 */
create or replace function paymongo_prepare_platform(p_purpose text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); g gyms; pp platform_plans; b platform_billing;
        v_amount numeric; v_desc text; v_details jsonb := coalesce(p_details, '{}'::jsonb); v_id uuid; n int;
begin
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

-- The Edge Function (service role) ties PayMongo's session to the row.
create or replace function paymongo_attach(p_id uuid, p_session text, p_url text) returns void
language sql security definer set search_path = public as $$
  update paymongo_checkouts set checkout_session_id = p_session, checkout_url = p_url
   where id = p_id and checkout_session_id is null;
$$;
revoke all on function paymongo_attach(uuid, text, text) from public, anon, authenticated;
grant execute on function paymongo_attach(uuid, text, text) to service_role;

/** For the Edge Function: what to open (amount in centavos), refusing a row already used. */
create or replace function paymongo_checkout_for(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'account', c.account, 'gym_id', c.gym_id, 'purpose', c.purpose,
                            'amount_centavos', (c.amount * 100)::int, 'description', c.description, 'status', c.status,
                            'has_session', c.checkout_session_id is not null)
    from paymongo_checkouts c where c.id = p_id;
$$;
revoke all on function paymongo_checkout_for(uuid) from public, anon, authenticated;
grant execute on function paymongo_checkout_for(uuid) to service_role;

-- ---- settling: what the webhook records, once ------------------------------------------------------------------
create or replace function paymongo_settle(p_session text, p_payment text, p_amount_centavos int, p_method text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare c paymongo_checkouts; v_from date; v_until date; v_result uuid; v_owner record; v_msg text;
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

  if c.purpose = 'gym_subscription' then
    v_from := greatest(coalesce((select paid_until from gyms where id = c.gym_id), manila_today() - 1), manila_today() - 1) + 1;
    v_until := (v_from + make_interval(months => (c.details->>'months')::int))::date - 1;
    insert into gym_payments (gym_id, amount, paid_on, covers_from, covers_until, method, reference, note, plan_key, recorded_by)
    values (c.gym_id, c.amount, manila_today(), v_from, v_until, 'PayMongo' || coalesce(' · ' || p_method, ''), p_payment,
            'Paid online', c.details->>'plan', null)
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
  else
    return 'not a platform payment';
  end if;

  update paymongo_checkouts set status = 'paid', payment_id = p_payment, method = p_method, paid_at = now(), result_id = v_result
   where id = c.id;
  perform act_as_gym(c.gym_id);
  for v_owner in select user_id from gym_roles where gym_id = c.gym_id and role = 'admin' and status = 'active' loop
    perform notify_once(v_owner.user_id, 'system', 'Payment received', v_msg, '/subscription', 'paymongo-' || c.id, c.gym_id);
  end loop;
  perform act_as_gym(null);
  perform platform_log(c.gym_id, 'paymongo.paid', c.description || ' — paid online, ₱' || c.amount,
    jsonb_build_object('checkout', c.id, 'payment', p_payment, 'method', p_method));
  return 'settled';
end;
$$;
revoke all on function paymongo_settle(text, text, int, text) from public, anon, authenticated;
grant execute on function paymongo_settle(text, text, int, text) to service_role;

/** The owner's online payments to Core Fitness, newest first. */
create or replace function my_paymongo_checkouts()
returns table (id uuid, purpose text, description text, amount numeric, status text, method text, created_at timestamptz, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.purpose, c.description, c.amount, c.status, c.method, c.created_at, c.paid_at
    from paymongo_checkouts c
   where c.gym_id = current_gym_id() and c.account = 'platform' and storage_role_here() = 'admin'
     and (c.status <> 'pending' or c.created_at > now() - interval '1 day')
   order by c.created_at desc limit 20;
$$;
revoke all on function my_paymongo_checkouts() from public, anon;
grant execute on function my_paymongo_checkouts() to authenticated;

/** What Your app needs about colours: unlocked or not, and the price. */
create or replace function my_theme_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('custom_colours', gym_has_custom_colours(current_gym_id()),
                            'price', (select b.custom_colours_price from platform_billing b limit 1));
$$;
revoke all on function my_theme_state() from public, anon;
grant execute on function my_theme_state() to authenticated;

/** The platform's list of online payments. */
create or replace function platform_paymongo_checkouts()
returns table (id uuid, gym_id uuid, gym_name text, purpose text, description text, amount numeric, status text,
               method text, payment_id text, created_at timestamptz, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.gym_id, g.name, c.purpose, c.description, c.amount, c.status, c.method, c.payment_id, c.created_at, c.paid_at
    from paymongo_checkouts c left join gyms g on g.id = c.gym_id
   where is_platform_admin() and c.account = 'platform' and c.status <> 'pending'
   order by c.created_at desc limit 200;
$$;
revoke all on function platform_paymongo_checkouts() from public, anon;
grant execute on function platform_paymongo_checkouts() to authenticated;

create or replace function platform_custom_colours_price() returns numeric
language sql stable security definer set search_path = public as $$
  select b.custom_colours_price from platform_billing b where is_platform_admin() limit 1;
$$;
revoke all on function platform_custom_colours_price() from public, anon;
grant execute on function platform_custom_colours_price() to authenticated;

create or replace function platform_set_custom_colours_price(p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform.' using errcode = '42501'; end if;
  if p_price is null or p_price < 0 then raise exception 'Give a price.'; end if;
  update platform_billing set custom_colours_price = p_price;
end;
$$;
revoke all on function platform_set_custom_colours_price(numeric) from public, anon;
grant execute on function platform_set_custom_colours_price(numeric) to authenticated;

create or replace function migration_0191_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0191_applied() from public, anon;
grant execute on function migration_0191_applied() to authenticated;
comment on function migration_0191_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0191.sql
