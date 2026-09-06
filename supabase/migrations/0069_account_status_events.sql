-- 0069 — a suspension that says why.
--
-- `profiles.status` records *that* an account was suspended. Nobody has ever
-- been able to find out **why**, because the answer was never written down:
-- Members.tsx flips the column and the member is locked out with a generic
-- refusal. Three weeks later the desk cannot reconstruct whether it was unpaid
-- dues, a safety incident, or a mis-click, and the member cannot either.
--
-- 0057 solved the same problem for memberships and the shape it landed on is
-- the one to copy: **events, not a column.** A `suspension_reason` on `profiles`
-- is overwritten by the next status change, so the history the desk actually
-- argues about is exactly the part it loses. And 0037's `activity_log` already
-- records the transition — what it cannot carry is a sentence a human wrote.
--
-- ## Why an RPC and not a trigger
--
-- A trigger on `profiles` can see the new status. It cannot see a reason,
-- because the reason is not a column on that table and never should be. The
-- alternatives are a session GUC (invisible, easy to forget, and silently
-- absent from every other writer) or making the caller do both writes and
-- trusting it to. `set_account_status()` does both in one transaction and
-- refuses a blank reason, so the two facts cannot come apart.
--
-- Re-runnable.

-- ============================================================================
-- 1. THE RECORD
-- ============================================================================
create table if not exists account_status_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  /** Plain text, matching `profiles.status` — which 0001 deliberately left as
      text rather than an enum because the set has churned. A check constraint
      here would have to be dropped and recreated in step with that column, and
      the two would drift. The RPC validates instead. */
  status      text not null,
  /** What it was before, so the row reads as a transition and not a state.
      NULL only for the first event on an account that predates this file. */
  previous_status text,
  /** Required to suspend or archive; optional to reinstate. Nobody has ever
      needed to justify giving somebody their account back. */
  reason      text,
  /** Stamped from auth.uid() by the RPC — never accepted from the caller. */
  recorded_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_account_status_events_profile
  on account_status_events(profile_id, created_at desc);

comment on table account_status_events is
  'Why an account was suspended, archived or reinstated, and by whom. Append '
  'only — a reason that can be rewritten is not a record. Correct a mistake by '
  'adding the opposite event, exactly as attendance undo works (0035).';

-- ============================================================================
-- 2. THE ONE WAY TO CHANGE A STATUS
-- ============================================================================
create or replace function set_account_status(
  p_profile uuid,
  p_status  text,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_prev text;
begin
  -- `auth.uid() is not null and` first. Outside a browser session auth.uid() is
  -- NULL and a bare not-admin test is true, which would refuse the SQL Editor —
  -- the exact bug 0055 and 0062 both shipped. Inside a session, a non-admin is
  -- still refused.
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can change an account status.';
  end if;

  if p_status not in ('active', 'pending_approval', 'suspended', 'archived') then
    raise exception 'Unknown account status: %', p_status;
  end if;

  -- A suspension with no reason is the thing this file exists to prevent.
  if p_status in ('suspended', 'archived')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to % an account.', p_status;
  end if;

  select status into v_prev from profiles where id = p_profile;
  if v_prev is null then
    raise exception 'No such account.';
  end if;

  -- Nothing to record and nothing to change. Returning quietly rather than
  -- raising keeps a double-click idempotent instead of alarming.
  if v_prev = p_status then
    return;
  end if;

  update profiles set status = p_status where id = p_profile;

  insert into account_status_events
    (profile_id, status, previous_status, reason, recorded_by)
  values
    (p_profile, p_status, v_prev, nullif(btrim(p_reason), ''), auth.uid());
end;
$fn$;

revoke all on function set_account_status(uuid, text, text) from public, anon;
grant execute on function set_account_status(uuid, text, text) to authenticated;

comment on function set_account_status(uuid, text, text) is
  'The only supported way to change profiles.status. Writes the status and the '
  'reason in one transaction so they cannot come apart. Admin only; the guard '
  'reads `auth.uid() is not null and` so it does not lock out the SQL Editor.';

-- ============================================================================
-- 3. WHO MAY READ IT
-- ============================================================================
alter table account_status_events enable row level security;

-- Asserted, not assumed. A policy on a table whose RLS is off reads exactly
-- like protection and is none.
do $$
begin
  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'account_status_events'
       and rowsecurity
  ) then
    raise exception 'RLS is not enabled on account_status_events.';
  end if;
end
$$;

-- The member sees their own. "Why am I locked out" should not need a phone
-- call, and a rule the user cannot read ambushes them (0017 → 0041).
drop policy if exists account_status_events_select_self on account_status_events;
create policy account_status_events_select_self on account_status_events
  for select using (profile_id = auth.uid());

drop policy if exists account_status_events_select_desk on account_status_events;
create policy account_status_events_select_desk on account_status_events
  for select using (get_my_role() in ('admin', 'staff'));

-- **No INSERT, UPDATE or DELETE policy for any role.** The SECURITY DEFINER
-- function above is the only writer, which is what makes the reason mandatory:
-- a client that could insert directly could insert a blank one.

-- ============================================================================
-- 4. WHAT A LOCKED-OUT MEMBER IS TOLD
-- ============================================================================
-- The login screen needs the latest reason for an account that cannot sign in,
-- and it needs it *before* a session exists — so the policies above cannot
-- serve it. This function takes the email, returns nothing but the sentence,
-- and deliberately does not distinguish "no such account" from "active
-- account": both return NULL, so it cannot be used to enumerate members.
create or replace function account_lockout_reason(p_email text)
returns text
language sql stable security definer set search_path = public as $fn$
  select e.reason
    from profiles p
    join account_status_events e on e.profile_id = p.id
   where lower(p.email) = lower(btrim(p_email))
     and p.status in ('suspended', 'archived')
     and e.status = p.status
   order by e.created_at desc
   limit 1;
$fn$;

revoke all on function account_lockout_reason(text) from public;
grant execute on function account_lockout_reason(text) to anon, authenticated;

comment on function account_lockout_reason(text) is
  'The reason a sign-in was refused, for the login screen. Returns NULL for an '
  'active or unknown account alike, so it cannot enumerate members. NULL means '
  '"no reason on file" and the screen must say exactly that, never invent one.';

-- ============================================================================
-- 5. BACKFILL
-- ============================================================================
-- Accounts suspended before this file have no reason and never will — the
-- sentence was never written anywhere. One honest row each, so the history
-- reads as "we do not know" rather than as an empty list that looks like the
-- account was never touched.
insert into account_status_events (profile_id, status, previous_status, reason, created_at)
select p.id, p.status, null,
       'Recorded before reasons were captured — the original reason is not known.',
       p.created_at
  from profiles p
 where p.status in ('suspended', 'archived')
   and not exists (
     select 1 from account_status_events e where e.profile_id = p.id
   );

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   -- Blank reason must be refused:
--   select set_account_status('<profile>', 'suspended', '   ');
--   -- expected: 'A reason is required to suspend an account.'
--
--   select set_account_status('<profile>', 'suspended', 'Unpaid dues since August.');
--   select status, reason, previous_status from account_status_events
--    where profile_id = '<profile>' order by created_at desc limit 1;
--
--   -- Reinstating needs no reason:
--   select set_account_status('<profile>', 'active');
--
--   -- As a member, inserting directly must match no policy:
--   insert into account_status_events (profile_id, status) values (auth.uid(), 'active');
--   -- expected: new row violates row-level security policy
--
--   select account_lockout_reason('someone@example.com');   -- NULL when active
