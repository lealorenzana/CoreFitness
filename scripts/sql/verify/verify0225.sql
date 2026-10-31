-- VERIFICATION for 0225 (deleting your own account)
-- Paste into the Supabase SQL editor right after 0225. Read-only; the error is the report.
do $$
declare c boolean; j boolean;
begin
  select coalesce((select migration_0225_applied()), false) into c;
  select exists (select 1 from cron.job where jobname = 'erase-due-accounts') into j;
  raise exception 'REPORT 0225: account_deletions=% | erasure_files=% | request=% | keep=% | sweep=% | daily sweep scheduled=% | marker=%',
    to_regclass('public.account_deletions') is not null,
    to_regclass('public.erasure_files') is not null,
    to_regprocedure('public.request_account_deletion()') is not null,
    to_regprocedure('public.cancel_account_deletion()') is not null,
    to_regprocedure('public.erase_due_accounts()') is not null, j, c;
end
$$;
