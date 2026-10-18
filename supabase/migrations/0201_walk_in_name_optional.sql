-- ============================================================================
-- 0201 — A walk-in's name is optional
-- ============================================================================
--
-- The owner (2026-10-18): a guest paying for one visit should not have to
-- give a name. 0185 refused a new guest without one. Now a new guest with no
-- name is recorded as "Walk-in guest" — their phone (if given) still finds
-- them next time, and the desk can see them in the walk-in history. A name
-- given later, on a visit found by phone, replaces the placeholder.
--
-- 0185's body in full, with only the name rule changed.
-- ============================================================================

create or replace function record_guest_visit(p_guest uuid, p_name text, p_phone text, p_kind text, p_method text default 'cash')
returns table (guest_id uuid, visits_left int, amount numeric, visits_this_month int, suggest_membership boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_gym uuid := current_gym_id(); s record; g guests; v_amount numeric := 0; v_month int;
        v_name text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
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
    -- A name given now replaces the placeholder of an unnamed first visit.
    if v_name is not null and g.name = 'Walk-in guest' then
      update guests set name = v_name where id = g.id returning * into g;
    end if;
  else
    insert into guests (gym_id, name, phone) values (v_gym, coalesce(v_name, 'Walk-in guest'), nullif(btrim(coalesce(p_phone, '')), ''))
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

-- The walk-in history (Attendance → Walk-ins → Past walk-ins): every visit
-- between two Manila dates, newest first, with who recorded it. The desk only.
create or replace function guest_visits_between(p_from date, p_to date)
returns table (id uuid, guest_id uuid, name text, phone text, visit_day date, visited_at timestamptz, kind text,
               amount numeric, method text, voided boolean, recorded_by_name text)
language sql stable security definer set search_path = public as $$
  select v.id, g.id, g.name, g.phone, v.visit_day, v.visited_at, v.kind, v.amount, v.method, v.voided_at is not null,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    from guest_visits v
    join guests g on g.id = v.guest_id
    left join profiles p on p.id = v.recorded_by
   where is_front_desk() and v.gym_id = current_gym_id()
     and v.visit_day between p_from and p_to
     and p_to - p_from <= 366
   order by v.visited_at desc
   limit 2000;
$$;
revoke all on function guest_visits_between(date, date) from public, anon;
grant execute on function guest_visits_between(date, date) to authenticated;

create or replace function migration_0201_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0201_applied() from public, anon;
grant execute on function migration_0201_applied() to authenticated;
comment on function migration_0201_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0201.sql
