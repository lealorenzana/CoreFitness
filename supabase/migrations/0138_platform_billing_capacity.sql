-- 0138 — Billing and capacity: the platform's side of being paid, and of staying
-- inside Supabase's free tier.
--
-- 1. The grace period is the platform's setting, not a 7 typed into three places.
--    0099/0111 hard-coded "read-only seven days after paid_until" in
--    gym_lock_reason() AND gym_state(), and the admin banner and the platform's
--    Money page each did the same arithmetic again. One row now holds it, both
--    functions read it, and both screens ask for it.
-- 2. Nobody should learn of a lock from the lock. billing_reminders_sweep()
--    tells a gym's owners N days before paid_until (the platform chooses N), on
--    the day, the day after, and the day it goes read-only — each once, through
--    notify_once. It runs on page load (pg_cron is optional here): the platform
--    sweeps every gym, an owner's admin app sweeps its own.
-- 3. A payment gets a receipt, and a receipt number is unique because a
--    constraint says so: CF-<year>-<00001>, from a per-year counter row taken
--    under its lock, never from a formula. Existing payments are numbered in the
--    order they were paid. The business details printed on it come from this
--    table, never typed into a component.
-- 4. Capacity: the free tier is 500 MB of database and 1 GB of storage.
--    platform_capacity() reports the database size, the biggest tables, each
--    bucket and each gym's own media folder — sizes, never a gym's rows.
--
-- Trial gyms: a gym with no paid_until is never locked (0099), so a free trial
-- does not *end* anywhere in the system. The sweep therefore reminds only about
-- paid_until — telling an owner "your trial ends Friday" when nothing happens on
-- Friday would be a lie.

-- ============================================================================
-- 1. THE PLATFORM'S BILLING SETTINGS
-- ============================================================================
create table if not exists platform_billing (
  id              boolean primary key default true check (id),
  grace_days      int  not null default 7 check (grace_days between 0 and 60),
  reminder_days   int[] not null default '{7,3,1}',
  business_name   text not null default 'Core Fitness',
  business_address text,
  business_email  text,
  business_phone  text,
  receipt_note    text,
  updated_at      timestamptz not null default now(),
  constraint platform_billing_reminders check (
    cardinality(reminder_days) <= 6 and 0 < all (reminder_days) and 60 >= all (reminder_days))
);
insert into platform_billing (id) values (true) on conflict do nothing;
alter table platform_billing enable row level security;
comment on table platform_billing is
  'The platform''s billing settings (0138), one row. RLS on, no policy: read through '
  'billing_settings(), written by set_billing_settings() (platform only).';

-- Grace days, for anyone signed in: a gym's owner is shown when their gym goes read-only.
create or replace function platform_grace_days() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select grace_days from platform_billing where id), 7);
$$;
revoke all on function platform_grace_days() from public, anon;
grant execute on function platform_grace_days() to authenticated;

create or replace function billing_settings()
returns table (grace_days int, reminder_days int[], business_name text, business_address text,
               business_email text, business_phone text, receipt_note text)
language sql stable security definer set search_path = public as $$
  select b.grace_days, b.reminder_days, b.business_name, b.business_address,
         b.business_email, b.business_phone, b.receipt_note
    from platform_billing b
   where b.id and is_platform_admin();
$$;
revoke all on function billing_settings() from public, anon;
grant execute on function billing_settings() to authenticated;

create or replace function set_billing_settings(
  p_grace_days int, p_reminder_days int[], p_business_name text, p_business_address text,
  p_business_email text, p_business_phone text, p_receipt_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform sets billing.' using errcode = '42501';
  end if;
  if p_grace_days is null or p_grace_days not between 0 and 60 then
    raise exception 'The grace period is 0 to 60 days.';
  end if;
  if coalesce(btrim(p_business_name), '') = '' then
    raise exception 'Receipts need a business name.';
  end if;
  update platform_billing
     set grace_days = p_grace_days,
         reminder_days = (select coalesce(array_agg(distinct d order by d desc), '{}')
                            from unnest(coalesce(p_reminder_days, '{}')) d where d is not null),
         business_name = btrim(p_business_name),
         business_address = nullif(btrim(p_business_address), ''),
         business_email = nullif(btrim(p_business_email), ''),
         business_phone = nullif(btrim(p_business_phone), ''),
         receipt_note = nullif(btrim(p_receipt_note), ''),
         updated_at = now()
   where id;
  perform platform_log(null, 'billing.settings',
    'Billing settings changed: read-only ' || p_grace_days || ' days after the due date',
    jsonb_build_object('grace_days', p_grace_days, 'reminder_days', p_reminder_days));
end;
$$;
revoke all on function set_billing_settings(int, int[], text, text, text, text, text) from public, anon;
grant execute on function set_billing_settings(int, int[], text, text, text, text, text) to authenticated;

-- The two functions that decided "seven" now ask. Signatures unchanged.
create or replace function gym_lock_reason(p_gym uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case
           when g.status = 'archived'  then 'archived'
           when g.status = 'cancelled' then 'cancelled'
           when g.status = 'suspended' then 'suspended'
           when g.paid_until is not null
                and g.paid_until < (now() at time zone 'Asia/Manila')::date - platform_grace_days() then 'overdue'
         end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

create or replace function gym_state(p_gym uuid default null)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when g.status = 'archived'  then 'archived'
    when g.status = 'cancelled' then 'cancelled'
    when g.status = 'suspended' then 'suspended'
    when not exists (select 1 from gym_roles r
                      where r.gym_id = g.id and r.role = 'admin' and r.status = 'active')
      then 'no_owner'
    when g.onboarded_at is null then 'onboarding'
    -- Past its date by more than the platform's grace period (0138).
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date - platform_grace_days() then 'overdue'
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date then 'due'
    when not exists (select 1 from gym_payments x where x.gym_id = g.id)
         and coalesce((select pp.trial_days from platform_plans pp where pp.key = g.plan), 0) > 0
      then 'trial'
    else 'active'
  end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

-- ============================================================================
-- 2. REMINDERS BEFORE THE LOCK
-- ============================================================================
-- Each message once per gym, per owner, per due date, per step — a renewal
-- moves paid_until, so the next cycle's reminders are new keys.
create or replace function billing_reminders_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_grace int  := platform_grace_days();
  v_days  int[] := coalesce((select reminder_days from platform_billing where id), '{7,3,1}');
  v_all   boolean := is_platform_admin();
  v_sent  int := 0;
  g record; o record;
  v_left int; v_step text; v_title text; v_msg text; v_locks date;
begin
  if auth.uid() is null then return 0; end if;
  for g in
    select x.id, x.name, x.paid_until from gyms x
     where x.status = 'active' and x.paid_until is not null
       and (v_all or x.id = current_gym_id())
  loop
    v_left  := g.paid_until - v_today;
    v_locks := g.paid_until + v_grace + 1;          -- the first read-only day
    v_step  := null;
    if v_left > 0 and v_left = any (v_days) then
      v_step := 'before-' || v_left;
      v_title := 'Your Core Fitness plan runs out in ' || v_left || ' day' || case when v_left = 1 then '' else 's' end;
      v_msg := 'Covered to ' || to_char(g.paid_until, 'FMDD Mon YYYY') || '. Pay Core Fitness before then to keep everything running.';
    elsif v_left = 0 then
      v_step := 'today';
      v_title := 'Your Core Fitness plan runs out today';
      v_msg := 'After today you have ' || v_grace || ' day' || case when v_grace = 1 then '' else 's' end
               || ' before the system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY') || '.';
    elsif v_left < 0 and v_today < v_locks and v_left = -1 then
      v_step := 'overdue';
      v_title := 'Your Core Fitness payment is overdue';
      v_msg := 'The system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY')
               || '. Nothing is deleted; it comes straight back when it is paid.';
    elsif v_today >= v_locks then
      v_step := 'locked';
      v_title := 'Your gym is read-only';
      v_msg := 'Core Fitness was due ' || to_char(g.paid_until, 'FMDD Mon YYYY')
               || '. Everything is still here and comes straight back when it is paid.';
    end if;
    continue when v_step is null;

    for o in select r.user_id from gym_roles r
              where r.gym_id = g.id and r.role = 'admin' and r.status = 'active'
    loop
      if notify_once(o.user_id, 'system', v_title, v_msg, '/subscription',
                     'billing:' || g.id || ':' || g.paid_until || ':' || v_step, g.id) then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;
  return v_sent;
end;
$$;
revoke all on function billing_reminders_sweep() from public, anon;
grant execute on function billing_reminders_sweep() to authenticated;

-- ============================================================================
-- 3. RECEIPTS
-- ============================================================================
create table if not exists platform_receipt_counters (
  year int primary key,
  last int not null default 0
);
alter table platform_receipt_counters enable row level security;
comment on table platform_receipt_counters is
  'Receipt numbers per year (0138). RLS on, no policy; only the gym_payments trigger touches it.';

alter table gym_payments add column if not exists receipt_no text;

create or replace function next_receipt_no(p_on date) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from coalesce(p_on, (now() at time zone 'Asia/Manila')::date))::int; v_n int;
begin
  insert into platform_receipt_counters (year, last) values (v_year, 1)
  on conflict (year) do update set last = platform_receipt_counters.last + 1
  returning last into v_n;
  return 'CF-' || v_year || '-' || lpad(v_n::text, 5, '0');
end;
$$;
revoke all on function next_receipt_no(date) from public, anon, authenticated;

create or replace function trg_gym_payment_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.receipt_no := next_receipt_no(new.paid_on);   -- always ours, never the caller's
  return new;
end;
$$;
drop trigger if exists gym_payment_receipt on gym_payments;
create trigger gym_payment_receipt before insert on gym_payments
  for each row execute function trg_gym_payment_receipt();

-- Number what was paid before today, in the order it was paid.
do $$
declare p record;
begin
  for p in select id, paid_on from gym_payments where receipt_no is null order by paid_on, created_at, id loop
    update gym_payments set receipt_no = next_receipt_no(p.paid_on) where id = p.id;
  end loop;
end $$;
alter table gym_payments alter column receipt_no set not null;
do $$ begin
  alter table gym_payments add constraint gym_payments_receipt_no_key unique (receipt_no);
exception when duplicate_table or duplicate_object then null; end $$;

-- A receipt number cannot be changed after it is issued.
create or replace function trg_gym_payment_receipt_fixed() returns trigger
language plpgsql as $$
begin
  if new.receipt_no is distinct from old.receipt_no then
    raise exception 'A receipt number never changes once issued.';
  end if;
  return new;
end;
$$;
drop trigger if exists gym_payment_receipt_fixed on gym_payments;
create trigger gym_payment_receipt_fixed before update on gym_payments
  for each row execute function trg_gym_payment_receipt_fixed();

-- One receipt: for the platform, or for the admin of the gym that paid.
create or replace function gym_payment_receipt(p_payment uuid)
returns table (receipt_no text, amount numeric, paid_on date, covers_from date, covers_until date,
               method text, reference text, plan_name text, gym_name text, gym_address text,
               business_name text, business_address text, business_email text, business_phone text,
               receipt_note text)
language sql stable security definer set search_path = public as $$
  select p.receipt_no, p.amount, p.paid_on, p.covers_from, p.covers_until, p.method, p.reference,
         coalesce(pp.name, p.plan_key), g.name, s.address,
         b.business_name, b.business_address, b.business_email, b.business_phone, b.receipt_note
    from gym_payments p
    join gyms g on g.id = p.gym_id
    left join gym_settings s on s.gym_id = g.id
    left join platform_plans pp on pp.key = p.plan_key
    cross join platform_billing b
   where p.id = p_payment and b.id
     and (is_platform_admin()
          or exists (select 1 from gym_roles r where r.gym_id = p.gym_id and r.user_id = auth.uid()
                        and r.role = 'admin' and r.status = 'active'));
$$;
revoke all on function gym_payment_receipt(uuid) from public, anon;
grant execute on function gym_payment_receipt(uuid) to authenticated;

-- The gym's own subscription, for its owner: dates, grace and every payment.
create or replace function my_gym_subscription()
returns table (plan_name text, price_monthly numeric, paid_until date, days_left int,
               grace_days int, read_only_on date, lock_reason text,
               max_members int, members int, max_staff int, staff int)
language sql stable security definer set search_path = public as $$
  select pp.name, pp.price_monthly, g.paid_until,
         case when g.paid_until is null then null else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         platform_grace_days(),
         case when g.paid_until is null then null else g.paid_until + platform_grace_days() + 1 end,
         gym_lock_reason(g.id),
         h.max_members, h.members, h.max_staff, h.staff
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    cross join lateral gym_headroom(g.id) h
   where g.id = current_gym_id()
     and get_my_role() is not distinct from 'admin';
$$;
revoke all on function my_gym_subscription() from public, anon;
grant execute on function my_gym_subscription() to authenticated;

create or replace function my_gym_payments()
returns table (id uuid, receipt_no text, amount numeric, paid_on date, covers_from date,
               covers_until date, method text, plan_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.receipt_no, p.amount, p.paid_on, p.covers_from, p.covers_until, p.method,
         coalesce(pp.name, p.plan_key)
    from gym_payments p
    left join platform_plans pp on pp.key = p.plan_key
   where p.gym_id = current_gym_id()
     and get_my_role() is not distinct from 'admin'
   order by p.paid_on desc, p.created_at desc;
$$;
revoke all on function my_gym_payments() from public, anon;
grant execute on function my_gym_payments() to authenticated;

-- ============================================================================
-- 4. CAPACITY
-- ============================================================================
-- Sizes only. `kind`: database | table | bucket | gym | users.
create or replace function platform_capacity()
returns table (kind text, key text, label text, used bigint, cap bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;

  return query select 'database'::text, current_database()::text, 'Database'::text,
    pg_database_size(current_database())::bigint, (500::bigint * 1024 * 1024);

  return query
    select 'table'::text, c.relname::text, c.relname::text, pg_total_relation_size(c.oid)::bigint, null::bigint
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc
     limit 8;

  return query
    select 'bucket'::text, o.bucket_id::text, o.bucket_id::text,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, null::bigint
      from storage.objects o
     group by o.bucket_id
     order by 4 desc;

  return query select 'storage'::text, 'all'::text, 'Storage, every bucket'::text,
    coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0)::bigint,
    (1024::bigint * 1024 * 1024);

  -- A gym's own files live under gyms/<gym_id>/ (0120).
  return query
    select 'gym'::text, g.id::text, g.name::text, x.bytes, null::bigint
      from (select (storage.foldername(o.name))[2] as gym, sum((o.metadata ->> 'size')::bigint)::bigint as bytes
              from storage.objects o
             where (storage.foldername(o.name))[1] = 'gyms'
             group by 1) x
      join gyms g on g.id::text = x.gym
     order by x.bytes desc
     limit 20;

  return query select 'users'::text, 'mau'::text, 'People signed in, last 30 days'::text,
    (select count(*) from auth.users u
      where (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz > now() - interval '30 days')::bigint,
    50000::bigint;
end;
$$;
revoke all on function platform_capacity() from public, anon;
grant execute on function platform_capacity() to authenticated;

-- ============================================================================
-- 5. THE BELL LEARNS ABOUT SPACE
-- ============================================================================
-- 0137's bell plus one line: the database or storage past 80% of the free tier.
create or replace function platform_bell()
returns table (kind text, label text, count int, href text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('applications', 'Gyms asking to join',
      (select count(*)::int from gym_applications where status = 'pending'), '/applications'),
    ('support', 'Support messages waiting',
      (select count(*)::int from support_tickets t where t.status <> 'closed' and t.last_from = 'gym'), '/support'),
    ('overdue', 'Gyms past their paid-until date',
      (select count(*)::int from gyms g where g.status = 'active' and g.paid_until < (now() at time zone 'Asia/Manila')::date), '/money'),
    ('crashes', 'Open crash reports',
      (select count(*)::int from client_errors c where c.created_at > now() - interval '14 days'
         and (to_jsonb(c) ->> 'resolved_at') is null), '/platform'),
    ('capacity', 'Free-tier limits past 80%',
      ((pg_database_size(current_database()) > 0.8 * 500 * 1024 * 1024)::int
       + ((select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o) > 0.8 * 1024 * 1024 * 1024)::int),
      '/capacity')
  ) v(kind, label, count, href)
  where is_platform_admin() and v.count > 0;
$$;

create or replace function migration_0138_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0138_applied() from public, anon;
grant execute on function migration_0138_applied() to authenticated;
comment on function migration_0138_applied() is
  'Probe marker: 0138 (billing settings, reminders, receipts, capacity) is live.';
