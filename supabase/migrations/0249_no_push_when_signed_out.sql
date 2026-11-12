-- ============================================================================
-- 0249 — No push to someone who signed out (owner, 2026-11-12)
-- ============================================================================
-- "why does it notify still even when my core fitness is logged out in my phone?"
--
-- The app removes its phone's push registration when it signs out — but only the
-- one it can see. A phone whose push address had changed since it registered left
-- the old one behind, still delivering. Two fixes:
--
--   1. The database: a push goes only to someone signed in somewhere. Signing out
--      ends every session of the account (Supabase's global sign-out), so a
--      signed-out account gets no push at all; its leftover registrations are
--      removed the first time one is tried. The notification itself is still kept
--      in their Inbox — preferences and sign-outs gate delivery, never the record.
--   2. The app (lib/api/push.ts): signing out removes every registration of the
--      account, not only this phone's — every device is signed out anyway.
-- Safe to paste again.
-- ============================================================================

-- Is this account signed in on any device? A session that has not run out.
-- (Read through execute so the function can be created where auth.sessions does not exist.)
create or replace function user_signed_in(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if to_regclass('auth.sessions') is null then return true; end if;
  execute 'select exists (select 1 from auth.sessions s where s.user_id = $1 and (s.not_after is null or s.not_after > now()))'
    into v using p_user;
  return coalesce(v, false);
end;
$$;
revoke all on function user_signed_in(uuid) from public, anon, authenticated;

-- 0170's claim, plus: someone signed out everywhere is not pushed to, and their
-- leftover registrations go. The row is still claimed (pushed_at), so it is not retried.
drop function if exists claim_notification_push(uuid);
create function claim_notification_push(p_id uuid)
returns table (user_id uuid, type text, title text, message text, action_url text)
language plpgsql security definer set search_path = public as $$
declare n record;
begin
  update notifications x set pushed_at = now()
   where x.id = p_id and x.pushed_at is null and x.created_at > now() - interval '2 minutes'
  returning x.user_id, x.type, x.title, x.message, x.action_url into n;
  if n.user_id is null then return; end if;
  if not user_signed_in(n.user_id) then
    delete from push_subscriptions s where s.user_id = n.user_id;
    return;
  end if;
  user_id := n.user_id; type := n.type; title := n.title; message := n.message; action_url := n.action_url;
  return next;
end;
$$;
revoke all on function claim_notification_push(uuid) from public, anon, authenticated;
grant execute on function claim_notification_push(uuid) to service_role;

-- 0246's chat fan-out, plus the same rule.
create or replace function claim_gym_chat_push(p_message uuid)
returns table (endpoint text, p256dh text, auth_key text, sub_id uuid, url text, title text, body text)
language plpgsql security definer set search_path = public as $$
declare
  m gym_chat_messages;
  v_name text;
  v_gym_name text;
begin
  update gym_chat_messages x set pushed_at = now()
   where x.id = p_message and x.pushed_at is null and x.removed_at is null
     and x.created_at > now() - interval '2 minutes'
  returning * into m;
  if m.id is null then return; end if;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = m.sender_id;
  select name into v_gym_name from gyms where id = m.gym_id;
  return query
    select s.endpoint, s.p256dh, s.auth, s.id,
           gym_chat_url(r.role::text),
           coalesce(nullif(v_name, ''), 'Someone') || ' · ' || coalesce(v_gym_name, 'Gym') || ' chat',
           coalesce(left(m.body, 140), 'Sent a photo')
      from gym_roles r
      join push_subscriptions s on s.user_id = r.user_id
      left join gym_chat_people c on c.gym_id = r.gym_id and c.user_id = r.user_id
     where r.gym_id = m.gym_id and r.status = 'active'
       and r.user_id <> m.sender_id
       and not (r.user_id = any (m.mentions))
       and not coalesce(c.muted, false)
       and gym_module_on(m.gym_id, 'gym_chat')
       and in_gym_chat(m.gym_id, r.user_id)
       and user_signed_in(r.user_id);   -- 0249: not to someone signed out everywhere
end;
$$;

create or replace function migration_0249_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0249_applied() to anon, authenticated;
