-- ============================================================================
-- 0237 — the Switches list (2026-11-07, the owner: "how can the admin owners see
-- who's switching to their gym and who is their member that is changing to
-- another gym?")
-- ============================================================================
--
-- 0227 notified the desk both ways and marked the member drawer, but there was
-- no one place to see them. gym_switch_list() is that place, for Members →
-- Switching: who asked to switch IN (waiting on this gym's approval, like any
-- sign-up) and who switched OUT in the last 90 days, with what is left to do —
-- an open cancellation (refund) request from the member's last term here.
--
-- As 0227 decided, the OTHER gym is never named: where a member goes, or comes
-- from, is their business. Owner and front desk only; a coach and a member get
-- nothing.
-- ============================================================================

create or replace function gym_switch_list()
returns table (
  id uuid, member uuid, name text, photo_url text,
  direction text,          -- 'in' | 'out'
  status text,             -- 'pending' | 'completed' | 'declined' | 'withdrawn'
  asked_at timestamptz, decided_at timestamptz,
  refund_waiting boolean   -- 'out': their cancellation request is still open on Members
)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if v_gym is null or get_my_role() is distinct from 'admin' and get_my_role() is distinct from 'staff' then
    raise exception 'Only the gym''s owner or front desk can see switches.' using errcode = '42501';
  end if;
  return query
  select s.id, s.member,
         coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'A member'),
         p.photo_url,
         case when s.to_gym = v_gym then 'in' else 'out' end,
         s.status, s.created_at, s.decided_at,
         (s.from_gym = v_gym and s.cancel_request is not null
            and exists (select 1 from membership_requests r where r.id = s.cancel_request and r.status = 'open'))
    from gym_switches s
    join profiles p on p.id = s.member
   where (s.to_gym = v_gym or s.from_gym = v_gym)
     and (s.status = 'pending' or s.created_at > now() - interval '90 days')
     -- A switch out that was only asked for (or withdrawn/declined elsewhere) is still the member's business.
     and not (s.from_gym = v_gym and s.status <> 'completed')
   order by (s.status = 'pending') desc, coalesce(s.decided_at, s.created_at) desc;
end;
$$;
revoke all on function gym_switch_list() from public, anon;
grant execute on function gym_switch_list() to authenticated;

create or replace function migration_0237_applied() returns boolean
language sql stable set search_path = public as $$ select true; $$;
grant execute on function migration_0237_applied() to anon, authenticated;
