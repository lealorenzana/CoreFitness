-- ============================================================================
-- 0197 — The rewards catalogue grows up: a photo, a category, featured,
--         a last day, and a per-member monthly limit
-- ============================================================================
--
-- A reward was a name, a price and a stock count. The owner asked for pictures
-- and "the missing features": a member scrolling the catalogue sees the photo,
-- the gym pins one or two as featured, a seasonal reward ends on its last day,
-- and a generous reward ("free shake") can be limited to N a member a month.
--
-- Rules live here, never in the form (CLAUDE.md):
--   * the last day and the monthly limit are checked by a BEFORE INSERT trigger
--     on reward_redemptions — the member app's insert cannot skip them. It sits
--     beside 0051/0102's trg_validate_redemption (price, stock, balance), which
--     is left untouched. The month is Manila's; a declined request does not
--     count against the limit (the member got nothing).
--   * a photo must be one of this gym's own uploads (media/gyms/<gym_id>/…) —
--     a URL typed by hand, or another gym's file, is refused (0120's rule that
--     a file belongs to a gym because its path says so).
-- ============================================================================

alter table rewards add column if not exists image_url text;
alter table rewards add column if not exists category text;
alter table rewards add column if not exists featured boolean not null default false;
alter table rewards add column if not exists available_until date;
alter table rewards add column if not exists per_member_monthly int;

do $$ begin
  alter table rewards add constraint rewards_per_member_monthly_positive
    check (per_member_monthly is null or per_member_monthly > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table rewards add constraint rewards_category_length
    check (category is null or char_length(category) between 1 and 40);
exception when duplicate_object then null; end $$;

comment on column rewards.image_url is '0197: a photo from this gym''s own media folder (checked by a trigger).';
comment on column rewards.category is '0197: free text the owner groups the catalogue by (Drinks, Merch, Membership…).';
comment on column rewards.featured is '0197: shown first, and marked, in the member app.';
comment on column rewards.available_until is '0197: the last Manila day it can be asked for; NULL = no end.';
comment on column rewards.per_member_monthly is '0197: at most this many requests a member a Manila month (declined ones do not count); NULL = no limit.';

-- A photo is this gym's own upload, or nothing.
create or replace function trg_reward_image_is_gyms() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if new.image_url is not null then
    new.image_url := nullif(btrim(new.image_url), '');
  end if;
  if new.image_url is not null
     and position('/storage/v1/object/public/media/gyms/' || new.gym_id::text || '/' in new.image_url) = 0 then
    raise exception 'A reward photo must be uploaded from this page.';
  end if;
  if new.category is not null then
    new.category := nullif(btrim(new.category), '');
  end if;
  return new;
end;
$fn$;

drop trigger if exists rewards_image_is_gyms on rewards;
create trigger rewards_image_is_gyms
  before insert or update of image_url, category on rewards
  for each row execute function trg_reward_image_is_gyms();

-- The last day and the monthly limit, enforced where the member cannot skip them.
create or replace function trg_redemption_limits() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  used int;
  month_start date := date_trunc('month', manila_today())::date;
begin
  select available_until, per_member_monthly into r from rewards where id = new.reward_id;
  if r is null then
    return new;  -- trg_validate_redemption says "not available"
  end if;
  if r.available_until is not null and r.available_until < manila_today() then
    raise exception 'That reward ended on %.', to_char(r.available_until, 'FMMonth FMDD');
  end if;
  if r.per_member_monthly is not null then
    select count(*) into used
      from reward_redemptions q
     where q.member_id = new.member_id
       and q.reward_id = new.reward_id
       and q.status <> 'rejected'
       and (q.requested_at at time zone 'Asia/Manila')::date >= month_start;
    if used >= r.per_member_monthly then
      raise exception 'You have asked for this % time% this month — the limit is %.',
        used, case when used = 1 then '' else 's' end, r.per_member_monthly;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists reward_redemptions_limits on reward_redemptions;
create trigger reward_redemptions_limits
  before insert on reward_redemptions
  for each row execute function trg_redemption_limits();

-- What the owner sees about each reward: requests this month, all time, and
-- points spent on it. Admin or desk of the acting gym; counts only.
create or replace function reward_stats()
returns table (reward_id uuid, this_month int, all_time int, points_spent bigint)
language sql stable security definer set search_path = public as $$
  select w.id,
         count(q.id) filter (where q.status <> 'rejected'
           and (q.requested_at at time zone 'Asia/Manila')::date >= date_trunc('month', manila_today())::date)::int,
         count(q.id) filter (where q.status <> 'rejected')::int,
         coalesce(sum(q.cost_points) filter (where q.status in ('approved', 'fulfilled')), 0)::bigint
    from rewards w
    left join reward_redemptions q on q.reward_id = w.id
   where w.gym_id = current_gym_id()
     and exists (select 1 from gym_roles g where g.gym_id = w.gym_id and g.user_id = auth.uid()
                  and g.role in ('admin', 'staff') and g.status = 'active')
   group by w.id
$$;
revoke all on function reward_stats() from public, anon;
grant execute on function reward_stats() to authenticated;

create or replace function migration_0197_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0197_applied() from public, anon;
grant execute on function migration_0197_applied() to authenticated;
comment on function migration_0197_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0197.sql
