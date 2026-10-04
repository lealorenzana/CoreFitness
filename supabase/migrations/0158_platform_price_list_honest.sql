-- 0158 — The website's price list advertises only what a plan really gives,
-- and a price change leaves a full trace.
--
-- 1. 0141 made some features children of a part (shop and requests under the
--    desk, chat and rooms under coaching, programs and photos under progress,
--    squads/seasons/quests/referrals under engagement): a child works only
--    while its parent is on. `platform_price_list()` (0108) still listed every
--    ticked label, so a plan with "Coach chat" ticked and "Coaches" unticked
--    advertised a chat it could never open. A child is now listed only when
--    its parent is enabled on the same plan.
--
-- 2. `save_platform_plan()` logged only `price_monthly`: a yearly price, a
--    trial length or retiring/restoring a plan changed what gyms are charged
--    and left no trace in the platform log. It now records all of them.
--    Signature unchanged, so the console's call is untouched.
--
-- Re-runnable.

create or replace function platform_price_list()
returns table (key text, name text, blurb text,
               price_monthly numeric, price_yearly numeric, trial_days int,
               max_members int, includes text[], sort_order int)
language sql stable security definer set search_path = public as $$
  select p.key, p.name, p.blurb, p.price_monthly, p.price_yearly, p.trial_days,
         p.max_members,
         coalesce(array(
           select f.label from platform_plan_features ppf
             join platform_features f on f.key = ppf.feature_key
            where ppf.plan_key = p.key and ppf.enabled
              and (f.parent_key is null or exists (
                     select 1 from platform_plan_features pp
                      where pp.plan_key = p.key and pp.feature_key = f.parent_key and pp.enabled))
            order by f.sort_order
         ), '{}'::text[]),
         p.sort_order
    from platform_plans p
   where p.is_public and p.is_active
   order by p.sort_order, p.name;
$$;
revoke all on function platform_price_list() from public;
grant execute on function platform_price_list() to anon, authenticated;

create or replace function save_platform_plan(
  p_key text, p_name text, p_blurb text default null,
  p_price_monthly numeric default null, p_price_yearly numeric default null,
  p_trial_days int default null, p_max_members int default null,
  p_max_staff int default null, p_is_public boolean default true,
  p_is_active boolean default true, p_sort int default 0
) returns text
language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change what it sells.' using errcode = '42501';
  end if;
  if p_key !~ '^[a-z0-9_]+$' or length(p_key) not between 2 and 30 then
    raise exception 'A plan key uses small letters, numbers and underscores only.';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The plan needs a name.';
  end if;

  v_new := not exists (select 1 from platform_plans where key = p_key);

  insert into platform_plans (key, name, blurb, price_monthly, price_yearly, trial_days,
                              max_members, max_staff, is_public, is_active, sort_order)
  values (p_key, btrim(p_name), nullif(btrim(p_blurb), ''), p_price_monthly, p_price_yearly,
          p_trial_days, p_max_members, p_max_staff,
          coalesce(p_is_public, true), coalesce(p_is_active, true), coalesce(p_sort, 0))
  on conflict (key) do update set
    name = excluded.name, blurb = excluded.blurb,
    price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly,
    trial_days = excluded.trial_days,
    max_members = excluded.max_members, max_staff = excluded.max_staff,
    is_public = excluded.is_public, is_active = excluded.is_active,
    sort_order = excluded.sort_order;

  perform platform_log(null, case when v_new then 'plan.created' else 'plan.changed' end,
    btrim(p_name) || case when v_new then ' was added to what Core Fitness sells'
                          else ' was changed' end,
    jsonb_build_object('key', p_key, 'price_monthly', p_price_monthly,
                       'price_yearly', p_price_yearly, 'trial_days', p_trial_days,
                       'max_members', p_max_members, 'max_staff', p_max_staff,
                       'is_public', coalesce(p_is_public, true), 'is_active', coalesce(p_is_active, true)));
  return p_key;
end;
$$;
revoke all on function save_platform_plan(text, text, text, numeric, numeric, int, int, int, boolean, boolean, int)
  from public, anon;
grant execute on function save_platform_plan(text, text, text, numeric, numeric, int, int, int, boolean, boolean, int)
  to authenticated;

create or replace function migration_0158_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0158_applied() from public, anon;
grant execute on function migration_0158_applied() to authenticated;
comment on function migration_0158_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0158.sql
