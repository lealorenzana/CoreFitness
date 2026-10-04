-- ============================================================================
-- 0162 — Support access is asked for, and given, inside the ticket it is for
-- ============================================================================
--
-- 0113 let an owner open a few hours of read-only access from Your app, with a
-- reason typed from nothing; 0137 gave gyms tickets. The two never met: the
-- platform could not ask from the ticket, the owner had to find a different
-- page to say yes, and nothing tied the visit or the fix back to the problem.
--
--   * platform_request_ticket_access(): the platform asks, on the ticket, for
--     1–24 hours and says why; the request is a message the owner reads there;
--   * approve_ticket_access(): the owner's one tap — it is 0113's
--     grant_support_access(), so the access is the same read-only, expiring,
--     logged, revocable window, now linked to the ticket;
--     decline_ticket_access() says no, on the ticket;
--   * resolve_ticket(): the platform writes down what the fix was; the ticket
--     closes with it, so the gym can read what changed;
--   * a ticket may carry a context (an error report: message, screen, build —
--     never member data) when the gym opens it from a crash screen;
--   * ticket_access_state(): either side reads where the request stands.
--
-- Data minimisation is unchanged: access is the snapshot 0149 shows, read-only.
-- ============================================================================

alter table support_tickets
  add column if not exists access_hours        int check (access_hours is null or access_hours between 1 and 24),
  add column if not exists access_why          text check (access_why is null or length(access_why) <= 300),
  add column if not exists access_requested_at timestamptz,
  add column if not exists access_answer       text check (access_answer in ('approved', 'declined')),
  add column if not exists access_grant_id     uuid references support_grants(id) on delete set null,
  add column if not exists resolution          text check (resolution is null or length(resolution) <= 2000),
  add column if not exists resolved_at         timestamptz,
  add column if not exists context             jsonb check (context is null or pg_column_size(context) <= 8000);

-- ---- a ticket opened with an error report attached ---------------------------------------------------
create or replace function open_support_ticket_with_context(p_subject text, p_body text, p_context jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := open_support_ticket(p_subject, p_body);
  -- Only what helps find the bug: no member names, no rows.
  update support_tickets set context = jsonb_strip_nulls(jsonb_build_object(
      'message', left(p_context ->> 'message', 1000), 'route', left(p_context ->> 'route', 300),
      'build', left(p_context ->> 'build', 80), 'user_agent', left(p_context ->> 'user_agent', 300),
      'at', now()))
   where id = v_id;
  return v_id;
end;
$$;
revoke all on function open_support_ticket_with_context(text, text, jsonb) from public, anon;
grant execute on function open_support_ticket_with_context(text, text, jsonb) to authenticated;

-- ---- the platform asks ----------------------------------------------------------------------------------
create or replace function platform_request_ticket_access(p_ticket uuid, p_hours int, p_why text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; a uuid;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness asks for access.' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket;
  if t.id is null then raise exception 'That ticket is gone.'; end if;
  if t.status = 'closed' then raise exception 'That ticket is closed.'; end if;
  if coalesce(p_hours, 0) not between 1 and 24 then raise exception 'Ask for between 1 and 24 hours.'; end if;
  if coalesce(btrim(p_why), '') = '' then raise exception 'Say what you need to look at — the owner reads it.'; end if;
  update support_tickets set access_hours = p_hours, access_why = btrim(p_why), access_requested_at = now(),
         access_answer = null, access_grant_id = null, status = 'answered', last_from = 'platform', updated_at = now()
   where id = t.id;
  insert into support_messages (ticket_id, author_id, from_platform, body)
  values (t.id, auth.uid(), true, 'We would like to look at your gym for ' || p_hours || ' hour' || case when p_hours = 1 then '' else 's' end
    || ' — read-only, it ends by itself, and every visit is in your activity log. Why: ' || btrim(p_why) || ' Approve or decline it here.');
  for a in select user_id from gym_roles where gym_id = t.gym_id and role = 'admin' and status = 'active' loop
    perform notify_once(a, 'system', 'Core Fitness asks to look at your gym',
      left(t.subject, 60) || ' — approve or decline it on the ticket.', '/support',
      'support-access:' || t.id || ':' || extract(epoch from now())::bigint, t.gym_id);
  end loop;
end;
$$;
revoke all on function platform_request_ticket_access(uuid, int, text) from public, anon;
grant execute on function platform_request_ticket_access(uuid, int, text) to authenticated;

-- ---- the owner answers ------------------------------------------------------------------------------------
create or replace function approve_ticket_access(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; g record;
begin
  select * into t from support_tickets where id = p_ticket and gym_id = current_gym_id();
  if t.id is null then raise exception 'That ticket is not in this gym.'; end if;
  if t.access_requested_at is null or t.access_answer is not null then raise exception 'There is no request waiting on this ticket.'; end if;
  -- 0113's own grant: owner only, read-only, expiring, logged in both places.
  select * into g from grant_support_access(t.access_hours, 'Ticket: ' || t.subject || ' — ' || t.access_why);
  update support_tickets set access_answer = 'approved', access_grant_id = g.grant_id, updated_at = now(), last_from = 'gym', status = 'open'
   where id = t.id;
  insert into support_messages (ticket_id, author_id, from_platform, body)
  values (t.id, auth.uid(), false, 'Approved: you can look for ' || t.access_hours || ' hour' || case when t.access_hours = 1 then '' else 's' end
    || ', until ' || to_char(g.grant_expires_at at time zone 'Asia/Manila', 'Mon DD, HH12:MI AM') || '.');
end;
$$;
revoke all on function approve_ticket_access(uuid) from public, anon;
grant execute on function approve_ticket_access(uuid) to authenticated;

create or replace function decline_ticket_access(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Only the gym owner answers an access request.' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket and gym_id = current_gym_id();
  if t.id is null then raise exception 'That ticket is not in this gym.'; end if;
  if t.access_requested_at is null or t.access_answer is not null then raise exception 'There is no request waiting on this ticket.'; end if;
  update support_tickets set access_answer = 'declined', updated_at = now(), last_from = 'gym', status = 'open' where id = t.id;
  insert into support_messages (ticket_id, author_id, from_platform, body)
  values (t.id, auth.uid(), false, 'Declined — please help without looking for now.');
end;
$$;
revoke all on function decline_ticket_access(uuid) from public, anon;
grant execute on function decline_ticket_access(uuid) to authenticated;

-- ---- the fix, written down ----------------------------------------------------------------------------------
create or replace function resolve_ticket(p_ticket uuid, p_resolution text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness resolves a ticket.' using errcode = '42501'; end if;
  select * into t from support_tickets where id = p_ticket;
  if t.id is null then raise exception 'That ticket is gone.'; end if;
  if coalesce(btrim(p_resolution), '') = '' then raise exception 'Write what was fixed — the gym reads it.'; end if;
  update support_tickets set resolution = btrim(p_resolution), resolved_at = now(), status = 'closed', last_from = 'platform', updated_at = now()
   where id = t.id;
  insert into support_messages (ticket_id, author_id, from_platform, body)
  values (t.id, auth.uid(), true, 'Fixed: ' || btrim(p_resolution));
  -- Access opened for this ticket ends with it.
  if t.access_grant_id is not null then
    update support_grants set revoked_at = now() where id = t.access_grant_id and revoked_at is null;
  end if;
  perform notify_once(t.opened_by, 'system', 'Your support ticket is fixed', left(t.subject, 60) || ': ' || left(btrim(p_resolution), 100), '/support',
    'support-fixed:' || t.id, t.gym_id);
end;
$$;
revoke all on function resolve_ticket(uuid, text) from public, anon;
grant execute on function resolve_ticket(uuid, text) to authenticated;

-- ---- where it stands, for either side --------------------------------------------------------------------------
create or replace function ticket_access_state(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hours', t.access_hours, 'why', t.access_why, 'requested_at', t.access_requested_at, 'answer', t.access_answer,
    'expires_at', g.expires_at, 'live', g.id is not null and g.revoked_at is null and g.expires_at > now(),
    'first_used_at', g.first_used_at, 'resolution', t.resolution, 'resolved_at', t.resolved_at, 'context', t.context)
    from support_tickets t left join support_grants g on g.id = t.access_grant_id
   where t.id = p_ticket
     and (is_platform_admin() or (t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')));
$$;
revoke all on function ticket_access_state(uuid) from public, anon;
grant execute on function ticket_access_state(uuid) to authenticated;

create or replace function migration_0162_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0162_applied() from public, anon;
grant execute on function migration_0162_applied() to authenticated;
comment on function migration_0162_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0162.sql
