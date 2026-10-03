-- ============================================================================
-- 0148 — a gym applies with a plan, talks to us, and pays from anywhere
-- ============================================================================
-- The two things a gym software business lives on were missing:
--
--   TALKING  An applicant had no account and nowhere to read an answer: the
--            website said "we answer by email", and the platform had an email
--            address and a phone number. Now every application has a private
--            status link (a token, like an invitation's): the applicant reads
--            where it stands and talks to us there; the platform answers from
--            Applications. Once a gym is let in, support tickets (0137) carry on.
--
--   PAYING   Gyms are far away and cash cannot travel. The platform publishes
--            how to pay (GCash, Maya, a bank — numbers and QR codes) and a gym's
--            owner sends the money, then submits the reference number and a
--            screenshot from the admin app. The platform checks it against its
--            own GCash or bank history and presses Verify, which records the
--            payment (0108's record_gym_payment) and moves paid_until. A
--            reference number can be claimed once: a unique index says so.
--
-- And the website's form asks which plan the gym wants, how it heard of us and
-- how it likes to be reached — so "Where they come from" has something to say.
--
-- Nothing here is readable directly: the new tables have RLS on and no policy;
-- every read and write is a SECURITY DEFINER function that checks who is asking.
-- ============================================================================

-- ---- 1. the application carries a plan, a source, a channel, and a link ------------------------
alter table gym_applications add column if not exists plan_key text references platform_plans(key) on update cascade;
alter table gym_applications add column if not exists billing text;
alter table gym_applications add column if not exists heard_from text;
alter table gym_applications add column if not exists contact_pref text;
alter table gym_applications add column if not exists contact_handle text;
alter table gym_applications add column if not exists status_token text;
alter table gym_applications add column if not exists platform_read_at timestamptz;

alter table gym_applications drop constraint if exists gym_applications_billing_check;
alter table gym_applications add constraint gym_applications_billing_check
  check (billing is null or billing in ('monthly', 'yearly'));
alter table gym_applications drop constraint if exists gym_applications_heard_check;
alter table gym_applications add constraint gym_applications_heard_check
  check (heard_from is null or length(heard_from) between 2 and 60);
alter table gym_applications drop constraint if exists gym_applications_contact_check;
alter table gym_applications add constraint gym_applications_contact_check
  check (contact_pref is null or contact_pref in ('call', 'sms', 'viber', 'messenger', 'whatsapp', 'email'));
alter table gym_applications drop constraint if exists gym_applications_handle_check;
alter table gym_applications add constraint gym_applications_handle_check
  check (contact_handle is null or length(contact_handle) <= 120);

-- The token is the applicant's key to their own application. The database makes
-- it — two v4 UUIDs, the same recipe as 0111's invitations — whatever the
-- client sent, so nobody can choose a guessable one.
update gym_applications set status_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where status_token is null;
create unique index if not exists idx_gym_applications_token on gym_applications(status_token);

create or replace function gym_application_token() returns trigger
language plpgsql as $$
begin
  new.status_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  return new;
end;
$$;
drop trigger if exists gym_application_token on gym_applications;
create trigger gym_application_token before insert on gym_applications
  for each row execute function gym_application_token();

-- ---- 2. the conversation with an applicant -----------------------------------------------------
create table if not exists application_messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references gym_applications(id) on delete cascade,
  from_platform  boolean not null,
  body           text not null check (length(btrim(body)) between 1 and 2000),
  author         uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_application_messages on application_messages(application_id, created_at);
alter table application_messages enable row level security;
-- No policy: a token is a credential, and the platform reads through functions.

-- ---- 3. how to pay us -----------------------------------------------------------------------------
create table if not exists platform_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('gcash', 'maya', 'bank', 'other')),
  label          text not null check (length(btrim(label)) between 2 and 60),
  account_name   text check (account_name is null or length(account_name) <= 120),
  account_number text check (account_number is null or length(account_number) <= 60),
  -- A QR code as a small image (data: URL, resized in the browser). Kept here
  -- rather than in storage so publishing it needs no bucket policy at all.
  qr_image       text check (qr_image is null or (qr_image like 'data:image/%' and length(qr_image) <= 400000)),
  instructions   text check (instructions is null or length(instructions) <= 600),
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table platform_payment_methods enable row level security;

-- ---- 4. a gym saying "we paid" ---------------------------------------------------------------------
create table if not exists gym_payment_claims (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  submitted_by uuid references profiles(id),
  amount       numeric(10,2) not null check (amount > 0),
  paid_on      date not null,
  method_id    uuid references platform_payment_methods(id) on delete set null,
  method_label text not null check (length(method_label) between 2 and 60),
  reference    text not null check (length(btrim(reference)) between 4 and 60),
  months       int not null default 1 check (months between 1 and 24),
  plan_key     text references platform_plans(key) on update cascade,
  -- A screenshot of the transfer, resized in the browser. Evidence, not proof:
  -- the platform checks the reference against its own GCash or bank history.
  proof_image  text check (proof_image is null or (proof_image like 'data:image/%' and length(proof_image) <= 1500000)),
  note         text check (note is null or length(note) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reason       text check (reason is null or length(reason) <= 500),
  decided_by   uuid references profiles(id),
  decided_at   timestamptz,
  payment_id   uuid references gym_payments(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_gym_payment_claims_gym on gym_payment_claims(gym_id, created_at desc);
create index if not exists idx_gym_payment_claims_status on gym_payment_claims(status, created_at);
-- One transfer, one claim. A refused claim frees its reference (a typo can be
-- corrected); a pending or verified one holds it.
create unique index if not exists uq_gym_payment_claims_reference
  on gym_payment_claims (lower(btrim(reference))) where status <> 'rejected';
alter table gym_payment_claims enable row level security;

-- ============================================================================
-- 5. THE APPLICANT'S SIDE (anon — the website)
-- ============================================================================
create or replace function submit_gym_application(
  p_gym_name text, p_owner_name text, p_email text, p_phone text,
  p_address text default null, p_member_estimate int default null, p_message text default null,
  p_plan_key text default null, p_billing text default null, p_heard_from text default null,
  p_contact_pref text default null, p_contact_handle text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if p_plan_key is not null and not exists (
       select 1 from platform_plans where key = p_plan_key and is_active and is_public) then
    raise exception 'That plan is not on offer. Pick one of the plans on the page.';
  end if;
  -- A form with no account behind it: five a day from one address is plenty.
  if (select count(*) from gym_applications
       where lower(btrim(email)) = lower(btrim(p_email)) and created_at > now() - interval '1 day') >= 5 then
    raise exception 'We already have your applications from today. We will answer them — no need to send another.';
  end if;

  insert into gym_applications (gym_name, owner_name, email, phone, address, member_estimate, message,
                                plan_key, billing, heard_from, contact_pref, contact_handle)
  values (btrim(p_gym_name), btrim(p_owner_name), lower(btrim(p_email)), btrim(p_phone),
          nullif(btrim(p_address), ''), p_member_estimate, nullif(btrim(p_message), ''),
          p_plan_key, coalesce(nullif(p_billing, ''), 'monthly'), nullif(btrim(p_heard_from), ''),
          nullif(p_contact_pref, ''), nullif(btrim(p_contact_handle), ''))
  returning status_token into v_token;
  return v_token;
end;
$$;
revoke all on function submit_gym_application(text, text, text, text, text, int, text, text, text, text, text, text) from public;
grant execute on function submit_gym_application(text, text, text, text, text, int, text, text, text, text, text, text) to anon, authenticated;

/** What an applicant sees on their status link. Nothing about anybody else. */
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
                                                            'created_at', m.created_at) order by m.created_at)
                            from application_messages m where m.application_id = a.id), '[]'::jsonb),
    -- How to pay is shown once there is a gym to pay for.
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

create or replace function application_reply(p_token text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_app gym_applications;
begin
  select * into v_app from gym_applications where status_token = btrim(p_token) and length(btrim(p_token)) >= 32;
  if v_app.id is null then
    raise exception 'That link is not valid.';
  end if;
  if coalesce(length(btrim(p_body)), 0) not between 1 and 2000 then
    raise exception 'Write a message of up to 2,000 characters.';
  end if;
  if (select count(*) from application_messages
       where application_id = v_app.id and not from_platform and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of messages for one day. We will read them and answer.';
  end if;
  insert into application_messages (application_id, from_platform, body) values (v_app.id, false, btrim(p_body));
  perform platform_log(v_app.gym_id, 'application.message',
    v_app.gym_name || ' wrote: ' || left(btrim(p_body), 120),
    jsonb_build_object('application', v_app.id));
end;
$$;
revoke all on function application_reply(text, text) from public;
grant execute on function application_reply(text, text) to anon, authenticated;

-- ============================================================================
-- 6. THE PLATFORM'S SIDE OF AN APPLICATION
-- ============================================================================
-- 0111's platform_applications(), plus the new columns and the conversation.
drop function if exists platform_applications(text);
create function platform_applications(p_status text default null)
returns table (id uuid, gym_name text, owner_name text, email text, phone text,
               address text, member_estimate int, message text, status text,
               reason text, gym_id uuid, created_at timestamptz,
               duplicates int, already_a_gym boolean,
               plan_key text, plan_name text, billing text, heard_from text,
               contact_pref text, contact_handle text, status_token text,
               messages int, unread int, last_message_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.gym_name, a.owner_name, a.email, a.phone, a.address,
         a.member_estimate, a.message, a.status, a.reason, a.gym_id, a.created_at,
         (select count(*)::int from gym_applications d
           where d.id <> a.id
             and (lower(btrim(d.email)) = lower(btrim(a.email))
                  or lower(btrim(d.gym_name)) = lower(btrim(a.gym_name)))),
         exists (select 1 from profiles p join gym_roles r on r.user_id = p.id
                  where lower(p.email) = lower(btrim(a.email))
                    and r.role = 'admin' and r.status = 'active'),
         a.plan_key, (select p.name from platform_plans p where p.key = a.plan_key), a.billing, a.heard_from,
         a.contact_pref, a.contact_handle, a.status_token,
         (select count(*)::int from application_messages m where m.application_id = a.id),
         (select count(*)::int from application_messages m where m.application_id = a.id and not m.from_platform
             and m.created_at > coalesce(a.platform_read_at, '-infinity'::timestamptz)),
         (select max(m.created_at) from application_messages m where m.application_id = a.id)
    from gym_applications a
   where is_platform_admin()
     and (p_status is null or a.status = p_status)
   order by a.created_at desc;
$$;
revoke all on function platform_applications(text) from public, anon;
grant execute on function platform_applications(text) to authenticated;

create or replace function platform_application_thread(p_id uuid)
returns table (id uuid, from_platform boolean, body text, author_name text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;
  update gym_applications set platform_read_at = now() where gym_applications.id = p_id;
  return query
    select m.id, m.from_platform, m.body,
           (select nullif(trim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = m.author),
           m.created_at
      from application_messages m where m.application_id = p_id order by m.created_at;
end;
$$;
revoke all on function platform_application_thread(uuid) from public, anon;
grant execute on function platform_application_thread(uuid) to authenticated;

create or replace function platform_application_reply(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_app gym_applications;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform answers an application.' using errcode = '42501';
  end if;
  select * into v_app from gym_applications where id = p_id;
  if v_app.id is null then raise exception 'That application does not exist.'; end if;
  if coalesce(length(btrim(p_body)), 0) not between 1 and 2000 then
    raise exception 'Write a message of up to 2,000 characters.';
  end if;
  insert into application_messages (application_id, from_platform, body, author)
  values (p_id, true, btrim(p_body), auth.uid());
  update gym_applications set platform_read_at = now() where id = p_id;
  perform platform_log(v_app.gym_id, 'application.answered',
    'Wrote to ' || v_app.gym_name || ': ' || left(btrim(p_body), 120),
    jsonb_build_object('application', p_id));
end;
$$;
revoke all on function platform_application_reply(uuid, text) from public, anon;
grant execute on function platform_application_reply(uuid, text) to authenticated;

-- ============================================================================
-- 7. HOW TO PAY — the platform sets it, gyms and applicants read it
-- ============================================================================
create or replace function platform_payment_options()
returns table (id uuid, kind text, label text, account_name text, account_number text,
               qr_image text, instructions text, sort_order int, active boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.label, m.account_name, m.account_number, m.qr_image, m.instructions, m.sort_order, m.active
    from platform_payment_methods m
   where m.active or is_platform_admin()
   order by m.sort_order, m.label;
$$;
revoke all on function platform_payment_options() from public;
grant execute on function platform_payment_options() to anon, authenticated;

create or replace function save_payment_method(
  p_id uuid, p_kind text, p_label text, p_account_name text, p_account_number text,
  p_qr_image text, p_instructions text, p_sort int, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform sets how gyms pay it.' using errcode = '42501';
  end if;
  if p_id is null then
    insert into platform_payment_methods (kind, label, account_name, account_number, qr_image, instructions, sort_order, active)
    values (p_kind, btrim(p_label), nullif(btrim(p_account_name), ''), nullif(btrim(p_account_number), ''),
            nullif(p_qr_image, ''), nullif(btrim(p_instructions), ''), coalesce(p_sort, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update platform_payment_methods
       set kind = p_kind, label = btrim(p_label), account_name = nullif(btrim(p_account_name), ''),
           account_number = nullif(btrim(p_account_number), ''), qr_image = nullif(p_qr_image, ''),
           instructions = nullif(btrim(p_instructions), ''), sort_order = coalesce(p_sort, 0),
           active = coalesce(p_active, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'That payment method no longer exists.'; end if;
  end if;
  perform platform_log(null, 'billing.method_saved', 'Payment method "' || btrim(p_label) || '" was saved',
    jsonb_build_object('kind', p_kind, 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;
revoke all on function save_payment_method(uuid, text, text, text, text, text, text, int, boolean) from public, anon;
grant execute on function save_payment_method(uuid, text, text, text, text, text, text, int, boolean) to authenticated;

create or replace function remove_payment_method(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform sets how gyms pay it.' using errcode = '42501';
  end if;
  delete from platform_payment_methods where id = p_id returning label into v_label;
  if v_label is null then raise exception 'That payment method no longer exists.'; end if;
  perform platform_log(null, 'billing.method_removed', 'Payment method "' || v_label || '" was removed', '{}'::jsonb);
end;
$$;
revoke all on function remove_payment_method(uuid) from public, anon;
grant execute on function remove_payment_method(uuid) to authenticated;

-- ============================================================================
-- 8. A GYM SAYS IT PAID — and the platform checks
-- ============================================================================
-- The owner (an active admin of the current gym) only. Deliberately NOT gated
-- on gym_writable(): a gym that is read-only for being overdue is exactly the
-- gym that needs to say it has paid.
create or replace function submit_gym_payment(
  p_amount numeric, p_paid_on date, p_method uuid, p_reference text,
  p_proof text default null, p_months int default 1, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid; v_label text; v_name text;
begin
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
          and r.role = 'admin' and r.status = 'active') then
    raise exception 'Only the gym''s owner can tell Core Fitness about a payment.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount you sent.'; end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Manila')::date + 1
     or p_paid_on < (now() at time zone 'Asia/Manila')::date - 120 then
    raise exception 'Enter the day you sent it — within the last four months.';
  end if;
  if coalesce(length(btrim(p_reference)), 0) < 4 then
    raise exception 'Enter the reference number from your GCash or bank receipt.';
  end if;
  select label into v_label from platform_payment_methods where id = p_method and active;
  if v_label is null then raise exception 'Choose how you paid.'; end if;
  if exists (select 1 from gym_payment_claims where lower(btrim(reference)) = lower(btrim(p_reference)) and status <> 'rejected') then
    raise exception 'That reference number has already been sent to us. If this is a different payment, check the number.';
  end if;

  insert into gym_payment_claims (gym_id, submitted_by, amount, paid_on, method_id, method_label, reference,
                                  months, plan_key, proof_image, note)
  values (v_gym, auth.uid(), round(p_amount, 2), p_paid_on, p_method, v_label, btrim(p_reference),
          greatest(1, least(coalesce(p_months, 1), 24)), (select plan from gyms where id = v_gym),
          nullif(p_proof, ''), nullif(btrim(p_note), ''))
  returning id into v_id;

  select name into v_name from gyms where id = v_gym;
  perform platform_log(v_gym, 'payment.claimed',
    v_name || ' says it paid ₱' || to_char(round(p_amount, 2), 'FM999,999,990.00') || ' by ' || v_label
      || ' (ref ' || btrim(p_reference) || ')',
    jsonb_build_object('claim', v_id, 'amount', p_amount, 'reference', btrim(p_reference)));
  return v_id;
end;
$$;
revoke all on function submit_gym_payment(numeric, date, uuid, text, text, int, text) from public, anon;
grant execute on function submit_gym_payment(numeric, date, uuid, text, text, int, text) to authenticated;

/** The owner's own claims, newest first. No proof image: they have it. */
create or replace function my_gym_payment_claims()
returns table (id uuid, amount numeric, paid_on date, method_label text, reference text, months int,
               status text, reason text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.amount, c.paid_on, c.method_label, c.reference, c.months, c.status, c.reason, c.created_at, c.decided_at
    from gym_payment_claims c
   where c.gym_id = current_gym_id()
     and exists (select 1 from gym_roles r where r.gym_id = c.gym_id and r.user_id = auth.uid()
                    and r.role = 'admin' and r.status = 'active')
   order by c.created_at desc
   limit 50;
$$;
revoke all on function my_gym_payment_claims() from public, anon;
grant execute on function my_gym_payment_claims() to authenticated;

create or replace function platform_payment_claims(p_status text default 'pending')
returns table (id uuid, gym_id uuid, gym_name text, plan_key text, plan_name text, price_monthly numeric,
               paid_until date, amount numeric, paid_on date, method_label text, reference text, months int,
               proof_image text, note text, status text, reason text, submitted_by_name text,
               created_at timestamptz, decided_at timestamptz, payment_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.gym_id, g.name, c.plan_key, p.name, p.price_monthly, g.paid_until, c.amount, c.paid_on,
         c.method_label, c.reference, c.months, c.proof_image, c.note, c.status, c.reason,
         (select nullif(trim(pr.first_name || ' ' || pr.last_name), '') from profiles pr where pr.id = c.submitted_by),
         c.created_at, c.decided_at, c.payment_id
    from gym_payment_claims c
    join gyms g on g.id = c.gym_id
    left join platform_plans p on p.key = c.plan_key
   where is_platform_admin()
     and (p_status is null or c.status = p_status)
   order by c.created_at desc
   limit 200;
$$;
revoke all on function platform_payment_claims(text) from public, anon;
grant execute on function platform_payment_claims(text) to authenticated;

/**
 * The platform found the money in its own history: record it. The payment is
 * 0108's record_gym_payment(), so receipts (0138), paid_until and the lock all
 * follow exactly as for a payment typed in by hand.
 */
create or replace function verify_gym_payment(p_claim uuid, p_covers_until date, p_amount numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c gym_payment_claims; v_pay uuid; v_from date; o record; v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform verifies a payment.' using errcode = '42501';
  end if;
  select * into c from gym_payment_claims where id = p_claim for update;
  if c.id is null then raise exception 'That payment claim does not exist.'; end if;
  if c.status <> 'pending' then raise exception 'That claim has already been answered.'; end if;
  if p_covers_until is null then raise exception 'Choose the day this payment covers until.'; end if;

  select greatest(coalesce(paid_until + 1, c.paid_on), c.paid_on), name into v_from, v_name from gyms where id = c.gym_id;
  v_pay := record_gym_payment(c.gym_id, coalesce(p_amount, c.amount), p_covers_until, c.paid_on, v_from,
                              c.method_label, c.reference, 'Verified from the gym''s own claim');
  update gym_payment_claims
     set status = 'verified', payment_id = v_pay, decided_by = auth.uid(), decided_at = now()
   where id = p_claim;

  for o in select r.user_id from gym_roles r where r.gym_id = c.gym_id and r.role = 'admin' and r.status = 'active' loop
    perform notify_once(o.user_id, 'system', 'Your payment to Core Fitness is confirmed',
      'We found your ' || c.method_label || ' payment (ref ' || c.reference || '). Your gym is paid until '
        || to_char(p_covers_until, 'FMMonth FMDD, YYYY') || '.',
      '/subscription', 'claim:' || c.id, c.gym_id);
  end loop;
  return v_pay;
end;
$$;
revoke all on function verify_gym_payment(uuid, date, numeric) from public, anon;
grant execute on function verify_gym_payment(uuid, date, numeric) to authenticated;

create or replace function reject_gym_payment(p_claim uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c gym_payment_claims; o record;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform answers a payment claim.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'Say why, for the gym to read.';
  end if;
  select * into c from gym_payment_claims where id = p_claim for update;
  if c.id is null then raise exception 'That payment claim does not exist.'; end if;
  if c.status <> 'pending' then raise exception 'That claim has already been answered.'; end if;
  update gym_payment_claims set status = 'rejected', reason = btrim(p_reason), decided_by = auth.uid(), decided_at = now()
   where id = p_claim;
  perform platform_log(c.gym_id, 'payment.claim_rejected',
    'A payment claim (ref ' || c.reference || ') was not found: ' || btrim(p_reason),
    jsonb_build_object('claim', c.id));
  for o in select r.user_id from gym_roles r where r.gym_id = c.gym_id and r.role = 'admin' and r.status = 'active' loop
    perform notify_once(o.user_id, 'system', 'We could not find your payment',
      'Ref ' || c.reference || ': ' || btrim(p_reason), '/subscription', 'claim-no:' || c.id, c.gym_id);
  end loop;
end;
$$;
revoke all on function reject_gym_payment(uuid, text) from public, anon;
grant execute on function reject_gym_payment(uuid, text) to authenticated;

-- ============================================================================
-- 9. THE BELL — 0138's, plus what this adds
-- ============================================================================
create or replace function platform_bell()
returns table (kind text, label text, count int, href text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('applications', 'Gyms asking to join',
      (select count(*)::int from gym_applications where status = 'pending'), '/applications'),
    ('application_messages', 'Applicants waiting for an answer',
      (select count(distinct a.id)::int from gym_applications a join application_messages m on m.application_id = a.id
        where not m.from_platform and m.created_at > coalesce(a.platform_read_at, '-infinity'::timestamptz)), '/applications'),
    ('payments', 'Payments to verify',
      (select count(*)::int from gym_payment_claims where status = 'pending'), '/money'),
    ('support', 'Support messages waiting',
      (select count(*)::int from support_tickets t where t.status <> 'closed' and t.last_from = 'gym'), '/support'),
    ('support_access', 'Gyms that opened their doors to you',
      (select count(*)::int from support_grants s where s.revoked_at is null and s.expires_at > now()), '/support'),
    ('overdue', 'Gyms past their paid-until date',
      (select count(*)::int from gyms g where g.status = 'active' and g.paid_until < (now() at time zone 'Asia/Manila')::date), '/money'),
    ('crashes', 'Open crash reports',
      (select count(*)::int from client_errors c where c.created_at > now() - interval '14 days'
         and (to_jsonb(c) ->> 'resolved_at') is null), '/platform'),
    ('capacity', 'Free-tier limits past 80%',
      ((pg_database_size(current_database()) > 0.8 * 500 * 1024 * 1024)::int
       + ((select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o) > 0.8 * 1024 * 1024 * 1024)::int),
      '/capacity')
  ) v(kind, label, count, href)
  where is_platform_admin() and v.count > 0;
$$;

create or replace function migration_0148_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0148_applied() from public, anon;
grant execute on function migration_0148_applied() to authenticated;
comment on function migration_0148_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0148.sql
