-- 0284: a gym's own lists (owner, 2026-11-28).
--
-- A gym's areas (Studio, Gym floor) and its categories were typed by hand on every form, so "Studio A" and
-- "studio a" became two rooms and a typo split a filter. Now each gym keeps one list per kind and every form
-- picks from it:
--   area      classes.location, class_templates.location, events.location, gym_equipment.location_note
--   shop      shop_products.category
--   reward    rewards.category
--   resource  workout_resources.category
--   badge     achievements.category
-- The columns stay text (members' screens read them as before); the list is what the forms offer. Renaming an
-- entry renames it on every row that used it, so nothing is left behind under the old name. Retiring hides it from
-- new picks and keeps every old row as it is.
--
-- Reads: anyone signed in to the gym (forms in admin and the trainer app). Writes: only the definer functions
-- below (no INSERT/UPDATE/DELETE policy). Adding: owner and desk for every kind, coaches for areas (they run
-- their own one-off classes, 0085). Renaming and retiring: the owner.

create table if not exists gym_choices (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  kind text not null check (kind in ('area', 'shop', 'reward', 'resource', 'badge')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists gym_choices_one_name on gym_choices (gym_id, kind, lower(btrim(name)));

alter table gym_choices enable row level security;
drop policy if exists gym_choices_read on gym_choices;
create policy gym_choices_read on gym_choices for select to authenticated using (gym_id = current_gym_id());
-- Supabase's default grants stay: with only a read policy, a direct insert is refused and an update or delete reaches
-- no row (the tenancy harness reads a raised error as reaching it).

-- ---- seed: what each gym already typed, one entry per name whatever its case ----------------------------------
insert into gym_choices (gym_id, kind, name)
select distinct on (gym_id, kind, lower(v)) gym_id, kind, v from (
  select gym_id, 'area' as kind, btrim(location) as v from classes where gym_id is not null
  union all select gym_id, 'area', btrim(location) from class_templates where gym_id is not null
  union all select gym_id, 'area', btrim(location) from events where gym_id is not null
  union all select gym_id, 'area', btrim(location_note) from gym_equipment where gym_id is not null
  union all select gym_id, 'shop', btrim(category) from shop_products where gym_id is not null
  union all select gym_id, 'reward', btrim(category) from rewards where gym_id is not null
  union all select gym_id, 'resource', btrim(category) from workout_resources where gym_id is not null
  union all select gym_id, 'badge', btrim(category) from achievements where gym_id is not null
) s
where v is not null and char_length(v) between 1 and 60
order by gym_id, kind, lower(v), v
on conflict do nothing;

-- ---- add (or bring back) one entry; returns its id -------------------------------------------------------------
create or replace function gym_choice_add(p_kind text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := get_my_role(); v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if v_gym is null then raise exception 'Sign in to a gym first.' using errcode = '42501'; end if;
  if not (v_role in ('admin', 'staff') or (v_role = 'trainer' and p_kind = 'area')) then
    raise exception 'Only the gym can add to its lists.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('area', 'shop', 'reward', 'resource', 'badge') then raise exception 'Unknown list.'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'A name from 1 to 60 characters.'; end if;
  select id into v_id from gym_choices where gym_id = v_gym and kind = p_kind and lower(btrim(name)) = lower(v_name);
  if v_id is not null then
    update gym_choices set retired_at = null where id = v_id and retired_at is not null;
    return v_id;
  end if;
  insert into gym_choices (gym_id, kind, name, sort_order)
  values (v_gym, p_kind, v_name, coalesce((select max(sort_order) + 1 from gym_choices where gym_id = v_gym and kind = p_kind), 0))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function gym_choice_add(text, text) from public, anon;
grant execute on function gym_choice_add(text, text) to authenticated;

-- ---- rename: the entry and every row that used the old name ----------------------------------------------------
create or replace function gym_choice_rename(p_id uuid, p_name text) returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_old text; v_kind text; v_name text := btrim(coalesce(p_name, '')); v_n int := 0; v_c int;
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Only the gym owner renames its lists.' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'A name from 1 to 60 characters.'; end if;
  select btrim(name), kind into v_old, v_kind from gym_choices where id = p_id and gym_id = v_gym;
  if v_old is null then raise exception 'That entry is not in your gym''s lists.'; end if;
  if v_old = v_name then return 0; end if;
  if exists (select 1 from gym_choices where gym_id = v_gym and kind = v_kind and id <> p_id and lower(btrim(name)) = lower(v_name)) then
    raise exception '"%" is already on this list.', v_name;
  end if;
  update gym_choices set name = v_name where id = p_id;
  if v_kind = 'area' then
    update classes set location = v_name where gym_id = v_gym and lower(btrim(location)) = lower(v_old); get diagnostics v_c = row_count; v_n := v_n + v_c;
    update class_templates set location = v_name where gym_id = v_gym and lower(btrim(location)) = lower(v_old); get diagnostics v_c = row_count; v_n := v_n + v_c;
    update events set location = v_name where gym_id = v_gym and lower(btrim(location)) = lower(v_old); get diagnostics v_c = row_count; v_n := v_n + v_c;
    update gym_equipment set location_note = v_name where gym_id = v_gym and lower(btrim(location_note)) = lower(v_old); get diagnostics v_c = row_count; v_n := v_n + v_c;
  elsif v_kind = 'shop' then
    update shop_products set category = v_name where gym_id = v_gym and lower(btrim(category)) = lower(v_old); get diagnostics v_n = row_count;
  elsif v_kind = 'reward' then
    update rewards set category = v_name where gym_id = v_gym and lower(btrim(category)) = lower(v_old); get diagnostics v_n = row_count;
  elsif v_kind = 'resource' then
    update workout_resources set category = v_name where gym_id = v_gym and lower(btrim(category)) = lower(v_old); get diagnostics v_n = row_count;
  elsif v_kind = 'badge' then
    update achievements set category = v_name where gym_id = v_gym and lower(btrim(category)) = lower(v_old); get diagnostics v_n = row_count;
  end if;
  return v_n; -- how many classes, items or badges now carry the new name
end;
$$;
revoke all on function gym_choice_rename(uuid, text) from public, anon;
grant execute on function gym_choice_rename(uuid, text) to authenticated;

-- ---- retire or bring back: hidden from new picks, old rows untouched ------------------------------------------
create or replace function gym_choice_retire(p_id uuid, p_retired boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Only the gym owner changes its lists.' using errcode = '42501'; end if;
  update gym_choices set retired_at = case when p_retired then coalesce(retired_at, now()) end
   where id = p_id and gym_id = current_gym_id();
  if not found then raise exception 'That entry is not in your gym''s lists.'; end if;
end;
$$;
revoke all on function gym_choice_retire(uuid, boolean) from public, anon;
grant execute on function gym_choice_retire(uuid, boolean) to authenticated;

-- ---- a gym's table: on tenancy_gym_tables(), added to whatever the list is (0276's pattern) ---------------------
do $$
declare l text[] := tenancy_gym_tables();
begin
  if not ('gym_choices' = any (l)) then
    l := array_append(l, 'gym_choices');
    execute format('create or replace function tenancy_gym_tables() returns text[] language sql immutable as $f$ select %L::text[] $f$', l);
  end if;
end $$;

create or replace function migration_0284_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0284_applied() to anon, authenticated;

-- Check: expect true, then how many entries each gym's lists start with.
select 'gym_choices' = any (tenancy_gym_tables()) as listed;
select kind, count(*) from gym_choices group by kind order by kind;
