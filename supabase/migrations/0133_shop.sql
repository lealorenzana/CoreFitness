-- 0133: SHOP & INVENTORY — the counter's drinks, supplements and merch
--
-- Decisions (conversation, 2026-09-27):
--   * Each gym adds what IT sells. The OWNER adds products, sets prices and
--     records stock (deliveries, counts, damage). The DESK rings up sales and
--     can void one the same day, with a reason, before the drawer is closed.
--   * Members see a menu in the phone app — what is sold, the price, and
--     "In stock / Low / Sold out" (never the exact count) — and pay at the desk.
--     The owner can hide any product from the app. No online payment: cash-only.
--   * Stock changes only through stock_moves (delivery, sale, void, count,
--     damage), each saying who and why; products.stock is kept by a trigger on
--     them, never written directly. A product is retired, never deleted, so
--     past sales keep their names.
--   * Cash sales join the day's expected cash in cash_day_summary (0095/0100),
--     so the drawer count includes the counter.

-- ---- 1. tables ------------------------------------------------------------------------------------

create table if not exists shop_products (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null default acting_gym_id() references gyms(id),
  name         text not null check (length(btrim(name)) between 1 and 80),
  category     text not null default 'Other' check (length(btrim(category)) between 1 and 40),
  description  text check (description is null or length(description) <= 300),
  price        numeric(10, 2) not null check (price >= 0),
  photo_url    text check (photo_url is null or position('/gyms/' || gym_id::text || '/content/' in photo_url) > 0),
  track_stock  boolean not null default true,
  stock        int not null default 0,
  low_stock_at int not null default 5 check (low_stock_at >= 0),
  shown_in_app boolean not null default true,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (gym_id, id)
);
create unique index if not exists shop_products_name on shop_products (gym_id, lower(name)) where active;

create table if not exists shop_sales (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  sale_day    date not null default ((now() at time zone 'Asia/Manila')::date),
  total       numeric(12, 2) not null check (total >= 0),
  member_id   uuid references profiles(id) on delete set null,
  sold_by     uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid references profiles(id),
  void_reason text,
  unique (gym_id, id),
  check ((voided_at is null) = (void_reason is null))
);
create index if not exists shop_sales_day_idx on shop_sales (gym_id, sale_day);

create table if not exists shop_sale_items (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  sale_id    uuid not null,
  product_id uuid not null,
  qty        int not null check (qty > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  unique (gym_id, id),
  foreign key (gym_id, sale_id) references shop_sales (gym_id, id) on delete cascade,
  foreign key (gym_id, product_id) references shop_products (gym_id, id)
);

create table if not exists stock_moves (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  product_id uuid not null,
  change     int not null check (change <> 0),
  reason     text not null check (reason in ('delivery', 'sale', 'void', 'count', 'damage')),
  note       text check (note is null or length(note) <= 200),
  sale_id    uuid,
  moved_by   uuid references profiles(id),
  moved_at   timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, product_id) references shop_products (gym_id, id),
  foreign key (gym_id, sale_id) references shop_sales (gym_id, id) on delete set null (sale_id)
);
create index if not exists stock_moves_product_idx on stock_moves (gym_id, product_id, moved_at desc);

-- products.stock follows the moves, and nothing else writes it.
create or replace function trg_stock_move_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cf.stock_from_move', 'on', true);
  update shop_products set stock = stock + new.change, updated_at = now() where id = new.product_id;
  perform set_config('cf.stock_from_move', 'off', true);
  return new;
end;
$$;
drop trigger if exists stock_move_apply on stock_moves;
create trigger stock_move_apply after insert on stock_moves for each row execute function trg_stock_move_apply();

create or replace function trg_stock_guard() returns trigger
language plpgsql as $$
begin
  if new.stock is distinct from old.stock and coalesce(current_setting('cf.stock_from_move', true), 'off') <> 'on' then
    raise exception 'Stock changes through a delivery, a sale or a count — not by editing the number.';
  end if;
  return new;
end;
$$;
drop trigger if exists stock_guard on shop_products;
create trigger stock_guard before update of stock on shop_products for each row execute function trg_stock_guard();

alter table shop_products   enable row level security;
alter table shop_sales      enable row level security;
alter table shop_sale_items enable row level security;
alter table stock_moves     enable row level security;
grant select on shop_products, shop_sales, shop_sale_items, stock_moves to authenticated;

-- The desk reads everything; members read the menu through shop_catalog().
drop policy if exists shop_products_read on shop_products;
create policy shop_products_read on shop_products for select to authenticated using (is_front_desk());
drop policy if exists shop_sales_read on shop_sales;
create policy shop_sales_read on shop_sales for select to authenticated using (is_front_desk());
drop policy if exists shop_sale_items_read on shop_sale_items;
create policy shop_sale_items_read on shop_sale_items for select to authenticated using (is_front_desk());
drop policy if exists stock_moves_read on stock_moves;
create policy stock_moves_read on stock_moves for select to authenticated using (is_front_desk());

-- ---- 2. the owner: products and stock -----------------------------------------------------------

create or replace function save_product(p_id uuid, p_name text, p_category text, p_price numeric,
  p_description text default null, p_photo_url text default null, p_track_stock boolean default true,
  p_low_stock_at int default 5, p_shown_in_app boolean default true, p_active boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  if storage_role_here() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the owner adds products and sets prices.' using errcode = '42501';
  end if;
  if p_price is null or p_price < 0 then raise exception 'Set a price of ₱0 or more.'; end if;
  if p_id is null then
    insert into shop_products (gym_id, name, category, price, description, photo_url, track_stock, low_stock_at, shown_in_app, active)
    values (v_gym, btrim(p_name), coalesce(nullif(btrim(p_category), ''), 'Other'), p_price, nullif(btrim(coalesce(p_description, '')), ''),
            p_photo_url, coalesce(p_track_stock, true), coalesce(p_low_stock_at, 5), coalesce(p_shown_in_app, true), coalesce(p_active, true))
    returning id into v_id;
  else
    update shop_products
       set name = btrim(p_name), category = coalesce(nullif(btrim(p_category), ''), 'Other'), price = p_price,
           description = nullif(btrim(coalesce(p_description, '')), ''), photo_url = p_photo_url,
           track_stock = coalesce(p_track_stock, true), low_stock_at = coalesce(p_low_stock_at, 5),
           shown_in_app = coalesce(p_shown_in_app, true), active = coalesce(p_active, true), updated_at = now()
     where id = p_id and gym_id = v_gym
    returning id into v_id;
    if v_id is null then raise exception 'That product is not in this gym.'; end if;
  end if;
  return v_id;
end;
$$;

-- A delivery (+), a count (set to what is on the shelf), or damage/expired (−).
create or replace function move_stock(p_product uuid, p_reason text, p_qty int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare p shop_products; v_change int;
begin
  if storage_role_here() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the owner records stock.' using errcode = '42501';
  end if;
  select * into p from shop_products where id = p_product and gym_id = current_gym_id() for update;
  if p.id is null then raise exception 'That product is not in this gym.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter a quantity of 0 or more.'; end if;
  v_change := case p_reason when 'delivery' then p_qty when 'damage' then -p_qty when 'count' then p_qty - p.stock end;
  if v_change is null then raise exception 'A stock change is a delivery, a count or damage.'; end if;
  if p_reason = 'count' and coalesce(btrim(p_note), '') = '' and v_change <> 0 then
    raise exception 'Say why the count is different (e.g. "shelf count Monday").';
  end if;
  if v_change <> 0 then
    insert into stock_moves (gym_id, product_id, change, reason, note, moved_by)
    values (p.gym_id, p.id, v_change, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  end if;
  return (select stock from shop_products where id = p.id);
end;
$$;

-- ---- 3. the desk: selling and voiding --------------------------------------------------------------

-- p_items: [{"product_id": "...", "qty": 2}, ...]. Prices are the database's,
-- not the screen's. Refuses what is not in stock. Tells the owner when a
-- product runs low.
create or replace function record_sale(p_items jsonb, p_member uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_sale uuid; it record; p shop_products; v_total numeric := 0; a uuid;
begin
  if not is_front_desk() or not gym_writable() then
    raise exception 'Only the front desk records a sale.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add something to the sale.'; end if;
  if p_member is not null and not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_member and role = 'member') then
    raise exception 'That person is not a member here.';
  end if;
  insert into shop_sales (gym_id, total, member_id, sold_by) values (v_gym, 0, p_member, auth.uid()) returning id into v_sale;
  for it in select (e->>'product_id')::uuid as product_id, (e->>'qty')::int as qty from jsonb_array_elements(p_items) e loop
    select * into p from shop_products where id = it.product_id and gym_id = v_gym for update;
    if p.id is null or not p.active then raise exception 'A product in the sale is not sold here.'; end if;
    if it.qty is null or it.qty < 1 then raise exception 'Quantities start at 1.'; end if;
    if p.track_stock and p.stock < it.qty then
      raise exception 'Only % % left.', p.stock, p.name;
    end if;
    insert into shop_sale_items (gym_id, sale_id, product_id, qty, unit_price) values (v_gym, v_sale, p.id, it.qty, p.price);
    if p.track_stock then
      insert into stock_moves (gym_id, product_id, change, reason, sale_id, moved_by) values (v_gym, p.id, -it.qty, 'sale', v_sale, auth.uid());
      if p.stock - it.qty <= p.low_stock_at then
        for a in select user_id from gym_roles where gym_id = v_gym and role = 'admin' and status = 'active' loop
          perform notify_once(a, 'system', 'Running low: ' || p.name,
            (p.stock - it.qty) || ' left. Record a delivery in Shop when it arrives.', '/shop',
            'lowstock:' || p.id || ':' || (now() at time zone 'Asia/Manila')::date, v_gym);
        end loop;
      end if;
    end if;
    v_total := v_total + it.qty * p.price;
  end loop;
  update shop_sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;

-- Same day and before the drawer is closed — after that the count has been
-- signed for, and correcting it is the owner redoing the close (0095).
create or replace function void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s shop_sales; it record;
begin
  if not is_front_desk() or not gym_writable() then
    raise exception 'Only the front desk voids a sale.' using errcode = '42501';
  end if;
  select * into s from shop_sales where id = p_sale and gym_id = current_gym_id() for update;
  if s.id is null then raise exception 'That sale is not in this gym.'; end if;
  if s.voided_at is not null then raise exception 'That sale was already voided.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Say why the sale is voided.'; end if;
  if s.sale_day <> (now() at time zone 'Asia/Manila')::date then raise exception 'Only today''s sales can be voided.'; end if;
  if exists (select 1 from cash_closeouts where gym_id = s.gym_id and day = s.sale_day) then
    raise exception 'Today''s drawer is already closed. The owner can redo the close if a sale was wrong.';
  end if;
  update shop_sales set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = s.id;
  for it in select i.product_id, i.qty from shop_sale_items i join shop_products p on p.id = i.product_id
             where i.sale_id = s.id and p.track_stock loop
    insert into stock_moves (gym_id, product_id, change, reason, sale_id, note, moved_by)
    values (s.gym_id, it.product_id, it.qty, 'void', s.id, btrim(p_reason), auth.uid());
  end loop;
end;
$$;

-- ---- 4. what the screens read ------------------------------------------------------------------

-- The member's menu: what is sold here and whether it is in — never the count.
create or replace function shop_catalog()
returns table (id uuid, name text, category text, description text, price numeric, photo_url text, availability text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.category, p.description, p.price, p.photo_url,
         case when not p.track_stock then 'in_stock' when p.stock <= 0 then 'sold_out'
              when p.stock <= p.low_stock_at then 'low' else 'in_stock' end
    from shop_products p
   where p.gym_id = current_gym_id() and p.active and p.shown_in_app
   order by p.category, p.name;
$$;

-- Sales between two Manila days, by product (voids excluded).
create or replace function shop_report(p_from date, p_to date)
returns table (product_id uuid, name text, qty int, revenue numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, sum(i.qty)::int, sum(i.qty * i.unit_price)
    from shop_sale_items i join shop_sales s on s.id = i.sale_id join shop_products p on p.id = i.product_id
   where s.gym_id = current_gym_id() and is_front_desk() and s.voided_at is null
     and s.sale_day between p_from and p_to
   group by p.id, p.name
   order by 4 desc;
$$;

-- ---- 5. the drawer now counts the counter ------------------------------------------------------

create or replace function cash_day_summary(p_day date)
returns table (day date, cash_in numeric, refunds_out numeric, expected numeric, payment_count int,
               closed boolean, counted numeric, difference numeric, note text, closed_by_name text, closed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_in numeric; v_out numeric; v_n int; v_shop numeric; v_shop_n int;
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
  select coalesce(sum(e.refund_amount), 0) into v_out
    from membership_events e
   where e.gym_id = v_gym
     and e.refund_amount is not null
     and (e.created_at at time zone 'Asia/Manila')::date = p_day;
  return query
  select p_day, v_in + v_shop, v_out, v_in + v_shop - v_out, v_n + v_shop_n,
         c.day is not null, c.counted, c.difference, c.note,
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), c.closed_at
    from (select 1) one
    left join cash_closeouts c on c.gym_id = v_gym and c.day = p_day
    left join profiles pr on pr.id = c.closed_by;
end;
$$;

-- ---- 6. tenancy ----------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['shop_products', 'shop_sales', 'shop_sale_items', 'stock_moves'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

revoke all on function trg_stock_move_apply(), save_product(uuid, text, text, numeric, text, text, boolean, int, boolean, boolean),
  move_stock(uuid, text, int, text), record_sale(jsonb, uuid), void_sale(uuid, text), shop_catalog(), shop_report(date, date)
  from public, anon;
revoke all on function trg_stock_move_apply() from authenticated;
grant execute on function save_product(uuid, text, text, numeric, text, text, boolean, int, boolean, boolean),
  move_stock(uuid, text, int, text), record_sale(jsonb, uuid), void_sale(uuid, text), shop_catalog(), shop_report(date, date)
  to authenticated;

create or replace function migration_0133_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0133_applied() from public, anon;
grant execute on function migration_0133_applied() to authenticated;
comment on function migration_0133_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0133.sql
