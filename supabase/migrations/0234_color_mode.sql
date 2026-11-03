-- 0234 — Light or dark, each person's own choice (2026-11-03).
--
-- Every app (member, coach, owner and desk) can be light or dark. The default is
-- the device's own setting; a person who picks Light or Dark keeps it on every
-- phone and computer they sign in on — so it lives on the account, never in
-- the browser (CLAUDE.md: per-user state never lives in localStorage).
-- Safe to paste again.

alter table profiles add column if not exists color_mode text not null default 'system';
alter table profiles drop constraint if exists profiles_color_mode_check;
alter table profiles add constraint profiles_color_mode_check check (color_mode in ('system', 'light', 'dark'));

create or replace function my_color_mode() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select color_mode from profiles where id = auth.uid()), 'system');
$$;
revoke all on function my_color_mode() from public, anon;
grant execute on function my_color_mode() to authenticated;

create or replace function set_color_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('system', 'light', 'dark') then
    raise exception 'Choose system, light or dark.';
  end if;
  update profiles set color_mode = p_mode where id = auth.uid();
end;
$$;
revoke all on function set_color_mode(text) from public, anon;
grant execute on function set_color_mode(text) to authenticated;

create or replace function migration_0234_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0234_applied() to anon, authenticated;
