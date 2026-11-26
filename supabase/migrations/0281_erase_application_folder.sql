-- 0281 — deleting an account erases the application's whole folder, not only its documents.
--
-- 0225's erase_account() queued for erasure only the files that had become documents. A file an
-- applicant uploaded but never attached (abandoned after it was read, 0280, or a save that failed)
-- stayed in Storage for good, and could be an owner's ID. Now the erase queues the folder of every
-- application not let in (erasure_files.is_prefix, which the erase-accounts function already
-- empties), and drops that application's readings, attached or not.
--
-- Edits the live body in place, as 0274 did, so nothing else in erase_account() changes and
-- CREATE OR REPLACE keeps who may call it. Safe to paste again: a second run finds nothing to change.

do $$
declare
  v_def text := pg_get_functiondef('erase_account(uuid)'::regprocedure);
  v_new text;
begin
  v_new := regexp_replace(v_def,
    $p$insert into erasure_files \(person, bucket, path\)\s+select p, 'applications', d\.path from application_documents d join gym_applications a on a\.id = d\.application_id\s+where a\.applicant_id = p and a\.status <> 'approved' and d\.path is not null;$p$,
    $r$insert into erasure_files (person, bucket, path, is_prefix)
  select p, 'applications', a.id::text || '/', true from gym_applications a
   where a.applicant_id = p and a.status <> 'approved';
  delete from document_readings r using gym_applications a
   where a.id = r.application_id and a.applicant_id = p and a.status <> 'approved';$r$);
  if v_new <> v_def then
    execute v_new;
  elsif position($q$select p, 'applications', a.id::text || '/', true$q$ in v_def) = 0 then
    raise exception '0281: erase_account() does not look like 0225''s. Nothing was changed.';
  end if;
end $$;

create or replace function migration_0281_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0281_applied() to anon, authenticated;
