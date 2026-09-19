-- 0095 — Running the gym day to day: crash reports, the cash drawer, trainer
-- monthly totals, and a language preference.
--
-- 1. client_errors — when a screen breaks on a member's phone or the desk PC,
--    the app files one row here. Until now a crash was known only if somebody
--    complained. Anyone (signed in or not — the login screen breaks too) may
--    insert; only an admin may read or clear. Length-capped, and a global cap of
--    300 rows an hour drops the rest silently, so a crash loop or a vandal
--    cannot fill the free tier. Rows older than 60 days are pruned by
--    `prune_client_errors()`, which the admin's System page calls on open.
--
-- 2. cash_closeouts — the end-of-day count for a cash-only gym. The desk types
--    what is in the drawer; the database works out what *should* be there from
--    the day's completed cash payments minus refunds paid out on cancellations
--    (0070's `membership_events.refund_amount`), both counted on the Manila
--    date. Expected is computed here, never sent by the client, so the
--    difference cannot be typed to zero. A difference needs a note. One close
--    per day; an admin may redo it (again with a note), and the first count is
--    kept in `previous`.
--
-- 3. trainer_month_summary(month) — sessions and classes each coach delivered
--    in a Manila calendar month, for paying them. Delivered means what 0028
--    means: approved and already started. Admin and front desk only.
--
-- 4. member_profiles.preferred_language — 'en' or 'fil', chosen in the phone
--    app's Settings. A column, not localStorage: per-user state never lives on
--    one device (CLAUDE.md), and the row exists from signup (0036).

-- ============================================================================
-- 1. CLIENT ERRORS
-- ============================================================================
create table if not exists client_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references profiles(id) on delete set null,
  app         text not null check (app in ('member', 'admin')),
  route       text check (char_length(route) <= 300),
  message     text not null check (char_length(message) <= 1000),
  stack       text check (char_length(stack) <= 4000),
  user_agent  text check (char_length(user_agent) <= 300),
  build       text check (char_length(build) <= 80)
);

create index if not exists idx_client_errors_created on client_errors(created_at desc);

alter table client_errors enable row level security;

drop policy if exists client_errors_insert_any on client_errors;
create policy client_errors_insert_any on client_errors for insert
  to anon, authenticated
  -- Nobody files a report in someone else's name.
  with check (user_id is not distinct from auth.uid());

drop policy if exists client_errors_read_admin on client_errors;
create policy client_errors_read_admin on client_errors for select
  using (coalesce(get_my_role()::text, '') = 'admin');

drop policy if exists client_errors_delete_admin on client_errors;
create policy client_errors_delete_admin on client_errors for delete
  using (coalesce(get_my_role()::text, '') = 'admin');

grant insert on client_errors to anon, authenticated;
grant select, delete on client_errors to authenticated;

-- A crash loop on one phone must not fill the database. Returning NULL from a
-- BEFORE trigger skips the row without an error, which is what the reporter
-- wants — it is fire-and-forget and must never throw at the user.
create or replace function client_errors_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors where created_at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_errors_cap on client_errors;
create trigger trg_client_errors_cap before insert on client_errors
  for each row execute function client_errors_cap();

create or replace function prune_client_errors() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or coalesce(get_my_role()::text, '') <> 'admin' then
    return 0;
  end if;
  delete from client_errors where created_at < now() - interval '60 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function prune_client_errors() from public, anon;
grant execute on function prune_client_errors() to authenticated;

-- ============================================================================
-- 2. THE CASH DRAWER
-- ============================================================================
create table if not exists cash_closeouts (
  day           date primary key,
  expected      numeric(12,2) not null,
  counted       numeric(12,2) not null check (counted >= 0),
  difference    numeric(12,2) generated always as (counted - expected) stored,
  payment_count int not null default 0,
  refunds_out   numeric(12,2) not null default 0,
  note          text,
  closed_by     uuid references profiles(id),
  closed_at     timestamptz not null default now(),
  /** The count this one replaced, when an admin redid the close. */
  previous      jsonb
);

alter table cash_closeouts enable row level security;

drop policy if exists cash_closeouts_read_desk on cash_closeouts;
create policy cash_closeouts_read_desk on cash_closeouts for select using (is_front_desk());
-- No insert/update/delete policy: rows come only from close_cash_day().

grant select on cash_closeouts to authenticated;

-- What the drawer should hold for one Manila day.
create or replace function cash_day_summary(p_day date)
returns table (day date, cash_in numeric, refunds_out numeric, expected numeric, payment_count int,
               closed boolean, counted numeric, difference numeric, note text, closed_by_name text, closed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_in numeric; v_out numeric; v_n int;
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the front desk can see the cash drawer' using errcode = '42501';
  end if;
  select coalesce(sum(p.amount), 0), count(*)::int into v_in, v_n
    from payments p
   where p.status = 'completed'
     and lower(p.method) = 'cash'
     and coalesce(p.paid_on, (p.created_at at time zone 'Asia/Manila')::date) = p_day;
  select coalesce(sum(e.refund_amount), 0) into v_out
    from membership_events e
   where e.refund_amount is not null
     and (e.created_at at time zone 'Asia/Manila')::date = p_day;
  return query
  select p_day, v_in, v_out, v_in - v_out, v_n,
         c.day is not null, c.counted, c.difference, c.note,
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), c.closed_at
    from (select 1) one
    left join cash_closeouts c on c.day = p_day
    left join profiles pr on pr.id = c.closed_by;
end;
$$;

create or replace function close_cash_day(p_day date, p_counted numeric, p_note text default null)
returns cash_closeouts
language plpgsql security definer set search_path = public as $$
declare
  s record;
  existing cash_closeouts;
  result cash_closeouts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the front desk can close the cash drawer' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Type the amount counted in the drawer';
  end if;
  if p_day > (now() at time zone 'Asia/Manila')::date then
    raise exception 'That day has not happened yet';
  end if;
  select * into s from cash_day_summary(p_day);
  if p_counted <> s.expected and v_note is null then
    raise exception 'The count is off by %. Add a note saying why before closing.', abs(p_counted - s.expected);
  end if;
  select * into existing from cash_closeouts where day = p_day;
  if existing.day is not null then
    if coalesce(get_my_role()::text, '') <> 'admin' then
      raise exception 'This day is already closed. Only an admin can redo it.';
    end if;
    if v_note is null then
      raise exception 'Redoing a close needs a note saying why';
    end if;
    update cash_closeouts
       set expected = s.expected, counted = p_counted, payment_count = s.payment_count,
           refunds_out = s.refunds_out, note = v_note, closed_by = auth.uid(), closed_at = now(),
           previous = jsonb_build_object('counted', existing.counted, 'expected', existing.expected,
                                         'note', existing.note, 'closed_by', existing.closed_by,
                                         'closed_at', existing.closed_at)
     where day = p_day
     returning * into result;
  else
    insert into cash_closeouts (day, expected, counted, payment_count, refunds_out, note, closed_by)
    values (p_day, s.expected, p_counted, s.payment_count, s.refunds_out, v_note, auth.uid())
    returning * into result;
  end if;
  return result;
end;
$$;

revoke all on function cash_day_summary(date) from public, anon;
revoke all on function close_cash_day(date, numeric, text) from public, anon;
grant execute on function cash_day_summary(date) to authenticated;
grant execute on function close_cash_day(date, numeric, text) to authenticated;

-- ============================================================================
-- 3. WHAT EACH COACH DELIVERED IN A MONTH
-- ============================================================================
create or replace function trainer_month_summary(p_month date)
returns table (trainer_id uuid, first_name text, last_name text,
               pt_sessions int, pt_hours numeric, classes_led int, class_attendees int, distinct_members int)
language plpgsql stable security definer set search_path = public as $$
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the gym can see trainer totals' using errcode = '42501';
  end if;
  return query
  with pt as (
    select s.trainer_id, s.member_id, s.duration_minutes
      from pt_sessions s
     where s.status = 'approved' and s.starts_at < now()
       and (s.starts_at at time zone 'Asia/Manila')::date >= m_start
       and (s.starts_at at time zone 'Asia/Manila')::date <  m_end
  ), cl as (
    select c.trainer_id, c.id,
           (select count(*) from bookings b where b.class_id = c.id and b.status = 'approved')::int as n
      from classes c
     where c.scheduled_at < now()
       and (c.scheduled_at at time zone 'Asia/Manila')::date >= m_start
       and (c.scheduled_at at time zone 'Asia/Manila')::date <  m_end
  ), members as (
    select pt.trainer_id, pt.member_id from pt
    union
    select c.trainer_id, b.member_id
      from classes c join bookings b on b.class_id = c.id and b.status = 'approved'
     where c.scheduled_at < now()
       and (c.scheduled_at at time zone 'Asia/Manila')::date >= m_start
       and (c.scheduled_at at time zone 'Asia/Manila')::date <  m_end
  )
  select t.profile_id, p.first_name::text, p.last_name::text,
         (select count(*) from pt where pt.trainer_id = t.profile_id)::int,
         round(coalesce((select sum(pt.duration_minutes) from pt where pt.trainer_id = t.profile_id), 0) / 60.0, 1),
         -- A class nobody attended was not led (0028's definition).
         (select count(*) from cl where cl.trainer_id = t.profile_id and cl.n > 0)::int,
         coalesce((select sum(cl.n) from cl where cl.trainer_id = t.profile_id), 0)::int,
         (select count(distinct mm.member_id) from members mm where mm.trainer_id = t.profile_id)::int
    from trainer_profiles t
    join profiles p on p.id = t.profile_id
   where p.status = 'active'
   order by p.first_name, p.last_name;
end;
$$;

revoke all on function trainer_month_summary(date) from public, anon;
grant execute on function trainer_month_summary(date) to authenticated;

-- ============================================================================
-- 4. LANGUAGE
-- ============================================================================
alter table member_profiles
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'fil'));

comment on column member_profiles.preferred_language is
  'Phone app language: en (English) or fil (Filipino). Set by the member in Settings. 0095.';

create or replace function migration_0095_applied() returns boolean
language sql immutable as $$ select true $$;
grant execute on function migration_0095_applied() to anon, authenticated;
