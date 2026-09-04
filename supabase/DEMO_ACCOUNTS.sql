-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO ACCOUNTS — five logins, one per plan and role. NOT a migration.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Like DEMO_DATA.sql, this lives outside `supabase/migrations/` on purpose: it
-- is scaffolding for trying the app out, and you should be able to throw it
-- away without touching the schema.
--
-- DEMO_DATA.sql deliberately refuses to invent members, because a made-up
-- member is a row nobody can log into — data that looks real and is not. This
-- file is the other half of that rule: every account it creates is a **real
-- Supabase Auth user with a password you can actually type in**. That is the
-- only kind of demo account worth having.
--
-- ---------------------------------------------------------------------------
-- What you get
-- ---------------------------------------------------------------------------
--   demo.freetrial@corefitness.test   member   Free Trial
--   demo.free@corefitness.test        member   Free Plan
--   demo.premium@corefitness.test     member   Premium
--   demo.trainer@corefitness.test     trainer  (Trainer tab on the phone app)
--   demo.staff@corefitness.test       staff    (front desk, admin dashboard)
--
--   Password for all five:  CoreFitness123!
--
-- The three members differ **only** in their plan, which is the point: log in as
-- two of them side by side and every difference you see is the plan_features
-- matrix (0049) doing its job. If two plans look identical, that is a finding —
-- check the matrix on the admin Membership Plans screen.
--
-- `.test` is a reserved TLD that can never route, so these addresses cannot
-- reach a real person even by accident. Nothing here sends email: the accounts
-- are created already confirmed, so there is no confirmation link to click and
-- no bounce. It also means **password reset will not work** for them — that is
-- correct for a throwaway account.
--
-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------
-- Migrations 0001–0060. 0057 names the plans this file looks up and 0060 cuts
-- them back to three — it fails loudly and tells you if any are missing, rather
-- than quietly creating members with no membership.
--
-- Safe to run twice: every insert is guarded, so a second run changes nothing
-- and reports the same five accounts.
--
-- ---------------------------------------------------------------------------
-- Run DEMO_DATA.sql afterwards
-- ---------------------------------------------------------------------------
-- That file refuses to run against a gym with no members, and until now there
-- may not have been any. Run this file first and it has three to work with: it
-- then fills in attendance history, workout logs, points, goals, a challenge
-- and events, so the accounts open onto a gym with a past instead of five empty
-- screens. The two are independent — either can be cleaned up without the
-- other — but they are much more useful in that order.
--
-- ---------------------------------------------------------------------------
-- To remove them later
-- ---------------------------------------------------------------------------
-- Scroll to the CLEANUP block at the bottom and run that alone. Deleting the
-- auth user cascades through profiles, member_profiles and memberships.
-- ═══════════════════════════════════════════════════════════════════════════

do $accounts$
declare
  -- Change this before running if you would rather not have a known password
  -- sitting in a file. It is applied to all five accounts.
  demo_password constant text := 'CoreFitness123!';

  a               record;
  v_plan          record;
  v_today         date := (now() at time zone 'Asia/Manila')::date;
  v_membership    uuid;
  v_has_prov_id   boolean;
  v_missing       text[] := '{}';
  v_made          int := 0;
  v_already       int := 0;
begin
  -- ── The password hash has to be one GoTrue will accept ───────────────────
  -- Supabase ships pgcrypto in the `extensions` schema and puts it on the
  -- search_path, so crypt() is normally just there. Check rather than fail
  -- three statements later with a confusing "function does not exist".
  if to_regprocedure('crypt(text,text)') is null then
    raise exception
      'pgcrypto is not reachable from here, so no password could be hashed. '
      'Run:  create extension if not exists pgcrypto with schema extensions;';
  end if;

  -- ── The plans have to exist before anyone can be put on one ──────────────
  -- Checked up front, all three at once, so you get one clear list instead of
  -- discovering the third is missing after two members were created.
  --
  -- Only *active* plans count. 0060 retired Pro by deactivating it when a
  -- membership still pointed at it, and a deactivated plan is one no member
  -- can be put on — so a demo account must not be put on one either.
  select array_agg(want.name order by want.name) into v_missing
    from (values ('Free Trial'), ('Free Plan'), ('Premium')) as want(name)
   where not exists (
     select 1 from membership_plans p where p.name = want.name and p.is_active
   );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception
      'These plans do not exist (or are not active): %. Run migrations 0057 '
      'and 0060 first — 0057 names them, 0060 cuts them back to three.',
      array_to_string(v_missing, ', ');
  end if;

  -- ── Every plan needs a full row of feature cells ─────────────────────────
  -- A plan with a missing cell locks members out of that area with no way for
  -- the admin to see why. The insert trigger seeds new plans; this catches any
  -- plan that predates 0049. Harmless when there is nothing to do.
  if to_regprocedure('sync_plan_features()') is not null then
    perform sync_plan_features();
  end if;

  -- Newer GoTrue has auth.identities.provider_id and older versions do not.
  -- Ask the catalogue instead of guessing, so this file works on both.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities'
       and column_name = 'provider_id'
  ) into v_has_prov_id;

  for a in
    select * from (values
      ('dede0001-0000-4000-8000-000000000001', 'demo.freetrial@corefitness.test',
       'Trial',   'Tamayo',   'member',  'Free Trial', 'beginner',     '+639170000001'),
      ('dede0002-0000-4000-8000-000000000002', 'demo.free@corefitness.test',
       'Frankie', 'Reyes',    'member',  'Free Plan',  'beginner',     '+639170000002'),
      ('dede0003-0000-4000-8000-000000000003', 'demo.premium@corefitness.test',
       'Prima',   'Salazar',  'member',  'Premium',    'intermediate', '+639170000003'),
      -- dede0004 was demo.pro@corefitness.test, on the Pro plan 0057 added and
      -- 0060 retired. The id is deliberately left unused rather than shuffled
      -- up: anyone who ran the old version of this file has that account, and
      -- reusing the id would quietly overwrite a different person.
      ('dede0005-0000-4000-8000-000000000005', 'demo.trainer@corefitness.test',
       'Tere',    'Bautista', 'trainer',  null,        null,           '+639170000005'),
      ('dede0006-0000-4000-8000-000000000006', 'demo.staff@corefitness.test',
       'Sandro',  'Lim',      'staff',    null,        null,           '+639170000006')
    ) as t(id, email, first_name, last_name, role, plan_name, level, phone)
  loop
    if exists (select 1 from auth.users u where u.id = a.id::uuid) then
      v_already := v_already + 1;
    else
      v_made := v_made + 1;
    end if;

    -- ── 1. The auth user ───────────────────────────────────────────────────
    -- email_confirmed_at is set, so there is no confirmation link to chase.
    -- The four token columns are written as '' rather than left to default:
    -- some GoTrue versions declare them NOT NULL without one.
    --
    -- No 'signup_source' key in the metadata, which matters: the trigger from
    -- 0005/0031 only fires for 'member_self_registration'. Leaving it out means
    -- these accounts skip the pending_approval queue entirely and this file
    -- controls their state, instead of racing a trigger for it.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', a.id::uuid,
      'authenticated', 'authenticated', a.email,
      crypt(demo_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name),
      '', '', '', ''
    )
    on conflict (id) do nothing;

    -- ── 2. The identity row ────────────────────────────────────────────────
    -- Password sign-in works without this on most versions, but the dashboard
    -- shows the account as having no provider and some flows look it up.
    if not exists (select 1 from auth.identities i where i.user_id = a.id::uuid) then
      if v_has_prov_id then
        insert into auth.identities
          (id, user_id, identity_data, provider, provider_id,
           last_sign_in_at, created_at, updated_at)
        values
          (gen_random_uuid(), a.id::uuid,
           jsonb_build_object('sub', a.id, 'email', a.email),
           'email', a.id, now(), now(), now());
      else
        insert into auth.identities
          (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values
          (gen_random_uuid(), a.id::uuid,
           jsonb_build_object('sub', a.id, 'email', a.email),
           'email', now(), now(), now());
      end if;
    end if;

    -- ── 3. The profile ─────────────────────────────────────────────────────
    -- 'active' straight away. These exist to be logged into; parking them in
    -- pending_approval would just mean six more clicks before anything is
    -- testable. Approve a *real* registration to exercise that queue.
    insert into profiles (id, role, first_name, last_name, email, phone, status)
    values (a.id::uuid, a.role::user_role, a.first_name, a.last_name,
            a.email, a.phone, 'active')
    on conflict (id) do nothing;

    -- ── 4. Role-specific rows ──────────────────────────────────────────────
    if a.role = 'trainer' then
      insert into trainer_profiles (profile_id, specialization, bio, availability)
      values (a.id::uuid, 'Strength & conditioning',
              'Demo coach account. Created by DEMO_ACCOUNTS.sql.',
              'Mon-Sat, 6am-10am and 4pm-8pm')
      on conflict (profile_id) do nothing;

    elsif a.role = 'member' then
      -- qr_code is the auth user id, matching what approval writes.
      -- onboarding_completed_at is stamped so the five-step intro does not
      -- replay every time you open one of these accounts on a new device.
      insert into member_profiles (
        profile_id, qr_code, experience_level, gym_id,
        date_of_birth, gender, onboarding_completed_at,
        address, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship
      ) values (
        a.id::uuid, a.id, a.level, 'core-fitness',
        '1998-06-15'::date, 'prefer_not_to_say', now(),
        'Mamburao, Occidental Mindoro',
        'Demo Contact', '+639170009999', 'Sibling'
      )
      on conflict (profile_id) do nothing;

      select * into v_plan
        from membership_plans p
       where p.name = a.plan_name and p.is_active
       limit 1;

      -- No unique constraint to conflict on, so guard by hand rather than
      -- handing the same member a second membership on every re-run.
      if not exists (select 1 from memberships m where m.member_id = a.id::uuid) then
        if v_plan.duration_days is null then
          -- A plan with no duration does not expire. never_expires is what
          -- separates that from "not activated yet" — both have a NULL expiry
          -- (0024), and the membership card reads the flag, not the NULL.
          insert into memberships
            (member_id, plan_id, status, start_date, expiry_date, never_expires)
          values (a.id::uuid, v_plan.id, 'active', v_today, null, true)
          returning id into v_membership;
        else
          insert into memberships
            (member_id, plan_id, status, start_date, expiry_date, never_expires)
          values (a.id::uuid, v_plan.id, 'active', v_today,
                  v_today + v_plan.duration_days, false)
          returning id into v_membership;
        end if;

        -- One trial per member, ever. Recording it means this account reflects
        -- a trial that has actually been claimed, so "can I claim another?"
        -- answers the same way it would for a real member.
        if v_plan.tier = 'freemium' and to_regclass('freemium_trials') is not null then
          insert into freemium_trials (member_id, membership_id, plan_id)
          values (a.id::uuid, v_membership, v_plan.id)
          on conflict (member_id) do nothing;
        end if;
      end if;
    end if;
  end loop;

  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'Demo accounts ready: % created, % already existed.', v_made, v_already;
  raise notice 'Password for all five: %', demo_password;
  raise notice 'Members: freetrial / free / premium @corefitness.test';
  raise notice 'Also:    trainer, staff @corefitness.test';
  raise notice '─────────────────────────────────────────────────────────────';
end
$accounts$;


-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK — run this on its own to see what exists and on which plan.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- select p.email, p.role, p.status, pl.name as plan, m.status as membership,
--        m.expiry_date, m.never_expires
--   from profiles p
--   left join memberships m     on m.member_id = p.id
--   left join membership_plans pl on pl.id = m.plan_id
--  where p.email like '%@corefitness.test'
--  order by p.email;


-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP — removes every demo account. Run this block alone.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deleting the auth user cascades: profiles → member_profiles → memberships,
-- and anything those own. It is scoped to the .test domain, so it cannot touch
-- a real member however many times you run it.
--
-- delete from auth.users where email like '%@corefitness.test';
--
-- **If you ran the earlier version of this file**, you still have a
-- demo.pro@corefitness.test account, and its membership is what stops 0060
-- deleting the retired Pro plan. Remove just that one:
--
-- delete from auth.users where email = 'demo.pro@corefitness.test';
--
-- then re-run 0060 and the Pro row goes rather than lingering as inactive.
