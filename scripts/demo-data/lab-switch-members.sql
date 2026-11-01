-- Part G — a second private test gym, and switching to try (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md).
--
-- Paste ONCE in the Supabase SQL editor, after 0229. It:
--   1. creates "Core Fitness Lab 2" — private like the Lab: hidden from every
--      gym list (0229), never billed (paid until 2099), on Pro, set up already;
--      joined only with its code LABTWO, and its desk approves each member;
--   2. makes the Lab's owner login (mf.jgabrielle+owner@gmail.com) its owner
--      too — the admin app's gym switcher moves between the two;
--   3. moves two of the Lab's MADE-UP members (5eed…, @seed.corefitness-test.com)
--      through the real switch (0227): one has switched to Lab 2 (their
--      training went with them), one is waiting at Lab 2's desk to switch in.
--
-- Then try it for real: sign in to the member app as mf.jgabrielle+member@gmail.com
-- (a Lab member) → More → Gyms → Switch gym → Find your gym → type LABTWO →
-- Switch → agree; approve them in the admin app at Lab 2 (Members).
--
-- Undo: the made-up members go with the platform's Remove demo data. Lab 2
-- itself stays until you delete it (it holds nothing real).
-- Safe to paste again: each step checks first.

do $g$
declare
  v_lab  uuid := gym_one();
  v_two  uuid := 'c0f1e55e-0000-4000-8000-000000000002';
  v_owner uuid;
  v_out  uuid;
  v_in   uuid;
begin
  if to_regprocedure('public.migration_0229_applied()') is null then
    raise exception 'Paste 0229 (supabase/migrations/0229_hidden_gyms.sql) first.';
  end if;
  if to_regprocedure('public.complete_gym_switch(uuid)') is null then
    raise exception 'Paste 0227 first.';
  end if;
  select id into v_owner from profiles where lower(email) = 'mf.jgabrielle+owner@gmail.com';
  if v_owner is null then raise exception 'The Lab owner login (mf.jgabrielle+owner@gmail.com) was not found.'; end if;

  -- 1. The gym.
  if not exists (select 1 from gyms where id = v_two) then
    insert into gyms (id, name, slug, status, plan, onboarded_at, paid_until, hidden)
    values (v_two, 'Core Fitness Lab 2', 'core-fitness-lab-2', 'active', 'pro', now(), '2099-12-31', true);
    perform seed_gym_defaults(v_two);
  end if;
  update gyms set hidden = true, paid_until = greatest(coalesce(paid_until, '2099-12-31'), '2099-12-31'), status = 'active' where id = v_two;
  insert into gym_settings (gym_id, join_policy, join_code, join_approval)
  values (v_two, 'code', 'LABTWO', 'desk')
  on conflict (gym_id) do update set join_policy = 'code', join_code = 'LABTWO', join_approval = 'desk';

  -- 2. Its owner: the Lab's owner login.
  insert into gym_roles (gym_id, user_id, role, status) values (v_two, v_owner, 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = 'admin', status = 'active';

  -- 3. Two made-up Lab members, through the real switch. The desk guard checks the person signed in,
  --    and nobody is signed in to the SQL editor, so it steps aside for these two inserts only.
  alter table gym_roles disable trigger staff_area_guard;

  select r.user_id into v_out from gym_roles r join profiles p on p.id = r.user_id
   where r.gym_id = v_lab and r.role = 'member' and r.status = 'active'
     and p.id::text like '5eed%' and p.email like '%@seed.corefitness-test.com'
     and exists (select 1 from workout_logs w where w.member_id = p.id and w.gym_id = v_lab)
     and not exists (select 1 from gym_switches s where s.member = p.id)
   order by p.id limit 1;
  if v_out is not null and not exists (select 1 from gym_switches where to_gym = v_two and status = 'completed') then
    insert into gym_switches (member, from_gym, to_gym) values (v_out, v_lab, v_two);
    insert into member_profiles (gym_id, profile_id, qr_code) values (v_two, v_out, v_out::text) on conflict (gym_id, profile_id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values (v_two, v_out, 'member', 'active');   -- accepted: the switch completes
  end if;

  select r.user_id into v_in from gym_roles r join profiles p on p.id = r.user_id
   where r.gym_id = v_lab and r.role = 'member' and r.status = 'active'
     and p.id::text like '5eed%' and p.email like '%@seed.corefitness-test.com'
     and not exists (select 1 from gym_switches s where s.member = p.id)
   order by p.id desc limit 1;
  if v_in is not null and not exists (select 1 from gym_switches where to_gym = v_two and status = 'pending') then
    insert into gym_switches (member, from_gym, to_gym) values (v_in, v_lab, v_two);
    insert into member_profiles (gym_id, profile_id, qr_code) values (v_two, v_in, v_in::text) on conflict (gym_id, profile_id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values (v_two, v_in, 'member', 'pending_approval');   -- waiting at the desk
  end if;

  alter table gym_roles enable trigger staff_area_guard;

  raise notice 'Core Fitness Lab 2 is ready (code LABTWO). Switched out: %. Waiting to switch in: %.',
    coalesce(display_name_of(v_out), 'none'), coalesce(display_name_of(v_in), 'none');
end
$g$;

-- What it made (read-only):
select g.name, g.hidden, g.paid_until, s.join_policy, s.join_code,
       (select count(*) from gym_roles r where r.gym_id = g.id and r.role = 'member' and r.status = 'active') as members,
       (select count(*) from gym_roles r where r.gym_id = g.id and r.role = 'member' and r.status = 'pending_approval') as waiting,
       (select count(*) from workout_logs w where w.gym_id = g.id) as workouts_moved
  from gyms g join gym_settings s on s.gym_id = g.id
 where g.id = 'c0f1e55e-0000-4000-8000-000000000002';
