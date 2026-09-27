-- 0134: THE PLATFORM SEES EACH GYM'S LOGO
--
-- The platform app drew every gym as two letters. A gym's logo and colour live
-- in its gym_settings (0067/0112) — its public identity, the same the join
-- page and the lobby TV show — so platform_gyms() now returns them. Nothing
-- private is added: no member, no payment row, only the gym's own brand.
--
-- The return type changes, so the function is dropped and made again (0108's
-- body, plus two columns at the end); the grants are restored below.

drop function if exists platform_gyms();
create function platform_gyms()
returns table (id uuid, name text, slug text, status text, plan text, paid_until date,
               lock_reason text, members int, staff int, created_at timestamptz,
               last_activity timestamptz, owners int, onboarded boolean,
               plan_name text, price_monthly numeric, days_left int,
               max_members int, paid_total numeric, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, g.status, g.plan, g.paid_until,
         gym_lock_reason(g.id),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'member' and r.status = 'active'),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role in ('admin', 'staff') and r.status = 'active'),
         g.created_at,
         greatest(
           (select max(a.check_in_time) from attendance a where a.gym_id = g.id),
           (select max(p.created_at) from payments p where p.gym_id = g.id)
         ),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'admin' and r.status = 'active'),
         g.onboarded_at is not null,
         pp.name, pp.price_monthly,
         case when g.paid_until is null then null
              else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         pp.max_members,
         coalesce((select sum(x.amount) from gym_payments x where x.gym_id = g.id), 0),
         nullif(btrim(s.logo_url), ''),
         coalesce(s.accent, 'violet')
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    left join gym_settings s on s.gym_id = g.id
   where is_platform_admin()
   order by g.name;
$$;
revoke all on function platform_gyms() from public, anon;
grant execute on function platform_gyms() to authenticated;

create or replace function migration_0134_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0134_applied() from public, anon;
grant execute on function migration_0134_applied() to authenticated;
comment on function migration_0134_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0134.sql
