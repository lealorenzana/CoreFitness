-- ============================================================================
-- 0240 — Core Fitness writes to a gym's owner (the owner, 2026-11-08)
-- ============================================================================
--
-- "There should be a message to the gym owner from the super admin when a gym is
-- at risk — sent to their notification inbox, like the win-back messages an owner
-- sends a member." Until now the platform could only post an announcement to EVERY
-- gym, or answer a ticket a gym had opened first.
--
-- platform_message_gym() writes one notification to each active owner (gym_roles
-- admin) of that gym: their bell and Notifications, and a phone push through 0170's
-- trigger — the same road a win-back message travels to a member. The row is the
-- record; the push is only the alert. Each message is logged in platform_events
-- ('message_owner'), so Activity and the gym's timeline show what was said and
-- when, and platform_gym_messages() lists them for the gym's page.
--
-- Only a platform admin may send. Front desks are not written to: the owner runs
-- the account with Core Fitness. Words are the platform's own, typed or picked from
-- a template on the screen — nothing here invents a number.
-- ============================================================================

create or replace function platform_message_gym(p_gym uuid, p_title text, p_body text, p_reason text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  v_name  text;
  v_sent  int;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can write to a gym''s owner.'; end if;
  if length(v_title) < 3 then raise exception 'Give the message a title.'; end if;
  if length(v_title) > 120 then raise exception 'Keep the title under 120 characters.'; end if;
  if length(v_body) < 10 then raise exception 'Write the message — at least a sentence.'; end if;
  if length(v_body) > 2000 then raise exception 'Keep the message under 2,000 characters.'; end if;
  select name into v_name from gyms where id = p_gym;
  if v_name is null then raise exception 'That gym does not exist.'; end if;

  insert into notifications (user_id, gym_id, type, title, message, action_url, metadata)
  select r.user_id, p_gym, 'platform_message', v_title, v_body, '/inbox',
         jsonb_build_object('from', 'Core Fitness', 'reason', p_reason)
    from gym_roles r
   where r.gym_id = p_gym and r.role = 'admin' and r.status = 'active';
  get diagnostics v_sent = row_count;
  if v_sent = 0 then raise exception '% has no active owner to write to.', v_name; end if;

  perform platform_log(p_gym, 'message_owner', 'Wrote to the owner of ' || v_name || ': ' || v_title,
    jsonb_build_object('title', v_title, 'body', v_body, 'reason', p_reason, 'recipients', v_sent));
  return v_sent;
end;
$$;
revoke execute on function platform_message_gym(uuid, text, text, text) from public, anon;
grant execute on function platform_message_gym(uuid, text, text, text) to authenticated;

-- What Core Fitness has written to this gym's owner, newest first — and whether they have read it.
create or replace function platform_gym_messages(p_gym uuid)
returns table (sent_at timestamptz, title text, body text, reason text, recipients int, read_by int, sent_by text)
language sql stable security definer set search_path = public as $$
  select e.created_at, e.detail ->> 'title', e.detail ->> 'body', e.detail ->> 'reason',
         coalesce((e.detail ->> 'recipients')::int, 0),
         (select count(*)::int from notifications n
           where n.gym_id = p_gym and n.type = 'platform_message' and n.read
             and n.title = e.detail ->> 'title' and n.created_at between e.created_at - interval '5 seconds' and e.created_at + interval '5 seconds'),
         coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    from platform_events e
    left join profiles p on p.id = e.actor_id
   where is_platform_admin() and e.gym_id = p_gym and e.action = 'message_owner'
   order by e.created_at desc
   limit 50;
$$;
revoke execute on function platform_gym_messages(uuid) from public, anon;
grant execute on function platform_gym_messages(uuid) to authenticated;

-- The front desk reads every notification in its gym (notifications_select_staff — it manages what members are
-- sent). A message from Core Fitness to the owner can be about the bill: only the owner it was sent to reads it.
-- RESTRICTIVE, so it narrows the permissive policies instead of adding to them.
drop policy if exists notifications_platform_message_owner_only on notifications;
create policy notifications_platform_message_owner_only on notifications as restrictive for select to authenticated
  using (type is distinct from 'platform_message' or user_id = auth.uid() or is_platform_admin());

create or replace function migration_0240_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0240_applied() to anon, authenticated;
