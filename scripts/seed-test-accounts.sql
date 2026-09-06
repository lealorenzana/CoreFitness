-- Puts the test accounts on the right plans, for the run in docs/TEST_MATRIX.md.
--
-- ## What this does NOT do
--
-- **It does not create the accounts.** `auth.users` belongs to Supabase Auth —
-- it holds a hashed password, an identity row and confirmation state, and rows
-- inserted into it by hand produce accounts that appear in the dashboard and
-- cannot sign in. Every workaround for that is a way of corrupting the auth
-- schema quietly.
--
-- So create them through the app first:
--
--   * **members**  — register in the member app, then approve in admin. That
--                    exercises the approval workflow, which is itself on the
--                    test list, so it is not wasted effort.
--   * **trainers** — Admin → Trainers → Add (the `create-trainer` Edge
--                    Function, which keeps the admin's own session).
--   * **staff**    — Admin → Settings → Staff accounts.
--
-- Then run this. It is re-runnable and only ever touches
-- `@corefitness-test.com` addresses, so it cannot reach a real member.
--
-- ## Read the NOTICEs
--
-- Every account it could not find is reported by name rather than skipped in
-- silence. A seed script that quietly does nothing is how a test run ends up
-- proving something about the wrong account.

do $$
declare
  v_free    uuid;
  v_trial   uuid;
  v_premium uuid;
  r         record;
  n_missing int := 0;
begin
  -- ── Guard: this must never run against real data ────────────────────────
  if exists (
    select 1 from profiles
     where email like '%@corefitness-test.com'
       and email not like '%.member@corefitness-test.com'
       and email not like 'trainer.%@corefitness-test.com'
       and email not like 'desk@corefitness-test.com'
  ) then
    raise notice 'Unexpected @corefitness-test.com accounts present — check before trusting a run.';
  end if;

  select id into v_free    from membership_plans where name = 'Free Plan'  limit 1;
  select id into v_trial   from membership_plans where name = 'Free Trial' limit 1;
  select id into v_premium from membership_plans where name = 'Premium'    limit 1;

  if v_free is null or v_trial is null or v_premium is null then
    raise exception
      'The three plans are not all present (Free Plan / Free Trial / Premium). Run 0060 first.';
  end if;

  -- ── Put each test member on its plan ────────────────────────────────────
  for r in
    select * from (values
      ('free.member@corefitness-test.com',    v_free),
      ('trial.member@corefitness-test.com',   v_trial),
      ('premium.member@corefitness-test.com', v_premium),
      ('second.member@corefitness-test.com',  v_trial)
    ) as t(email, plan_id)
  loop
    declare
      v_member uuid;
      v_ms     uuid;
      v_days   int;
    begin
      select p.id into v_member
        from profiles p
        join member_profiles mp on mp.profile_id = p.id
       where lower(p.email) = r.email;

      if v_member is null then
        raise notice 'MISSING: % — register and approve it first.', r.email;
        n_missing := n_missing + 1;
        continue;
      end if;

      select duration_days into v_days from membership_plans where id = r.plan_id;

      -- One membership per test account, updated in place. Inserting a second
      -- would leave the old row behind and split every report in two, which is
      -- the bug 0057 avoided when it renamed plans rather than duplicating them.
      select id into v_ms
        from memberships
       where member_id = v_member
       order by created_at desc
       limit 1;

      if v_ms is null then
        insert into memberships (member_id, plan_id, status, start_date, expiry_date, never_expires)
        values (
          v_member, r.plan_id, 'active',
          (now() at time zone 'Asia/Manila')::date,
          case when v_days is null then null
               else (now() at time zone 'Asia/Manila')::date + v_days end,
          v_days is null
        );
        raise notice 'created membership for %', r.email;
      else
        update memberships
           set plan_id       = r.plan_id,
               status        = 'active',
               start_date    = (now() at time zone 'Asia/Manila')::date,
               expiry_date   = case when v_days is null then null
                                    else (now() at time zone 'Asia/Manila')::date + v_days end,
               never_expires = v_days is null,
               frozen_at     = null
         where id = v_ms;
        raise notice 'reset membership for %', r.email;
      end if;
    end;
  end loop;

  -- ── Both test trainers need the SAME availability ───────────────────────
  -- The panel's scenario is "A is full at Tuesday 10:00, B is free at Tuesday
  -- 10:00". If B has no Tuesday hours the test passes for the wrong reason —
  -- B's slot would be unavailable because B does not work Tuesdays.
  for r in
    select p.id
      from profiles p
      join trainer_profiles tp on tp.profile_id = p.id
     where lower(p.email) in ('trainer.a@corefitness-test.com',
                              'trainer.b@corefitness-test.com')
  loop
    insert into trainer_availability (trainer_id, day_of_week, start_time, end_time)
    select r.id, 2, '09:00', '17:00'          -- 2 = Tuesday
     where not exists (
       select 1 from trainer_availability
        where trainer_id = r.id and day_of_week = 2 and start_time = '09:00'
     );
  end loop;

  if n_missing > 0 then
    raise notice '--- % account(s) missing. Create them in the app, then re-run. ---', n_missing;
  else
    raise notice '--- all test accounts seeded ---';
  end if;
end
$$;

-- ============================================================================
-- WHAT YOU SHOULD SEE
-- ============================================================================
--   select p.email, mp.name as plan, m.status, m.expiry_date
--     from profiles p
--     join memberships m on m.member_id = p.id
--     join membership_plans mp on mp.id = m.plan_id
--    where p.email like '%@corefitness-test.com'
--    order by p.email;
--
--   -- Both trainers free on Tuesday, which test 3.2.2 depends on:
--   select p.email, ta.day_of_week, ta.start_time, ta.end_time
--     from trainer_availability ta
--     join profiles p on p.id = ta.trainer_id
--    where p.email like 'trainer.%@corefitness-test.com';
--
-- To reset between runs, re-run this file — it puts every test membership back
-- to active, today, unfrozen.
