-- 0100 — Accounts, memberships, payments, cash and refunds stay in one gym.
--
-- SECURITY DEFINER functions run as the table owner, so the same-gym policies
-- (0099) do not reach inside them. Each function here is its last definition,
-- copied and changed only where it touches another gym:
--   * a member-keyed helper reads the acting gym (acting_gym_id(): the
--     caller's current gym, or what system code set);
--   * a function handed an id refuses one from another gym;
--   * a trigger uses the row's own gym;
--   * "every active admin" means every active admin *of that gym* (gym_roles).
-- The keys 0098 kept for these functions' ON CONFLICT clauses are dropped at
-- the end, now that nothing names them.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 5)

-- ---- the transition mirror: a change lands in the gym of whoever made it ------
-- (0097 used the member's current gym first; an admin of Gym A suspending a
-- member whose current gym is B must suspend them in A.)

create or replace function trg_mirror_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := case when tg_op = 'INSERT'
                     then coalesce(new.active_gym_id, current_gym_id(), gym_one())
                     else coalesce(nullif(current_setting('cf.acting_gym', true), '')::uuid,
                                   current_gym_id(), new.active_gym_id, gym_one()) end;
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role
     and new.status is not distinct from old.status then
    return new;
  end if;
  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, new.id, new.role,
          case when new.status in ('active', 'pending_approval', 'suspended', 'archived')
               then new.status else 'active' end)
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  return new;
end;
$$;

-- ---- sign-up: into the gym the person chose ---------------------------------------
-- The app sends the chosen gym as `gym_id` in the sign-up metadata. Today's app
-- sends none, and its sign-ups keep going to Gym #1. A gym that is not taking
-- sign-ups (unknown, or suspended) is refused rather than silently swapped.

create or replace function handle_new_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta  jsonb := new.raw_user_meta_data;
  v_gym uuid;
begin
  if meta->>'signup_source' is distinct from 'member_self_registration' then
    return new;
  end if;

  if nullif(meta->>'gym_id', '') is null then
    v_gym := gym_one();
  else
    select g.id into v_gym from gyms g
     where g.id::text = meta->>'gym_id' and g.status = 'active';
    if v_gym is null then
      raise exception 'That gym is not taking sign-ups right now.';
    end if;
  end if;
  perform act_as_gym(v_gym);

  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id)
  values (
    new.id,
    'member',
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    'pending_approval',
    v_gym
  )
  on conflict (id) do nothing;

  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, new.id, 'member', 'pending_approval')
  on conflict (gym_id, user_id) do nothing;

  -- The row onboarding writes into. Created here, not at approval, because
  -- onboarding runs first.
  insert into member_profiles (gym_id, profile_id, qr_code, terms_accepted_at)
  values (
    v_gym,
    new.id,
    new.id::text,
    -- Only 'true' counts. A missing key, 'false', or anything else leaves NULL,
    -- which reads as "no record of consent" rather than as a quiet yes.
    case when meta->>'terms_accepted' = 'true' then now() end
  )
  on conflict (gym_id, profile_id) do nothing;

  insert into pending_registrations (gym_id, first_name, last_name, email, phone, requested_plan_id, auth_user_id)
  values (
    v_gym,
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    -- Only a plan of the chosen gym; another gym's plan id is dropped, not trusted.
    (select mp.id from membership_plans mp
      where mp.id::text = nullif(meta->>'requested_plan_id', '') and mp.gym_id = v_gym),
    new.id
  )
  on conflict (gym_id, email) do nothing;

  perform act_as_gym(null);
  return new;
end;
$$;

-- A signed-in person asks to join another gym. That gym's front desk approves
-- them exactly as it approves a sign-up (0078's set_account_status).
create or replace function request_to_join(p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  p    profiles;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  if not exists (select 1 from gyms where id = p_gym and status = 'active') then
    raise exception 'That gym is not taking sign-ups right now.';
  end if;
  if exists (select 1 from gym_roles where gym_id = p_gym and user_id = v_me) then
    raise exception 'You have already joined or asked to join that gym.';
  end if;
  select * into p from profiles where id = v_me;
  perform act_as_gym(p_gym);

  insert into gym_roles (gym_id, user_id, role, status)
  values (p_gym, v_me, 'member', 'pending_approval');
  insert into member_profiles (gym_id, profile_id, qr_code)
  values (p_gym, v_me, v_me::text)
  on conflict (gym_id, profile_id) do nothing;
  insert into pending_registrations (gym_id, first_name, last_name, email, phone, auth_user_id)
  values (p_gym, p.first_name, p.last_name, p.email, p.phone, v_me)
  on conflict (gym_id, email) do nothing;

  perform notify_once(r.user_id, 'system', 'New member request',
           coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Someone')
             || ' asked to join the gym.',
           '/members', 'join:' || p_gym || ':' || v_me)
    from gym_roles r
   where r.gym_id = p_gym and r.role in ('admin', 'staff') and r.status = 'active';

  perform act_as_gym(null);
end;
$$;
revoke all on function request_to_join(uuid) from public, anon;
grant execute on function request_to_join(uuid) to authenticated;

create or replace function apply_registration_details(
  member uuid,
  p_date_of_birth date,
  p_gender text,
  p_address text,
  p_ec_name text,
  p_ec_phone text,
  p_ec_relationship text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can apply registration details';
  end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = member) then
    raise exception 'That person is not a member of this gym.';
  end if;

  insert into member_profiles (gym_id, profile_id, qr_code, date_of_birth, gender, address,
                               emergency_contact_name, emergency_contact_phone,
                               emergency_contact_relationship)
  values (v_gym, member, member::text, p_date_of_birth, p_gender, p_address,
          p_ec_name, p_ec_phone, p_ec_relationship)
  on conflict (gym_id, profile_id) do update
    set date_of_birth                  = coalesce(excluded.date_of_birth, member_profiles.date_of_birth),
        gender                         = coalesce(excluded.gender, member_profiles.gender),
        address                        = coalesce(excluded.address, member_profiles.address),
        emergency_contact_name         = coalesce(excluded.emergency_contact_name, member_profiles.emergency_contact_name),
        emergency_contact_phone        = coalesce(excluded.emergency_contact_phone, member_profiles.emergency_contact_phone),
        emergency_contact_relationship = coalesce(excluded.emergency_contact_relationship, member_profiles.emergency_contact_relationship);
end;
$$;

-- ---- account status: per gym ------------------------------------------------------

create or replace function set_account_status(
  p_profile uuid,
  p_status  text,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym  uuid := acting_gym_id();
  v_prev text;
  -- text, not user_role: plpgsql converts on assignment, and the comparisons
  -- below are against literals either way. It also keeps the function loadable
  -- by scripts/sql/*.mjs, whose minimal fixture stubs get_my_role() as text.
  v_role text;
begin
  if p_status not in ('active', 'pending_approval', 'suspended', 'archived') then
    raise exception 'Unknown account status: %', p_status;
  end if;

  -- A suspension with no reason is the thing 0069 exists to prevent. The
  -- sentence is 0074's, not 0069's: "a reason is required to suspended an
  -- account" is read out at a desk, and this file must not undo that repair by
  -- copying the older body forward. Caught by scripts/sql/reasons-and-limits.mjs.
  if p_status in ('suspended', 'archived')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to set an account to %.', p_status;
  end if;

  -- The status in *this* gym. Someone with no role here is not this gym's to change.
  select status into v_prev from gym_roles where user_id = p_profile and gym_id = v_gym;
  if v_prev is null then
    raise exception 'No such account.';
  end if;

  -- `auth.uid() is not null and` first, as everywhere else in this schema:
  -- outside a browser session auth.uid() is NULL, and a bare role test would
  -- refuse the SQL Editor and the replay harness — the bug 0055 and 0062 both
  -- shipped. Inside a session the checks below still apply.
  if auth.uid() is not null then
    v_role := get_my_role();

    -- The front desk's single permitted transition. Spelled out rather than
    -- expressed as "not admin", because the next role added to this schema
    -- would otherwise inherit it silently.
    -- `v_prev = 'active'` is here for the double-click, not as a permission:
    -- it falls through to the quiet early return below, which writes nothing.
    -- Without it, approving a member somebody else just approved would raise a
    -- permission error at a desk with a queue behind it. The guard stays above
    -- the early return either way — 0074 shipped that bug the other way round.
    if v_role = 'staff' then
      if not (p_status = 'active' and v_prev in ('pending_approval', 'active')) then
        raise exception
          'The front desk can activate a pending sign-up. Changing an account '
          'beyond that is an admin action.';
      end if;
    elsif v_role is distinct from 'admin' then
      raise exception 'Only an admin can change an account status.';
    end if;
  end if;

  -- Nothing to record and nothing to change. Returning quietly rather than
  -- raising keeps a double-click idempotent instead of alarming.
  if v_prev = p_status then
    return;
  end if;

  update gym_roles set status = p_status where user_id = p_profile and gym_id = v_gym;
  -- Today's apps read profiles.status until Part B moves them to gym_roles.
  -- The mirror copies this back into the same gym, so it cannot touch another.
  perform set_config('cf.acting_gym', v_gym::text, true);
  update profiles set status = p_status where id = p_profile;

  insert into account_status_events
    (gym_id, profile_id, status, previous_status, reason, recorded_by)
  values
    (v_gym, p_profile, p_status, v_prev, nullif(btrim(p_reason), ''), auth.uid());
end;
$fn$;

-- The sign-in screen explains a lock-out. Someone still active in any gym is
-- not locked out, so nothing is said; otherwise the latest reason, in whichever
-- gym locked them out.
create or replace function account_lockout_reason(p_email text)
returns text
language sql stable security definer set search_path = public as $fn$
  select e.reason
    from profiles p
    join gym_roles r on r.user_id = p.id
    join account_status_events e on e.profile_id = p.id and e.gym_id = r.gym_id and e.status = r.status
   where lower(p.email) = lower(btrim(p_email))
     and r.status in ('suspended', 'archived')
     and not exists (select 1 from gym_roles a where a.user_id = p.id and a.status = 'active')
   order by e.created_at desc
   limit 1;
$fn$;

-- ---- memberships and plans --------------------------------------------------------

create or replace function claim_freemium_trial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_tier plan_tier;
  entering boolean;
begin
  select tier into new_tier from membership_plans where id = new.plan_id;

  -- `is distinct from` and not `<>`: a membership pointing at a missing plan
  -- leaves new_tier NULL, and `NULL <> 'freemium'` is NULL, which plpgsql
  -- treats as not-true — so the early return would be skipped and a member with
  -- no plan at all would burn their trial. That exact three-valued-logic hole
  -- shipped live in 0038 and was fixed in 0039; it is not making a comeback.
  if new_tier is distinct from 'freemium' then
    return new;
  end if;

  -- Only *moving onto* the trial consumes it (see 0041). OLD is unassigned
  -- during an INSERT, so TG_OP is checked before OLD is named at all.
  if tg_op = 'INSERT' then
    entering := true;
  else
    entering := old.plan_id is distinct from new.plan_id;
  end if;

  if not entering then
    return new;
  end if;

  -- One trial per member *per gym*: each gym runs its own offer.
  insert into freemium_trials (gym_id, member_id, membership_id, plan_id)
  values (new.gym_id, new.member_id, new.id, new.plan_id)
  on conflict (gym_id, member_id) do nothing;

  if not found then
    raise exception 'This member has already used the Freemium trial. Choose Free Access or Premium.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function free_tier_plan() returns membership_plans
language sql stable security definer set search_path = public as $$
  select * from membership_plans
   where tier = 'free' and is_active and gym_id = acting_gym_id()
   order by price asc, created_at asc
   limit 1;
$$;

create or replace function current_membership_of(p_member uuid)
returns table (status membership_status, expiry_date date, plan_id uuid, never_expires boolean)
language sql stable security definer set search_path = public as $$
  select m.status, m.expiry_date, m.plan_id, m.never_expires
  from memberships m
  where m.member_id = p_member
    and m.gym_id = acting_gym_id()
  order by m.created_at desc
  limit 1;
$$;

create or replace function plan_member_counts()
returns table (plan_id uuid, active_count int, total_count int)
language sql stable security definer set search_path = public as $$
  select p.id,
         count(*) filter (where m.status = 'active')::int,
         count(m.id)::int
    from membership_plans p
    left join memberships m on m.plan_id = p.id
   where p.gym_id = acting_gym_id()
   group by p.id;
$$;

create or replace function retire_plan(p_plan_id uuid)
returns table (moved int, plan_name text, moved_to text)
language plpgsql security definer set search_path = public as $fn$
declare
  v_plan  membership_plans;
  v_free  membership_plans;
  v_moved int := 0;
  v_trials int := 0;
begin
  -- Only a *signed-in non-admin* is refused (see 0062).
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can delete a membership plan.'
      using errcode = 'insufficient_privilege';
  end if;

  -- This gym's plan only: another gym's plan id reads as "no longer exists".
  select * into v_plan from membership_plans where id = p_plan_id and gym_id = acting_gym_id();
  if v_plan.id is null then
    raise exception 'That plan no longer exists — someone may have deleted it already.';
  end if;

  -- The destination is resolved by tier, not name (see `free_tier_plan()`), in
  -- this gym. If the gym has deactivated its free plan there is nowhere safe to
  -- send anyone, and saying so is better than inventing a destination.
  select * into v_free from free_tier_plan();
  if v_free.id is null then
    raise exception
      'There is no active free plan to move members to, so this plan cannot be '
      'deleted without stranding them. Create a plan on the free tier first.';
  end if;

  if v_plan.id = v_free.id then
    raise exception
      'This is the free plan members fall back to when another plan is deleted. '
      'Deactivate it instead, or create a replacement free plan first.';
  end if;

  -- A claimed trial is history: repointing it would falsify the record, and
  -- deleting it would hand that member a second trial.
  select count(*) into v_trials from freemium_trials where plan_id = p_plan_id;
  if v_trials > 0 then
    raise exception
      'Cannot delete "%": % member(s) claimed their one free trial on it, and '
      'that record cannot be moved without either falsifying it or handing '
      'them a second trial. Deactivate the plan instead — it disappears from '
      'the member app either way.', v_plan.name, v_trials;
  end if;

  -- Every membership, whatever its status. Status and dates are left alone:
  -- retiring a plan is an act about the catalogue and must not reactivate a
  -- lapsed member or cut short anyone's remaining days.
  update memberships set plan_id = v_free.id, updated_at = now()
   where plan_id = p_plan_id;
  get diagnostics v_moved = row_count;

  update pending_registrations set requested_plan_id = v_free.id
   where requested_plan_id = p_plan_id;

  delete from membership_plans where id = p_plan_id;

  return query select v_moved, v_plan.name, v_free.name;
end;
$fn$;

-- Every plan in every gym gets a row per feature; each row is filed under its
-- plan's gym (the acting gym would file them all under one).
create or replace function sync_plan_features() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  n int;
begin
  insert into plan_features (gym_id, plan_id, feature_key, enabled)
  select p.gym_id, p.id, f.key,
         case p.tier
           when 'free'     then f.default_free
           when 'freemium' then f.default_freemium
           when 'premium'  then f.default_premium
           else true
         end
    from membership_plans p
    cross join features f
  on conflict (plan_id, feature_key) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

create or replace function freezes_this_month(p_member uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select count(*)::int
    from membership_events e
   where e.member_id = p_member
     and e.gym_id = acting_gym_id()
     and e.kind = 'freeze'
     and date_trunc('month', (e.created_at at time zone 'Asia/Manila'))
       = date_trunc('month', (now() at time zone 'Asia/Manila'));
$fn$;

create or replace function frozen_days_last_year(p_member uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  with spans as (
    select e.created_at as started,
           (select min(u.created_at)
              from membership_events u
             where u.member_id = e.member_id
               and u.gym_id = e.gym_id
               and u.kind = 'unfreeze'
               and u.created_at > e.created_at) as ended
      from membership_events e
     where e.member_id = p_member
       and e.gym_id = acting_gym_id()
       and e.kind = 'freeze'
       and e.created_at > now() - interval '1 year'
  )
  select coalesce(sum(
    extract(epoch from (coalesce(ended, now()) - started)) / 86400
  ), 0)::int
  from spans;
$fn$;

-- ---- renewals -----------------------------------------------------------------------

create or replace function request_renewal(p_plan uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_me   uuid := auth.uid();
  v_gym  uuid := current_gym_id();
  v_plan record;
  v_id   uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from member_profiles where profile_id = v_me and gym_id = v_gym) then
    raise exception 'Only members can ask to renew.';
  end if;

  select id, name, tier, is_active into v_plan from membership_plans where id = p_plan and gym_id = v_gym;
  if v_plan.id is null or not v_plan.is_active then
    raise exception 'That plan is not offered any more.';
  end if;
  if v_plan.tier = 'freemium'
     and exists (select 1 from freemium_trials where member_id = v_me and gym_id = v_gym) then
    raise exception 'The free trial is one per member, and yours has been used.';
  end if;

  -- Asking again replaces the earlier ask rather than failing on the index:
  -- a member who changes their mind should not have to withdraw first.
  update renewal_requests
     set status = 'withdrawn', closed_at = now(), closed_by = v_me, close_note = 'Replaced by a new request'
   where member_id = v_me and gym_id = v_gym and status = 'open';

  insert into renewal_requests (gym_id, member_id, plan_id, note)
  values (v_gym, v_me, p_plan, nullif(btrim(p_note), ''))
  returning id into v_id;

  -- The desk hears about it. One row per staff account of this gym, deduped per request.
  perform notify_once(r.user_id, 'system', 'Renewal request',
           coalesce((select first_name || ' ' || last_name from profiles where id = v_me), 'A member')
             || ' is coming to the desk for ' || v_plan.name || '.',
           '/payments', 'renewal:' || v_id)
    from gym_roles r
   where r.gym_id = v_gym and r.role in ('admin', 'staff') and r.status = 'active';

  return v_id;
end;
$fn$;

create or replace function decline_renewal_request(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can decline a request.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;
  update renewal_requests
     set status = 'declined', closed_at = now(), closed_by = auth.uid(), close_note = btrim(p_reason)
   where id = p_id and status = 'open' and gym_id = acting_gym_id()
  returning member_id into r;
  if r.member_id is null then raise exception 'That request is not open.'; end if;
  perform notify_once(r.member_id, 'system', 'Renewal request closed', btrim(p_reason),
                      '/member/renew', 'renewal-declined:' || p_id);
end;
$fn$;

create or replace function withdraw_renewal_request()
returns void
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  update renewal_requests
     set status = 'withdrawn', closed_at = now(), closed_by = auth.uid()
   where member_id = auth.uid() and gym_id = current_gym_id() and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'You have no open request to withdraw.'; end if;
end;
$fn$;

create or replace function trg_fulfil_renewal_request() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'completed' and new.membership_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    update renewal_requests rr
       set status = 'fulfilled', closed_at = now(), closed_by = new.recorded_by
      from memberships ms
     where ms.id = new.membership_id
       and rr.member_id = new.member_id
       and rr.gym_id = new.gym_id
       and rr.status = 'open'
       and rr.plan_id = ms.plan_id;
  end if;
  return new;
end;
$fn$;

-- ---- invoice numbers: a sequence per gym per year -------------------------------------

drop function if exists next_invoice_number(int);
create function next_invoice_number(p_year int, p_gym uuid default null) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gym uuid := coalesce(p_gym, acting_gym_id());
  v_seq int;
begin
  -- The upsert is the lock (see 0045): concurrent inserts serialise on the
  -- gym's counter for the year instead of both reading the same last_seq.
  insert into invoice_counters (gym_id, year, last_seq)
  values (v_gym, p_year, 1)
  on conflict (gym_id, year) do update
    set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  -- Four digits carries 9,999 payments in a year and simply grows past it
  -- rather than wrapping or truncating, which is the failure being fixed.
  return 'INV-' || p_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function set_payment_invoice_number() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `new.paid_on` is already defaulted by the time a BEFORE INSERT trigger runs,
  -- so the coalesce only covers an explicit NULL. Note this reads `new` only:
  -- `old` is unassigned in an INSERT trigger, and touching it aborts the insert.
  new.invoice_number := next_invoice_number(
    extract(year from coalesce(new.paid_on,
                               (now() at time zone 'Asia/Manila')::date))::int,
    new.gym_id);
  return new;
end;
$$;

-- ---- the cash drawer ------------------------------------------------------------------

create or replace function cash_day_summary(p_day date)
returns table (day date, cash_in numeric, refunds_out numeric, expected numeric, payment_count int,
               closed boolean, counted numeric, difference numeric, note text, closed_by_name text, closed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_in numeric; v_out numeric; v_n int;
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the front desk can see the cash drawer' using errcode = '42501';
  end if;
  select coalesce(sum(p.amount), 0), count(*)::int into v_in, v_n
    from payments p
   where p.gym_id = v_gym
     and p.status = 'completed'
     and lower(p.method) = 'cash'
     and coalesce(p.paid_on, (p.created_at at time zone 'Asia/Manila')::date) = p_day;
  select coalesce(sum(e.refund_amount), 0) into v_out
    from membership_events e
   where e.gym_id = v_gym
     and e.refund_amount is not null
     and (e.created_at at time zone 'Asia/Manila')::date = p_day;
  return query
  select p_day, v_in, v_out, v_in - v_out, v_n,
         c.day is not null, c.counted, c.difference, c.note,
         nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), c.closed_at
    from (select 1) one
    left join cash_closeouts c on c.gym_id = v_gym and c.day = p_day
    left join profiles pr on pr.id = c.closed_by;
end;
$$;

create or replace function close_cash_day(p_day date, p_counted numeric, p_note text default null)
returns cash_closeouts
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  s record;
  existing cash_closeouts;
  result cash_closeouts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the front desk can close the cash drawer' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now, so the drawer cannot be closed.';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Type the amount counted in the drawer';
  end if;
  if p_day > (now() at time zone 'Asia/Manila')::date then
    raise exception 'That day has not happened yet';
  end if;
  select * into s from cash_day_summary(p_day);
  if p_counted <> s.expected and v_note is null then
    raise exception 'The count is off by %. Add a note saying why before closing.', abs(p_counted - s.expected);
  end if;
  select * into existing from cash_closeouts where gym_id = v_gym and day = p_day;
  if existing.day is not null then
    if coalesce(get_my_role()::text, '') <> 'admin' then
      raise exception 'This day is already closed. Only an admin can redo it.';
    end if;
    if v_note is null then
      raise exception 'Redoing a close needs a note saying why';
    end if;
    update cash_closeouts
       set expected = s.expected, counted = p_counted, payment_count = s.payment_count,
           refunds_out = s.refunds_out, note = v_note, closed_by = auth.uid(), closed_at = now(),
           previous = jsonb_build_object('counted', existing.counted, 'expected', existing.expected,
                                         'note', existing.note, 'closed_by', existing.closed_by,
                                         'closed_at', existing.closed_at)
     where gym_id = v_gym and day = p_day
     returning * into result;
  else
    insert into cash_closeouts (gym_id, day, expected, counted, payment_count, refunds_out, note, closed_by)
    values (v_gym, p_day, s.expected, p_counted, s.payment_count, s.refunds_out, v_note, auth.uid())
    returning * into result;
  end if;
  return result;
end;
$$;

-- ---- refunds: the membership's own gym's rules --------------------------------------------

create or replace function refund_quote(p_membership uuid)
returns table (
  percent        numeric,   -- the effective percentage actually applied
  amount         numeric,   -- pesos, after the documented fee
  rule_label     text,      -- the sentence that produced it
  days_elapsed   int,
  has_visited    boolean,
  paid_total     numeric,
  days_total     int,       -- the membership's full term
  days_unused    int,
  prorata_percent numeric,  -- what the law expects on its own
  floor_percent  numeric,   -- what the gym's own tier guarantees
  basis          text,      -- 'prorata' | 'gym_floor' | 'undecided'
  fee_deducted   numeric
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  m record;
  v_days_elapsed int;
  v_days_total   int;
  v_days_unused  int;
  v_visited  boolean;
  v_paid     numeric;
  v_fee      numeric;
  v_prorata  numeric;
  v_floor    numeric;
  v_pct      numeric;
  v_basis    text;
  v_label    text;
  r record;
begin
  -- A signed-in caller sees only a membership of their current gym; another
  -- gym's membership id reads as no such membership.
  select ms.id, ms.gym_id, ms.member_id, ms.start_date, ms.expiry_date, ms.never_expires, ms.status
    into m
    from memberships ms
   where ms.id = p_membership
     and (auth.uid() is null or ms.gym_id = current_gym_id());

  if m.id is null then
    raise exception 'No such membership.';
  end if;

  -- Self or front desk. `auth.uid() is not null and` first, so the SQL Editor
  -- is not the one caller refused (0055 and 0062 both shipped that bug).
  if auth.uid() is not null
     and m.member_id is distinct from auth.uid()
     and not is_front_desk() then
    raise exception 'You can only see your own refund quote.';
  end if;

  -- Manila, never `current_date`, which is UTC and reads as yesterday for the
  -- first eight hours of every local day.
  v_days_elapsed := greatest(0, (
    (now() at time zone 'Asia/Manila')::date
      - coalesce(m.start_date, (now() at time zone 'Asia/Manila')::date)
  ));

  select exists (
    select 1 from attendance a
     where a.member_id = m.member_id
       and a.gym_id = m.gym_id
       and (m.start_date is null
            or (a.check_in_time at time zone 'Asia/Manila')::date >= m.start_date)
  ) into v_visited;

  -- Completed payments only: a pending payment is money the gym has not
  -- received and cannot give back.
  select coalesce(sum(p.amount), 0) into v_paid
    from payments p
   where p.membership_id = m.id and p.status = 'completed';

  select coalesce(refund_processing_fee, 0) into v_fee from gym_settings where gym_id = m.gym_id;

  -- ── Pro-rata ────────────────────────────────────────────────────────────
  if m.never_expires or m.expiry_date is null or m.start_date is null then
    v_days_total  := null;
    v_days_unused := null;
    v_prorata     := null;
  else
    v_days_total  := greatest(1, m.expiry_date - m.start_date);
    v_days_unused := greatest(0, least(v_days_total, m.expiry_date
                       - (now() at time zone 'Asia/Manila')::date));
    v_prorata     := round(v_days_unused::numeric * 100 / v_days_total, 2);
  end if;

  -- ── The gym's own floor ─────────────────────────────────────────────────
  select * into r
    from refund_rules rr
   where rr.gym_id = m.gym_id
     and rr.is_active
     and v_days_elapsed >= rr.min_days
     and (rr.max_days is null or v_days_elapsed < rr.max_days)
     and (rr.requires_visits is null or rr.requires_visits = v_visited)
   order by rr.priority
   limit 1;

  v_floor := case when found then r.percent else null end;

  -- ── Whichever is kinder to the member ───────────────────────────────────
  if v_prorata is null and v_floor is null then
    return query select null::numeric, null::numeric,
      'No refund rule covers this case — an admin decides.'::text,
      v_days_elapsed, v_visited, v_paid,
      v_days_total, v_days_unused, v_prorata, v_floor, 'undecided'::text, v_fee;
    return;
  end if;

  if coalesce(v_prorata, -1) >= coalesce(v_floor, -1) then
    v_pct   := v_prorata;
    v_basis := 'prorata';
    v_label := format(
      '%s of %s days unused — pro-rata refund of %s%%. This is the Consumer Act baseline.',
      v_days_unused, v_days_total, trim(to_char(v_prorata, 'FM990.99')));
  else
    v_pct   := v_floor;
    v_basis := 'gym_floor';
    v_label := coalesce(r.label, 'Gym policy') ||
      case when v_prorata is null then ''
           else format(' (more generous than the %s%% pro-rata share)',
                       trim(to_char(v_prorata, 'FM990.99'))) end;
  end if;

  return query select
    v_pct,
    greatest(0, round(v_paid * v_pct / 100, 2) - v_fee),
    v_label,
    v_days_elapsed, v_visited, v_paid,
    v_days_total, v_days_unused, v_prorata, v_floor, v_basis, v_fee;
end;
$fn$;

-- ---- the transition keys these functions were the last to name --------------------------

alter table member_profiles       drop constraint if exists member_profiles_profile_id_transition;
alter table member_profiles       drop constraint if exists member_profiles_qr_code_transition;
alter table pending_registrations drop constraint if exists pending_registrations_email_transition;
alter table freemium_trials       drop constraint if exists freemium_trials_member_id_transition;
alter table invoice_counters      drop constraint if exists invoice_counters_year_transition;
drop index if exists renewal_requests_one_open_transition;

create or replace function migration_0100_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0100_applied() from public, anon;
grant execute on function migration_0100_applied() to authenticated;
comment on function migration_0100_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0100.sql
