-- 0214 — The ready-made colour pairs are free, including the ones written as colour codes.
--
-- 0191 made a gym's own colour code a one-time purchase (₱499): `trg_custom_colours_paid()` refuses
-- any `#…` accent or action colour from a gym without the unlock. But Your app's ready-made pairs —
-- shown as free, one tap — are partly codes (Royal is #4338CA + #EAB308, Volt #7C3AED + #A3E635, every
-- Pinoy pair…). So an unpaid gym tapping Volt and publishing was told "Your own colour codes are a
-- one-time purchase", while Citrus (two named presets) published: the same feature, two answers
-- (owner's report, 2026-10-27).
--
-- The rule now: a code that one of the ready-made pairs uses is free; any other code still needs the
-- unlock. `free_pair_colours()` is that list — the codes in g-fitness-admin/src/lib/themePairs.ts, kept
-- in step by the harness (scripts/sql/free-pair-colours.mjs reads the file and compares).
--
-- Paste once. Safe to re-run.

create or replace function free_pair_colours() returns text[]
language sql immutable as $$
  select array[
    '#0038A8', '#0E7490', '#0F766E', '#1E3A8A', '#22D3EE', '#2563EB', '#2DD4BF', '#34D399', '#38BDF8', '#4338CA',
    '#4D7C0F', '#7C3AED', '#7E22CE', '#84CC16', '#8B5E3C', '#A16207', '#A3E635', '#B91C1C', '#C2410C', '#CE1126',
    '#D4A373', '#DC2626', '#EAB308', '#F472B6', '#F97316', '#FACC15', '#FBBF24', '#FCD116', '#FDE047'
  ]::text[]
$$;
revoke execute on function free_pair_colours() from public, anon, authenticated;

-- A colour code (#…) set where there was none needs the unlock — unless a ready-made pair uses it.
-- A preset never needs it, and a gym's code it already has is left alone (as in 0191).
create or replace function trg_custom_colours_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((new.accent ~ '^#' and upper(new.accent) <> all (free_pair_colours())
         and new.accent is distinct from (case when tg_op = 'UPDATE' then old.accent end))
      or (coalesce(new.accent_action, '') ~ '^#' and upper(new.accent_action) <> all (free_pair_colours())
          and new.accent_action is distinct from (case when tg_op = 'UPDATE' then old.accent_action end)))
     and not gym_has_custom_colours(new.gym_id) then
    raise exception 'Your own colour codes are a one-time purchase. Pick a preset, or buy custom colours on Your app.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0214_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0214_applied() to anon, authenticated;
