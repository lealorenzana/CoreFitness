-- ============================================================================
-- 0167 — Members can pay their gym by GCash, Maya or bank transfer
-- ============================================================================
--
-- Until now a gym was cash-only: a member asked to renew (0091) and paid at
-- the desk. This adds the same road a gym already uses to pay Core Fitness
-- (0148), one level down:
--
--   * the owner lists the gym's own GCash / Maya / bank details and QR codes
--     (gym_payment_methods — save/delete through owner-only functions);
--   * a member choosing a plan can pay by one of them from the app and send
--     the reference number and a screenshot: request_renewal_paid() writes an
--     ordinary renewal request carrying the payment proof, and the desk is told;
--   * the desk confirms it by recording the payment as always (the existing
--     0091 trigger then closes the request), or declines it with a reason;
--   * a reference can be claimed once per gym while its request stands.
--
-- The money never passes through Core Fitness: the member pays the gym's own
-- account, and the gym confirms by hand. It is a switch the gym owns
-- (platform_features 'online_pay', a child of the front desk): off, members
-- see only "pay at the desk". Members see it only while it is on AND the gym
-- has at least one active method.
-- ============================================================================

-- ---- 1. the switch -------------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key) values
  ('online_pay', 'Online payments',
   'Members pay by GCash, Maya or bank transfer from the app and send the reference; the desk confirms each one.',
   13, 'front_desk')
on conflict (key) do nothing;

-- ---- 2. the gym's own payment methods ------------------------------------------------------------
create table if not exists gym_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  kind           text not null check (kind in ('gcash', 'maya', 'bank', 'other')),
  label          text not null check (length(btrim(label)) between 2 and 60),
  account_name   text check (account_name is null or length(account_name) <= 120),
  account_number text check (account_number is null or length(account_number) <= 60),
  qr_image       text check (qr_image is null or (qr_image like 'data:image/%' and length(qr_image) <= 400000)),
  instructions   text check (instructions is null or length(instructions) <= 600),
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists idx_gym_payment_methods_gym on gym_payment_methods (gym_id, sort_order);
alter table gym_payment_methods enable row level security;

-- Everyone at the gym reads its active methods while the switch is on; the
-- owner reads all of them (to set them up before switching on). No write
-- policy: only the functions below write.
drop policy if exists gym_payment_methods_read on gym_payment_methods;
create policy gym_payment_methods_read on gym_payment_methods for select to authenticated
  using (gym_id = current_gym_id()
         and ((active and gym_module_on(gym_id, 'online_pay')) or get_my_role() = 'admin'));

create or replace function save_gym_payment_method(
  p_id uuid, p_kind text, p_label text, p_account_name text, p_account_number text,
  p_qr_image text, p_instructions text, p_active boolean, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  if v_gym is null or get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym''s owner can change how members pay.' using errcode = '42501';
  end if;
  if not gym_writable() then
    raise exception 'Your gym is read-only right now.' using errcode = '42501';
  end if;
  if p_id is null then
    insert into gym_payment_methods (gym_id, kind, label, account_name, account_number, qr_image, instructions, active, sort_order)
    values (v_gym, p_kind, btrim(p_label), nullif(btrim(p_account_name), ''), nullif(btrim(p_account_number), ''),
            nullif(p_qr_image, ''), nullif(btrim(p_instructions), ''), coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update gym_payment_methods
       set kind = p_kind, label = btrim(p_label), account_name = nullif(btrim(p_account_name), ''),
           account_number = nullif(btrim(p_account_number), ''), qr_image = nullif(p_qr_image, ''),
           instructions = nullif(btrim(p_instructions), ''), active = coalesce(p_active, true),
           sort_order = coalesce(p_sort, sort_order)
     where id = p_id and gym_id = v_gym
     returning id into v_id;
    if v_id is null then raise exception 'That payment method is not at your gym.'; end if;
  end if;
  perform log_activity('gym.payment_method_saved', 'gym_payment_method', v_id, null,
    'Payment method saved: ' || btrim(p_label) || case when coalesce(p_active, true) then '' else ' (hidden)' end, null, v_gym);
  return v_id;
end $$;
revoke all on function save_gym_payment_method(uuid, text, text, text, text, text, text, boolean, int) from public, anon;
grant execute on function save_gym_payment_method(uuid, text, text, text, text, text, text, boolean, int) to authenticated;

create or replace function delete_gym_payment_method(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_label text;
begin
  if v_gym is null or get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym''s owner can change how members pay.' using errcode = '42501';
  end if;
  delete from gym_payment_methods where id = p_id and gym_id = v_gym returning label into v_label;
  if v_label is null then raise exception 'That payment method is not at your gym.'; end if;
  perform log_activity('gym.payment_method_removed', 'gym_payment_method', p_id, null, 'Payment method removed: ' || v_label, null, v_gym);
end $$;
revoke all on function delete_gym_payment_method(uuid) from public, anon;
grant execute on function delete_gym_payment_method(uuid) to authenticated;

-- ---- 3. a renewal request can carry the payment ------------------------------------------------
alter table renewal_requests
  -- No foreign key on purpose: the method's label and kind are copied onto the row, so a
  -- removed method leaves the request readable, and tenancy forbids a gym-blind link.
  add column if not exists pay_method_id    uuid,
  add column if not exists pay_method_label text check (pay_method_label is null or length(pay_method_label) <= 60),
  add column if not exists pay_kind         text check (pay_kind is null or pay_kind in ('gcash', 'maya', 'bank', 'other')),
  add column if not exists pay_reference    text check (pay_reference is null or length(btrim(pay_reference)) between 4 and 60),
  add column if not exists pay_proof        text check (pay_proof is null or (pay_proof like 'data:image/%' and length(pay_proof) <= 400000)),
  add column if not exists pay_amount       numeric(10,2) check (pay_amount is null or pay_amount > 0),
  add column if not exists paid_on          date;

-- A reference can be claimed once per gym, while its request stands (open or
-- fulfilled). A declined or withdrawn one frees it, so a typo can be retried.
create unique index if not exists renewal_requests_reference_once
  on renewal_requests (gym_id, upper(btrim(pay_reference)))
  where pay_reference is not null and status in ('open', 'fulfilled');

create or replace function request_renewal_paid(
  p_plan uuid, p_method uuid, p_reference text, p_proof text default null, p_paid_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_me uuid := auth.uid(); v_gym uuid := current_gym_id(); v_id uuid; v_plan record; v_m record;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_on date := coalesce(p_paid_on, (now() at time zone 'Asia/Manila')::date);
  v_name text;
begin
  if v_me is null or v_gym is null
     or not exists (select 1 from member_profiles where profile_id = v_me and gym_id = v_gym) then
    raise exception 'Only members can pay for a plan.';
  end if;
  if not gym_module_on(v_gym, 'online_pay') then
    raise exception 'Your gym takes payments at the front desk only.';
  end if;
  select id, label, kind, active into v_m from gym_payment_methods where id = p_method and gym_id = v_gym;
  if v_m.id is null or not v_m.active then
    raise exception 'That way to pay is not offered any more.';
  end if;
  select id, name, price, is_active into v_plan from membership_plans where id = p_plan and gym_id = v_gym;
  if v_plan.id is null or not v_plan.is_active then
    raise exception 'That plan is not offered any more.';
  end if;
  if coalesce(v_plan.price, 0) <= 0 then
    raise exception 'That plan is free — ask the desk for it, there is nothing to pay.';
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 4 then
    raise exception 'Type the reference number from your receipt.';
  end if;
  if v_on > v_today or v_on < v_today - 7 then
    raise exception 'The payment date must be within the last 7 days.';
  end if;
  if exists (select 1 from renewal_requests where gym_id = v_gym and pay_reference is not null
              and upper(btrim(pay_reference)) = upper(btrim(p_reference)) and status in ('open', 'fulfilled')) then
    raise exception 'That reference number has already been sent.';
  end if;

  update renewal_requests
     set status = 'withdrawn', closed_at = now(), closed_by = v_me, close_note = 'Replaced by a new request'
   where member_id = v_me and gym_id = v_gym and status = 'open';

  insert into renewal_requests (gym_id, member_id, plan_id, note, pay_method_id, pay_method_label, pay_kind,
                                pay_reference, pay_proof, pay_amount, paid_on)
  values (v_gym, v_me, p_plan, 'Paid by ' || v_m.label, v_m.id, v_m.label, v_m.kind,
          upper(btrim(p_reference)), nullif(p_proof, ''), v_plan.price, v_on)
  returning id into v_id;

  v_name := coalesce((select nullif(btrim(first_name || ' ' || last_name), '') from profiles where id = v_me), 'A member');
  perform notify_once(r.user_id, 'system', 'Online payment to confirm',
           v_name || ' sent ₱' || to_char(v_plan.price, 'FM999,999,990.00') || ' by ' || v_m.label
             || ' for ' || v_plan.name || ' (ref ' || upper(btrim(p_reference)) || ').',
           '/payments', 'online-pay:' || v_id, v_gym)
    from gym_roles r
   where r.gym_id = v_gym and r.role in ('admin', 'staff') and r.status = 'active';
  perform log_activity('payment.sent_online', 'renewal_request', v_id, v_me,
    v_name || ' sent ₱' || to_char(v_plan.price, 'FM999,999,990.00') || ' by ' || v_m.label || ' for ' || v_plan.name
      || ' — ref ' || upper(btrim(p_reference)) || ', waiting for the desk',
    jsonb_build_object('amount', v_plan.price, 'method', v_m.label), v_gym);
  return v_id;
end $fn$;
revoke all on function request_renewal_paid(uuid, uuid, text, text, date) from public, anon;
grant execute on function request_renewal_paid(uuid, uuid, text, text, date) to authenticated;

-- ---- 4. tenancy --------------------------------------------------------------------------------
-- 0161's list plus gym_payment_methods.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

drop policy if exists tenant_select on gym_payment_methods;
drop policy if exists tenant_insert on gym_payment_methods;
drop policy if exists tenant_update on gym_payment_methods;
drop policy if exists tenant_delete on gym_payment_methods;
create policy tenant_select on gym_payment_methods as restrictive for select to anon, authenticated using (gym_id = current_gym_id());
create policy tenant_insert on gym_payment_methods as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_update on gym_payment_methods as restrictive for update to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id());
create policy tenant_delete on gym_payment_methods as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable());

create or replace function migration_0167_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0167_applied() from public, anon;
grant execute on function migration_0167_applied() to authenticated;
comment on function migration_0167_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0167.sql
