-- 0285: how each person likes a page laid out (owner, 2026-11-28).
--
-- The View menu (Details, List, Tiles, the Details pane) on admin's Members and the platform's Gyms and
-- Applications forgot the choice on leaving the page or signing out. Per-user state never lives in the browser
-- (one front-desk computer is shared by several people), so it lives on the person's own profile, one small value per
-- page, read and written only for the caller.

alter table profiles add column if not exists view_prefs jsonb not null default '{}'::jsonb;

-- Every saved choice of the caller, e.g. {"admin.members": {"view": "tiles", "pane": true}}.
create or replace function my_view_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select view_prefs from profiles where id = auth.uid()), '{}'::jsonb);
$$;
revoke all on function my_view_prefs() from public, anon;
grant execute on function my_view_prefs() to authenticated;

-- Save one page's choice for the caller. The key names a page; the value is small, or it is refused.
create or replace function set_view_pref(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z]+\.[a-z_-]{1,40}$' then raise exception 'Unknown page.'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 500 then raise exception 'That choice is too large.'; end if;
  update profiles set view_prefs = jsonb_set(coalesce(view_prefs, '{}'::jsonb), array[p_key], p_value, true) where id = auth.uid();
end;
$$;
revoke all on function set_view_pref(text, jsonb) from public, anon;
grant execute on function set_view_pref(text, jsonb) to authenticated;

create or replace function migration_0285_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0285_applied() to anon, authenticated;

-- Check: expect true.
select exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'view_prefs') as view_prefs_added;
