-- 0277: the gym writes its own Today hero (owner, 2026-11-25).
--
-- The member app's Today page opens on a hero: a small line, a big line, an accented line and a sentence
-- ("One step at a time / Make today / your day. / Show up. Find your rhythm. Keep going."). It was fixed text;
-- the owner sets every other word of the app on Your app → Words, so this is theirs to write too.
--
-- Four optional columns on gym_settings. Empty (NULL) means the app's own default wording, so a gym that never
-- touches them sees no change. The two lines that describe the member's state, not the gym's voice, stay the
-- app's ("You showed up…" after a check-in, "Your next chapter…" when frozen or expired).
--
-- Written only through save_today_words() (owner only, like save_gym_words), read through my_gym_app().
-- my_gym_app() gains four columns, so it is dropped and recreated (a RETURNS TABLE cannot grow in place) with
-- the same grants it had: authenticated and service_role, never anon.

alter table gym_settings
  add column if not exists today_kicker text,
  add column if not exists today_lead   text,
  add column if not exists today_accent text,
  add column if not exists today_line   text;

-- Lengths a phone hero holds without breaking its layout (the big lines are ~36px type in a 60% column).
alter table gym_settings drop constraint if exists gym_settings_today_words_len;
alter table gym_settings add constraint gym_settings_today_words_len check (
      coalesce(char_length(today_kicker), 0) <= 40
  and coalesce(char_length(today_lead),   0) <= 22
  and coalesce(char_length(today_accent), 0) <= 22
  and coalesce(char_length(today_line),   0) <= 120);

create or replace function save_today_words(p_kicker text, p_lead text, p_accent text, p_line text)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid := acting_gym_id();
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change what the app says.' using errcode = '42501';
  end if;
  if char_length(coalesce(btrim(p_kicker), '')) > 40 then raise exception 'The small line is 40 characters or fewer.'; end if;
  if char_length(coalesce(btrim(p_lead),   '')) > 22 then raise exception 'The big line is 22 characters or fewer.'; end if;
  if char_length(coalesce(btrim(p_accent), '')) > 22 then raise exception 'The coloured line is 22 characters or fewer.'; end if;
  if char_length(coalesce(btrim(p_line),   '')) > 120 then raise exception 'The sentence is 120 characters or fewer.'; end if;

  perform act_as_gym(v_gym);
  update gym_settings
     set today_kicker = nullif(btrim(p_kicker), ''),
         today_lead   = nullif(btrim(p_lead), ''),
         today_accent = nullif(btrim(p_accent), ''),
         today_line   = nullif(btrim(p_line), '')
   where gym_id = v_gym;
end;
$$;
revoke all on function save_today_words(text, text, text, text) from public, anon;
grant execute on function save_today_words(text, text, text, text) to authenticated;

drop function if exists my_gym_app();
create function my_gym_app()
returns table(gym_id uuid, gym_name text, slug text, short_name text, logo_url text, accent text, accent_action text,
              points_name text, points_name_short text, welcome_message text, tagline text, vocabulary jsonb,
              join_policy text, join_code text, modules jsonb,
              today_kicker text, today_lead text, today_accent text, today_line text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         w.points_name, w.points_name_short, w.welcome_message,
         nullif(btrim(coalesce(s.tagline, '')), ''),
         gym_vocabulary(g.id),
         coalesce(s.join_policy, 'open'),
         case when get_my_role() in ('admin', 'staff') then s.join_code end,
         coalesce((
           select jsonb_object_agg(f.key, gym_module_on(g.id, f.key))
             from platform_features f
         ), '{}'::jsonb),
         s.today_kicker, s.today_lead, s.today_accent, s.today_line
    from gyms g
    left join gym_settings s on s.gym_id = g.id
    cross join lateral gym_words(g.id) w
   where g.id = current_gym_id();
$$;
revoke all on function my_gym_app() from public, anon;
grant execute on function my_gym_app() to authenticated, service_role;

create or replace function migration_0277_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0277_applied() to anon, authenticated;

-- Check: expect true, true.
select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'today_line') as columns_added,
       exists (select 1 from information_schema.routines where routine_name = 'save_today_words') as saver_added;
