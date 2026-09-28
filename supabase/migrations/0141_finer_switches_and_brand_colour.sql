-- 0141 — Everything a gym runs can be switched, and the app can wear its own colour.
--
-- 1. FINER SWITCHES. 0110 gave a gym nine switches, one per thing the platform
--    sold in 0108. Everything built since — the shop, chat, coaching rooms,
--    programs, progress photos, squads, seasons, weekly quests, referrals, and
--    members' freeze and cancel requests — rode along inside a broad switch
--    or had none, so an owner who did not want a shop or a chat could not say
--    so. Each is now its own feature, with a parent:
--
--      front_desk → shop, requests        coaching  → chat, rooms
--      progress   → programs, photos      engagement → squads, seasons, quests, referrals
--
--    A child is on only while its parent is on (gym_module_on). Turning a
--    parent off switches its children off with it; turning it back on brings
--    back each child as the owner last left it. Nothing is ever deleted by a
--    switch: it hides a part of the app, the rows stay.
--
--    The platform sells them the same way it sells the nine (0108): a feature
--    with no plan row is included in every plan, so this takes nothing away.
--
-- 2. THE GYM'S OWN COLOUR. 0112 offered fourteen ramps for each colour role.
--    A gym whose brand is none of them could not wear it. `accent` and
--    `accent_action` now also take a colour code (#1F8A70). The apps keep its
--    hue and match its brightness steps to the nearest preset — the same steps
--    scripts/accent-contrast.mjs proves readable — so no gym's choice can make
--    a screen nobody can read.

-- ============================================================================
-- 1. FINER SWITCHES
-- ============================================================================
alter table platform_features add column if not exists parent_key text references platform_features(key) on delete cascade;

insert into platform_features (key, label, description, sort_order) values
  ('shop',      'The shop',              'Products sold at the counter, their stock, and a menu members can browse.', 11),
  ('requests',  'Freeze and cancel requests', 'Members ask in the app to freeze or cancel their membership; the desk still decides.', 12),
  ('chat',      'Coach chat',            'Private messages between a member and the coaches they train with.', 41),
  ('rooms',     'Coaching rooms',        'Each coach''s rooms: posts, classwork and check-ins for their members.', 42),
  ('programs',  'Programs',              'Multi-week programs members follow, built by the gym.', 61),
  ('photos',    'Progress photos',       'Private progress photos a member can choose to share with a coach.', 62),
  ('squads',    'Squads and gym goal',   'Small groups of friends training together, and one goal for the whole gym.', 51),
  ('seasons',   'Seasons and boards',    'A monthly season with leaderboards members opt into, and rewards you hand over.', 52),
  ('quests',    'Weekly quests',         'Small repeating challenges every week, for points.', 53),
  ('referrals', 'Invite a friend',       'Members share a code; both earn points when the friend first pays.', 54)
on conflict (key) do nothing;

update platform_features set parent_key = 'front_desk' where key in ('shop', 'requests') and parent_key is null;
update platform_features set parent_key = 'coaching'   where key in ('chat', 'rooms') and parent_key is null;
update platform_features set parent_key = 'progress'   where key in ('programs', 'photos') and parent_key is null;
update platform_features set parent_key = 'engagement' where key in ('squads', 'seasons', 'quests', 'referrals') and parent_key is null;

comment on column platform_features.parent_key is
  'The feature this one lives inside (0141). A child is on only while its parent is on.';

-- On: the plan sells it, the gym has not switched it off, and its parent is on.
create or replace function gym_module_on(p_gym uuid, p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    gym_plan_allows(coalesce(p_gym, current_gym_id()), p_feature)
    and coalesce(
      (select m.enabled from gym_modules m
        where m.gym_id = coalesce(p_gym, current_gym_id()) and m.feature_key = p_feature),
      true)
    and coalesce(
      (select gym_module_on(p_gym, f.parent_key) from platform_features f
        where f.key = p_feature and f.parent_key is not null),
      true);
$$;

-- The owner's list gains the parent, and says when a child is off because its parent is.
drop function if exists my_gym_modules();
create function my_gym_modules()
returns table (feature_key text, label text, description text,
               state text, enabled boolean, sort_order int, parent_key text)
language sql stable security definer set search_path = public as $$
  select f.key, f.label, f.description,
         case when not gym_plan_allows(current_gym_id(), f.key) then 'not_sold'
              when not coalesce(m.enabled, true) then 'off'
              when f.parent_key is not null and not gym_module_on(current_gym_id(), f.parent_key) then 'parent_off'
              else 'on' end,
         gym_module_on(current_gym_id(), f.key),
         f.sort_order,
         f.parent_key
    from platform_features f
    left join gym_modules m on m.feature_key = f.key and m.gym_id = current_gym_id()
   where current_gym_id() is not null
   order by coalesce((select p.sort_order from platform_features p where p.key = f.parent_key), f.sort_order),
            f.parent_key nulls first, f.sort_order;
$$;
revoke all on function my_gym_modules() from public, anon;
grant execute on function my_gym_modules() to authenticated;

-- ============================================================================
-- 2. THE GYM'S OWN COLOUR
-- ============================================================================
alter table gym_settings drop constraint if exists gym_settings_accent_check;
alter table gym_settings add constraint gym_settings_accent_check
  check (accent in ('violet', 'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald',
                    'lime', 'amber', 'orange', 'red', 'rose', 'fuchsia', 'slate')
         or accent ~ '^#[0-9a-fA-F]{6}$');
alter table gym_settings drop constraint if exists gym_settings_accent_action_check;
do $$
declare c text;
begin
  -- 0112 declared the column's check inline, so it carries a generated name.
  for c in select conname from pg_constraint
            where conrelid = 'gym_settings'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%accent_action%' loop
    execute format('alter table gym_settings drop constraint %I', c);
  end loop;
end $$;
alter table gym_settings add constraint gym_settings_accent_action_check
  check (accent_action is null
         or accent_action in ('violet', 'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald',
                              'lime', 'amber', 'orange', 'red', 'rose', 'fuchsia', 'slate')
         or accent_action ~ '^#[0-9a-fA-F]{6}$');

-- Colour codes are stored in one case, so the same colour is the same value.
create or replace function trg_gym_colour_case() returns trigger
language plpgsql as $$
begin
  if new.accent ~ '^#' then new.accent := upper(new.accent); end if;
  if new.accent_action ~ '^#' then new.accent_action := upper(new.accent_action); end if;
  return new;
end;
$$;
drop trigger if exists gym_colour_case on gym_settings;
create trigger gym_colour_case before insert or update of accent, accent_action on gym_settings
  for each row execute function trg_gym_colour_case();

create or replace function migration_0141_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0141_applied() from public, anon;
grant execute on function migration_0141_applied() to authenticated;
comment on function migration_0141_applied() is 'Probe marker: 0141 (finer feature switches, the gym''s own colour) is live.';
