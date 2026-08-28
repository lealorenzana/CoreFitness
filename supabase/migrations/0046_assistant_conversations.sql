-- 0046 — the assistant remembers the conversation.
--
-- Until now the chat was `useState<Message[]>([])` and nothing else. Closing the
-- sheet, switching tabs or reloading threw the whole exchange away, and there
-- was no way to keep one thread and start another.
--
-- The obvious shortcut would be `localStorage`, and this project has a standing
-- rule against exactly that: **per-user state never lives in localStorage**. A
-- phone shared between two members would hand the second one the first one's
-- conversation, and the member app already caches a legacy user object in
-- localStorage, so "it is keyed by user" is not a defence — the key is only as
-- trustworthy as the boot that wrote it. These rows are per-account and RLS
-- enforces it.
--
-- ---------------------------------------------------------------------------
-- Owned by the profile, not the member
-- ---------------------------------------------------------------------------
-- `user_id` references `profiles`, not `member_profiles`. The trainer role lives
-- in the same app and has its own assistant (`trainerChatbot.ts`), so keying
-- this to members would have left coaches with a chat that still forgot itself.
--
-- ---------------------------------------------------------------------------
-- Nobody else can read these
-- ---------------------------------------------------------------------------
-- Deliberately owner-only, with **no admin or staff select policy**. Every other
-- table in this schema opens up to the front desk because the front desk has a
-- job to do with the data — take payments, record attendance, approve members.
-- Nobody has a job that requires reading what a member typed to the assistant.
-- A member asking about a body measurement, a missed payment or an injury is
-- writing something they would not post on the noticeboard.
--
-- The audit log records that a conversation was deleted, not what it said.

create table if not exists assistant_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  -- Derived from the first thing the user says. NULL until then, which is what
  -- an opened-but-unused thread looks like.
  title      text,
  created_at timestamptz not null default now(),
  -- Ordering key for the list. Bumped by the trigger below when a message
  -- lands, so "most recent" means most recently *talked to*, not created.
  updated_at timestamptz not null default now()
);

create table if not exists assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  -- 'user' or 'assistant'. Text with a CHECK rather than an enum, matching how
  -- experience_level and training_focus are done on this schema: a fourth value
  -- ('system', if a hybrid ever needs one) is then an ALTER, not a type change.
  role            text not null,
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint assistant_messages_role_valid check (role in ('user', 'assistant'))
);

comment on table assistant_conversations is
  'One assistant thread. Owner-only: no admin or staff policy exists, because '
  'nobody has a job that needs to read what a member typed to the assistant.';

comment on column assistant_messages.role is
  'user | assistant. The assistant is rule-based, so an assistant row is the '
  'deterministic answer that was actually shown - not a model completion.';

-- The list query: this user's threads, most recently used first.
create index if not exists idx_assistant_conversations_user
  on assistant_conversations (user_id, updated_at desc);

-- The thread query: one conversation's messages in order.
create index if not exists idx_assistant_messages_conversation
  on assistant_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------
-- Doing this in the client would mean a second round trip that can fail on its
-- own, leaving a thread that sorts as though it were never used.
create or replace function touch_assistant_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- INSERT trigger: only `new` is assigned. Reading `old` here would abort
  -- every insert, which is how a coalesce(new.x, old.x) broke this schema once.
  update assistant_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_assistant_conversation on assistant_messages;
create trigger trg_touch_assistant_conversation
after insert on assistant_messages
for each row execute function touch_assistant_conversation();

-- ---------------------------------------------------------------------------
-- RLS — owner only, all four verbs
-- ---------------------------------------------------------------------------
alter table assistant_conversations enable row level security;
alter table assistant_messages      enable row level security;

drop policy if exists assistant_conversations_own on assistant_conversations;
create policy assistant_conversations_own on assistant_conversations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages are reached through their conversation. `exists` rather than a join
-- so the policy stays true for INSERT, where there is no row to join from yet.
drop policy if exists assistant_messages_own on assistant_messages;
create policy assistant_messages_own on assistant_messages
  for all
  using (
    exists (select 1 from assistant_conversations c
             where c.id = assistant_messages.conversation_id
               and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from assistant_conversations c
             where c.id = assistant_messages.conversation_id
               and c.user_id = auth.uid())
  );
