-- 0131: COACH ↔ MEMBER CHAT
--
-- Decisions (conversation, 2026-09-27):
--   * A member chats with the coaches they train with — a class of theirs they
--     booked, or a 1-on-1 (is_my_trainee, 0082/0101) — and a coach with their own
--     trainees. Either may start. Members never message each other.
--   * Text only, with "Seen" (each side's last-read time), a notification for a
--     new message, and a mute per side. Photos come with progress photos, which
--     bring their own private-storage rule.
--   * PRIVATE: only the two people in a conversation read it. The owner and desk
--     cannot (no policy grants them), and the admin app has no screen for it.
--   * No write policy on either table: open, send, read and mute are functions
--     that check who is asking.

create table if not exists conversations (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null default acting_gym_id() references gyms(id),
  member_id        uuid not null references profiles(id) on delete cascade,
  trainer_id       uuid not null references profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  member_read_at   timestamptz,
  trainer_read_at  timestamptz,
  member_muted     boolean not null default false,
  trainer_muted    boolean not null default false,
  unique (gym_id, id),
  unique (gym_id, member_id, trainer_id),
  check (member_id <> trainer_id)
);
create index if not exists conversations_trainer_idx on conversations (gym_id, trainer_id, last_message_at desc);
create index if not exists conversations_member_idx on conversations (gym_id, member_id, last_message_at desc);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null default acting_gym_id() references gyms(id),
  conversation_id uuid not null,
  sender_id       uuid not null references profiles(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, conversation_id) references conversations (gym_id, id) on delete cascade
);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at desc);

alter table conversations enable row level security;
alter table messages      enable row level security;
grant select on conversations, messages to authenticated;

-- The two people in it, and nobody else — not the owner, not the desk.
drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select to authenticated
  using (member_id = auth.uid() or trainer_id = auth.uid());
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (exists (select 1 from conversations c where c.id = conversation_id
                  and (c.member_id = auth.uid() or c.trainer_id = auth.uid())));

-- May these two chat? The member trains with the coach, here.
create or replace function may_chat(p_member uuid, p_trainer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_roles where gym_id = current_gym_id() and user_id = p_trainer
                   and role = 'trainer' and status = 'active')
     and exists (select 1 from gym_roles where gym_id = current_gym_id() and user_id = p_member
                   and role = 'member' and status = 'active')
     and is_my_trainee(p_member, p_trainer);
$$;

-- Opens (or finds) the conversation with someone, from either side.
create or replace function open_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := storage_role_here(); v_member uuid; v_trainer uuid; v_id uuid;
begin
  if v_role = 'member' then v_member := auth.uid(); v_trainer := p_other;
  elsif v_role = 'trainer' then v_member := p_other; v_trainer := auth.uid();
  else raise exception 'Chat is between a member and their coach.' using errcode = '42501';
  end if;
  if not gym_writable() or not may_chat(v_member, v_trainer) then
    raise exception 'You can message a coach you train with, or a member you coach.' using errcode = '42501';
  end if;
  insert into conversations (gym_id, member_id, trainer_id) values (v_gym, v_member, v_trainer)
  on conflict (gym_id, member_id, trainer_id) do nothing;
  select id into v_id from conversations where gym_id = v_gym and member_id = v_member and trainer_id = v_trainer;
  return v_id;
end;
$$;

create or replace function send_message(p_conversation uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c conversations; v_id uuid; v_to uuid; v_muted boolean; v_name text; v_url text;
begin
  select * into c from conversations where id = p_conversation and gym_id = current_gym_id();
  if c.id is null or auth.uid() not in (c.member_id, c.trainer_id) or not gym_writable() then
    raise exception 'That conversation is not yours.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Write a message first.'; end if;
  insert into messages (gym_id, conversation_id, sender_id, body) values (c.gym_id, c.id, auth.uid(), btrim(p_body))
  returning id into v_id;
  -- Sending means you have read everything before it.
  update conversations set last_message_at = now(),
         member_read_at  = case when auth.uid() = member_id  then now() else member_read_at end,
         trainer_read_at = case when auth.uid() = trainer_id then now() else trainer_read_at end
   where id = c.id;
  if auth.uid() = c.member_id then
    v_to := c.trainer_id; v_muted := c.trainer_muted; v_url := '/trainer/messages/' || c.id;
  else
    v_to := c.member_id; v_muted := c.member_muted; v_url := '/member/messages/' || c.id;
  end if;
  select btrim(first_name || ' ' || last_name) into v_name from profiles where id = auth.uid();
  -- One alert per conversation per 10 minutes, however many lines are sent.
  if not v_muted then
    perform notify_once(v_to, 'message', 'Message from ' || coalesce(v_name, 'your coach'), left(btrim(p_body), 140), v_url,
      'chat:' || c.id || ':' || v_to || ':' || floor(extract(epoch from now()) / 600)::bigint, c.gym_id);
  end if;
  return v_id;
end;
$$;

create or replace function mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update conversations
     set member_read_at  = case when auth.uid() = member_id  then now() else member_read_at end,
         trainer_read_at = case when auth.uid() = trainer_id then now() else trainer_read_at end
   where id = p_conversation and gym_id = current_gym_id() and auth.uid() in (member_id, trainer_id);
$$;

create or replace function set_conversation_muted(p_conversation uuid, p_muted boolean) returns void
language sql security definer set search_path = public as $$
  update conversations
     set member_muted  = case when auth.uid() = member_id  then p_muted else member_muted end,
         trainer_muted = case when auth.uid() = trainer_id then p_muted else trainer_muted end
   where id = p_conversation and gym_id = current_gym_id() and auth.uid() in (member_id, trainer_id);
$$;

-- The caller's conversations, newest first, with the other person and unread count.
create or replace function my_conversations()
returns table (id uuid, other_id uuid, other_name text, other_photo text, last_message text, last_from_me boolean,
               last_message_at timestamptz, unread int, muted boolean, other_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, o.id, btrim(o.first_name || ' ' || o.last_name), o.photo_url,
         (select m.body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         (select m.sender_id = auth.uid() from messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         c.last_message_at,
         (select count(*)::int from messages m where m.conversation_id = c.id and m.sender_id <> auth.uid()
            and m.created_at > coalesce(case when auth.uid() = c.member_id then c.member_read_at else c.trainer_read_at end, '-infinity'::timestamptz)),
         case when auth.uid() = c.member_id then c.member_muted else c.trainer_muted end,
         case when auth.uid() = c.member_id then c.trainer_read_at else c.member_read_at end
    from conversations c
    join profiles o on o.id = case when auth.uid() = c.member_id then c.trainer_id else c.member_id end
   where c.gym_id = current_gym_id() and auth.uid() in (c.member_id, c.trainer_id)
   order by c.last_message_at desc nulls last, c.created_at desc;
$$;

-- Who a member may start a chat with: the coaches they train with.
create or replace function my_coaches()
returns table (trainer_id uuid, name text, photo_url text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(p.first_name || ' ' || p.last_name), p.photo_url
    from gym_roles r join profiles p on p.id = r.user_id
   where r.gym_id = current_gym_id() and r.role = 'trainer' and r.status = 'active'
     and storage_role_here() = 'member' and may_chat(auth.uid(), p.id)
   order by 2;
$$;

-- Unread across all conversations, for the badge.
create or replace function unread_messages() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(unread), 0)::int from my_conversations();
$$;

-- ---- tenancy ------------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['conversations', 'messages'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

revoke all on function may_chat(uuid, uuid), open_conversation(uuid), send_message(uuid, text),
  mark_conversation_read(uuid), set_conversation_muted(uuid, boolean), my_conversations(), my_coaches(),
  unread_messages() from public, anon;
grant execute on function may_chat(uuid, uuid), open_conversation(uuid), send_message(uuid, text),
  mark_conversation_read(uuid), set_conversation_muted(uuid, boolean), my_conversations(), my_coaches(),
  unread_messages() to authenticated;

create or replace function migration_0131_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0131_applied() from public, anon;
grant execute on function migration_0131_applied() to authenticated;
comment on function migration_0131_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0131.sql
