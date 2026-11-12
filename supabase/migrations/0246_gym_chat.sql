-- ============================================================================
-- 0246 — The gym chat: one group chat for the whole gym (owner, 2026-11-11)
-- ============================================================================
-- "a group chat for the gym, even the admin owner is there … can we copy what
--  group chat of messenger be like?"
--
-- One chat per gym. In it: the owner, the front desk, coaches, and members whose
-- membership is usable today (a frozen, expired, pending or archived member is
-- out until active again). Photos, reactions, replies, seen, typing, @mentions,
-- pins. A push for every message, unless that person muted the chat; a mention
-- reaches them anyway and is kept in their Inbox.
--
-- Moderation: anyone removes their own message; the owner and desk remove any
-- (with a reason the author is told); they stop one person from posting (with a
-- reason); members report a message; the owner can make it announcements-only
-- (only the owner, desk and coaches post).
--
--   The switch: `gym_chat`, on every plan, OFF at each gym until the owner
--   switches it on. Every read and write is a definer function — no table here
--   has a permissive policy — so the screen cannot skip a rule.
--   The apps poll gym_chat_sync() every 3 seconds while the chat is open; the
--   project uses no realtime channel.
-- Safe to paste again.
-- ============================================================================

-- ---- 1. the switch ----------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key)
values ('gym_chat', 'Gym chat',
        'One group chat for your whole gym: members, coaches, the front desk and you. You can remove messages, stop someone posting, or make it announcements-only.',
        83, null)
on conflict (key) do nothing;
update platform_features set default_on = false where key = 'gym_chat'
   and to_regprocedure('migration_0246_applied()') is null;

select sync_platform_plan_features();
update platform_plan_features set enabled = true
 where feature_key = 'gym_chat' and to_regprocedure('migration_0246_applied()') is null;

alter table gym_settings add column if not exists chat_announce_only boolean not null default false;
comment on column gym_settings.chat_announce_only is
  '0246: the gym chat takes messages only from the owner, the desk and coaches. Set by set_gym_chat_announce_only().';

-- ---- 2. the tables ----------------------------------------------------------------------------
create table if not exists gym_chat_messages (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  sender_id      uuid not null references profiles(id) on delete cascade,
  body           text check (body is null or length(body) <= 2000),
  photo_path     text,
  reply_to       uuid,
  mentions       uuid[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),   -- bumped by a reaction, a pin, a removal: what a poll asks for
  removed_at     timestamptz,
  removed_by     uuid references profiles(id) on delete set null,
  removed_reason text,
  pinned_at      timestamptz,
  pinned_by      uuid references profiles(id) on delete set null,
  pushed_at      timestamptz,
  unique (gym_id, id),
  check (removed_at is not null or coalesce(btrim(body), '') <> '' or photo_path is not null)
);
create index if not exists gym_chat_messages_gym_created on gym_chat_messages (gym_id, created_at desc);
create index if not exists gym_chat_messages_gym_updated on gym_chat_messages (gym_id, updated_at desc);

create table if not exists gym_chat_reactions (
  gym_id     uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  message_id uuid not null,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (gym_id, message_id) references gym_chat_messages (gym_id, id) on delete cascade
);

-- One row per person per gym: what they have read, whether they muted the chat,
-- when they last typed, and whether the gym stopped them posting.
create table if not exists gym_chat_people (
  gym_id          uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  typing_at       timestamptz,
  silenced_at     timestamptz,
  silenced_by     uuid references profiles(id) on delete set null,
  silenced_reason text,
  primary key (gym_id, user_id)
);

create table if not exists gym_chat_reports (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  message_id  uuid not null,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      text not null check (length(btrim(reason)) between 3 and 300),
  status      text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  unique (gym_id, id),
  unique (message_id, reporter_id),
  foreign key (gym_id, message_id) references gym_chat_messages (gym_id, id) on delete cascade
);
create index if not exists gym_chat_reports_open on gym_chat_reports (gym_id) where status = 'open';

do $$
declare t text;
begin
  foreach t in array array['gym_chat_messages', 'gym_chat_reactions', 'gym_chat_people', 'gym_chat_reports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;
-- No permissive policy on any of the four: a direct select reads nothing, a direct write changes nothing.

-- ---- 3. who is in the chat ------------------------------------------------------------------

-- Is this person in this gym's chat today? Staff and coaches while their role is
-- active; a member while their latest membership here is usable. Names its gym,
-- so the push sender (no signed-in caller) can ask too.
create or replace function in_gym_chat(p_gym uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when r.role::text in ('admin', 'staff', 'trainer') then true
      else coalesce((select membership_is_usable(m.status, m.expiry_date, m.never_expires)
                       from memberships m
                      where m.member_id = p_user and m.gym_id = p_gym
                      order by m.created_at desc limit 1), false)
    end
      from gym_roles r
     where r.gym_id = p_gym and r.user_id = p_user and r.status = 'active'), false);
$$;
revoke all on function in_gym_chat(uuid, uuid) from public, anon, authenticated;

create or replace function gym_chat_role(p_gym uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select r.role::text from gym_roles r where r.gym_id = p_gym and r.user_id = p_user and r.status = 'active';
$$;
revoke all on function gym_chat_role(uuid, uuid) from public, anon, authenticated;

-- May the caller open the chat (read it)?
create or replace function may_use_gym_chat() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() is not null
    and current_gym_id() is not null
    and gym_module_on(current_gym_id(), 'gym_chat')
    and in_gym_chat(current_gym_id(), auth.uid()), false);
$$;
revoke all on function may_use_gym_chat() from public, anon;
grant execute on function may_use_gym_chat() to authenticated;

-- Why the caller cannot post, in words — or NULL when they can.
create or replace function gym_chat_post_block() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_role text;
begin
  if not may_use_gym_chat() then return 'The gym chat is for active members and staff of this gym.'; end if;
  if not gym_writable() then return 'This gym is paused, so the chat is read-only for now.'; end if;
  v_role := gym_chat_role(v_gym, auth.uid());
  if exists (select 1 from gym_chat_people p where p.gym_id = v_gym and p.user_id = auth.uid() and p.silenced_at is not null) then
    return 'The gym has stopped you from posting in the chat. You can still read it.';
  end if;
  if v_role = 'member' and (select s.chat_announce_only from gym_settings s where s.gym_id = v_gym) then
    return 'Only the gym posts here right now. You can still read and react.';
  end if;
  return null;
end;
$$;
revoke all on function gym_chat_post_block() from public, anon;
grant execute on function gym_chat_post_block() to authenticated;

-- Where the chat opens for each role (the owner and desk use the admin app).
create or replace function gym_chat_url(p_role text) returns text
language sql immutable as $$
  select case p_role when 'member' then '/member/gym-chat' when 'trainer' then '/trainer/gym-chat' else '/gym-chat' end;
$$;

-- The reactions people may leave.
create or replace function gym_chat_emojis() returns text[]
language sql immutable as $$ select array['👍', '❤️', '😂', '😮', '😢', '🔥', '💪'] $$;
grant execute on function gym_chat_emojis() to authenticated;

-- ---- 4. reading -----------------------------------------------------------------------------

-- One message as the caller sees it.
create or replace function gym_chat_message_json(m gym_chat_messages) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
    'photo', p.photo_url,
    'role', coalesce(gym_chat_role(m.gym_id, m.sender_id), 'left'),
    'body', case when m.removed_at is null then m.body end,
    'photo_path', case when m.removed_at is null then m.photo_path end,
    'mentions', case when m.removed_at is null then to_jsonb(m.mentions) else '[]'::jsonb end,
    'created_at', m.created_at,
    'updated_at', m.updated_at,
    'removed', m.removed_at is not null,
    'removed_by_gym', m.removed_at is not null and m.removed_by is distinct from m.sender_id,
    'pinned', m.pinned_at is not null,
    'mine', m.sender_id = auth.uid(),
    'reply', (select jsonb_build_object(
                 'id', q.id,
                 'name', btrim(coalesce(qp.first_name, '') || ' ' || coalesce(qp.last_name, '')),
                 'body', case when q.removed_at is null then left(coalesce(q.body, ''), 140) end,
                 'photo', q.removed_at is null and q.photo_path is not null,
                 'removed', q.removed_at is not null)
                from gym_chat_messages q left join profiles qp on qp.id = q.sender_id
               where q.id = m.reply_to and q.gym_id = m.gym_id),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'count', x.n, 'mine', x.mine) order by x.first_at)
                             from (select r.emoji, count(*)::int n, bool_or(r.user_id = auth.uid()) mine, min(r.created_at) first_at
                                     from gym_chat_reactions r where r.message_id = m.id group by r.emoji) x), '[]'::jsonb))
    from (select 1) one left join profiles p on p.id = m.sender_id;
$$;
revoke all on function gym_chat_message_json(gym_chat_messages) from public, anon, authenticated;

-- Everything the open chat needs, in one call every few seconds.
--   p_since  : the `now` of the last answer (NULL the first time: the newest 50).
--   p_typing : the caller is typing right now.
--   p_seen   : the chat is on screen — mark it read.
create or replace function gym_chat_sync(p_since timestamptz default null,
                                         p_typing boolean default false,
                                         p_seen boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_me uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_block text;
  v_msgs jsonb;
  v_last gym_chat_messages;
  v_mine gym_chat_people;
  v_typing boolean;
  v_read boolean;
begin
  if not may_use_gym_chat() then
    return jsonb_build_object('open', false,
      'why', case when v_gym is not null and not gym_module_on(v_gym, 'gym_chat')
                  then 'The gym chat is not on at this gym.'
                  else 'The gym chat is for active members and staff of this gym.' end);
  end if;
  v_role := gym_chat_role(v_gym, v_me);
  v_block := gym_chat_post_block();

  -- The caller's own row. Written only when there is something to write — a poll
  -- every three seconds must not be an update every three seconds — and never
  -- while the gym is read-only.
  select * into v_mine from gym_chat_people where gym_id = v_gym and user_id = v_me;
  v_typing := coalesce(p_typing, false) and v_block is null;
  v_read := coalesce(p_seen, false) and (v_mine.last_read_at is null or exists (
              select 1 from gym_chat_messages x where x.gym_id = v_gym and x.created_at > v_mine.last_read_at));
  if gym_writable() and (v_typing or v_read) then
    insert into gym_chat_people (gym_id, user_id, last_read_at, typing_at)
    values (v_gym, v_me, case when v_read then v_now end, case when v_typing then v_now end)
    on conflict (gym_id, user_id) do update
      set last_read_at = case when v_read then v_now else gym_chat_people.last_read_at end,
          typing_at = case when v_typing then v_now else gym_chat_people.typing_at end
    returning * into v_mine;
  end if;

  if p_since is null then
    select coalesce(jsonb_agg(gym_chat_message_json(x) order by x.created_at), '[]'::jsonb) into v_msgs
      from (select * from gym_chat_messages where gym_id = v_gym order by created_at desc limit 50) x;
  else
    select coalesce(jsonb_agg(gym_chat_message_json(x) order by x.created_at), '[]'::jsonb) into v_msgs
      from (select * from gym_chat_messages where gym_id = v_gym and updated_at > p_since - interval '5 seconds'
             order by updated_at desc limit 200) x;
  end if;

  select * into v_last from gym_chat_messages where gym_id = v_gym order by created_at desc limit 1;

  return jsonb_build_object(
    'open', true,
    'now', v_now,
    'me', v_me,
    'role', v_role,
    'can_post', v_block is null,
    'why_not', v_block,
    'can_moderate', v_role in ('admin', 'staff') and gym_writable(),
    'announce_only', coalesce((select s.chat_announce_only from gym_settings s where s.gym_id = v_gym), false),
    'muted', coalesce(v_mine.muted, false),
    'emojis', to_jsonb(gym_chat_emojis()),
    'messages', v_msgs,
    'pinned', coalesce((select jsonb_agg(gym_chat_message_json(x) order by x.pinned_at desc)
                          from gym_chat_messages x
                         where x.gym_id = v_gym and x.pinned_at is not null and x.removed_at is null), '[]'::jsonb),
    'typing', coalesce((select jsonb_agg(split_part(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ' ', 1))
                          from gym_chat_people c join profiles p on p.id = c.user_id
                         where c.gym_id = v_gym and c.user_id <> v_me and c.typing_at > v_now - interval '6 seconds'), '[]'::jsonb),
    -- Who has seen the newest message (not its sender, not the caller).
    'seen', case when v_last.id is null then jsonb_build_object('message_id', null, 'count', 0, 'people', '[]'::jsonb) else
      (select jsonb_build_object('message_id', v_last.id, 'count', count(*)::int,
                'people', coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'photo', s.photo)) filter (where s.rn <= 5), '[]'::jsonb))
         from (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) name, p.photo_url photo,
                      row_number() over (order by c.last_read_at desc) rn
                 from gym_chat_people c join profiles p on p.id = c.user_id
                where c.gym_id = v_gym and c.last_read_at >= v_last.created_at
                  and c.user_id <> v_last.sender_id and c.user_id <> v_me) s) end,
    'unread', case when p_seen then 0 else
      (select count(*)::int from gym_chat_messages x
        where x.gym_id = v_gym and x.sender_id <> v_me and x.removed_at is null
          and x.created_at > coalesce(v_mine.last_read_at, '-infinity')) end);
end;
$$;
revoke all on function gym_chat_sync(timestamptz, boolean, boolean) from public, anon;
grant execute on function gym_chat_sync(timestamptz, boolean, boolean) to authenticated;

-- Older messages, for scrolling up.
create or replace function gym_chat_history(p_before timestamptz, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not may_use_gym_chat() then '[]'::jsonb else
    coalesce((select jsonb_agg(gym_chat_message_json(x) order by x.created_at)
                from (select * from gym_chat_messages
                       where gym_id = current_gym_id() and created_at < p_before
                       order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) x), '[]'::jsonb) end;
$$;
revoke all on function gym_chat_history(timestamptz, int) from public, anon;
grant execute on function gym_chat_history(timestamptz, int) to authenticated;

-- The badge: messages from others since the caller last looked. 0 when the chat is not theirs.
create or replace function gym_chat_unread() returns int
language sql stable security definer set search_path = public as $$
  select case when not may_use_gym_chat() then 0 else
    (select least(count(*), 99)::int from gym_chat_messages x
      where x.gym_id = current_gym_id() and x.sender_id <> auth.uid() and x.removed_at is null
        and x.created_at > coalesce((select c.last_read_at from gym_chat_people c
                                      where c.gym_id = current_gym_id() and c.user_id = auth.uid()), '-infinity')) end;
$$;
revoke all on function gym_chat_unread() from public, anon;
grant execute on function gym_chat_unread() to authenticated;

-- Who is in the chat — for @mentions and the people list. `silenced` only for the owner and desk.
create or replace function gym_chat_members()
returns table (user_id uuid, name text, photo text, role text, silenced boolean, silenced_reason text)
language sql stable security definer set search_path = public as $$
  select r.user_id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), p.photo_url, r.role::text,
         case when storage_role_here() in ('admin', 'staff') then c.silenced_at is not null else false end,
         case when storage_role_here() in ('admin', 'staff') then c.silenced_reason end
    from gym_roles r
    join profiles p on p.id = r.user_id
    left join gym_chat_people c on c.gym_id = r.gym_id and c.user_id = r.user_id
   where may_use_gym_chat()
     and r.gym_id = current_gym_id() and r.status = 'active'
     and in_gym_chat(r.gym_id, r.user_id)
   order by case r.role::text when 'admin' then 0 when 'staff' then 1 when 'trainer' then 2 else 3 end, 2;
$$;
revoke all on function gym_chat_members() from public, anon;
grant execute on function gym_chat_members() to authenticated;

-- ---- 5. writing -----------------------------------------------------------------------------

-- Send a message. p_id comes from the phone, so a resend after a lost reply is the
-- same message, not a second one.
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
  begin
    if to_regproc('net.http_post') is not null then
      perform net.http_post(
        url := 'https://ifwxtekyjgeljerslnzr.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'apikey', 'sb_publishable_UvVt5N-d4PnQlruDuQ4JVA_0qpq4lug'),
        body := jsonb_build_object('chatMessageId', v_row.id));
    end if;
  exception when others then
    null;  -- the alert is a courtesy; the message must never fail because of it
  end;

  return gym_chat_message_json(v_row);
end;
$$;
revoke all on function gym_chat_send(uuid, text, text, uuid, uuid[]) from public, anon;
grant execute on function gym_chat_send(uuid, text, text, uuid, uuid[]) to authenticated;

-- For send-push (service role only): claims the message once, while fresh, and
-- answers who to tell — everyone in the chat except the sender, the people who
-- muted it, and the people mentioned (their Inbox row already pushed).
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
       and in_gym_chat(m.gym_id, r.user_id);
end;
$$;
revoke all on function claim_gym_chat_push(uuid) from public, anon, authenticated;
grant execute on function claim_gym_chat_push(uuid) to service_role;

-- A reaction on, changed, or (p_emoji NULL, or the same one again) off.
create or replace function gym_chat_react(p_message uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_row gym_chat_messages;
begin
  if not may_use_gym_chat() or not gym_writable() then
    raise exception 'The gym chat is for active members and staff of this gym.' using errcode = '42501';
  end if;
  select * into v_row from gym_chat_messages where id = p_message and gym_id = v_gym and removed_at is null;
  if v_row.id is null then raise exception 'That message is not in this chat.'; end if;
  if p_emoji is not null and not (p_emoji = any (gym_chat_emojis())) then
    raise exception 'That reaction is not one of the chat''s.';
  end if;
  if p_emoji is null or exists (select 1 from gym_chat_reactions where message_id = p_message and user_id = auth.uid() and emoji = p_emoji) then
    delete from gym_chat_reactions where message_id = p_message and user_id = auth.uid();
  else
    insert into gym_chat_reactions (gym_id, message_id, user_id, emoji) values (v_gym, p_message, auth.uid(), p_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
  update gym_chat_messages set updated_at = clock_timestamp() where id = p_message returning * into v_row;
  return gym_chat_message_json(v_row);
end;
$$;
revoke all on function gym_chat_react(uuid, text) from public, anon;
grant execute on function gym_chat_react(uuid, text) to authenticated;

-- Mute or unmute the chat's alerts for yourself.
create or replace function gym_chat_set_muted(p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not may_use_gym_chat() or not gym_writable() then
    raise exception 'The gym chat is for active members and staff of this gym.' using errcode = '42501';
  end if;
  insert into gym_chat_people (gym_id, user_id, muted) values (current_gym_id(), auth.uid(), coalesce(p_muted, false))
  on conflict (gym_id, user_id) do update set muted = excluded.muted;
end;
$$;
revoke all on function gym_chat_set_muted(boolean) from public, anon;
grant execute on function gym_chat_set_muted(boolean) to authenticated;

-- ---- 6. moderation --------------------------------------------------------------------------

-- Remove a message: your own, or — the owner and the desk, with a reason the author
-- is told — anyone's. The words and the photo go; "Message removed" stays in place.
-- Returns the photo's path so the caller can delete the file.
create or replace function gym_chat_remove(p_message uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_me uuid := auth.uid();
  v_row gym_chat_messages;
  v_staff boolean;
  v_path text;
begin
  if not may_use_gym_chat() or not gym_writable() then
    raise exception 'The gym chat is for active members and staff of this gym.' using errcode = '42501';
  end if;
  select * into v_row from gym_chat_messages where id = p_message and gym_id = v_gym;
  if v_row.id is null then raise exception 'That message is not in this chat.'; end if;
  if v_row.removed_at is not null then return null; end if;
  v_staff := gym_chat_role(v_gym, v_me) in ('admin', 'staff');
  if v_row.sender_id <> v_me then
    if not v_staff then
      raise exception 'You can remove your own messages. The owner and front desk remove others.' using errcode = '42501';
    end if;
    if coalesce(btrim(p_reason), '') = '' or length(p_reason) > 200 then
      raise exception 'Say in a few words why it is removed (up to 200 characters). The person is told.';
    end if;
  end if;
  v_path := v_row.photo_path;
  update gym_chat_messages
     set removed_at = now(), removed_by = v_me,
         removed_reason = case when v_row.sender_id <> v_me then btrim(p_reason) end,
         body = null, photo_path = null, mentions = '{}', pinned_at = null, pinned_by = null,
         updated_at = clock_timestamp()
   where id = p_message;
  delete from gym_chat_reactions where message_id = p_message;
  update gym_chat_reports set status = 'removed', resolved_at = now(), resolved_by = v_me
   where message_id = p_message and status = 'open';
  if v_row.sender_id <> v_me then
    perform notify_once(v_row.sender_id, 'system', 'A message of yours was removed from the gym chat',
      'The gym said: ' || btrim(p_reason), gym_chat_url(gym_chat_role(v_gym, v_row.sender_id)),
      'gymchat:removed:' || p_message, v_gym);
    perform log_activity('chat.removed', 'gym_chat_messages', p_message, v_row.sender_id,
      'Removed a message from the gym chat', jsonb_build_object('reason', btrim(p_reason)), v_gym);
  end if;
  return v_path;
end;
$$;
revoke all on function gym_chat_remove(uuid, text) from public, anon;
grant execute on function gym_chat_remove(uuid, text) to authenticated;

-- Pin or unpin: the owner and the desk. Three pins at most.
create or replace function gym_chat_pin(p_message uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if not may_use_gym_chat() or not gym_writable() or gym_chat_role(v_gym, auth.uid()) not in ('admin', 'staff') then
    raise exception 'The owner and front desk pin messages.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_chat_messages where id = p_message and gym_id = v_gym and removed_at is null) then
    raise exception 'That message is not in this chat.';
  end if;
  if coalesce(p_pinned, false) then
    if (select count(*) from gym_chat_messages where gym_id = v_gym and pinned_at is not null and id <> p_message) >= 3 then
      raise exception 'Three messages are pinned already. Unpin one first.';
    end if;
    update gym_chat_messages set pinned_at = coalesce(pinned_at, now()), pinned_by = auth.uid(), updated_at = clock_timestamp()
     where id = p_message;
  else
    update gym_chat_messages set pinned_at = null, pinned_by = null, updated_at = clock_timestamp() where id = p_message;
  end if;
end;
$$;
revoke all on function gym_chat_pin(uuid, boolean) from public, anon;
grant execute on function gym_chat_pin(uuid, boolean) to authenticated;

-- Stop one person posting (they still read), or let them post again. The owner and
-- the desk; never against the owner or the desk. The person is told, with the reason.
create or replace function gym_chat_silence(p_user uuid, p_silenced boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_target text;
  v_name text;
begin
  if not may_use_gym_chat() or not gym_writable() or gym_chat_role(v_gym, auth.uid()) not in ('admin', 'staff') then
    raise exception 'The owner and front desk decide who may post.' using errcode = '42501';
  end if;
  v_target := gym_chat_role(v_gym, p_user);
  if v_target is null then raise exception 'That person is not in this gym.'; end if;
  if v_target in ('admin', 'staff') then raise exception 'The owner and the front desk cannot be stopped from posting.'; end if;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = p_user;
  if coalesce(p_silenced, false) then
    if coalesce(btrim(p_reason), '') = '' or length(p_reason) > 200 then
      raise exception 'Say in a few words why (up to 200 characters). The person is told.';
    end if;
    insert into gym_chat_people (gym_id, user_id, silenced_at, silenced_by, silenced_reason)
    values (v_gym, p_user, now(), auth.uid(), btrim(p_reason))
    on conflict (gym_id, user_id) do update
      set silenced_at = now(), silenced_by = auth.uid(), silenced_reason = excluded.silenced_reason, typing_at = null;
    perform notify_once(p_user, 'system', 'You can no longer post in the gym chat',
      'The gym said: ' || btrim(p_reason) || ' You can still read it.', gym_chat_url(v_target),
      'gymchat:silenced:' || p_user || ':' || floor(extract(epoch from now())), v_gym);
    perform log_activity('chat.silenced', 'profiles', p_user, p_user,
      coalesce(nullif(v_name, ''), 'Someone') || ' was stopped from posting in the gym chat',
      jsonb_build_object('reason', btrim(p_reason)), v_gym);
  else
    update gym_chat_people set silenced_at = null, silenced_by = null, silenced_reason = null
     where gym_id = v_gym and user_id = p_user and silenced_at is not null;
    if found then
      perform notify_once(p_user, 'system', 'You can post in the gym chat again', 'The gym has let you post again.', gym_chat_url(v_target),
        'gymchat:unsilenced:' || p_user || ':' || floor(extract(epoch from now())), v_gym);
      perform log_activity('chat.unsilenced', 'profiles', p_user, p_user,
        coalesce(nullif(v_name, ''), 'Someone') || ' may post in the gym chat again', null, v_gym);
    end if;
  end if;
end;
$$;
revoke all on function gym_chat_silence(uuid, boolean, text) from public, anon;
grant execute on function gym_chat_silence(uuid, boolean, text) to authenticated;

-- Announcements-only, on or off: the owner.
create or replace function set_gym_chat_announce_only(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not gym_writable() or gym_chat_role(v_gym, auth.uid()) is distinct from 'admin' then
    raise exception 'The gym''s owner decides who posts in the chat.' using errcode = '42501';
  end if;
  update gym_settings set chat_announce_only = coalesce(p_on, false) where gym_id = v_gym;
  perform log_activity('chat.mode', 'gym_settings', null, null,
    case when coalesce(p_on, false) then 'The gym chat is announcements-only' else 'Everyone may post in the gym chat again' end,
    null, v_gym);
end;
$$;
revoke all on function set_gym_chat_announce_only(boolean) from public, anon;
grant execute on function set_gym_chat_announce_only(boolean) to authenticated;

-- Report someone else's message, once. The owner and desk find it in their list.
create or replace function gym_chat_report(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_row gym_chat_messages;
begin
  if not may_use_gym_chat() or not gym_writable() then
    raise exception 'The gym chat is for active members and staff of this gym.' using errcode = '42501';
  end if;
  select * into v_row from gym_chat_messages where id = p_message and gym_id = v_gym and removed_at is null;
  if v_row.id is null then raise exception 'That message is not in this chat.'; end if;
  if v_row.sender_id = auth.uid() then raise exception 'That is your own message — you can remove it.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(p_reason) > 300 then
    raise exception 'Say in a few words what is wrong with it (up to 300 characters).';
  end if;
  if exists (select 1 from gym_chat_reports where message_id = p_message and reporter_id = auth.uid()) then
    raise exception 'You already reported that message. The gym will look at it.';
  end if;
  insert into gym_chat_reports (gym_id, message_id, reporter_id, reason) values (v_gym, p_message, auth.uid(), btrim(p_reason));
end;
$$;
revoke all on function gym_chat_report(uuid, text) from public, anon;
grant execute on function gym_chat_report(uuid, text) to authenticated;

-- The owner's and desk's list of open reports.
create or replace function gym_chat_open_reports()
returns table (report_id uuid, message_id uuid, reported_at timestamptz, reason text, reporter text,
               sender_id uuid, sender text, body text, has_photo boolean, sent_at timestamptz, reports int)
language sql stable security definer set search_path = public as $$
  select q.id, m.id, q.created_at, q.reason,
         btrim(coalesce(rp.first_name, '') || ' ' || coalesce(rp.last_name, '')),
         m.sender_id, btrim(coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')),
         m.body, m.photo_path is not null, m.created_at,
         (select count(*)::int from gym_chat_reports z where z.message_id = m.id and z.status = 'open')
    from gym_chat_reports q
    join gym_chat_messages m on m.id = q.message_id
    left join profiles rp on rp.id = q.reporter_id
    left join profiles sp on sp.id = m.sender_id
   where q.gym_id = current_gym_id() and q.status = 'open'
     and auth.uid() is not null
     and gym_chat_role(current_gym_id(), auth.uid()) in ('admin', 'staff')
   order by q.created_at;
$$;
revoke all on function gym_chat_open_reports() from public, anon;
grant execute on function gym_chat_open_reports() to authenticated;

-- Close a report without removing the message (removing one closes its reports itself).
create or replace function gym_chat_dismiss_report(p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not gym_writable()
     or gym_chat_role(current_gym_id(), auth.uid()) not in ('admin', 'staff') then
    raise exception 'The owner and front desk close reports.' using errcode = '42501';
  end if;
  update gym_chat_reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
   where id = p_report and gym_id = current_gym_id() and status = 'open';
  if not found then raise exception 'That report is not open in this gym.'; end if;
end;
$$;
revoke all on function gym_chat_dismiss_report(uuid) from public, anon;
grant execute on function gym_chat_dismiss_report(uuid) to authenticated;

-- ---- 7. photos ------------------------------------------------------------------------------
-- Private: a chat photo is read only by people in that gym's chat (signed addresses).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- gyms/<gym>/chat/<user>/<file>
create or replace function may_read_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'chat'
    and may_use_gym_chat(), false);
$$;
create or replace function may_write_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'chat'
    and split_part(p_name, '/', 4) = auth.uid()::text
    and gym_chat_post_block() is null, false);
$$;
-- Your own file, or — the owner and desk — any file of the gym's chat.
create or replace function may_delete_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'chat'
    and gym_writable()
    and (split_part(p_name, '/', 4) = auth.uid()::text or storage_role_here() in ('admin', 'staff')), false);
$$;
revoke all on function may_read_chat_file(text), may_write_chat_file(text), may_delete_chat_file(text) from public, anon;
grant execute on function may_read_chat_file(text), may_write_chat_file(text), may_delete_chat_file(text) to authenticated;

drop policy if exists chat_read   on storage.objects;
drop policy if exists chat_insert on storage.objects;
drop policy if exists chat_delete on storage.objects;
create policy chat_read on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.may_read_chat_file(name));
create policy chat_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.may_write_chat_file(name));
create policy chat_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and public.may_delete_chat_file(name));

-- ---- 8. a deleted account takes its chat and its reels with it -----------------------------
-- 0225's erase_account() ends by renaming the profile to "Deleted member". This
-- rides on that moment (a trigger, so 0225's long function is not rewritten):
-- the person's chat messages, reactions, reports and likes go, the reels they
-- posted go, and the files are queued for the erase-accounts function.
create or replace function trg_erase_chat_and_reels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.erasure_files') is not null then
    insert into erasure_files (person, bucket, path)
      select new.id, 'chat', m.photo_path from gym_chat_messages m where m.sender_id = new.id and m.photo_path is not null;
    insert into erasure_files (person, bucket, path)
      select new.id, 'reels', u from gym_reels r, unnest(array[r.video_path, r.cover_path]) u
       where r.created_by = new.id and u is not null;
  end if;
  delete from gym_chat_reactions where user_id = new.id;
  delete from gym_chat_reports where reporter_id = new.id;
  delete from gym_chat_messages where sender_id = new.id;      -- reactions and reports on them go too
  delete from gym_chat_people where user_id = new.id;
  delete from reel_likes where user_id = new.id;
  delete from gym_reels where created_by = new.id;             -- likes on them go too
  return new;
end;
$$;
revoke all on function trg_erase_chat_and_reels() from public, anon, authenticated;
drop trigger if exists erase_chat_and_reels on profiles;
create trigger erase_chat_and_reels after update of email on profiles
  for each row when (new.email like 'deleted+%@deleted.invalid' and old.email is distinct from new.email)
  execute function trg_erase_chat_and_reels();

-- ---- 9. tenancy -------------------------------------------------------------------------------
-- The tenancy register (0245's list, plus the four tables above).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments',
    -- 0245: reels.
    'gym_reels','reel_likes',
    -- 0246: the gym chat.
    'gym_chat_messages','gym_chat_reactions','gym_chat_people','gym_chat_reports']::text[]
$$;

create or replace function migration_0246_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0246_applied() to anon, authenticated;
