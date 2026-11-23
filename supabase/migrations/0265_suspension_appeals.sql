-- 0265 — appealing a Core Fitness suspension (owner, 2026-11-23).
--
-- 0226 lets the platform suspend one person across every gym for system-wide abuse. This adds the other half: the
-- person can answer it, once, and a platform admin reviews the answer.
--
--   * ONCE PER SUSPENSION: one appeal for each platform_suspensions row (a unique index). If the platform lifts a
--     suspension and later suspends the same person again, that new suspension gets its own appeal.
--   * WHAT THEY SEND: a statement (20 to 2000 characters) and, if they like, one photo or PDF in the private
--     'appeals' bucket under appeals/<their id>/…, readable only by them and the platform.
--   * WHO DECIDES: any platform admin. Upheld keeps the suspension; lifted lifts it through 0226's own
--     platform_lift_suspension(), so the gyms are told exactly as before. The person reads the decision on their suspension screen.
--   * GYMS ARE NOT TOLD an appeal exists: they keep seeing "Suspended by Core Fitness" until the outcome.
--   * NO POLICY on the table: definer functions only, like 0226.
-- Needs 0226. Safe to paste again.

create table if not exists platform_appeals (
  id            uuid primary key default gen_random_uuid(),
  suspension_id uuid not null references platform_suspensions(id) on delete cascade,
  person        uuid not null references profiles(id) on delete cascade,
  statement     text not null check (length(btrim(statement)) between 20 and 2000),
  attachment    text check (attachment is null or length(attachment) <= 300),
  status        text not null default 'pending' check (status in ('pending', 'upheld', 'lifted')),
  decision_note text check (decision_note is null or length(btrim(decision_note)) between 3 and 1000),
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_platform_appeals_once on platform_appeals(suspension_id);
create index if not exists ix_platform_appeals_pending on platform_appeals(created_at) where status = 'pending';
alter table platform_appeals enable row level security;   -- no policy: definer functions only

-- ---- the evidence: one private file, the person's own folder ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appeals', 'appeals', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- appeals/<person>/<file>: written by that person while suspended with no appeal sent; read by them and the platform.
drop policy if exists appeals_files_insert on storage.objects;
drop policy if exists appeals_files_read   on storage.objects;
create policy appeals_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'appeals'
              and split_part(name, '/', 1) = auth.uid()::text
              and public.is_platform_suspended(auth.uid()));
create policy appeals_files_read on storage.objects for select to authenticated
  using (bucket_id = 'appeals'
         and (public.is_platform_admin() or split_part(name, '/', 1) = auth.uid()::text));

-- ---- the person: what they see, and sending the appeal ----
/** 0226's answer plus the appeal: whether one may be sent, and where it stands. */
create or replace function my_platform_suspension() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reason', s.reason, 'suspended_at', s.suspended_at,
           'appeal', (select jsonb_build_object('status', a.status, 'sent_at', a.created_at,
                                                'decision_note', a.decision_note, 'decided_at', a.decided_at)
                        from platform_appeals a where a.suspension_id = s.id))
    from platform_suspensions s where s.person = auth.uid() and s.lifted_at is null;
$$;
revoke all on function my_platform_suspension() from public, anon;
grant execute on function my_platform_suspension() to authenticated;

create or replace function appeal_my_suspension(p_statement text, p_attachment text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sus uuid; v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id into v_sus from platform_suspensions where person = auth.uid() and lifted_at is null;
  if v_sus is null then raise exception 'Your account is not suspended.'; end if;
  if exists (select 1 from platform_appeals where suspension_id = v_sus) then
    raise exception 'You have already appealed this suspension. Core Fitness answers each appeal once.';
  end if;
  if coalesce(length(btrim(p_statement)), 0) < 20 then raise exception 'Say what happened in at least 20 characters.'; end if;
  if length(btrim(p_statement)) > 2000 then raise exception 'Keep it under 2000 characters.'; end if;
  if p_attachment is not null and split_part(p_attachment, '/', 1) <> auth.uid()::text then
    raise exception 'That file is not in your own folder.';
  end if;
  insert into platform_appeals (suspension_id, person, statement, attachment)
  values (v_sus, auth.uid(), btrim(p_statement), nullif(btrim(coalesce(p_attachment, '')), '')) returning id into v_id;
  v_name := display_name_of(auth.uid());
  perform platform_log(null, 'account.appealed', v_name || ' appealed their suspension', jsonb_build_object('person', auth.uid(), 'appeal', v_id));
  return v_id;
end;
$$;
revoke all on function appeal_my_suspension(text, text) from public, anon;
grant execute on function appeal_my_suspension(text, text) to authenticated;

-- ---- the platform: the queue and the decision ----
create or replace function platform_appeals_list(p_status text default 'pending')
returns table (id uuid, person uuid, name text, email text, reason text, suspended_at timestamptz, statement text,
               attachment text, status text, decision_note text, decided_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.person, display_name_of(a.person), u.email::text, s.reason, s.suspended_at, a.statement,
         a.attachment, a.status, a.decision_note, a.decided_at, a.created_at
    from platform_appeals a
    join platform_suspensions s on s.id = a.suspension_id
    left join auth.users u on u.id = a.person
   where is_platform_admin() and (p_status = 'all' or a.status = p_status)
   order by case when a.status = 'pending' then 0 else 1 end, a.created_at;
$$;
revoke all on function platform_appeals_list(text) from public, anon;
grant execute on function platform_appeals_list(text) to authenticated;

create or replace function platform_decide_appeal(p_appeal uuid, p_lift boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a platform_appeals;
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness reviews an appeal.' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_note)), 0) < 3 then raise exception 'Say why: the person reads it.'; end if;
  select * into a from platform_appeals where id = p_appeal for update;
  if a.id is null then raise exception 'That appeal does not exist.'; end if;
  if a.status <> 'pending' then raise exception 'That appeal was already decided.'; end if;
  update platform_appeals set status = case when p_lift then 'lifted' else 'upheld' end,
         decision_note = btrim(p_note), decided_by = auth.uid(), decided_at = now()
   where id = p_appeal;
  if p_lift and exists (select 1 from platform_suspensions where id = a.suspension_id and lifted_at is null) then
    perform platform_lift_suspension(a.person);   -- 0226: lifts it and tells their gyms
  end if;
  -- The person reads the decision where they read the suspension: my_platform_suspension() carries it while upheld,
  -- and a lifted account simply opens again. (No notification: a suspended account has no gym to file it under.)
  perform platform_log(null, case when p_lift then 'account.appeal_lifted' else 'account.appeal_upheld' end,
    display_name_of(a.person) || '''s appeal: ' || btrim(p_note), jsonb_build_object('person', a.person, 'appeal', a.id));
end;
$$;
revoke all on function platform_decide_appeal(uuid, boolean, text) from public, anon;
grant execute on function platform_decide_appeal(uuid, boolean, text) to authenticated;

create or replace function migration_0265_applied() returns boolean language sql stable as $$ select true $$;
