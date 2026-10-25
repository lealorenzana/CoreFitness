-- ============================================================================
-- 0209 — The lobby TV is a plan feature, and the gym designs its own screen
-- ============================================================================
-- The lobby TV (/tv, 0126) was on for every gym and looked the same for every
-- gym: one dark layout, every panel, twelve seconds each. The platform sells it
-- as a premium feature, and an owner putting it on their own wall wants it to
-- look like their gym.
--
--   1. `lobby_tv` joins platform_features, so it sits in the platform's plan
--      matrix like everything else. It starts on Pro, Premium and the free trial
--      (a trial is for trying things); the platform moves it on Plans.
--      `gym_module_on(gym, 'lobby_tv')` is the one answer for the screen and
--      for the owner's "What you run" switch.
--   2. gym_settings.tv_design: theme, a background photo from the gym's own
--      media folder, which panels show and for how long, a headline, and
--      whether the clock, today's count and the join code show. A trigger
--      checks every value, so a direct update cannot store what the editor
--      would refuse.
--   3. my_tv_design(): the design and whether the gym may run the TV, for the
--      owner's editor and for /tv (the desk runs the TV, so staff read it too).
-- ============================================================================

-- ---- 1. the feature -----------------------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key)
values ('lobby_tv', 'Lobby TV',
        'A full-screen board for a TV in your gym — classes, records, the season and your join code, in your own design.',
        79, null)
on conflict (key) do nothing;

-- 0108's sync gives a new feature to every plan, switched on; this sets where it starts.
-- Only here, once: the platform owns the matrix from now on.
insert into platform_plan_features (plan_key, feature_key, enabled)
select p.key, 'lobby_tv', p.key in ('pro', 'premium', 'trial')
  from platform_plans p
on conflict (plan_key, feature_key) do update set enabled = excluded.enabled;

-- ---- 2. the design --------------------------------------------------------------------------------------------
alter table gym_settings add column if not exists tv_design jsonb not null default '{}'::jsonb;
comment on column gym_settings.tv_design is
  '0209: the lobby TV''s look — theme, background_url, panels, seconds, headline, show_clock, show_count, show_qr. Checked by trg_tv_design.';

create or replace function trg_tv_design() returns trigger
language plpgsql as $$
declare
  d jsonb := coalesce(new.tv_design, '{}'::jsonb);
  k text;
  p text;
begin
  if jsonb_typeof(d) <> 'object' then
    raise exception 'The TV design is a set of choices, not %.', jsonb_typeof(d);
  end if;
  for k in select jsonb_object_keys(d) loop
    if k not in ('theme', 'background_url', 'panels', 'seconds', 'headline', 'show_clock', 'show_count', 'show_qr') then
      raise exception 'The TV has no setting called %.', k;
    end if;
  end loop;
  if d ? 'theme' and (d->>'theme') not in ('dark', 'brand', 'light') then
    raise exception 'The TV theme is dark, brand or light.';
  end if;
  if d ? 'seconds' and (jsonb_typeof(d->'seconds') <> 'number' or (d->>'seconds')::numeric not between 6 and 60) then
    raise exception 'Each panel shows for 6 to 60 seconds.';
  end if;
  if d ? 'headline' and (jsonb_typeof(d->'headline') <> 'string' or char_length(d->>'headline') > 140) then
    raise exception 'The headline is up to 140 characters.';
  end if;
  if d ? 'panels' then
    if jsonb_typeof(d->'panels') <> 'array' then
      raise exception 'The panels are a list.';
    end if;
    for p in select jsonb_array_elements_text(d->'panels') loop
      if p not in ('goal', 'wall', 'season', 'squads', 'classes', 'news') then
        raise exception 'The TV has no panel called %.', p;
      end if;
    end loop;
  end if;
  for k in select unnest(array['show_clock', 'show_count', 'show_qr']) loop
    if d ? k and jsonb_typeof(d->k) <> 'boolean' then
      raise exception '% is on or off.', k;
    end if;
  end loop;
  -- A background is a photo this gym uploaded, never a link to anywhere else (as 0197's reward photos).
  if d ? 'background_url' and jsonb_typeof(d->'background_url') <> 'null' then
    if jsonb_typeof(d->'background_url') <> 'string'
       or position('/storage/v1/object/public/media/gyms/' || new.gym_id::text || '/' in d->>'background_url') = 0 then
      raise exception 'The background has to be a photo uploaded to this gym.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tv_design on gym_settings;
create trigger trg_tv_design before insert or update of tv_design on gym_settings
  for each row execute function trg_tv_design();

-- The owner saves it; the trigger above is the rule, this is the door.
create or replace function save_tv_design(p_design jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the gym owner designs the lobby TV.' using errcode = '42501';
  end if;
  if not gym_module_on(current_gym_id(), 'lobby_tv') then
    raise exception 'The lobby TV is not on your Core Fitness plan.' using errcode = '42501';
  end if;
  update gym_settings set tv_design = coalesce(p_design, '{}'::jsonb), updated_at = now(), updated_by = auth.uid()
   where gym_id = current_gym_id();
  if not found then
    raise exception 'This gym has no settings row to save the TV design to.';
  end if;
end;
$$;
revoke all on function save_tv_design(jsonb) from public, anon;
grant execute on function save_tv_design(jsonb) to authenticated;

-- ---- 3. reading it ------------------------------------------------------------------------------------------
create or replace function my_tv_design() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when storage_role_here() in ('admin', 'staff') then jsonb_build_object(
    'allowed', gym_module_on(current_gym_id(), 'lobby_tv'),
    'sold', gym_plan_allows(current_gym_id(), 'lobby_tv'),
    'design', coalesce((select s.tv_design from gym_settings s where s.gym_id = current_gym_id()), '{}'::jsonb)) end;
$$;
revoke all on function my_tv_design() from public, anon;
grant execute on function my_tv_design() to authenticated;

revoke all on function trg_tv_design() from public, anon, authenticated;

create or replace function migration_0209_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0209_applied() to anon, authenticated;
