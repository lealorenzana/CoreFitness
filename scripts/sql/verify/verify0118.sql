-- Paste into the Supabase SQL editor right after 0118. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide it:
--
--   **"write policies on the table"** must be 0. Every write goes through the
--   four functions; a permissive INSERT or UPDATE policy would let a member
--   grant their own cancellation.
--
--   **"the grant trigger"** must be 1. That trigger is the only thing that
--   marks a request granted. Without it the desk can freeze a member and the
--   request stays open for ever, and the only remaining way to close one would
--   be a button that sets a status — which is a flag nothing honours: the
--   member reads "granted" and can still book.
do $$
declare
  v_tbl int; v_write int; v_read int; v_fns int; v_trg int; v_idx int; v_open int;
begin
  select count(*) into v_tbl from pg_tables
   where schemaname = 'public' and tablename = 'membership_requests';

  -- RESTRICTIVE tenancy policies are not writes anybody can use on their own;
  -- what must not exist is a PERMISSIVE write policy.
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename = 'membership_requests'
     and cmd in ('INSERT', 'UPDATE', 'DELETE') and permissive = 'PERMISSIVE';

  select count(*) into v_read from pg_policies
   where schemaname = 'public' and tablename = 'membership_requests'
     and cmd = 'SELECT' and permissive = 'PERMISSIVE';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('request_membership_change', 'withdraw_membership_request',
                     'decline_membership_request', 'my_membership_request',
                     'open_membership_requests', 'trg_grant_membership_request');

  select count(*) into v_trg from pg_trigger
   where tgrelid = 'public.membership_events'::regclass
     and tgname = 'grant_membership_request' and not tgisinternal;

  select count(*) into v_idx from pg_indexes
   where schemaname = 'public' and indexname = 'membership_requests_one_open';

  select count(*) into v_open from membership_requests where status = 'open';

  raise exception 'REPORT 0118: table=% % | write policies on the table=% % | read policies=% % | new functions=% of 6 % | the grant trigger=% % | one-open index=% % | requests waiting on the desk now=%',
    v_tbl, case when v_tbl = 1 then 'OK' else 'NOT OK' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK — STOP' end,
    v_read, case when v_read = 2 then 'OK' else 'NOT OK (self + desk)' end,
    v_fns, case when v_fns = 6 then 'OK' else 'NOT OK' end,
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK — STOP' end,
    v_idx, case when v_idx = 1 then 'OK' else 'NOT OK' end,
    v_open;
end $$;
