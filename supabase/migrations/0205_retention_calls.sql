-- 0205: Retention — the desk logs a phone call (2026-10-20)
--
-- The approved Retention mock-up has "Mark called" beside each member the
-- radar lists, and a "Last contact" column that says how they were reached:
-- a message from the desk, an automatic win-back, or a call. Messages were
-- already recorded in winback_sends (0130: 'manual' and the rule keys); a call
-- had nowhere to go, so two people at the desk could ring the same member.
--
-- A call is a person reaching out, like the desk's message, so it is a
-- 'manual' row — never capped, never caught by the once-a-month index, which
-- winback_sweep()'s ON CONFLICT names by its predicate (`rule_key <> 'manual'`;
-- a new rule_key would have broken that inference) — told apart by `kind`, with
-- an optional note ("will come Thursday"). It counts as contact:
-- retention_radar()'s last_contact already reads max(sent_at) over the table.
-- And a call this month holds back an automatic win-back this month — the
-- member has just heard from a person.

alter table winback_sends add column if not exists kind text not null default 'message' check (kind in ('message', 'call'));
alter table winback_sends add column if not exists note text check (note is null or length(note) <= 200);

create or replace function trg_winback_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rule_key = 'manual' then return new; end if;
  if exists (select 1 from winback_sends s
              where s.gym_id = new.gym_id and s.member_id = new.member_id
                and s.month = new.month and (s.rule_key <> 'manual' or s.kind = 'call')) then
    return null;
  end if;
  -- "We miss you" to someone who was in this week reads as not paying
  -- attention. The lapsed message is about the plan, not the visits, so a
  -- member whose plan ended still hears about renewing.
  if new.rule_key <> 'lapsed' and exists (select 1 from attendance a
              where a.gym_id = new.gym_id and a.member_id = new.member_id
                and a.check_in_time > now() - interval '7 days') then
    return null;
  end if;
  return new;
end;
$$;

-- The desk's "Mark called". Same gate as send_retention_message (0130): the
-- owner and the desk, in a gym that is not read-only, about a member here.
create or replace function log_retention_call(p_member uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  if auth.uid() is null or coalesce(storage_role_here(), '') not in ('admin', 'staff') or not gym_writable() then
    raise exception 'Only the owner and the desk log calls.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_member and role = 'member') then
    raise exception 'That person is not a member here.';
  end if;
  if p_note is not null and length(btrim(p_note)) > 200 then
    raise exception 'Keep the note to 200 characters.';
  end if;
  insert into winback_sends (gym_id, member_id, rule_key, month, sent_by, kind, note)
  values (v_gym, p_member, 'manual', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'), auth.uid(), 'call', nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function log_retention_call(uuid, text) from public, anon;
grant execute on function log_retention_call(uuid, text) to authenticated;

-- Results count messages; a call is not a message, so "came back after a message" stays true.
create or replace function winback_results()
returns table (rule_key text, sent int, came_back int)
language sql stable security definer set search_path = public as $$
  select s.rule_key, count(*)::int,
         count(*) filter (where exists (select 1 from attendance a where a.member_id = s.member_id and a.gym_id = s.gym_id
                                          and a.check_in_time between s.sent_at and s.sent_at + interval '14 days'))::int
    from winback_sends s
   where s.gym_id = current_gym_id() and storage_role_here() in ('admin', 'staff')
     and s.sent_at >= now() - interval '30 days' and s.kind = 'message'
   group by s.rule_key;
$$;

create or replace function migration_0205_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0205_applied() from public, anon;
grant execute on function migration_0205_applied() to authenticated;
comment on function migration_0205_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0205.sql
