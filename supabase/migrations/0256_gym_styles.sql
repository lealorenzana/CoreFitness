-- 0256 — How does your gym work? Gym styles, phase 1 (2026-11-14).
--
-- The owner: gyms work differently — G Fitness runs on coaching packages where a member picks a coach and does
-- not book sessions; another runs a class timetable; another is an open floor with nothing to book. An owner
-- ticks one or more STYLES (onboarding, or Settings later) and the settings that already exist follow from it:
-- the Classes part, class booking, the Coaches part, 1-on-1 booking, and whether members pick their own coach
-- for a package. Everything stays editable one by one afterwards — a style is a starting point, not a lock.
--
-- Styles here (built): open_gym · classes · pt_appointments · coaching_packages. Later phases add more
-- (time slots, drop-in classes, small-group coaching, members-only hours) to the same list.
--
-- Nothing a gym customised changes behind its back: `gym_style_changes()` lists exactly what a set of styles
-- would change (now → next), and only `apply_gym_styles()` — the owner's tap on "Apply these" — changes it,
-- through the same setters the screens use (set_gym_module, set_booking_approval, set_coaching_settings), so
-- their rules (owner only, the plan must include it) stay in one place.

alter table gym_settings add column if not exists gym_styles text[];
alter table gym_settings drop constraint if exists gym_settings_gym_styles_check;
alter table gym_settings add constraint gym_settings_gym_styles_check
  check (gym_styles is null or gym_styles <@ array['open_gym', 'classes', 'pt_appointments', 'coaching_packages']::text[]);

create or replace function gym_style_words(p_mode text) returns text
language sql immutable set search_path = public as $$
  select case p_mode
    when 'instant' then 'Instant' when 'coach' then 'Coach approves' when 'desk' then 'Desk approves'
    when 'coach_desk' then 'Coach, then desk' when 'off' then 'Off — the desk books'
    when 'on' then 'On' when 'offpart' then 'Off' else p_mode end;
$$;
revoke all on function gym_style_words(text) from public, anon, authenticated;

-- What these styles would change, setting by setting. Only rows that would change; nothing written.
create or replace function gym_style_changes(p_styles text[])
returns table (setting text, label text, now_value text, next_value text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_classes boolean; v_coaching boolean; v_class text; v_pt text; v_modes text[];
  w_classes boolean; w_coaching boolean; w_class text; w_pt text; w_pick boolean;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets how the gym works.' using errcode = '42501';
  end if;
  if p_styles is null or cardinality(p_styles) = 0 then
    raise exception 'Pick at least one way your gym works.';
  end if;
  if not (p_styles <@ array['open_gym', 'classes', 'pt_appointments', 'coaching_packages']::text[]) then
    raise exception 'That is not one of the gym styles.';
  end if;

  v_classes  := gym_module_on(v_gym, 'classes');
  v_coaching := gym_module_on(v_gym, 'coaching');
  v_class    := booking_approval_mode(v_gym, 'class');
  v_pt       := booking_approval_mode(v_gym, 'pt');
  select cs.modes into v_modes from coaching_settings(v_gym) cs;

  w_classes  := 'classes' = any(p_styles);
  w_coaching := 'pt_appointments' = any(p_styles) or 'coaching_packages' = any(p_styles);
  -- A booking that is on keeps the gym's own approval choice; one that was off starts at the usual default.
  w_class := case when w_classes then (case when v_class = 'off' then 'instant' else v_class end) else 'off' end;
  w_pt    := case when 'pt_appointments' = any(p_styles) then (case when v_pt = 'off' then 'coach' else v_pt end) else 'off' end;
  w_pick  := 'coaching_packages' = any(p_styles);
  -- A part the gym's Core Fitness plan does not include cannot be switched on; it stays as it is.
  if w_classes and not gym_plan_allows(v_gym, 'classes') then w_classes := v_classes; end if;
  if w_coaching and not gym_plan_allows(v_gym, 'coaching') then w_coaching := v_coaching; end if;

  if w_classes is distinct from v_classes then
    setting := 'classes'; label := 'Classes'; now_value := gym_style_words(case when v_classes then 'on' else 'offpart' end);
    next_value := gym_style_words(case when w_classes then 'on' else 'offpart' end); return next;
  end if;
  if w_class is distinct from v_class then
    setting := 'class_booking'; label := 'Booking a class in the app'; now_value := gym_style_words(v_class);
    next_value := gym_style_words(w_class); return next;
  end if;
  if w_coaching is distinct from v_coaching then
    setting := 'coaching'; label := 'Coaches'; now_value := gym_style_words(case when v_coaching then 'on' else 'offpart' end);
    next_value := gym_style_words(case when w_coaching then 'on' else 'offpart' end); return next;
  end if;
  if w_pt is distinct from v_pt then
    setting := 'pt_booking'; label := 'Booking a 1-on-1 session in the app'; now_value := gym_style_words(v_pt);
    next_value := gym_style_words(w_pt); return next;
  end if;
  if w_pick is distinct from ('pick_pt' = any(coalesce(v_modes, '{}'))) then
    setting := 'pick_pt'; label := 'Members pick their own coach for a package';
    now_value := case when w_pick then 'No' else 'Yes' end; next_value := case when w_pick then 'Yes' else 'No' end; return next;
  end if;
  return;
end;
$$;
revoke all on function gym_style_changes(text[]) from public, anon;
grant execute on function gym_style_changes(text[]) to authenticated;

-- The owner's "Apply these": records the styles and makes exactly the changes listed above.
create or replace function apply_gym_styles(p_styles text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  r record;
  v_class text; v_pt text; v_modes text[]; v_lengths int[]; v_fee text;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets how the gym works.' using errcode = '42501';
  end if;
  v_class := booking_approval_mode(v_gym, 'class');
  v_pt    := booking_approval_mode(v_gym, 'pt');
  select cs.modes, cs.lengths, cs.fee_mode into v_modes, v_lengths, v_fee from coaching_settings(v_gym) cs;

  for r in select * from gym_style_changes(p_styles) loop
    if r.setting = 'classes' then perform set_gym_module('classes', r.next_value = 'On');
    elsif r.setting = 'coaching' then perform set_gym_module('coaching', r.next_value = 'On');
    elsif r.setting = 'class_booking' then
      v_class := case r.next_value when 'Instant' then 'instant' when 'Coach approves' then 'coach' when 'Desk approves' then 'desk'
                                   when 'Coach, then desk' then 'coach_desk' else 'off' end;
    elsif r.setting = 'pt_booking' then
      v_pt := case r.next_value when 'Instant' then 'instant' when 'Coach approves' then 'coach' when 'Desk approves' then 'desk'
                                when 'Coach, then desk' then 'coach_desk' else 'off' end;
    elsif r.setting = 'pick_pt' then
      v_modes := case when r.next_value = 'Yes'
        then array(select distinct m from unnest(coalesce(v_modes, '{}') || array['pick_pt']) m)
        else array(select m from unnest(coalesce(v_modes, '{}')) m where m <> 'pick_pt') end;
      perform set_coaching_settings(v_modes, v_lengths, v_fee);
    end if;
  end loop;
  perform set_booking_approval(v_class, v_pt);

  update gym_settings set gym_styles = (select array_agg(distinct s order by s) from unnest(p_styles) s)
   where gym_id = v_gym;
  perform log_activity('gym.styles', 'gym_settings', null, null,
    'How the gym works: ' || array_to_string(p_styles, ', '), jsonb_build_object('styles', p_styles), v_gym);
end;
$$;
revoke all on function apply_gym_styles(text[]) from public, anon;
grant execute on function apply_gym_styles(text[]) to authenticated;

create or replace function migration_0256_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0256_applied() to anon, authenticated;
