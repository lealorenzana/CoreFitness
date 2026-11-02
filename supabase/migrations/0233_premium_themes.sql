-- 0233 — Premium themes (2026-11-02).
--
-- Beyond its two colours, a gym can wear one of twelve premium themes: its own
-- ground and surfaces and a two-colour gradient on the main buttons, progress
-- bars and the member card (g-fitness-member/src/lib/premiumThemes.ts holds the
-- colours; these keys must match it). One unlock opens them all — the same
-- one-time custom-colours purchase (0191, ₱499) — and the database refuses a
-- theme from a gym without it, as it refuses a colour code. Built as colour
-- roles per mode, so the light mode to come adds a `light` set and nothing here.
-- Safe to paste again.

alter table gym_settings add column if not exists premium_theme text;

create or replace function premium_theme_keys() returns text[]
language sql immutable as $$
  select array['midnight_gold', 'ocean_steel', 'ember', 'forest', 'royal', 'mono', 'oled', 'sakura',
               'volt', 'arctic', 'sunset', 'teal_graphite'];
$$;

-- Owner only (the look is the owner's), its own gym, a known key, and the unlock.
create or replace function set_premium_theme(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if v_gym is null or get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym''s owner changes its theme.' using errcode = '42501';
  end if;
  if p_key is not null and not (p_key = any (premium_theme_keys())) then
    raise exception 'There is no premium theme called "%".', p_key;
  end if;
  if p_key is not null and not gym_has_custom_colours(v_gym) then
    raise exception 'Premium themes are part of the one-time colours unlock. Buy it on Your app first.' using errcode = 'P0001';
  end if;
  update gym_settings set premium_theme = p_key where gym_id = v_gym;
end;
$$;
revoke all on function set_premium_theme(text) from public, anon;
grant execute on function set_premium_theme(text) to authenticated;

-- The same rule on the column itself, so a direct update of gym_settings cannot skip it.
create or replace function trg_premium_theme_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.premium_theme is not null and new.premium_theme is distinct from (case when tg_op = 'UPDATE' then old.premium_theme end) then
    if not (new.premium_theme = any (premium_theme_keys())) then
      raise exception 'There is no premium theme called "%".', new.premium_theme;
    end if;
    if not gym_has_custom_colours(new.gym_id) then
      raise exception 'Premium themes are part of the one-time colours unlock. Buy it on Your app first.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists premium_theme_paid on gym_settings;
create trigger premium_theme_paid before insert or update of premium_theme on gym_settings
  for each row execute function trg_premium_theme_paid();

-- Everyone in the gym (owner, desk, coach, member) reads the theme their app wears.
create or replace function my_gym_premium_theme() returns text
language sql stable security definer set search_path = public as $$
  select s.premium_theme from gym_settings s where s.gym_id = current_gym_id();
$$;
revoke all on function my_gym_premium_theme() from public, anon;
grant execute on function my_gym_premium_theme() to authenticated;

create or replace function migration_0233_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0233_applied() to anon, authenticated;
