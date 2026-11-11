-- ============================================================================
-- 0244 — An applicant can send a screenshot of the receipt with the reference (2026-11-11)
-- ============================================================================
--
-- The owner: "there should also be an image reference for extra validity". On the website's application, "Or send
-- it yourself" now takes an optional screenshot beside the reference number; the platform sees it when checking
-- the payment (Applications → the payment), before confirming it reached Core Fitness's account.
--
--   application_payments.proof: a data:image URL (shrunk on the phone, under ~1 MB), or null.
--   claim_application_payment(): gains p_proof (default null) — the 3-argument call keeps working. Redefined in
--     full from 0224 with only that change; the 3-argument version is dropped so the name is not ambiguous.
--   application_payment_proof(payment): the platform's read — a platform admin only, never the list query, so a
--     list of applications does not carry every image.
-- ============================================================================

alter table application_payments add column if not exists proof text;
alter table application_payments drop constraint if exists application_payments_proof_check;
alter table application_payments add constraint application_payments_proof_check
  check (proof is null or (proof ~ '^data:image/(png|jpeg|webp);base64,' and length(proof) <= 1500000));

drop function if exists claim_application_payment(uuid, uuid, text);
create or replace function claim_application_payment(p_application uuid, p_method uuid, p_reference text, p_proof text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d record; m platform_payment_methods; v_id uuid; v_ref text := btrim(coalesce(p_reference, ''));
begin
  perform application_payment_check(p_application);
  select * into m from platform_payment_methods where id = p_method and active;
  if m.id is null then raise exception 'Choose how you paid.'; end if;
  if length(v_ref) < 4 then raise exception 'Enter the reference number from your GCash, Maya or bank receipt.'; end if;
  -- 0244: a screenshot of the receipt, optional — a small image, never anything else.
  if p_proof is not null and (p_proof !~ '^data:image/(png|jpeg|webp);base64,' or length(p_proof) > 1500000) then
    raise exception 'The receipt must be a photo or screenshot (PNG, JPG or WebP) under about 1 MB.';
  end if;
  if exists (select 1 from application_payments where lower(btrim(reference)) = lower(v_ref) and status <> 'refused')
     or exists (select 1 from gym_payment_claims where lower(btrim(reference)) = lower(v_ref) and status <> 'rejected') then
    raise exception 'That reference number has already been sent to us. If this is a different payment, check the number.';
  end if;
  select * into d from application_plan_due(p_application);
  insert into application_payments (application_id, plan_key, months, amount, method, method_label, reference, proof)
  values (p_application, d.plan_key, d.months, d.amount, m.kind, m.label, v_ref, p_proof)
  returning id into v_id;
  perform platform_log(null, 'application.payment_claimed',
    (select gym_name from gym_applications where id = p_application) || ' says it paid ₱' || d.amount || ' by ' || m.label || ' (ref ' || v_ref || ')',
    jsonb_build_object('application', p_application, 'payment', v_id));
  return v_id;
end;
$$;
revoke all on function claim_application_payment(uuid, uuid, text, text) from public, anon;
grant execute on function claim_application_payment(uuid, uuid, text, text) to authenticated;

create or replace function application_payment_proof(p_payment uuid) returns text
language sql stable security definer set search_path = public as $$
  select ap.proof from application_payments ap where ap.id = p_payment and is_platform_admin();
$$;
revoke all on function application_payment_proof(uuid) from public, anon;
grant execute on function application_payment_proof(uuid) to authenticated;

create or replace function migration_0244_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0244_applied() to anon, authenticated;
