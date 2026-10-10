-- ============================================================================
-- 0187 — Applicants have an account, and prove the business is real
-- ============================================================================
--
-- E1. ACCOUNTS. A gym applied with a form and got a private link (0148). Now
--     the form also makes an ACCOUNT (email + password, Supabase Auth): the
--     sign-up carries `signup_source = 'gym_applicant'` and the application's
--     token, and a trigger gives the account a profile (no gym) and ties the
--     application to it — only when the token AND the email match, so nobody
--     can claim somebody else's application by guessing.
--     Signed in (the website or the admin app), the applicant sees their
--     application, writes to the platform, uploads documents and can call it
--     off; an application sent with a CONFIRMED address that matches is theirs
--     too, so old applications and people who already had an account are found.
--     Letting the gym in names that same account the owner (approve-gym's
--     "already here" path, 0107) — no temporary password at all.
--     Turned down or called off: the platform may DELETE the account — the only
--     hard delete in the system, allowed because no gym data exists yet.
--     The old #status/<token> links keep working.
--
-- E2. DOCUMENTS. Mayor's/business permit, DTI or SEC registration, BIR 2303,
--     the owner's government ID, a photo of the gym's front, and the barangay
--     business clearance — in a private bucket, each Verified or Rejected (with
--     a reason) by the platform. AN APPLICATION CANNOT BE APPROVED until all six
--     are verified and none has expired: a trigger on gym_applications, so
--     create_gym() (0106) refuses too, not just the button. After approval the
--     owner files renewals against the same application, and
--     permit_renewal_sweep() reminds them each January and before a document
--     runs out.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The application knows its account, and can be called off.
-- ---------------------------------------------------------------------------
alter table gym_applications add column if not exists applicant_id uuid references profiles(id) on delete set null;
create index if not exists idx_gym_applications_applicant on gym_applications(applicant_id);

alter table gym_applications drop constraint if exists gym_applications_status_check;
alter table gym_applications add constraint gym_applications_status_check
  check (status in ('pending', 'approved', 'rejected', 'withdrawn'));

-- The account behind a sign-up from the website's apply form. Member sign-ups
-- (0179's trigger) ignore this source, and this ignores theirs.
create or replace function handle_new_applicant_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := new.raw_user_meta_data;
begin
  if meta->>'signup_source' is distinct from 'gym_applicant' then
    return new;
  end if;
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id)
  values (new.id, 'member', coalesce(nullif(btrim(meta->>'first_name'), ''), 'Gym'),
          coalesce(nullif(btrim(meta->>'last_name'), ''), 'Owner'), new.email,
          nullif(btrim(meta->>'phone'), ''), 'active', null)
  on conflict (id) do nothing;
  -- 0097's mirror trigger files every new profile under Gym #1 when it has no
  -- gym. An applicant belongs to no gym until the platform lets theirs in.
  delete from gym_roles where user_id = new.id;
  -- The token proves they sent it; the email proves it is theirs.
  update gym_applications
     set applicant_id = new.id
   where status_token = btrim(coalesce(meta->>'application_token', ''))
     and length(btrim(coalesce(meta->>'application_token', ''))) >= 32
     and lower(btrim(email)) = lower(btrim(new.email))
     and applicant_id is null;
  return new;
end;
$$;
drop trigger if exists trg_handle_new_applicant_signup on auth.users;
create trigger trg_handle_new_applicant_signup after insert on auth.users
  for each row execute function handle_new_applicant_signup();

-- The caller's confirmed email, or null. An unconfirmed address proves nothing.
create or replace function my_confirmed_email() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return (select lower(btrim(u.email)) from auth.users u
           where u.id = auth.uid() and u.email_confirmed_at is not null);
end;
$$;
revoke all on function my_confirmed_email() from public, anon;

-- Is this application the caller's? Tied to their account, or sent from the
-- address they have confirmed.
create or replace function is_my_application(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from gym_applications a
     where a.id = p_id
       and (a.applicant_id = auth.uid()
            or lower(btrim(a.email)) = my_confirmed_email()));
$$;
revoke all on function is_my_application(uuid) from public, anon;
grant execute on function is_my_application(uuid) to authenticated;

-- May the caller file documents for it? The applicant while it is open, and —
-- once it made a gym — that gym's owner (renewals).
create or replace function may_file_for_application(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_applications a
     where a.id = p_id
       and ((a.status = 'pending' and is_my_application(a.id))
            or (a.status = 'approved' and a.gym_id is not null
                and exists (select 1 from gym_roles r where r.gym_id = a.gym_id and r.user_id = auth.uid()
                               and r.role = 'admin' and r.status = 'active'))));
$$;
revoke all on function may_file_for_application(uuid) from public, anon;
grant execute on function may_file_for_application(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The documents.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references gym_applications(id) on delete cascade,
  kind           text not null check (kind in ('permit', 'dti_sec', 'bir_2303', 'owner_id', 'front_photo', 'barangay')),
  path           text not null unique,
  file_name      text check (length(file_name) <= 200),
  expires_on     date,
  status         text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'replaced')),
  reason         text check (length(reason) <= 500),
  uploaded_by    uuid references profiles(id) on delete set null default auth.uid(),
  uploaded_at    timestamptz not null default now(),
  reviewed_by    uuid references profiles(id) on delete set null,
  reviewed_at    timestamptz,
  constraint application_documents_reason check (status <> 'rejected' or coalesce(length(btrim(reason)), 0) > 0)
);
create index if not exists idx_application_documents_app on application_documents(application_id, kind, uploaded_at desc);
-- A government ID and a permit: RLS on and NO policy — read and written only
-- through the definer functions below.
alter table application_documents enable row level security;

/** The six, in the order a person gathers them, with what each is called. */
create or replace function application_document_kinds()
returns table (kind text, label text, needs_expiry boolean, sort_order int)
language sql immutable as $$
  values ('permit',      'Mayor''s / business permit (this year)',  true,  1),
         ('dti_sec',     'DTI or SEC registration',                false, 2),
         ('bir_2303',    'BIR Certificate of Registration (2303)', false, 3),
         ('barangay',    'Barangay business clearance',            true,  4),
         ('owner_id',    'Owner''s valid government ID',           true,  5),
         ('front_photo', 'Photo of the gym''s front and signage',  false, 6);
$$;
grant execute on function application_document_kinds() to anon, authenticated;

-- The file path decides the application: applications/<application id>/<file>.
create or replace function application_of_path(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists applications_insert on storage.objects;
drop policy if exists applications_read   on storage.objects;
drop policy if exists applications_delete on storage.objects;
create policy applications_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'applications'
              and public.may_file_for_application(public.application_of_path(name)));
create policy applications_read on storage.objects for select to authenticated
  using (bucket_id = 'applications'
         and (public.is_platform_admin()
              or public.is_my_application(public.application_of_path(name))
              or public.may_file_for_application(public.application_of_path(name))));
-- Only the platform removes files: a verified permit is evidence.
create policy applications_delete on storage.objects for delete to authenticated
  using (bucket_id = 'applications' and public.is_platform_admin());

/** File an uploaded document. A newer one of the same kind replaces any not yet verified. */
create or replace function add_application_document(p_application uuid, p_kind text, p_path text,
                                                    p_file_name text default null, p_expires_on date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not may_file_for_application(p_application) then
    raise exception 'You cannot add documents to that application.' using errcode = '42501';
  end if;
  if not exists (select 1 from application_document_kinds() k where k.kind = p_kind) then
    raise exception 'Unknown document.';
  end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_application::text then
    raise exception 'That file is not in this application''s folder.';
  end if;
  if p_expires_on is not null and p_expires_on < manila_today() then
    raise exception 'That document has already expired. Upload the current one.';
  end if;
  if p_expires_on is null and (select needs_expiry from application_document_kinds() k where k.kind = p_kind) then
    raise exception 'Give the date this document expires.';
  end if;
  update application_documents set status = 'replaced'
   where application_id = p_application and kind = p_kind and status in ('pending', 'rejected');
  insert into application_documents (application_id, kind, path, file_name, expires_on)
  values (p_application, p_kind, p_path, nullif(btrim(p_file_name), ''), p_expires_on)
  returning id into v_id;
  perform platform_log((select gym_id from gym_applications where id = p_application), 'application.document',
    coalesce((select gym_name from gym_applications where id = p_application), 'An applicant')
      || ' sent ' || (select label from application_document_kinds() k where k.kind = p_kind),
    jsonb_build_object('application', p_application, 'kind', p_kind));
  return v_id;
end;
$$;
revoke all on function add_application_document(uuid, text, text, text, date) from public, anon;
grant execute on function add_application_document(uuid, text, text, text, date) to authenticated;

/** Every document on an application, newest first — for its applicant/owner or the platform. */
create or replace function application_documents_of(p_application uuid)
returns table (id uuid, kind text, label text, path text, file_name text, expires_on date, status text,
               reason text, uploaded_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.kind, k.label, d.path, d.file_name, d.expires_on, d.status, d.reason, d.uploaded_at, d.reviewed_at
    from application_documents d
    join application_document_kinds() k on k.kind = d.kind
   where d.application_id = p_application
     and (is_platform_admin() or is_my_application(p_application) or may_file_for_application(p_application))
   order by k.sort_order, d.uploaded_at desc;
$$;
revoke all on function application_documents_of(uuid) from public, anon;
grant execute on function application_documents_of(uuid) to authenticated;

/** Every kind verified and in date — what Approve needs. */
create or replace function application_documents_missing(p_application uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(k.label order by k.sort_order), '{}')
    from application_document_kinds() k
   where not exists (select 1 from application_documents d
                      where d.application_id = p_application and d.kind = k.kind and d.status = 'verified'
                        and (d.expires_on is null or d.expires_on >= manila_today()));
$$;
revoke all on function application_documents_missing(uuid) from public, anon;
grant execute on function application_documents_missing(uuid) to authenticated;

/** The platform's verdict on one document. */
create or replace function platform_review_document(p_document uuid, p_ok boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare d application_documents;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform checks documents.' using errcode = '42501';
  end if;
  select * into d from application_documents where id = p_document;
  if d.id is null then raise exception 'That document does not exist.'; end if;
  if d.status = 'replaced' then raise exception 'A newer copy of that document has been sent. Check that one.'; end if;
  if not p_ok and coalesce(length(btrim(p_reason)), 0) = 0 then
    raise exception 'Say what is wrong, so they know what to send instead.';
  end if;
  -- A newly verified one retires the older verified copy of the same kind.
  if p_ok then
    update application_documents set status = 'replaced'
     where application_id = d.application_id and kind = d.kind and status = 'verified' and id <> d.id;
  end if;
  update application_documents
     set status = case when p_ok then 'verified' else 'rejected' end,
         reason = case when p_ok then null else btrim(p_reason) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document;
  perform platform_log((select gym_id from gym_applications where id = d.application_id),
    case when p_ok then 'application.document_verified' else 'application.document_rejected' end,
    (select label from application_document_kinds() k where k.kind = d.kind)
      || case when p_ok then ' verified' else ' rejected: ' || btrim(p_reason) end,
    jsonb_build_object('application', d.application_id, 'document', d.id));
end;
$$;
revoke all on function platform_review_document(uuid, boolean, text) from public, anon;
grant execute on function platform_review_document(uuid, boolean, text) to authenticated;

/** For the platform's list: where each application's documents stand. */
create or replace function platform_application_documents_summary()
returns table (application_id uuid, verified int, waiting int, rejected int, missing text[])
language sql stable security definer set search_path = public as $$
  select a.id,
         (select count(distinct d.kind)::int from application_documents d where d.application_id = a.id and d.status = 'verified'),
         (select count(*)::int from application_documents d where d.application_id = a.id and d.status = 'pending'),
         (select count(*)::int from application_documents d where d.application_id = a.id and d.status = 'rejected'),
         application_documents_missing(a.id)
    from gym_applications a
   where is_platform_admin();
$$;
revoke all on function platform_application_documents_summary() from public, anon;
grant execute on function platform_application_documents_summary() to authenticated;

-- Approve waits for the documents — enforced here, so create_gym() (0106),
-- which approves the application in the same transaction, refuses too.
create or replace function trg_application_needs_documents() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_missing text[];
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    v_missing := application_documents_missing(new.id);
    if cardinality(v_missing) > 0 then
      raise exception 'Verify every document first. Still needed: %.', array_to_string(v_missing, '; ');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists application_needs_documents on gym_applications;
create trigger application_needs_documents before update of status on gym_applications
  for each row execute function trg_application_needs_documents();

-- ---------------------------------------------------------------------------
-- 3. The applicant's side, signed in.
-- ---------------------------------------------------------------------------
/** The caller's applications, each as the status page shows it, plus documents. */
create or replace function my_applications() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := my_confirmed_email();
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  -- Found by a confirmed address: tie it to the account from now on.
  if v_email is not null then
    update gym_applications set applicant_id = auth.uid()
     where applicant_id is null and lower(btrim(email)) = v_email;
  end if;
  return coalesce((
    select jsonb_agg(application_status(a.status_token)
             || jsonb_build_object(
                  'id', a.id, 'status_token', a.status_token, 'phone', a.phone, 'address', a.address,
                  'documents', coalesce((select jsonb_agg(to_jsonb(d)) from application_documents_of(a.id) d), '[]'::jsonb),
                  'missing', to_jsonb(application_documents_missing(a.id)))
             order by a.created_at desc)
      from gym_applications a
     where a.applicant_id = auth.uid()), '[]'::jsonb);
end;
$$;
revoke all on function my_applications() from public, anon;
grant execute on function my_applications() to authenticated;

create or replace function my_application_reply(p_application uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not is_my_application(p_application) then
    raise exception 'That is not your application.' using errcode = '42501';
  end if;
  select status_token into v_token from gym_applications where id = p_application;
  perform application_reply(v_token, p_body);
end;
$$;
revoke all on function my_application_reply(uuid, text) from public, anon;
grant execute on function my_application_reply(uuid, text) to authenticated;

create or replace function withdraw_my_application(p_application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_app gym_applications;
begin
  if not is_my_application(p_application) then
    raise exception 'That is not your application.' using errcode = '42501';
  end if;
  update gym_applications set status = 'withdrawn', decided_at = now()
   where id = p_application and status = 'pending'
  returning * into v_app;
  if v_app.id is null then
    raise exception 'Only an application still waiting for an answer can be called off.';
  end if;
  perform platform_log(null, 'application.withdrawn', v_app.gym_name || ' called off their application',
    jsonb_build_object('application', v_app.id));
end;
$$;
revoke all on function withdraw_my_application(uuid) from public, anon;
grant execute on function withdraw_my_application(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The platform deletes an applicant's account — the one hard delete.
-- ---------------------------------------------------------------------------
-- Only when: the application was turned down or called off, the account owns
-- or works at no gym, is not the platform's, and has no other application
-- still open or let in. Its documents' rows go with the application row kept
-- (gym_applications is the platform's history; applicant_id becomes null).
-- The platform app removes the files from storage first (storage objects
-- cannot be deleted from SQL).
create or replace function platform_delete_applicant(p_application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_app gym_applications; v_user uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can delete an applicant''s account.' using errcode = '42501';
  end if;
  select * into v_app from gym_applications where id = p_application;
  if v_app.id is null then raise exception 'That application does not exist.'; end if;
  if v_app.status not in ('rejected', 'withdrawn') then
    raise exception 'Only an application that was turned down or called off can have its account deleted.';
  end if;
  v_user := v_app.applicant_id;
  if v_user is null then
    raise exception 'No account is tied to that application.';
  end if;
  if exists (select 1 from gym_roles where user_id = v_user)
     or exists (select 1 from platform_admins where user_id = v_user) then
    raise exception 'That account belongs to a gym or to the platform — it is not only an applicant''s.';
  end if;
  if exists (select 1 from gym_applications where applicant_id = v_user and status in ('pending', 'approved')) then
    raise exception 'That account has another application still open.';
  end if;

  delete from application_documents d
   using gym_applications a
   where d.application_id = a.id and a.applicant_id = v_user;
  update gym_applications set applicant_id = null where applicant_id = v_user;
  -- The log keeps what happened, no longer who (their writing and calling off).
  update platform_events set actor_id = null where actor_id = v_user;
  delete from profiles where id = v_user;
  delete from auth.users where id = v_user;
  perform platform_log(null, 'application.account_deleted',
    'Deleted the account behind ' || v_app.gym_name || '''s application',
    jsonb_build_object('application', v_app.id));
end;
$$;
revoke all on function platform_delete_applicant(uuid) from public, anon;
grant execute on function platform_delete_applicant(uuid) to authenticated;

/** For the platform's list: which applications have an account behind them. */
create or replace function platform_application_accounts()
returns table (application_id uuid, has_account boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.applicant_id is not null from gym_applications a where is_platform_admin();
$$;
revoke all on function platform_application_accounts() from public, anon;
grant execute on function platform_application_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mail: the platform's answers and document verdicts reach the inbox.
-- ---------------------------------------------------------------------------
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in (
  'owner_credentials', 'password_reset', 'invitation',
  'application_approved', 'application_rejected', 'application_message', 'application_documents', 'test'));

-- ---------------------------------------------------------------------------
-- 6. After approval: the gym's application (setup autofill) and renewals.
-- ---------------------------------------------------------------------------
/** The owner's own application for the current gym: setup fills itself from it (E4). */
create or replace function my_gym_application() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'gym_name', a.gym_name, 'owner_name', a.owner_name, 'email', a.email,
                            'phone', a.phone, 'address', a.address, 'plan_key', a.plan_key, 'billing', a.billing,
                            'documents', coalesce((select jsonb_agg(to_jsonb(d)) from application_documents_of(a.id) d
                                                    where d.status <> 'replaced'), '[]'::jsonb))
    from gym_applications a
   where a.gym_id = current_gym_id() and a.status = 'approved'
     and get_my_role() is not distinct from 'admin'
   order by a.decided_at desc nulls last
   limit 1;
$$;
revoke all on function my_gym_application() from public, anon;
grant execute on function my_gym_application() to authenticated;

-- Each January, and 30 days before any verified document runs out, the owner
-- is told to send the renewed one. Once per document per year (notify_once).
create or replace function permit_renewal_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_today date := manila_today();
begin
  -- The owner's dashboard runs it for their gym; pg_cron (no session) for all.
  if auth.uid() is not null and not (is_platform_admin() or get_my_role() is not distinct from 'admin') then
    return 0;
  end if;
  for r in
    select a.gym_id, d.id doc, k.label, d.expires_on, ro.user_id owner
      from gym_applications a
      join application_documents d on d.application_id = a.id and d.status = 'verified'
      join application_document_kinds() k on k.kind = d.kind
      join gym_roles ro on ro.gym_id = a.gym_id and ro.role = 'admin' and ro.status = 'active'
     where a.status = 'approved' and a.gym_id is not null
       and d.expires_on is not null
       and (d.expires_on <= v_today + 30
            or (extract(month from v_today) = 1 and d.kind = 'permit'
                and extract(year from d.expires_on) < extract(year from v_today) + 1))
       and (current_gym_id() is null or a.gym_id = current_gym_id())
  loop
    perform act_as_gym(r.gym_id);
    if notify_once(r.owner, 'system', 'Time to renew: ' || r.label,
         case when r.expires_on < v_today then 'It expired on ' || to_char(r.expires_on, 'FMMonth FMDD, YYYY')
              else 'It runs out on ' || to_char(r.expires_on, 'FMMonth FMDD, YYYY') end
           || '. Send the renewed one from Your plan → Business documents.',
         '/subscription', 'doc-renew-' || r.doc || '-' || extract(year from v_today), r.gym_id) then
      n := n + 1;
    end if;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;
revoke all on function permit_renewal_sweep() from public, anon;
grant execute on function permit_renewal_sweep() to authenticated;

create or replace function migration_0187_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0187_applied() from public, anon;
grant execute on function migration_0187_applied() to authenticated;
comment on function migration_0187_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0187.sql
