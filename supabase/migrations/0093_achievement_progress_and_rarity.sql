-- 0093 — How close you are to each achievement, and how rare each one is.
--
-- The gallery could only say "Train on 25 separate days" under a locked badge,
-- never "you are on 18". The numbers exist — `sync_my_achievements()` (0038)
-- computes them on every sync — but `member_training_stats()` and
-- `trainer_stats()` are revoked from `authenticated` (0028), rightly: they take
-- any uid. So the progress comes from here, a definer function that computes
-- the same stats the same way and says who may ask.
--
--   achievement_progress(p_user)  one row per active, automatic achievement for
--       that person's audience: the current value and the threshold (and the
--       second pair where a rule has two). The two level badges are 'builtin'
--       in the catalogue; they are returned from `level_thresholds()` — the
--       source `sync_my_achievements()` and Home both use — so the bar and the
--       unlock can never disagree. Manual achievements have no number and are
--       not returned.
--       Who may ask: yourself; admin and front desk (the member drawer); a
--       trainer for a member they have trained (`is_my_trainee`, 0082 — the
--       same relationship that decides every other thing a coach sees).
--
--   achievement_rarity()  per active achievement, how many active people of its
--       audience hold it, and how many there are. Counts only — no names — so
--       any signed-in user may read it. "Earned by 12% of members".
--
-- Nothing here writes. Unlocking still happens only in sync_my_achievements().

create or replace function achievement_progress(p_user uuid default null)
returns table (achievement_key text, value numeric, threshold numeric, value2 numeric, threshold2 numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  me        uuid := auth.uid();
  target    uuid := coalesce(p_user, auth.uid());
  role_name text;
  s         record;
  t         record;
  stats     jsonb;
  d         int;
  w         int;
begin
  if me is null or target is null then
    return;
  end if;
  -- NULL-safe on purpose: a caller with no profile has a NULL role, and
  -- `null in (...)` would otherwise slip through the guard (DATA_ACCESS).
  if target is distinct from me
     and not (coalesce(get_my_role()::text, '') in ('admin', 'staff') or is_my_trainee(target, me)) then
    raise exception 'You can only see achievement progress for yourself or the members you train'
      using errcode = '42501';
  end if;

  select p.role::text into role_name from profiles p where p.id = target;

  if role_name = 'member' then
    select * into s from member_training_stats(target);
    stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
      'days_as_member',
      case when s.member_since is null then 0 else (current_date - s.member_since) end);

    select lt.days, lt.weeks into d, w from level_thresholds('intermediate') lt;
    achievement_key := 'level_intermediate'; value := s.training_days; threshold := d;
    value2 := s.consistent_weeks; threshold2 := w;
    return next;
    select lt.days, lt.weeks into d, w from level_thresholds('advanced') lt;
    achievement_key := 'level_advanced'; value := s.training_days; threshold := d;
    value2 := s.consistent_weeks; threshold2 := w;
    return next;
  elsif role_name = 'trainer' then
    select * into t from trainer_stats(target);
    stats := row_to_json(t)::jsonb;
  else
    return;
  end if;

  return query
  select ac.key,
         jsonb_metric_value(stats, ac.metric),
         ac.threshold::numeric,
         case when ac.metric2 is null then null else jsonb_metric_value(stats, ac.metric2) end,
         ac.threshold2::numeric
    from achievements ac
   where ac.audience = role_name
     and ac.active
     and ac.rule_kind = 'metric';
end;
$$;

revoke all on function achievement_progress(uuid) from public, anon;
grant execute on function achievement_progress(uuid) to authenticated;

comment on function achievement_progress(uuid) is
  'Current value and threshold per automatic achievement, for yourself, a member '
  'you train, or anyone if you are admin/front desk. Read-only; unlocking stays '
  'in sync_my_achievements(). 0093.';

create or replace function achievement_rarity()
returns table (achievement_key text, holders int, audience_size int)
language sql stable security definer set search_path = public as $$
  with pop as (
    select p.role::text as r, count(*)::int as n
      from profiles p
     where p.status = 'active' and p.role::text in ('member', 'trainer')
     group by p.role
  ), held as (
    select u.achievement_key as k, count(*)::int as n
      from achievement_unlocks u
      join profiles p on p.id = u.user_id and p.status = 'active'
     group by u.achievement_key
  )
  select a.key, coalesce(held.n, 0), coalesce(pop.n, 0)
    from achievements a
    left join held on held.k = a.key
    left join pop on pop.r = a.audience
   where a.active
     and auth.uid() is not null;
$$;

revoke all on function achievement_rarity() from public, anon;
grant execute on function achievement_rarity() to authenticated;

comment on function achievement_rarity() is
  'Per active achievement: active holders and the size of its audience. Counts '
  'only, no identities. 0093.';

create or replace function migration_0093_applied() returns boolean
language sql immutable as $$ select true $$;
grant execute on function migration_0093_applied() to anon, authenticated;
