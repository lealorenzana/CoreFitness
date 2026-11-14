-- 0254 — the first sign-in asks: Light, Dark, or Match my phone (2026-11-14).
--
-- The owner: "when first time logging in if they want dark/light mode", in the member/trainer app and the
-- owner's app. 0234 keeps the choice on the account (`profiles.color_mode`, 'system' until they pick), but
-- 'system' cannot tell "chose Match my phone" from "never asked". So the account records WHEN it chose:
-- `color_mode_chosen_at`, set by set_color_mode() — from the first-sign-in question, Settings → Appearance
-- or the admin's sun/moon alike. The apps ask once, while it is null. Per account, never per phone
-- (CLAUDE.md: per-user state never lives in localStorage), so a second phone does not ask again.
--
-- Accounts that already picked Light or Dark have answered; they are marked now and never asked.
-- Accounts still on 'system' are asked once — they may simply never have found the switch.

alter table profiles add column if not exists color_mode_chosen_at timestamptz;

update profiles set color_mode_chosen_at = now()
 where color_mode in ('light', 'dark') and color_mode_chosen_at is null;

-- Whether this account still has to be asked. A visitor has no account: nothing to ask.
create or replace function my_color_mode_asked() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select color_mode_chosen_at is not null from profiles where id = auth.uid()), true);
$$;
revoke all on function my_color_mode_asked() from public, anon;
grant execute on function my_color_mode_asked() to authenticated;

-- 0234's writer, now also remembering that the account chose (the first time only).
create or replace function set_color_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('system', 'light', 'dark') then
    raise exception 'Choose system, light or dark.';
  end if;
  update profiles set color_mode = p_mode, color_mode_chosen_at = coalesce(color_mode_chosen_at, now())
   where id = auth.uid();
end;
$$;
revoke all on function set_color_mode(text) from public, anon;
grant execute on function set_color_mode(text) to authenticated;

create or replace function migration_0254_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0254_applied() to anon, authenticated;
