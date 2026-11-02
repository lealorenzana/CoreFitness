-- 0231 — hide or show a gym in the gym lists, from the platform (2026-11-02).
--
-- 0229 added gyms.hidden (left out of the website's list and Find your gym, still
-- reached by its link or code) but only SQL could flip it. The platform owner's
-- gym page now has a Manage panel with every control in one place; this is the
-- one that had no button. Platform admins only, logged like every platform act.
-- Safe to paste again.

create or replace function platform_gym_hidden(p_gym uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform can see that.' using errcode = '42501'; end if;
  return (select hidden from gyms where id = p_gym);
end;
$$;
revoke all on function platform_gym_hidden(uuid) from public, anon;
grant execute on function platform_gym_hidden(uuid) to authenticated;

create or replace function platform_set_gym_hidden(p_gym uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_platform_admin() then raise exception 'Only the platform can hide a gym.' using errcode = '42501'; end if;
  select name into v_name from gyms where id = p_gym;
  if v_name is null then raise exception 'That gym does not exist.'; end if;
  update gyms set hidden = coalesce(p_hidden, false) where id = p_gym and hidden is distinct from coalesce(p_hidden, false);
  if found then
    perform platform_log(p_gym, case when p_hidden then 'gym.hidden' else 'gym.listed' end,
      v_name || case when p_hidden then ' was hidden from the gym lists' else ' is listed again' end, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function platform_set_gym_hidden(uuid, boolean) from public, anon;
grant execute on function platform_set_gym_hidden(uuid, boolean) to authenticated;

create or replace function migration_0231_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0231_applied() to anon, authenticated;
