-- ============================================================================
-- 0158 — How to pay, sent inside the application conversation
-- ============================================================================
--
-- 0148 showed an applicant how to pay only once the gym was let in, so a gym
-- that wanted to pay first (chose Standard, asked "how do I pay?") had nothing
-- to look at but whatever the platform typed by hand. Now the platform can send
-- one of its saved methods — GCash, Maya, a bank, with its QR code — as a
-- message in the conversation, at any point.
--
-- The message carries a REFERENCE to the method, never a copy: the status page
-- draws it from platform_payment_methods as it is now, so a number corrected in
-- Settings is corrected in every conversation, and a method switched off stops
-- being shown (the message then says it is no longer offered). Nothing about
-- who may read it changes: the status token is still the only key.
-- ============================================================================

alter table application_messages
  add column if not exists payment_method_id uuid references platform_payment_methods(id) on delete set null;

-- The card an applicant sees for a sent method; null once it is switched off or removed.
create or replace function application_pay_card(p_method uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('kind', m.kind, 'label', m.label, 'account_name', m.account_name,
           'account_number', m.account_number, 'qr_image', m.qr_image, 'instructions', m.instructions)
    from platform_payment_methods m where m.id = p_method and m.active;
$$;
revoke all on function application_pay_card(uuid) from public, anon, authenticated;

create or replace function application_status(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gym_name', a.gym_name, 'owner_name', a.owner_name, 'email', a.email, 'status', a.status,
    'reason', a.reason, 'created_at', a.created_at, 'decided_at', a.decided_at,
    'plan', (select jsonb_build_object('key', p.key, 'name', p.name, 'price_monthly', p.price_monthly,
                                       'price_yearly', p.price_yearly, 'trial_days', p.trial_days)
               from platform_plans p where p.key = coalesce((select g.plan from gyms g where g.id = a.gym_id), a.plan_key)),
    'billing', a.billing,
    'gym_slug', (select g.slug from gyms g where g.id = a.gym_id),
    'paid_until', (select g.paid_until from gyms g where g.id = a.gym_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('from_platform', m.from_platform, 'body', m.body,
                                                            'created_at', m.created_at,
                                                            'sent_method', m.payment_method_id is not null,
                                                            'pay', case when m.payment_method_id is not null
                                                                        then application_pay_card(m.payment_method_id) end)
                                          order by m.created_at)
                            from application_messages m where m.application_id = a.id), '[]'::jsonb),
    -- Every method, once there is a gym to pay for; before that, only what was sent.
    'pay', case when a.status = 'approved' then coalesce((select jsonb_agg(jsonb_build_object(
              'kind', m.kind, 'label', m.label, 'account_name', m.account_name, 'account_number', m.account_number,
              'qr_image', m.qr_image, 'instructions', m.instructions) order by m.sort_order, m.label)
              from platform_payment_methods m where m.active), '[]'::jsonb) end,
    'contact', (select jsonb_build_object('name', b.business_name, 'email', b.business_email, 'phone', b.business_phone)
                  from platform_billing b limit 1))
    from gym_applications a
   where a.status_token = btrim(p_token) and length(btrim(p_token)) >= 32;
$$;
revoke all on function application_status(text) from public;
grant execute on function application_status(text) to anon, authenticated;

-- The platform's view of the thread gains the method's name (the return type
-- changes, so the function is dropped first).
drop function if exists platform_application_thread(uuid);
create function platform_application_thread(p_id uuid)
returns table (id uuid, from_platform boolean, body text, author_name text, created_at timestamptz,
               method_label text, method_kind text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;
  update gym_applications set platform_read_at = now() where gym_applications.id = p_id;
  return query
    select m.id, m.from_platform, m.body,
           (select nullif(trim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = m.author),
           m.created_at, pm.label, pm.kind
      from application_messages m
      left join platform_payment_methods pm on pm.id = m.payment_method_id
     where m.application_id = p_id order by m.created_at;
end;
$$;
revoke all on function platform_application_thread(uuid) from public, anon;
grant execute on function platform_application_thread(uuid) to authenticated;

create or replace function platform_application_send_payment(p_id uuid, p_method uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_app gym_applications; v_label text; v_body text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform sends how to pay.' using errcode = '42501';
  end if;
  select * into v_app from gym_applications where id = p_id;
  if v_app.id is null then raise exception 'That application does not exist.'; end if;
  select label into v_label from platform_payment_methods where id = p_method and active;
  if v_label is null then
    raise exception 'That payment method is switched off or gone — turn it on in Settings → How gyms pay you.';
  end if;
  v_body := coalesce(nullif(btrim(p_note), ''), 'Here is how to pay — ' || v_label || '.');
  if length(v_body) > 2000 then raise exception 'Write a note of up to 2,000 characters.'; end if;
  insert into application_messages (application_id, from_platform, body, author, payment_method_id)
  values (p_id, true, v_body, auth.uid(), p_method);
  update gym_applications set platform_read_at = now() where id = p_id;
  perform platform_log(v_app.gym_id, 'application.payment_sent',
    'Sent ' || v_app.gym_name || ' how to pay: ' || v_label,
    jsonb_build_object('application', p_id, 'method', p_method));
end;
$$;
revoke all on function platform_application_send_payment(uuid, uuid, text) from public, anon;
grant execute on function platform_application_send_payment(uuid, uuid, text) to authenticated;

create or replace function migration_0158_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0158_applied() from public, anon;
grant execute on function migration_0158_applied() to authenticated;
comment on function migration_0158_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0158.sql
