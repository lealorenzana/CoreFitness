-- ============================================================================
-- 0185 — Day passes and walk-ins, at the desk
-- ============================================================================
--
-- A walk-in is not a member: no account, no plan, never in the member lists
-- and never counted toward the gym's Core Fitness member limit. The desk types
-- the guest's name (and phone, optional), takes the cash for a day pass — or
-- sells a 5- or 10-visit pack and spends a visit from it — and the visit lands
-- in attendance and in the day's cash drawer (cash_day_summary). Typing the
-- phone next time finds the same guest, so their visits add up; after the
-- owner's number of visits in a month the desk is told to suggest a membership.
--
-- The owner sets it in Settings: whether day passes are sold, the price per
-- day, and optional 5- and 10-visit pack prices. The platform sees guest
-- visits as a number on Usage.
--
-- (A guest buying a day pass in the member app comes with in-app payments.)
-- ============================================================================

alter table gym_settings add column if not exists day_pass_on boolean not null default false;
alter table gym_settings add column if not exists day_pass_price numeric(10,2) check (day_pass_price is null or day_pass_price >= 0);
alter table gym_settings add column if not exists pack5_price numeric(10,2) check (pack5_price is null or pack5_price >= 0);
alter table gym_settings add column if not exists pack10_price numeric(10,2) check (pack10_price is null or pack10_price >= 0);
alter table gym_settings add column if not exists guest_nudge_visits int check (guest_nudge_visits is null or guest_nudge_visits between 2 and 31);

create table if not exists guests (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default current_gym_id() references gyms(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  phone       text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  visits_left int  not null default 0 check (visits_left between 0 and 100),
  created_at  timestamptz not null default now(),
  unique (gym_id, id)
);
-- The phone finds the guest next time — one guest per number per gym. Its
-- last ten digits, so 0917 555 0101 and +63 917-555-0101 are one number.
create or replace function phone_key(p text) returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10);
$$;
create unique index if not exists guests_phone_once on guests (gym_id, phone_key(phone)) where phone is not null;

create table if not exists guest_visits (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default current_gym_id() references gyms(id) on delete cascade,
  guest_id    uuid not null,
  visited_at  timestamptz not null default now(),
  visit_day   date not null default (now() at time zone 'Asia/Manila')::date,
  kind        text not null check (kind in ('day', 'pack5', 'pack10', 'pack_visit')),
  amount      numeric(10,2) not null default 0 check (amount >= 0),
  method      text not null default 'cash' check (method in ('cash', 'online')),
  recorded_by uuid references profiles(id),
  voided_at   timestamptz,
  foreign key (gym_id, guest_id) references guests (gym_id, id) on delete cascade
);
create index if not exists guest_visits_day_idx on guest_visits (gym_id, visit_day);

alter table guests enable row level security;
alter table guest_visits enable row level security;
-- The desk only. Guests are not members and have no account to read with.
drop policy if exists guests_desk_read on guests;
create policy guests_desk_read on guests for select to authenticated using (is_front_desk());
drop policy if exists guest_visits_desk_read on guest_visits;
create policy guest_visits_desk_read on guest_visits for select to authenticated using (is_front_desk());
grant select on guests, guest_visits to authenticated;

do $$
declare t text;
begin
  foreach t in array array['guests', 'guest_visits'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end
$$;

-- The owner's choices.
create or replace function set_day_pass_settings(p_on boolean, p_day numeric, p_pack5 numeric, p_pack10 numeric, p_nudge int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets day-pass prices.' using errcode = '42501';
  end if;
  if p_on and p_day is null then raise exception 'Set a day-pass price, or turn day passes off.'; end if;
  if coalesce(p_day, 0) < 0 or coalesce(p_pack5, 0) < 0 or coalesce(p_pack10, 0) < 0 then raise exception 'A price cannot be below zero.'; end if;
  if p_nudge is not null and p_nudge not between 2 and 31 then raise exception 'Suggest a membership after 2 to 31 visits a month, or never.'; end if;
  update gym_settings set day_pass_on = p_on, day_pass_price = p_day, pack5_price = p_pack5, pack10_price = p_pack10,
         guest_nudge_visits = p_nudge
   where gym_id = acting_gym_id();
end;
$$;
revoke all on function set_day_pass_settings(boolean, numeric, numeric, numeric, int) from public, anon;
grant execute on function set_day_pass_settings(boolean, numeric, numeric, numeric, int) to authenticated;

-- What the desk sees before taking money: is this phone a guest we know?
create or replace function find_guest(p_phone text)
returns table (id uuid, name text, phone text, visits_left int, visits_this_month int, last_visit date)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.phone, g.visits_left,
         (select count(*)::int from guest_visits v where v.guest_id = g.id and v.voided_at is null
             and date_trunc('month', v.visit_day) = date_trunc('month', manila_today())),
         (select max(v.visit_day) from guest_visits v where v.guest_id = g.id and v.voided_at is null)
    from guests g
   where is_front_desk() and g.gym_id = current_gym_id()
     and length(phone_key(p_phone)) >= 7
     and phone_key(g.phone) = phone_key(p_phone);
$$;
revoke all on function find_guest(text) from public, anon;
grant execute on function find_guest(text) to authenticated;

-- One walk-in visit. p_kind: 'day' (pay for today), 'pack5'/'pack10' (buy a
-- pack — today is its first visit), 'pack_visit' (spend one left on a pack).
-- The price is the gym's, never the screen's. Returns what the desk needs to
-- say next.
create or replace function record_guest_visit(p_guest uuid, p_name text, p_phone text, p_kind text, p_method text default 'cash')
returns table (guest_id uuid, visits_left int, amount numeric, visits_this_month int, suggest_membership boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_gym uuid := current_gym_id(); s record; g guests; v_amount numeric := 0; v_month int;
begin
  if not is_front_desk() then raise exception 'The front desk records walk-ins.' using errcode = '42501'; end if;
  select gs.day_pass_on, gs.day_pass_price, gs.pack5_price, gs.pack10_price, gs.guest_nudge_visits into s
    from gym_settings gs where gs.gym_id = v_gym;
  if not coalesce(s.day_pass_on, false) then raise exception 'Day passes are off. Turn them on in Settings → Walk-ins.'; end if;
  if p_kind not in ('day', 'pack5', 'pack10', 'pack_visit') then raise exception 'Choose a day pass, a pack, or a visit from a pack.'; end if;
  if p_method not in ('cash', 'online') then raise exception 'Cash or online.'; end if;

  if p_guest is not null then
    select * into g from guests where id = p_guest and gym_id = v_gym for update;
    if g.id is null then raise exception 'That guest is not on this gym''s list.'; end if;
  else
    if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'Type the guest''s name.'; end if;
    insert into guests (gym_id, name, phone) values (v_gym, left(btrim(p_name), 80), nullif(btrim(coalesce(p_phone, '')), ''))
    returning * into g;
  end if;

  if p_kind = 'day' then
    v_amount := s.day_pass_price;
  elsif p_kind = 'pack5' then
    if s.pack5_price is null then raise exception 'This gym does not sell a 5-visit pack.'; end if;
    v_amount := s.pack5_price;
    update guests set visits_left = visits_left + 4 where id = g.id returning * into g;
  elsif p_kind = 'pack10' then
    if s.pack10_price is null then raise exception 'This gym does not sell a 10-visit pack.'; end if;
    v_amount := s.pack10_price;
    update guests set visits_left = visits_left + 9 where id = g.id returning * into g;
  else
    if g.visits_left < 1 then raise exception '% has no visits left on a pack.', g.name; end if;
    update guests set visits_left = visits_left - 1 where id = g.id returning * into g;
  end if;

  insert into guest_visits (gym_id, guest_id, kind, amount, method, recorded_by)
  values (v_gym, g.id, p_kind, v_amount, p_method, auth.uid());

  select count(*)::int into v_month from guest_visits v
   where v.guest_id = g.id and v.voided_at is null and date_trunc('month', v.visit_day) = date_trunc('month', manila_today());
  return query select g.id, g.visits_left, v_amount, v_month,
                      (s.guest_nudge_visits is not null and v_month >= s.guest_nudge_visits);
exception when unique_violation then
  raise exception 'A guest with that phone is already on the list — look them up by phone.';
end;
$$;
revoke all on function record_guest_visit(uuid, text, text, text, text) from public, anon;
grant execute on function record_guest_visit(uuid, text, text, text, text) to authenticated;

-- A mistake at the counter, the same day, before the drawer is closed (as 0133's shop voids).
create or replace function void_guest_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v guest_visits;
begin
  if not is_front_desk() then raise exception 'The front desk voids a visit.' using errcode = '42501'; end if;
  select * into v from guest_visits where id = p_visit and gym_id = current_gym_id() for update;
  if v.id is null or v.voided_at is not null then raise exception 'That visit is not here, or already voided.'; end if;
  if v.visit_day <> manila_today() then raise exception 'Only today''s visits can be voided.'; end if;
  if exists (select 1 from cash_closeouts c where c.gym_id = v.gym_id and c.day = v.visit_day) then
    raise exception 'Today''s drawer is closed — a void now would not match the count.';
  end if;
  update guest_visits set voided_at = now() where id = p_visit;
  update guests set visits_left = greatest(0, visits_left + case v.kind when 'pack_visit' then 1 when 'pack5' then -4 when 'pack10' then -9 else 0 end)
   where id = v.guest_id;
end;
$$;
revoke all on function void_guest_visit(uuid) from public, anon;
grant execute on function void_guest_visit(uuid) to authenticated;

-- A day's walk-ins for the desk's list.
create or replace function guest_visits_on(p_day date)
returns table (id uuid, guest_id uuid, name text, phone text, kind text, amount numeric, method text, visited_at timestamptz, voided boolean, visits_left int)
language sql stable security definer set search_path = public as $$
  select v.id, g.id, g.name, g.phone, v.kind, v.amount, v.method, v.visited_at, v.voided_at is not null, g.visits_left
    from guest_visits v join guests g on g.id = v.guest_id
   where is_front_desk() and v.gym_id = current_gym_id() and v.visit_day = p_day
   order by v.visited_at desc;
$$;
revoke all on function guest_visits_on(date) from public, anon;
grant execute on function guest_visits_on(date) to authenticated;

-- ---------------------------------------------------------------------------
-- The drawer counts walk-in cash (0133's body, plus guest_visits).
-- ---------------------------------------------------------------------------
create or replace function cash_day_summary(p_day date)
returns table (day date, cash_in numeric, refunds_out numeric, expected numeric, payment_count int,
               closed boolean, counted numeric, difference numeric, note text, closed_by_name text, closed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_in numeric; v_out numeric; v_n int; v_shop numeric; v_shop_n int; v_guest numeric; v_guest_n int;
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the front desk can see the cash drawer' using errcode = '42501';
  end if;
  select coalesce(sum(p.amount), 0), count(*)::int into v_in, v_n
    from payments p
   where p.gym_id = v_gym
     and p.status = 'completed'
     and lower(p.method) = 'cash'
     and coalesce(p.paid_on, (p.created_at at time zone 'Asia/Manila')::date) = p_day;
  -- Counter sales (0133): cash, not voided.
  select coalesce(sum(s.total), 0), count(*)::int into v_shop, v_shop_n
    from shop_sales s where s.gym_id = v_gym and s.sale_day = p_day and s.voided_at is null;
  -- Walk-ins (0185): cash day passes and packs, not voided. A visit spent from a pack is ₱0.
  select coalesce(sum(v.amount), 0), count(*) filter (where v.amount > 0)::int into v_guest, v_guest_n
    from guest_visits v where v.gym_id = v_gym and v.visit_day = p_day and v.voided_at is null and v.method = 'cash';
  select coalesce(sum(e.refund_amount), 0) into v_out
    from membership_events e
   where e.gym_id = v_gym
     and e.refund_amount is not null
     and (e.created_at at time zone 'Asia/Manila')::date = p_day;
  return query
  select p_day, v_in + v_shop + v_guest, v_out, v_in + v_shop + v_guest - v_out, v_n + v_shop_n + v_guest_n,
         c.day is not null, c.counted, c.difference, c.note,
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), c.closed_at
    from (select 1) one
    left join cash_closeouts c on c.gym_id = v_gym and c.day = p_day
    left join profiles pr on pr.id = c.closed_by;
end;
$$;

-- ---------------------------------------------------------------------------
-- The platform sees guest visits as a number (0149's usage, plus 'guests').
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'platform_gym_usage')
     and not exists (select 1 from pg_proc where proname = 'platform_gym_usage_v1') then
    alter function platform_gym_usage(int) rename to platform_gym_usage_v1;
  end if;
end
$$;
revoke all on function platform_gym_usage_v1(int) from public, anon, authenticated;
create or replace function platform_gym_usage(p_days int default 30)
returns table (gym_id uuid, feature text, n bigint)
language sql stable security definer set search_path = public as $$
  select * from platform_gym_usage_v1(p_days)
  union all
  select v.gym_id, 'guests'::text, count(*)::bigint from guest_visits v
   where is_platform_admin() and v.voided_at is null
     and v.visited_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   group by v.gym_id;
$$;
revoke all on function platform_gym_usage(int) from public, anon;
grant execute on function platform_gym_usage(int) to authenticated;

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','coaching_prices','coaching_standins','coachings','conversations',
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
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0185_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0185_applied() from public, anon;
grant execute on function migration_0185_applied() to authenticated;
comment on function migration_0185_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0185.sql
