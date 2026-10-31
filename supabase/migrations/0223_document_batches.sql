-- 0223 — business documents in one batch (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part B).
--
-- An applicant used to send each of the six documents on its own. Now:
--
--   * a file they attach is a DRAFT — only they see it (the platform never does);
--     attaching again replaces the draft of that kind;
--   * SUBMIT DOCUMENTS sends them together — and only when every document that
--     needs sending has a draft: all six the first time; after a send-back, every
--     one the platform sent back. Nothing reaches the platform before that;
--   * the platform checks each one: verified, or SENT BACK with a reason — a
--     pending one (rejected) or one it had already verified (requested: expired,
--     unreadable, wrong). Only the sent-back ones open again; the applicant
--     re-sends those, again as one batch;
--   * attaching needs a confirmed email (0222: the account becomes the owner).
--
-- Approval still needs all six verified and in date (0187's trigger) — a
-- requested one is not verified, so it holds approval until it comes back.
-- add_application_document() (one at a time) refuses a pending application and says what to do;
-- an approved gym's owner still files renewals with it.
-- Safe to paste again.

alter table application_documents drop constraint if exists application_documents_status_check;
alter table application_documents add constraint application_documents_status_check
  check (status in ('draft', 'pending', 'verified', 'rejected', 'requested', 'replaced'));
alter table application_documents drop constraint if exists application_documents_reason;
alter table application_documents add constraint application_documents_reason
  check (status not in ('rejected', 'requested') or coalesce(length(btrim(reason)), 0) > 0);

-- Which documents still need sending: never sent, or sent back. The newest
-- non-draft, non-replaced copy of each kind decides.
create or replace function application_documents_to_send(p_application uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(k.kind order by k.sort_order), '{}')
    from application_document_kinds() k
   where coalesce((select d.status from application_documents d
                    where d.application_id = p_application and d.kind = k.kind
                      and d.status not in ('draft', 'replaced')
                    order by d.uploaded_at desc limit 1), 'none') in ('none', 'rejected', 'requested');
$$;
revoke all on function application_documents_to_send(uuid) from public, anon;
grant execute on function application_documents_to_send(uuid) to authenticated;

/** Attach a file as a draft — seen only by the applicant until Submit documents. */
create or replace function save_document_draft(p_application uuid, p_kind text, p_path text,
                                               p_file_name text default null, p_expires_on date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not may_file_for_application(p_application) then
    raise exception 'You cannot add documents to that application.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your email first — open the link we sent you.';
  end if;
  if not exists (select 1 from application_document_kinds() k where k.kind = p_kind) then
    raise exception 'Unknown document.';
  end if;
  if not (p_kind = any(application_documents_to_send(p_application))) then
    raise exception 'That document is already sent. You can send it again only if we ask for it.';
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
   where application_id = p_application and kind = p_kind and status = 'draft';
  insert into application_documents (application_id, kind, path, file_name, expires_on, status)
  values (p_application, p_kind, p_path, nullif(btrim(p_file_name), ''), p_expires_on, 'draft')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function save_document_draft(uuid, text, text, text, date) from public, anon;
grant execute on function save_document_draft(uuid, text, text, text, date) to authenticated;

/** Send every attached document that needs sending, together. Returns how many went. */
create or replace function submit_documents(p_application uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_need text[];
  v_missing text[];
  v_count int;
begin
  if not may_file_for_application(p_application) then
    raise exception 'You cannot send documents for that application.' using errcode = '42501';
  end if;
  v_need := application_documents_to_send(p_application);
  if cardinality(v_need) = 0 then
    raise exception 'Nothing to send — every document is with us.';
  end if;
  select coalesce(array_agg(k.label order by k.sort_order), '{}') into v_missing
    from application_document_kinds() k
   where k.kind = any(v_need)
     and not exists (select 1 from application_documents d
                      where d.application_id = p_application and d.kind = k.kind and d.status = 'draft');
  if cardinality(v_missing) > 0 then
    raise exception 'Attach every document first. Still to attach: %.', array_to_string(v_missing, '; ');
  end if;
  -- The sent-back copies are retired by the new ones.
  update application_documents set status = 'replaced'
   where application_id = p_application and kind = any(v_need) and status in ('rejected', 'requested');
  update application_documents set status = 'pending', uploaded_at = now()
   where application_id = p_application and kind = any(v_need) and status = 'draft';
  get diagnostics v_count = row_count;
  perform platform_log((select gym_id from gym_applications where id = p_application), 'application.documents_submitted',
    coalesce((select gym_name from gym_applications where id = p_application), 'An applicant')
      || ' sent ' || v_count || ' document' || case when v_count = 1 then '' else 's' end,
    jsonb_build_object('application', p_application, 'kinds', to_jsonb(v_need)));
  return v_count;
end;
$$;
revoke all on function submit_documents(uuid) from public, anon;
grant execute on function submit_documents(uuid) to authenticated;

/** The platform asks for a document again — one it is checking, or one it already verified. */
create or replace function request_document_again(p_document uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d application_documents;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform checks documents.' using errcode = '42501';
  end if;
  select * into d from application_documents where id = p_document;
  if d.id is null then raise exception 'That document does not exist.'; end if;
  if d.status not in ('pending', 'verified') then
    raise exception 'Only a document that was sent can be asked for again.';
  end if;
  if coalesce(length(btrim(p_reason)), 0) = 0 then
    raise exception 'Say what is wrong, so they know what to send instead.';
  end if;
  update application_documents
     set status = case when d.status = 'verified' then 'requested' else 'rejected' end,
         reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document;
  perform platform_log((select gym_id from gym_applications where id = d.application_id), 'application.document_requested',
    (select label from application_document_kinds() k where k.kind = d.kind) || ' sent back: ' || btrim(p_reason),
    jsonb_build_object('application', d.application_id, 'document', d.id));
end;
$$;
revoke all on function request_document_again(uuid, text) from public, anon;
grant execute on function request_document_again(uuid, text) to authenticated;

-- One at a time is over while an application is being decided: an old page
-- that still calls it is told what to do. An approved gym's OWNER still files a
-- renewal one at a time from the admin app (a new permit each year) — 0187's body.
create or replace function add_application_document(p_application uuid, p_kind text, p_path text,
                                                    p_file_name text default null, p_expires_on date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select status from gym_applications where id = p_application) = 'pending' then
    raise exception 'Documents are sent together now: attach each one, then press Submit documents. Reload the page if you do not see it.';
  end if;
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
   where application_id = p_application and kind = p_kind and status in ('pending', 'rejected', 'requested');
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

-- Drafts are the applicant's own: the platform never sees one.
create or replace function application_documents_of(p_application uuid)
returns table (id uuid, kind text, label text, path text, file_name text, expires_on date, status text,
               reason text, uploaded_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.kind, k.label, d.path, d.file_name, d.expires_on, d.status, d.reason, d.uploaded_at, d.reviewed_at
    from application_documents d
    join application_document_kinds() k on k.kind = d.kind
   where d.application_id = p_application
     and (is_platform_admin() or is_my_application(p_application) or may_file_for_application(p_application))
     and (d.status <> 'draft' or is_my_application(p_application) or may_file_for_application(p_application))
   order by k.sort_order, d.uploaded_at desc;
$$;
revoke all on function application_documents_of(uuid) from public, anon;
grant execute on function application_documents_of(uuid) to authenticated;

-- The platform's list: a sent-back one counts with the rejected.
create or replace function platform_application_documents_summary()
returns table (application_id uuid, verified int, waiting int, rejected int, missing text[])
language sql stable security definer set search_path = public as $$
  select a.id,
         (select count(distinct d.kind)::int from application_documents d where d.application_id = a.id and d.status = 'verified'),
         (select count(*)::int from application_documents d where d.application_id = a.id and d.status = 'pending'),
         (select count(*)::int from application_documents d where d.application_id = a.id and d.status in ('rejected', 'requested')),
         application_documents_missing(a.id)
    from gym_applications a
   where is_platform_admin();
$$;
revoke all on function platform_application_documents_summary() from public, anon;
grant execute on function platform_application_documents_summary() to authenticated;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0223_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0223_applied() to anon, authenticated;
