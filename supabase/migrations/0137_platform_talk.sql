-- 0137: THE PLATFORM TALKS TO GYM OWNERS — announcements, a support inbox, a bell
--
--   * Announcements: the platform writes one; it shows as a banner in the admin
--     app of every gym it is for (all gyms, or one plan), between its dates, to
--     the owner and desk — never members. Each person can dismiss it.
--   * Support: a gym's owner or desk opens a ticket from the admin app; the
--     platform replies; both sides see the thread. A ticket is between that gym
--     and the platform — no other gym, and none of the gym's members or coaches.
--   * The bell: what is waiting for the platform owner, in one call.
--
-- All four tables are the platform's side of the relationship, like
-- support_grants (0113): RLS on, NO policy, every read and write a definer
-- function that checks who is asking. They carry gym_id but are not gym tables.

-- ---- 1. announcements ----------------------------------------------------------------------------

create table if not exists platform_announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 1 and 100),
  body       text not null check (length(btrim(body)) between 1 and 600),
  level      text not null default 'info' check (level in ('info', 'warning')),
  plan_key   text,                       -- NULL = every gym; else only gyms on this plan
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create table if not exists announcement_dismissals (
  announcement_id uuid not null references platform_announcements(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table platform_announcements  enable row level security;
alter table announcement_dismissals enable row level security;

create or replace function save_announcement(p_id uuid, p_title text, p_body text, p_level text,
  p_plan_key text, p_starts_at timestamptz, p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_platform_admin() then raise exception 'Only the platform announces.' using errcode = '42501'; end if;
  if p_plan_key is not null and not exists (select 1 from platform_plans where key = p_plan_key) then
    raise exception 'There is no plan called "%".', p_plan_key;
  end if;
  if p_id is null then
    insert into platform_announcements (title, body, level, plan_key, starts_at, ends_at)
    values (btrim(p_title), btrim(p_body), coalesce(p_level, 'info'), nullif(p_plan_key, ''), coalesce(p_starts_at, now()), p_ends_at)
    returning id into v_id;
  else
    update platform_announcements set title = btrim(p_title), body = btrim(p_body), level = coalesce(p_level, 'info'),
           plan_key = nullif(p_plan_key, ''), starts_at = coalesce(p_starts_at, starts_at), ends_at = p_ends_at
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'That announcement is gone.'; end if;
  end if;
  perform platform_log(null, 'announcement.saved', 'Announced: ' || btrim(p_title), jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

create or replace function end_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform announces.' using errcode = '42501'; end if;
  update platform_announcements set ends_at = now() where id = p_id and (ends_at is null or ends_at > now());
end;
$$;

create or replace function platform_announcements_list()
returns table (id uuid, title text, body text, level text, plan_key text, starts_at timestamptz, ends_at timestamptz,
               live boolean, gyms_reached int, dismissed int)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.level, a.plan_key, a.starts_at, a.ends_at,
         a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()),
         (select count(*)::int from gyms g where g.status = 'active' and (a.plan_key is null or g.plan = a.plan_key)),
         (select count(*)::int from announcement_dismissals d where d.announcement_id = a.id)
    from platform_announcements a
   where is_platform_admin()
   order by a.created_at desc;
$$;

-- What the admin app's banner shows: live, for this gym's plan, not dismissed.
create or replace function my_announcements()
returns table (id uuid, title text, body text, level text, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.level, a.starts_at
    from platform_announcements a
    join gyms g on g.id = current_gym_id()
   where coalesce(storage_role_here(), '') in ('admin', 'staff')
     and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     and (a.plan_key is null or a.plan_key = g.plan)
     and not exists (select 1 from announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid())
   order by a.level = 'warning' desc, a.starts_at desc;
$$;

create or replace function dismiss_announcement(p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into announcement_dismissals (announcement_id, user_id)
  select p_id, auth.uid() where auth.uid() is not null and exists (select 1 from platform_announcements where id = p_id)
  on conflict do nothing;
$$;

-- ---- 2. support tickets --------------------------------------------------------------------------

create table if not exists support_tickets (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references gyms(id) on delete cascade,
  opened_by        uuid not null references profiles(id),
  subject          text not null check (length(btrim(subject)) between 1 and 120),
  status           text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_from        text not null default 'gym' check (last_from in ('gym', 'platform')),
  platform_read_at timestamptz,
  gym_read_at      timestamptz
);
create table if not exists support_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references support_tickets(id) on delete cascade,
  author_id     uuid not null references profiles(id),
  from_platform boolean not null,
  body          text not null check (length(btrim(body)) between 1 and 4000),
  created_at    timestamptz not null default now()
);
create index if not exists support_tickets_gym_idx on support_tickets (gym_id, updated_at desc);
create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);
alter table support_tickets  enable row level security;
alter table support_messages enable row level security;

-- The gym side: its owner or desk, in its current gym.
create or replace function open_support_ticket(p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'The owner or the front desk contacts Core Fitness support.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Say what you need help with.'; end if;
  insert into support_tickets (gym_id, opened_by, subject, gym_read_at) values (v_gym, auth.uid(), btrim(p_subject), now())
  returning id into v_id;
  insert into support_messages (ticket_id, author_id, from_platform, body) values (v_id, auth.uid(), false, btrim(p_body));
  return v_id;
end;
$$;

create or replace function reply_support_ticket(p_ticket uuid, p_body text, p_close boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; v_platform boolean := is_platform_admin(); v_name text;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null then raise exception 'That ticket is gone.'; end if;
  if not v_platform and not (t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')) then
    raise exception 'That ticket is not yours.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Write a reply first.'; end if;
  insert into support_messages (ticket_id, author_id, from_platform, body) values (t.id, auth.uid(), v_platform, btrim(p_body));
  update support_tickets set updated_at = now(), last_from = case when v_platform then 'platform' else 'gym' end,
         status = case when p_close then 'closed' when v_platform then 'answered' else 'open' end,
         platform_read_at = case when v_platform then now() else platform_read_at end,
         gym_read_at = case when v_platform then gym_read_at else now() end
   where id = t.id;
  if v_platform then
    -- Tell whoever opened it, in their gym.
    perform notify_once(t.opened_by, 'system', 'Core Fitness support replied',
      left(t.subject, 60) || ': ' || left(btrim(p_body), 100), '/support',
      'support:' || t.id || ':' || extract(epoch from now())::bigint, t.gym_id);
  end if;
end;
$$;

create or replace function set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null then raise exception 'That ticket is gone.'; end if;
  if not is_platform_admin() and not (t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')) then
    raise exception 'That ticket is not yours.' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed') then raise exception 'A ticket is open or closed.'; end if;
  update support_tickets set status = p_status, updated_at = now() where id = t.id;
end;
$$;

-- A gym's own tickets.
create or replace function my_support_tickets()
returns table (id uuid, subject text, status text, created_at timestamptz, updated_at timestamptz,
               last_from text, unread boolean, messages int)
language sql stable security definer set search_path = public as $$
  select t.id, t.subject, t.status, t.created_at, t.updated_at, t.last_from,
         t.last_from = 'platform' and (t.gym_read_at is null or t.gym_read_at < t.updated_at),
         (select count(*)::int from support_messages m where m.ticket_id = t.id)
    from support_tickets t
   where t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff')
   order by t.updated_at desc;
$$;

-- Every ticket, for the platform.
create or replace function platform_support_tickets(p_status text default null)
returns table (id uuid, gym_id uuid, gym_name text, subject text, status text, opened_by_name text,
               created_at timestamptz, updated_at timestamptz, last_from text, unread boolean, messages int)
language sql stable security definer set search_path = public as $$
  select t.id, t.gym_id, g.name, t.subject, t.status, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         t.created_at, t.updated_at, t.last_from,
         t.last_from = 'gym' and (t.platform_read_at is null or t.platform_read_at < t.updated_at),
         (select count(*)::int from support_messages m where m.ticket_id = t.id)
    from support_tickets t join gyms g on g.id = t.gym_id left join profiles p on p.id = t.opened_by
   where is_platform_admin() and (p_status is null or t.status = p_status)
   order by (t.status = 'closed'), t.updated_at desc;
$$;

-- One thread, for either side; reading it marks it read for that side.
create or replace function support_thread(p_ticket uuid)
returns table (id uuid, author_name text, from_platform boolean, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare t support_tickets; v_platform boolean := is_platform_admin();
begin
  select * into t from support_tickets where support_tickets.id = p_ticket;
  if t.id is null or (not v_platform and not (t.gym_id = current_gym_id() and coalesce(storage_role_here(), '') in ('admin', 'staff'))) then
    return;
  end if;
  if v_platform then update support_tickets set platform_read_at = now() where support_tickets.id = t.id;
  else update support_tickets set gym_read_at = now() where support_tickets.id = t.id; end if;
  return query
    select m.id, case when m.from_platform then 'Core Fitness support'
                      else btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) end,
           m.from_platform, m.body, m.created_at
      from support_messages m left join profiles p on p.id = m.author_id
     where m.ticket_id = t.id
     order by m.created_at;
end;
$$;

-- ---- 3. the bell ---------------------------------------------------------------------------------

create or replace function platform_bell()
returns table (kind text, label text, count int, href text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('applications', 'Gyms asking to join',
      (select count(*)::int from gym_applications where status = 'pending'), '/applications'),
    ('support', 'Support messages waiting',
      (select count(*)::int from support_tickets t where t.status <> 'closed' and t.last_from = 'gym'), '/support'),
    ('overdue', 'Gyms past their paid-until date',
      (select count(*)::int from gyms g where g.status = 'active' and g.paid_until < (now() at time zone 'Asia/Manila')::date), '/money'),
    ('crashes', 'Open crash reports',
      (select count(*)::int from client_errors c where c.created_at > now() - interval '14 days'
         and (to_jsonb(c) ->> 'resolved_at') is null), '/platform')
  ) v(kind, label, count, href)
  where is_platform_admin() and v.count > 0;
$$;

revoke all on function save_announcement(uuid, text, text, text, text, timestamptz, timestamptz), end_announcement(uuid),
  platform_announcements_list(), my_announcements(), dismiss_announcement(uuid), open_support_ticket(text, text),
  reply_support_ticket(uuid, text, boolean), set_ticket_status(uuid, text), my_support_tickets(),
  platform_support_tickets(text), support_thread(uuid), platform_bell() from public, anon;
grant execute on function save_announcement(uuid, text, text, text, text, timestamptz, timestamptz), end_announcement(uuid),
  platform_announcements_list(), my_announcements(), dismiss_announcement(uuid), open_support_ticket(text, text),
  reply_support_ticket(uuid, text, boolean), set_ticket_status(uuid, text), my_support_tickets(),
  platform_support_tickets(text), support_thread(uuid), platform_bell() to authenticated;

create or replace function migration_0137_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0137_applied() from public, anon;
grant execute on function migration_0137_applied() to authenticated;
comment on function migration_0137_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0137.sql
