-- 0252: the push hand-off reads its address from the database, not from the code.
--
-- 0170's trg_push_notification() and 0246's gym_chat_send() each called send-push at a URL and
-- key typed into the function: production's. Any copy of the database (the staging project used
-- for the QA run, 2026-11-13, test NOTIF-PUSH-HANDOFF) therefore handed every push to PRODUCTION's
-- send-push. Now both call push_hand_off(), which reads one row of push_endpoint.
--
-- Production is unchanged: the row is seeded with the same public values the code had (the
-- project URL and the publishable key ship in every app bundle). A copy points the row at itself:
--   update push_endpoint set url = 'https://<ref>.supabase.co/functions/v1/send-push', apikey = '<its publishable key>';
-- A missing row means no push, never someone else's.
--
-- Nothing else changes: the alert is still a courtesy, and the record or message never fails because of it.

create table if not exists push_endpoint (
  only_row boolean primary key default true check (only_row),
  url      text not null check (url ~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/send-push$'),
  apikey   text not null,
  updated_at timestamptz not null default now()
);
alter table push_endpoint enable row level security;   -- no policy: only the database itself reads it
revoke all on push_endpoint from public, anon, authenticated;

insert into push_endpoint (url, apikey)
values ('https://ifwxtekyjgeljerslnzr.supabase.co/functions/v1/send-push', 'sb_publishable_UvVt5N-d4PnQlruDuQ4JVA_0qpq4lug')
on conflict (only_row) do nothing;

create or replace function push_hand_off(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e push_endpoint;
begin
  select * into e from push_endpoint where only_row;
  if e.url is null or to_regproc('net.http_post') is null then return; end if;
  perform net.http_post(
    url := e.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', e.apikey),
    body := p_body);
exception when others then
  null;  -- the alert is a courtesy; the caller must never fail because of it
end;
$$;
revoke all on function push_hand_off(jsonb) from public, anon, authenticated;

create or replace function trg_push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A notification already archived or cleared at birth (an import) is not news.
  if new.archived_at is not null or new.cleared_at is not null then return new; end if;
  perform push_hand_off(jsonb_build_object('notificationId', new.id));
  return new;
end;
$$;

create or replace function gym_chat_send(p_id uuid, p_body text, p_photo_path text default null,
                                         p_reply_to uuid default null, p_mentions uuid[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_me uuid := auth.uid();
  v_block text;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_prefix text;
  v_mentions uuid[];
  v_row gym_chat_messages;
  v_name text;
  v_user uuid;
begin
  v_block := gym_chat_post_block();
  if v_block is not null then raise exception '%', v_block using errcode = '42501'; end if;
  if p_id is null then raise exception 'A message needs an id.'; end if;

  select * into v_row from gym_chat_messages where id = p_id;
  if v_row.id is not null then
    if v_row.sender_id = v_me and v_row.gym_id = v_gym then return gym_chat_message_json(v_row); end if;
    raise exception 'That message id is taken.';
  end if;

  if v_body is null and p_photo_path is null then raise exception 'Write something, or add a photo.'; end if;
  if length(coalesce(v_body, '')) > 2000 then raise exception 'That message is too long (2,000 characters at most).'; end if;
  v_prefix := 'gyms/' || v_gym || '/chat/' || v_me || '/';
  if p_photo_path is not null and (left(p_photo_path, length(v_prefix)) <> v_prefix or p_photo_path ~ '\.\.') then
    raise exception 'That photo is not yours to send.';
  end if;
  if p_reply_to is not null and not exists (select 1 from gym_chat_messages where id = p_reply_to and gym_id = v_gym) then
    raise exception 'The message you are replying to is not in this chat.';
  end if;
  -- A person, not a firehose: 20 messages a minute.
  if (select count(*) from gym_chat_messages where gym_id = v_gym and sender_id = v_me
        and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending messages very fast. Wait a moment.';
  end if;

  -- Only people who are in the chat can be mentioned; never yourself; ten at most.
  select coalesce(array_agg(distinct u), '{}') into v_mentions
    from (select u from unnest(coalesce(p_mentions, '{}')) u
           where u <> v_me and in_gym_chat(v_gym, u) limit 10) q;

  insert into gym_chat_messages (id, gym_id, sender_id, body, photo_path, reply_to, mentions)
  values (p_id, v_gym, v_me, v_body, p_photo_path, p_reply_to, v_mentions)
  returning * into v_row;

  -- The sender is no longer typing, and has read up to their own message.
  insert into gym_chat_people (gym_id, user_id, last_read_at, typing_at) values (v_gym, v_me, v_row.created_at, null)
  on conflict (gym_id, user_id) do update set last_read_at = excluded.last_read_at, typing_at = null;

  -- A mention is kept in the Inbox (and pushed from there), muted chat or not.
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = v_me;
  foreach v_user in array v_mentions loop
    perform notify_once(v_user, 'message', coalesce(nullif(v_name, ''), 'Someone') || ' mentioned you in the gym chat',
      coalesce(left(v_body, 140), 'Sent a photo'), gym_chat_url(gym_chat_role(v_gym, v_user)),
      'gymchat:mention:' || v_row.id || ':' || v_user, v_gym);
  end loop;

  -- Everyone else hears about it from send-push, which asks claim_gym_chat_push() who that is.
  perform push_hand_off(jsonb_build_object('chatMessageId', v_row.id));

  return gym_chat_message_json(v_row);
end;
$$;

revoke all on function gym_chat_send(uuid, text, text, uuid, uuid[]) from public, anon;
grant execute on function gym_chat_send(uuid, text, text, uuid, uuid[]) to authenticated;

create or replace function migration_0252_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0252_applied() to anon, authenticated;
