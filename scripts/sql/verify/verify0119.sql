-- Paste into the Supabase SQL editor right after 0119. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- **Pasting 0119 blocks nobody.** `waiver_required` defaults to false for every
-- gym, and even when a gym turns it on nothing is blocked until it publishes a
-- waiver. The "gyms requiring a signature" line should read 0 today.
--
-- Two lines decide whether it is safe to keep:
--
--   **"the freeze trigger"** must be 1. It is the only thing stopping a
--   published waiver's words being edited after people signed them — without
--   it every signature is worthless.
--
--   **"write policies on acceptances"** must be 0. A signature the client can
--   insert is not a signature.
do $$
declare
  v_tbls int; v_trg int; v_write int; v_fns int; v_q int; v_req int; v_pub int; v_signed int;
begin
  select count(*) into v_tbls from pg_tables
   where schemaname = 'public' and tablename in ('gym_waivers', 'waiver_acceptances');

  select count(*) into v_trg from pg_trigger
   where tgrelid = 'public.gym_waivers'::regclass and tgname = 'waiver_frozen' and not tgisinternal;

  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('waiver_acceptances', 'gym_waivers')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('parq_questions', 'save_gym_waiver', 'publish_gym_waiver',
                     'my_waiver_status', 'accept_waiver', 'gym_waiver_signatures', 'waiver_blocks');

  select count(*) into v_q from parq_questions();
  select count(*) into v_req from gym_settings where waiver_required;
  select count(*) into v_pub from gym_waivers where published_at is not null;
  select count(*) into v_signed from waiver_acceptances;

  raise exception 'REPORT 0119: tables=% of 2 % | the freeze trigger=% % | write policies on acceptances=% % | new functions=% of 7 % | PAR-Q questions=% % | gyms requiring a signature=% | published waivers=% | signatures=%',
    v_tbls, case when v_tbls = 2 then 'OK' else 'NOT OK' end,
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK - STOP' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 7 then 'OK' else 'NOT OK' end,
    v_q, case when v_q = 7 then 'OK' else 'NOT OK' end,
    v_req, v_pub, v_signed;
end $$;
