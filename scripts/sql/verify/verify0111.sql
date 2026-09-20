-- Paste into the Supabase SQL editor right after 0111. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- The line to read first is "gyms whose state changed meaning": every gym you
-- had was `active` or `suspended`, and both still mean what they meant. The new
-- states are only the two decisions the platform could not express before
-- (cancelled, archived) — nothing was reinterpreted underneath you.
--
-- "permissive policies on gym_invitations" must be 0. A token is a credential:
-- if any policy makes that table readable, a gym's own members could list live
-- invitations and take a seat meant for somebody else.
do $$
declare
  v_status_ok int; v_fns int; v_invites int; v_perm int; v_restrict int;
  v_states text; v_bookmarks int; v_onboarded int; v_apps int;
begin
  -- The widened CHECK accepts the two new decisions.
  select count(*) into v_status_ok from pg_constraint
   where conrelid = 'gyms'::regclass and conname = 'gyms_status_check'
     and pg_get_constraintdef(oid) like '%cancelled%'
     and pg_get_constraintdef(oid) like '%archived%';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('gym_state', 'set_onboarding_step', 'invite_to_gym', 'list_invitations',
                     'revoke_invitation', 'peek_invitation', 'accept_invitation',
                     'record_backup', 'last_backup');

  select count(*) into v_invites from gym_invitations;

  -- No permissive policy at all; the four restrictive ones present.
  select count(*) into v_perm from pg_policies
   where schemaname = 'public' and tablename = 'gym_invitations' and permissive = 'PERMISSIVE';
  select count(*) into v_restrict from pg_policies
   where schemaname = 'public' and tablename = 'gym_invitations'
     and policyname in ('tenant_select', 'tenant_insert', 'tenant_update', 'tenant_delete');

  -- Every gym, folded into one word. Read it: it should describe what you know.
  select string_agg(g.name || '=' || gym_state(g.id), ', ' order by g.name)
    into v_states from gyms g;

  select count(*) into v_bookmarks from gyms where onboarding_step is not null;
  select count(*) into v_onboarded from gyms where onboarded_at is not null;
  select count(*) into v_apps from gym_applications where status = 'pending';

  raise exception 'REPORT 0111: gyms.status accepts cancelled+archived=% % | new functions=% of 9 % | invitations=% | permissive policies on gym_invitations=% % | RESTRICTIVE policies=% of 4 % | gyms set up=% | setup bookmarks=% | applications waiting=% | every gym now reads as: %',
    v_status_ok, case when v_status_ok = 1 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 9 then 'OK' else 'NOT OK' end,
    v_invites,
    v_perm, case when v_perm = 0 then 'OK' else 'NOT OK — STOP, tokens are readable' end,
    v_restrict, case when v_restrict = 4 then 'OK' else 'NOT OK — STOP' end,
    v_onboarded, v_bookmarks, v_apps,
    coalesce(v_states, '(no gyms)');
end $$;
