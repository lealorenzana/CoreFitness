-- VERIFICATION for 0223 (business documents in one batch)
-- Paste into the Supabase SQL editor right after 0223. Read-only; the error is the report.
do $$
declare c boolean; s text;
begin
  select coalesce((select migration_0223_applied()), false) into c;
  select pg_get_constraintdef(oid) into s from pg_constraint where conname = 'application_documents_status_check';
  raise exception 'REPORT 0223: drafts allowed=% | requested allowed=% | save_document_draft=% | submit_documents=% | request_document_again=% | marker=%',
    position('draft' in s) > 0, position('requested' in s) > 0,
    to_regprocedure('public.save_document_draft(uuid,text,text,text,date)') is not null,
    to_regprocedure('public.submit_documents(uuid)') is not null,
    to_regprocedure('public.request_document_again(uuid,text)') is not null, c;
end
$$;
