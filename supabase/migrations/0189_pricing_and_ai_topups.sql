-- ============================================================================
-- 0189 — Real prices for gyms, and AI coach top-ups
-- ============================================================================
--
-- E5. PRICING. Three flat tiers by size, launch prices the platform edits on
--     /plans (the AI coach is the main cost, so each tier carries its monthly
--     message allowance):
--         Starter   up to 100 members, 3 staff,   ₱1,499 / ₱14,990,   300 AI messages a month
--         Growth    up to 400 members, 10 staff,  ₱3,499 / ₱34,990, 1,500
--         Pro       unlimited,                     ₱6,999 / ₱69,990, 4,000
--     Yearly is two months free. The free trial stays 30 days with every
--     switch on (300 AI messages). Every switch is on in every tier
--     (sync_platform_plan_features, 0108) — tiers differ by size, never by
--     holding features back. Standard and Premium are no longer offered; the
--     gyms on them keep them (unpriced, unlimited) until moved.
--
-- E6. TOP-UPS. When a gym's month allowance is used up, the coach keeps going
--     on prepaid messages the owner bought (default 500 for ₱699; the platform
--     sets both), used only after the allowance and never expiring. Paying is
--     the same as paying Core Fitness today — reference + screenshot, the
--     platform verifies (PayMongo replaces that in F). The owner keeps the
--     per-member daily limit (0147). No surprise bills: at 80% and 100% of the
--     allowance, and when top-ups run out, the owner is told once.
-- ============================================================================

-- ---- E5: the tiers ----------------------------------------------------------------------------------------
insert into platform_plans (key, name, blurb, price_monthly, price_yearly, trial_days, max_members, max_staff,
                            ai_monthly_cap, is_public, is_active, sort_order)
values
  ('starter', 'Starter', 'For a gym up to 100 members',      1499, 14990, null, 100,  3,    300, true, true, 2),
  ('growth',  'Growth',  'For a gym up to 400 members',      3499, 34990, null, 400,  10,  1500, true, true, 3),
  ('pro',     'Pro',     'No limit on members or staff',     6999, 69990, null, null, null, 4000, true, true, 4)
on conflict (key) do nothing;

update platform_plans set is_public = false, sort_order = 8 where key = 'standard' and is_public;
update platform_plans set is_public = false, sort_order = 9 where key = 'premium' and is_public;
update platform_plans set ai_monthly_cap = 300, blurb = coalesce(blurb, 'Everything, free for 30 days')
 where key = 'trial' and ai_monthly_cap is null;

-- Every switch on every new tier.
select sync_platform_plan_features();

-- ---- E6: top-ups -------------------------------------------------------------------------------------------
alter table platform_billing add column if not exists ai_topup_messages int not null default 500 check (ai_topup_messages between 50 and 100000);
alter table platform_billing add column if not exists ai_topup_price numeric(10,2) not null default 699 check (ai_topup_price >= 0);

create table if not exists gym_ai_credits (
  gym_id     uuid primary key references gyms(id) on delete cascade,
  balance    int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
alter table gym_ai_credits enable row level security;

create table if not exists ai_topups (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  packs        int not null check (packs between 1 and 20),
  messages     int not null check (messages > 0),
  amount       numeric(10,2) not null check (amount >= 0),
  reference    text not null check (length(btrim(reference)) between 4 and 60),
  proof_image  text check (length(proof_image) <= 400000),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  reason       text check (length(reason) <= 500),
  requested_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz
);
-- A reference is claimed once (as 0148's payments).
create unique index if not exists uq_ai_topups_reference on ai_topups (lower(btrim(reference))) where status <> 'rejected';
alter table ai_topups enable row level security;

/** The owner buys top-ups: the size and price are the platform's, never the screen's. */
create or replace function request_ai_topup(p_packs int, p_reference text, p_proof text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); b platform_billing; v_id uuid;
begin
  if storage_role_here() is distinct from 'admin' then
    raise exception 'The gym''s owner buys AI coach messages.' using errcode = '42501';
  end if;
  if p_packs is null or p_packs not between 1 and 20 then raise exception 'Choose 1 to 20 packs.'; end if;
  if exists (select 1 from gym_payment_claims c where lower(btrim(c.reference)) = lower(btrim(p_reference)) and c.status <> 'rejected') then
    raise exception 'That reference number has already been sent.';
  end if;
  select * into b from platform_billing limit 1;
  insert into ai_topups (gym_id, packs, messages, amount, reference, proof_image)
  values (v_gym, p_packs, p_packs * coalesce(b.ai_topup_messages, 500), p_packs * coalesce(b.ai_topup_price, 699),
          btrim(p_reference), p_proof)
  returning id into v_id;
  perform platform_log(v_gym, 'ai.topup_requested',
    (select name from gyms where id = v_gym) || ' paid for ' || p_packs * coalesce(b.ai_topup_messages, 500) || ' AI coach messages',
    jsonb_build_object('topup', v_id, 'reference', btrim(p_reference)));
  return v_id;
exception when unique_violation then
  raise exception 'That reference number has already been sent.';
end;
$$;
revoke all on function request_ai_topup(int, text, text) from public, anon;
grant execute on function request_ai_topup(int, text, text) to authenticated;

create or replace function platform_ai_topups()
returns table (id uuid, gym_id uuid, gym_name text, packs int, messages int, amount numeric, reference text, proof_image text,
               status text, reason text, created_at timestamptz, decided_at timestamptz, balance int)
language sql stable security definer set search_path = public as $$
  select t.id, t.gym_id, g.name, t.packs, t.messages, t.amount, t.reference, t.proof_image, t.status, t.reason, t.created_at, t.decided_at,
         coalesce((select c.balance from gym_ai_credits c where c.gym_id = t.gym_id), 0)
    from ai_topups t join gyms g on g.id = t.gym_id
   where is_platform_admin()
   order by (t.status = 'pending') desc, t.created_at desc;
$$;
revoke all on function platform_ai_topups() from public, anon;
grant execute on function platform_ai_topups() to authenticated;

create or replace function platform_decide_topup(p_id uuid, p_paid boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t ai_topups; r record;
begin
  if not is_platform_admin() then raise exception 'Only the platform verifies payments.' using errcode = '42501'; end if;
  if not p_paid and coalesce(length(btrim(p_reason)), 0) = 0 then raise exception 'Say why, so the owner knows.'; end if;
  update ai_topups set status = case when p_paid then 'paid' else 'rejected' end,
         reason = case when p_paid then null else btrim(p_reason) end, decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending' returning * into t;
  if t.id is null then raise exception 'That top-up has already been decided.'; end if;
  if p_paid then
    insert into gym_ai_credits (gym_id, balance) values (t.gym_id, t.messages)
    on conflict (gym_id) do update set balance = gym_ai_credits.balance + excluded.balance, updated_at = now();
  end if;
  perform act_as_gym(t.gym_id);
  for r in select user_id from gym_roles where gym_id = t.gym_id and role = 'admin' and status = 'active' loop
    perform notify_once(r.user_id, 'system',
      case when p_paid then t.messages || ' AI coach messages added' else 'About your AI coach top-up' end,
      case when p_paid then 'They are used after your plan''s monthly messages run out, and never expire.'
           else 'Not added: ' || btrim(p_reason) end,
      '/gym-app', 'ai-topup-' || t.id, t.gym_id);
  end loop;
  perform act_as_gym(null);
  perform platform_log(t.gym_id, case when p_paid then 'ai.topup_paid' else 'ai.topup_rejected' end,
    case when p_paid then 'Verified ' || t.messages || ' AI messages for ' else 'Turned down an AI top-up for ' end
      || (select name from gyms where id = t.gym_id), jsonb_build_object('topup', t.id));
end;
$$;
revoke all on function platform_decide_topup(uuid, boolean, text) from public, anon;
grant execute on function platform_decide_topup(uuid, boolean, text) to authenticated;

/** What Your app shows the owner: the month's allowance, what is used, top-ups left, the price of more. */
create or replace function my_ai_allowance() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when storage_role_here() = 'admin' then jsonb_build_object(
    'monthly', coalesce((select s.ai_monthly_messages from gym_settings s where s.gym_id = current_gym_id()), 1500),
    'plan_monthly', (select c.monthly from gym_ai_caps(current_gym_id()) c),
    'used', coalesce((select sum(u.messages) from ai_usage_days u
                       where u.gym_id = current_gym_id() and u.day >= date_trunc('month', manila_today())::date), 0),
    'credits', coalesce((select c.balance from gym_ai_credits c where c.gym_id = current_gym_id()), 0),
    'topup_messages', (select b.ai_topup_messages from platform_billing b limit 1),
    'topup_price', (select b.ai_topup_price from platform_billing b limit 1),
    'topups', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'messages', t.messages, 'amount', t.amount, 'reference', t.reference,
                          'status', t.status, 'reason', t.reason, 'created_at', t.created_at) order by t.created_at desc)
                        from ai_topups t where t.gym_id = current_gym_id()), '[]'::jsonb)) end;
$$;
revoke all on function my_ai_allowance() from public, anon;
grant execute on function my_ai_allowance() to authenticated;

-- ---- the coach's counter: 0143's, with top-ups after the month and the owner told ---------------------------
create or replace function ai_claim_message(p_gym uuid, p_member uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_daily int; v_monthly int; v_today int; v_month int; v_credit boolean := false; v_left int; r record;
        v_key text := to_char(manila_today(), 'YYYY-MM');
begin
  perform pg_advisory_xact_lock(hashtext('ai_claim:' || p_gym::text));
  select coalesce(s.ai_daily_messages, 30), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = p_gym;
  v_daily := coalesce(v_daily, 30); v_monthly := coalesce(v_monthly, 1500);
  select coalesce(sum(u.messages), 0) into v_today from ai_usage_days u
   where u.gym_id = p_gym and u.member_id = p_member and u.day = manila_today();
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = p_gym and u.day >= date_trunc('month', manila_today())::date;
  -- The owner's per-member daily limit always holds (0147).
  if v_today >= v_daily then return false; end if;
  if v_month >= v_monthly then
    -- The month's allowance is used: a prepaid message, if there is one.
    update gym_ai_credits set balance = balance - 1, updated_at = now()
     where gym_id = p_gym and balance > 0
    returning balance into v_left;
    if v_left is null then
      perform ai_tell_owner(p_gym, 'ai-out-' || v_key, 'The AI coach has stopped for this month',
        'Your plan''s ' || v_monthly || ' messages are used. Buy more on Your app, or it starts again on the 1st.');
      return false;
    end if;
    v_credit := true;
    if v_left = 0 then
      perform ai_tell_owner(p_gym, 'ai-credits-out-' || v_key || '-' || v_month, 'Your AI coach top-ups are used up',
        'The coach stops until next month unless you buy more on Your app.');
    end if;
  end if;
  insert into ai_usage_days (gym_id, member_id, day, messages)
  values (p_gym, p_member, manila_today(), 1)
  on conflict (gym_id, member_id, day) do update set messages = ai_usage_days.messages + 1;
  if not v_credit then
    if v_month + 1 >= v_monthly then
      perform ai_tell_owner(p_gym, 'ai-100-' || v_key, 'Your AI coach messages for this month are used',
        case when coalesce((select balance from gym_ai_credits where gym_id = p_gym), 0) > 0
             then 'The coach now uses your top-up messages.' else 'Members cannot ask it more until the 1st, unless you buy more on Your app.' end);
    elsif v_month + 1 >= ceil(v_monthly * 0.8) then
      perform ai_tell_owner(p_gym, 'ai-80-' || v_key, '80% of this month''s AI coach messages used',
        (v_month + 1) || ' of ' || v_monthly || '. You can buy more on Your app before it stops.');
    end if;
  end if;
  return true;
end;
$$;

create or replace function ai_tell_owner(p_gym uuid, p_key text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform act_as_gym(p_gym);
  for r in select user_id from gym_roles where gym_id = p_gym and role = 'admin' and status = 'active' loop
    perform notify_once(r.user_id, 'system', p_title, p_body, '/gym-app', p_key, p_gym);
  end loop;
  perform act_as_gym(null);
end;
$$;
revoke all on function ai_tell_owner(uuid, text, text, text) from public, anon, authenticated;

create or replace function migration_0189_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0189_applied() from public, anon;
grant execute on function migration_0189_applied() to authenticated;
comment on function migration_0189_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0189.sql
