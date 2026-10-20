-- 0206: Achievements — points when earned, secret until earned, tell the member,
-- and how many already qualify (2026-10-20, the approved Achievements mock-up)
--
-- Three switches on a badge, all the gym's and all enforced here:
--   * points      — added to a member's balance the moment the badge is earned,
--                   once (the ledger's unique key), only if their plan earns
--                   points — asked of the member's plan alone (member_plan_allows,
--                   below), because plan_allows() says yes to any admin caller.
--                   Coaches have no points balance, so a coach badge pays none.
--   * secret      — the member app shows "Secret badge" instead of its name and
--                   rule until it is theirs. This hides words on a screen, not a
--                   secret: RLS filters rows, never columns, and the catalogue
--                   row is readable by members (CLAUDE.md, DATA_ACCESS).
--   * tell_member — a notification the moment it is earned (notify_once, keyed
--                   on the unlock, so a retry never sends two). Off for every
--                   badge that existed before this migration — nobody switched it.
-- And achievement_qualifiers(): for a rule being drafted, how many active
-- people already meet it (they get it on their next sync) and how many are
-- over halfway — counted with the same stats sync_my_achievements() uses.

alter table achievements add column if not exists points int not null default 0 check (points between 0 and 10000);
alter table achievements add column if not exists secret boolean not null default false;
alter table achievements add column if not exists tell_member boolean not null default false;

-- The ledger's rule reference must hold: one row per gym, like 'gym_goal' (0124).
-- New gyms copy point_rules from the template gym (0186), so they get it too.
insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'achievement', 'Earned a badge (points set on each badge)', 1, 10 from gyms g
on conflict (gym_id, key) do nothing;

-- plan_allows() answers true whenever the CALLER is admin or staff ("the gym is
-- never gated by a member's tier"), which is right for reading screens and wrong
-- for paying a member: a badge the owner gives by hand would pay points to a
-- plan that earns none. This asks about the member alone — plan_allows()'s
-- body (0186) without the caller's shortcut.
create or replace function member_plan_allows(p_member uuid, p_feature text)
returns boolean
language plpgsql stable security definer set search_path = public as $fn$
declare m record; v_plan uuid; v_on boolean;
begin
  select * into m from current_membership_of(p_member);
  if m.plan_id is not null and membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    v_plan := m.plan_id;
  elsif m.status is not null and m.status::text = 'frozen' then
    return false;
  else
    select p.id into v_plan from membership_plans p
     where p.gym_id = coalesce(acting_gym_id(), current_gym_id()) and p.tier = 'free' and p.is_active
     order by p.price, p.created_at limit 1;
    if v_plan is null then return false; end if;
  end if;
  select pf.enabled into v_on from plan_features pf where pf.plan_id = v_plan and pf.feature_key = p_feature;
  return coalesce(v_on, true);
end;
$fn$;
revoke all on function member_plan_allows(uuid, text) from public, anon, authenticated;

create or replace function trg_achievement_unlocked() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from achievements where gym_id = new.gym_id and key = new.achievement_key;
  if not found then return new; end if;
  if a.points > 0 and a.audience = 'member'
     and exists (select 1 from point_rules r where r.gym_id = new.gym_id and r.key = 'achievement' and r.is_active)
     and member_plan_allows(new.user_id, 'points_earn') then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (new.gym_id, new.user_id, 'achievement', a.points, 'achievement_unlocks', new.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
  end if;
  if a.tell_member then
    perform notify_once(new.user_id, 'info', 'New badge: ' || a.title,
      a.description || case when a.points > 0 and a.audience = 'member' then ' +' || a.points || ' points.' else '' end,
      case when a.audience = 'member' then '/member/achievements' else '/trainer/achievements' end,
      'badge:' || new.id, new.gym_id);
  end if;
  return new;
end;
$$;
drop trigger if exists achievement_unlocked on achievement_unlocks;
create trigger achievement_unlocked after insert on achievement_unlocks
  for each row execute function trg_achievement_unlocked();
revoke all on function trg_achievement_unlocked() from public, anon, authenticated;

-- For the maker's "N already qualify": the owner and the desk only.
create or replace function achievement_qualifiers(p_audience text, p_metric text, p_threshold numeric,
                                                  p_metric2 text default null, p_threshold2 numeric default null)
returns table (qualify int, halfway int)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); u record; s record; t record; stats jsonb; v1 numeric; v2 numeric;
        q int := 0; h int := 0;
begin
  if auth.uid() is null or coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the owner and the desk see this.' using errcode = '42501';
  end if;
  if p_audience not in ('member', 'trainer') or p_metric is null or p_threshold is null or p_threshold <= 0 then
    return query select 0, 0; return;
  end if;
  for u in select r.user_id from gym_roles r where r.gym_id = v_gym and r.role::text = p_audience and r.status = 'active' loop
    if p_audience = 'member' then
      select * into s from member_training_stats(u.user_id);
      stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
        'days_as_member', case when s.member_since is null then 0 else (current_date - s.member_since) end);
    else
      select * into t from trainer_stats(u.user_id);
      stats := row_to_json(t)::jsonb;
    end if;
    v1 := coalesce(jsonb_metric_value(stats, p_metric), 0);
    v2 := case when p_metric2 is null then null else coalesce(jsonb_metric_value(stats, p_metric2), 0) end;
    if v1 >= p_threshold and (p_metric2 is null or v2 >= p_threshold2) then
      q := q + 1;
    elsif v1 >= p_threshold / 2 and (p_metric2 is null or v2 >= p_threshold2 / 2) then
      h := h + 1;
    end if;
  end loop;
  return query select q, h;
end;
$$;
revoke all on function achievement_qualifiers(text, text, numeric, text, numeric) from public, anon;
grant execute on function achievement_qualifiers(text, text, numeric, text, numeric) to authenticated;

create or replace function migration_0206_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0206_applied() from public, anon;
grant execute on function migration_0206_applied() to authenticated;
comment on function migration_0206_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0206.sql
