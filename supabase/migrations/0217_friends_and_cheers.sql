-- 0217 — friends, wins and cheers (wave 3 of the lively member app, 2026-10-27;
-- spec docs/superpowers/specs/2026-10-27-lively-member-app-design.md, mock-up
-- 2026-10-27-lively-wave3/mock-wave3.html, approved).
--
-- An optional part of the app: OFF for every gym until its owner switches it
-- on (Your app → Celebrations → Friends & cheers). Off, every function below
-- answers nothing and refuses every write.
--
-- Members are friends when both agree. They find each other by name (unless
-- they switched "findable" off), by a friend code (a QR at the gym, never the
-- check-in code), or as people they may know (their squad, the people they
-- invited or who invited them). Friends and squad mates see each other's wins —
-- records, streak milestones, badges, targets reached, challenges finished —
-- unless the member switched "share my wins" off; earned level-ups are not
-- recorded with a date anywhere, so they are not in the feed rather than made
-- up. A cheer is on a win the feed shows the cheerer; the person is notified;
-- their coach sees it on the trainee sheet; the owner and desk see counts only.
--
-- Nothing here is written by the client directly: friendships and cheers have
-- no INSERT/UPDATE/DELETE policy for any role; the SECURITY DEFINER functions
-- are the writers, and each checks the caller.
--
-- Paste after 0216. Then scripts/sql/verify/verify0217.sql.

-- ── Switches ────────────────────────────────────────────────────────────────
alter table gym_settings add column if not exists friends_on boolean not null default false;

alter table member_profiles
  add column if not exists findable    boolean not null default true,
  add column if not exists share_wins  boolean not null default true,
  add column if not exists friend_code text;

-- A friend code per member per gym, unique because a constraint says so
-- (CLAUDE.md), and made by the server — never typed, never chosen.
create or replace function new_friend_code(p_gym uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  loop
    -- Seven letters and digits, without the ones a person misreads (0/O, 1/I/L).
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 7));
    exit when length(c) = 7 and not exists (select 1 from member_profiles where gym_id = p_gym and friend_code = c);
  end loop;
  return c;
end;
$$;
revoke all on function new_friend_code(uuid) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select gym_id, profile_id from member_profiles where friend_code is null loop
    update member_profiles set friend_code = new_friend_code(r.gym_id) where gym_id = r.gym_id and profile_id = r.profile_id;
  end loop;
end
$$;
create unique index if not exists member_profiles_friend_code on member_profiles (gym_id, friend_code);

create or replace function trg_friend_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.friend_code is null then new.friend_code := new_friend_code(new.gym_id); end if;
  elsif new.friend_code is distinct from old.friend_code and get_my_role() is distinct from 'admin' then
    raise exception 'A friend code is made by the gym, not chosen.';
  end if;
  return new;
end;
$$;
drop trigger if exists friend_code on member_profiles;
create trigger friend_code before insert or update of friend_code on member_profiles
  for each row execute function trg_friend_code();

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists friendships (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default current_gym_id() references gyms(id) on delete cascade,
  requester   uuid not null references profiles(id) on delete cascade,
  addressee   uuid not null references profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);
-- One row per pair, whichever of the two asked.
create unique index if not exists friendships_pair on friendships (gym_id, least(requester, addressee), greatest(requester, addressee));
alter table friendships enable row level security;
drop policy if exists friendships_read_own on friendships;
create policy friendships_read_own on friendships for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
grant select on friendships to authenticated;

create table if not exists cheers (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default current_gym_id() references gyms(id) on delete cascade,
  from_member uuid not null references profiles(id) on delete cascade,
  to_member   uuid not null references profiles(id) on delete cascade,
  win_kind    text not null check (win_kind in ('record', 'streak', 'badge', 'target', 'challenge')),
  win_ref     text not null,
  -- The win's words as the feed showed them, so the coach and the bell can say what was cheered.
  win_title   text not null,
  created_at  timestamptz not null default now(),
  unique (gym_id, from_member, win_kind, win_ref)
);
create index if not exists cheers_to on cheers (gym_id, to_member, created_at desc);
alter table cheers enable row level security;
drop policy if exists cheers_read_own on cheers;
create policy cheers_read_own on cheers for select to authenticated
  using (from_member = auth.uid() or to_member = auth.uid());
grant select on cheers to authenticated;

do $$
declare t text;
begin
  foreach t in array array['friendships', 'cheers'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end
$$;

-- ── Helpers (not callable by anyone) ────────────────────────────────────────
create or replace function friends_live(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select friends_on from gym_settings where gym_id = p_gym), false)
$$;
revoke all on function friends_live(uuid) from public, anon, authenticated;

-- An active member of this gym (archived, suspended and pending people are out of every list).
create or replace function is_active_member(p_gym uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_roles where gym_id = p_gym and user_id = p_user and role = 'member' and status = 'active')
$$;
revoke all on function is_active_member(uuid, uuid) from public, anon, authenticated;

create or replace function are_friends(p_gym uuid, a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where gym_id = p_gym and status = 'accepted'
     and ((requester = a and addressee = b) or (requester = b and addressee = a)))
$$;
revoke all on function are_friends(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function in_same_squad(p_gym uuid, a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members x join squad_members y on y.squad_id = x.squad_id
     join squads s on s.id = x.squad_id and s.archived_at is null
    where x.gym_id = p_gym and x.member_id = a and y.member_id = b and x.left_at is null and y.left_at is null)
$$;
revoke all on function in_same_squad(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function referral_pair(p_gym uuid, a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from referrals where gym_id = p_gym
     and ((referrer_id = a and referred_id = b) or (referrer_id = b and referred_id = a)))
$$;
revoke all on function referral_pair(uuid, uuid, uuid) from public, anon, authenticated;

-- The caller, checked: signed in, this gym's friends on, an active member.
create or replace function friends_caller() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not friends_live(v_gym) then raise exception 'Friends are switched off at this gym.'; end if;
  if not is_active_member(v_gym, auth.uid()) then raise exception 'Friends are for members of this gym.'; end if;
  return v_gym;
end;
$$;
revoke all on function friends_caller() from public, anon, authenticated;

-- ── Requests ────────────────────────────────────────────────────────────────
/** Ask someone to be friends. Their request already waiting for you? Then you are friends now. */
create or replace function send_friend_request(p_other uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller(); v_me uuid := auth.uid(); f friendships; v_name text; v_id uuid;
begin
  if p_other is null or p_other = v_me then raise exception 'Pick someone else.'; end if;
  if not is_active_member(v_gym, p_other) then raise exception 'That member is not at this gym.'; end if;
  -- By name only when they are findable; your squad and the people you invited may always ask.
  if not coalesce((select findable from member_profiles where gym_id = v_gym and profile_id = p_other), false)
     and not in_same_squad(v_gym, v_me, p_other) and not referral_pair(v_gym, v_me, p_other) then
    raise exception 'That member can be added with their friend code.';
  end if;
  select * into f from friendships where gym_id = v_gym
     and least(requester, addressee) = least(v_me, p_other) and greatest(requester, addressee) = greatest(v_me, p_other);
  if found then
    if f.status = 'accepted' then return 'friends'; end if;
    if f.addressee = v_me then
      update friendships set status = 'accepted', accepted_at = now() where id = f.id;
      select first_name into v_name from profiles where id = v_me;
      perform notify_once(p_other, 'friends', coalesce(v_name, 'A member') || ' is your friend now',
        'You can see each other''s wins and cheer them on.', '/member/friends', 'friend-ok:' || f.id, v_gym);
      return 'friends';
    end if;
    return 'sent';
  end if;
  insert into friendships (gym_id, requester, addressee) values (v_gym, v_me, p_other) returning id into v_id;
  select first_name into v_name from profiles where id = v_me;
  perform notify_once(p_other, 'friends', coalesce(v_name, 'A member') || ' wants to be your friend',
    'Accept or decline in Friends.', '/member/friends?tab=requests', 'friend-req:' || v_id, v_gym);
  return 'sent';
end;
$$;

/** The same, from a scanned friend code — which reaches a member who is not findable by name. */
create or replace function send_friend_request_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller(); v_other uuid; v_state text; v_name text; v_id uuid; f friendships;
begin
  select profile_id into v_other from member_profiles where gym_id = v_gym and friend_code = upper(btrim(coalesce(p_code, '')));
  if v_other is null or not is_active_member(v_gym, v_other) then raise exception 'That code is not a member of this gym.'; end if;
  if v_other = auth.uid() then raise exception 'That is your own code.'; end if;
  select * into f from friendships where gym_id = v_gym
     and least(requester, addressee) = least(auth.uid(), v_other) and greatest(requester, addressee) = greatest(auth.uid(), v_other);
  if found then
    if f.status = 'accepted' then v_state := 'friends';
    elsif f.addressee = auth.uid() then
      update friendships set status = 'accepted', accepted_at = now() where id = f.id;
      v_state := 'friends';
    else v_state := 'sent'; end if;
  else
    insert into friendships (gym_id, requester, addressee) values (v_gym, auth.uid(), v_other) returning id into v_id;
    select first_name into v_name from profiles where id = auth.uid();
    perform notify_once(v_other, 'friends', coalesce(v_name, 'A member') || ' wants to be your friend',
      'Accept or decline in Friends.', '/member/friends?tab=requests', 'friend-req:' || v_id, v_gym);
    v_state := 'sent';
  end if;
  return jsonb_build_object('state', v_state,
    'name', (select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from profiles where id = v_other));
end;
$$;

/** Accept or decline a request made to you. A decline is silent: the request just goes. */
create or replace function respond_friend_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller(); f friendships; v_name text;
begin
  select * into f from friendships where id = p_id and gym_id = v_gym and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'That request is no longer waiting.'; end if;
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now() where id = f.id;
    select first_name into v_name from profiles where id = auth.uid();
    perform notify_once(f.requester, 'friends', coalesce(v_name, 'A member') || ' accepted your friend request',
      'You can see each other''s wins and cheer them on.', '/member/friends', 'friend-ok:' || f.id, v_gym);
  else
    delete from friendships where id = f.id;
  end if;
end;
$$;

/** Unfriend, or take back a request you sent. Nobody is told. */
create or replace function remove_friend(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller();
begin
  delete from friendships where gym_id = v_gym
     and least(requester, addressee) = least(auth.uid(), p_other) and greatest(requester, addressee) = greatest(auth.uid(), p_other)
     and (status = 'accepted' or requester = auth.uid());
end;
$$;

-- ── Lists ───────────────────────────────────────────────────────────────────
/** Your friends: who, since when, and the streak they are on. */
create or replace function my_friends()
returns table (member_id uuid, first_name text, last_name text, photo_url text, since timestamptz, streak_weeks int, in_squad boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) then return; end if;
  return query
  select o.id, p.first_name, p.last_name, p.photo_url, f.accepted_at,
         coalesce((streak_card(o.id, v_gym) ->> 'current')::int, 0), in_same_squad(v_gym, auth.uid(), o.id)
    from friendships f
    cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as id) o
    join profiles p on p.id = o.id
   where f.gym_id = v_gym and f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
     and is_active_member(v_gym, o.id)
   order by p.first_name, p.last_name;
end;
$$;

/** Requests waiting for you, and the ones you sent. */
create or replace function my_friend_requests()
returns table (request_id uuid, member_id uuid, first_name text, last_name text, photo_url text, direction text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) then return; end if;
  return query
  select f.id, o.id, p.first_name, p.last_name, p.photo_url,
         case when f.addressee = auth.uid() then 'in' else 'out' end,
         case when in_same_squad(v_gym, auth.uid(), o.id) then 'squad' when referral_pair(v_gym, auth.uid(), o.id) then 'invited' end,
         f.created_at
    from friendships f
    cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as id) o
    join profiles p on p.id = o.id
   where f.gym_id = v_gym and f.status = 'pending' and auth.uid() in (f.requester, f.addressee)
     and is_active_member(v_gym, o.id)
   order by f.created_at desc;
end;
$$;

-- Where you stand with someone: none, sent, incoming or friends.
create or replace function friend_state(p_gym uuid, p_me uuid, p_other uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when status = 'accepted' then 'friends' when requester = p_me then 'sent' else 'incoming' end
     from friendships where gym_id = p_gym
      and least(requester, addressee) = least(p_me, p_other) and greatest(requester, addressee) = greatest(p_me, p_other)), 'none')
$$;
revoke all on function friend_state(uuid, uuid, uuid) from public, anon, authenticated;

/** Members of your gym by name — only those who are findable. Two letters at least. */
create or replace function find_members(p_query text)
returns table (member_id uuid, first_name text, last_name text, photo_url text, state text)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); q text := btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not friends_live(v_gym) or length(q) < 2 then return; end if;
  return query
  select p.id, p.first_name, p.last_name, p.photo_url, friend_state(v_gym, auth.uid(), p.id)
    from member_profiles mp join profiles p on p.id = mp.profile_id
   where mp.gym_id = v_gym and mp.findable and p.id <> auth.uid() and is_active_member(v_gym, p.id)
     and (p.first_name || ' ' || coalesce(p.last_name, '')) ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
   order by p.first_name, p.last_name
   limit 20;
end;
$$;

/** Your squad and the people you invited (or who invited you), not friends yet. */
create or replace function people_you_may_know()
returns table (member_id uuid, first_name text, last_name text, photo_url text, reason text, state text)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) then return; end if;
  return query
  with near as (
    select y.member_id as id, 'squad'::text as why from squad_members x
      join squad_members y on y.squad_id = x.squad_id and y.left_at is null
      join squads s on s.id = x.squad_id and s.archived_at is null
     where x.gym_id = v_gym and x.member_id = auth.uid() and x.left_at is null and y.member_id <> auth.uid()
    union
    select case when r.referrer_id = auth.uid() then r.referred_id else r.referrer_id end, 'invited'
      from referrals r where r.gym_id = v_gym and auth.uid() in (r.referrer_id, r.referred_id)
  )
  select distinct on (p.id) p.id, p.first_name, p.last_name, p.photo_url, n.why, friend_state(v_gym, auth.uid(), p.id)
    from near n join profiles p on p.id = n.id
   where n.id is not null and is_active_member(v_gym, n.id) and friend_state(v_gym, auth.uid(), n.id) <> 'friends'
   order by p.id, n.why
   limit 12;
end;
$$;

/** Your friend code, for the QR a friend scans. */
create or replace function my_friend_code() returns text
language sql stable security definer set search_path = public as $$
  select friend_code from member_profiles where gym_id = current_gym_id() and profile_id = auth.uid() and friends_live(current_gym_id())
$$;

-- ── Wins ────────────────────────────────────────────────────────────────────
/**
 * The wins of everyone a member may see: a member's own friends and squad
 * mates who share their wins, in the last 30 days, newest first. Built from
 * what the app already records — nothing here is stored twice.
 */
create or replace function wins_for(p_gym uuid, p_viewer uuid, p_limit int default 40)
returns table (member_id uuid, first_name text, last_name text, photo_url text, relation text,
               kind text, ref text, title text, detail text, tier text, at timestamptz)
language sql stable security definer set search_path = public as $$
  with people as (
    select o.id, 'friend'::text as relation from friendships f
      cross join lateral (select case when f.requester = p_viewer then f.addressee else f.requester end as id) o
     where f.gym_id = p_gym and f.status = 'accepted' and p_viewer in (f.requester, f.addressee)
    union
    select y.member_id, 'squad' from squad_members x
      join squad_members y on y.squad_id = x.squad_id and y.left_at is null and y.member_id <> p_viewer
      join squads s on s.id = x.squad_id and s.archived_at is null
     where x.gym_id = p_gym and x.member_id = p_viewer and x.left_at is null
  ),
  shown as (
    select distinct on (pe.id) pe.id, pe.relation from people pe
      join member_profiles mp on mp.gym_id = p_gym and mp.profile_id = pe.id and mp.share_wins
     where is_active_member(p_gym, pe.id)
     order by pe.id, pe.relation
  ),
  w as (
    select r.member_id, 'record'::text kind, r.id::text ref, 'New record · ' || e.name title,
           case when r.kind = 'duration' then r.value::numeric(10,0) || ' s' else trim(trailing '.' from trim(trailing '0' from r.value::numeric(10,2)::text)) || ' kg' end
             || case when r.previous is not null and r.previous > 0
                     then ' — best was ' || case when r.kind = 'duration' then r.previous::numeric(10,0) || ' s' else trim(trailing '.' from trim(trailing '0' from r.previous::numeric(10,2)::text)) || ' kg' end
                     else '' end detail,
           null::text tier, r.achieved_at at
      from personal_records r join exercises e on e.id = r.exercise_id
     where r.gym_id = p_gym and r.removed_at is null and r.achieved_at > now() - interval '30 days'
    union all
    select m.member_id, 'streak', m.id::text, m.weeks || '-week streak', 'Their own weekly target, ' || m.weeks || ' weeks in a row', null, m.reached_at
      from streak_milestones m where m.gym_id = p_gym and m.reached_at > now() - interval '30 days'
    union all
    select u.user_id, 'badge', u.id::text, 'Badge: ' || a.title, a.description, a.tier, u.created_at
      from achievement_unlocks u join achievements a on a.gym_id = u.gym_id and a.key = u.achievement_key
     where u.gym_id = p_gym and u.created_at > now() - interval '30 days'
    union all
    select g.member_id, 'target', g.id::text, 'Target reached · ' || g.title, null, null, g.achieved_on::timestamptz
      from fitness_goals g
     where g.gym_id = p_gym and g.achieved_on is not null and g.achieved_on > current_date - 30
       and (g.metric <> 'custom' or g.template_key is not null)
    union all
    select c.member_id, 'challenge', c.challenge_id::text, 'Challenge finished · ' || ch.title, null, null, c.completed_on::timestamptz
      from challenge_participants c join challenges ch on ch.id = c.challenge_id
     where c.gym_id = p_gym and c.completed_on is not null and c.completed_on > current_date - 30
  )
  select w.member_id, p.first_name, p.last_name, p.photo_url, s.relation, w.kind, w.ref, w.title, w.detail, w.tier, w.at
    from w join shown s on s.id = w.member_id join profiles p on p.id = w.member_id
   order by w.at desc
   limit greatest(1, least(coalesce(p_limit, 40), 200))
$$;
revoke all on function wins_for(uuid, uuid, int) from public, anon, authenticated;

/** Your friends' and squad's wins, with whether you cheered each. */
create or replace function friend_wins(p_limit int default 40)
returns table (member_id uuid, first_name text, last_name text, photo_url text, relation text,
               kind text, ref text, title text, detail text, tier text, at timestamptz, cheered boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) then return; end if;
  return query
  select w.*, exists (select 1 from cheers c where c.gym_id = v_gym and c.from_member = auth.uid()
                        and c.win_kind = w.kind and c.win_ref = w.ref)
    from wins_for(v_gym, auth.uid(), p_limit) w;
end;
$$;

-- ── Cheers ──────────────────────────────────────────────────────────────────
/** Cheer a win the feed shows you. The person is told, once. */
create or replace function cheer_win(p_member uuid, p_kind text, p_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller(); v_title text; v_name text; v_id uuid;
begin
  select w.title into v_title from wins_for(v_gym, auth.uid(), 200) w
   where w.member_id = p_member and w.kind = p_kind and w.ref = p_ref;
  if v_title is null then raise exception 'That win is not one you can see.'; end if;
  insert into cheers (gym_id, from_member, to_member, win_kind, win_ref, win_title)
  values (v_gym, auth.uid(), p_member, p_kind, p_ref, v_title)
  on conflict (gym_id, from_member, win_kind, win_ref) do nothing
  returning id into v_id;
  if v_id is null then return false; end if;
  select first_name into v_name from profiles where id = auth.uid();
  perform notify_once(p_member, 'friends', coalesce(v_name, 'A friend') || ' cheered you on',
    v_title, '/member/friends', 'cheer:' || v_id, v_gym);
  return true;
end;
$$;

/** Take a cheer back. */
create or replace function uncheer_win(p_member uuid, p_kind text, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := friends_caller();
begin
  delete from cheers where gym_id = v_gym and from_member = auth.uid() and to_member = p_member and win_kind = p_kind and win_ref = p_ref;
end;
$$;

-- ── What the coach and the owner see ────────────────────────────────────────
/** A coach's trainee: the cheers they received lately (who and what) — their own trainees only. */
create or replace function trainee_cheers(p_member uuid, p_days int default 14)
returns table (from_first_name text, from_last_initial text, win_title text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) or not is_my_trainee(p_member) then return; end if;
  return query
  select p.first_name, left(coalesce(p.last_name, ''), 1), c.win_title, c.created_at
    from cheers c join profiles p on p.id = c.from_member
   where c.gym_id = v_gym and c.to_member = p_member
     and c.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
   order by c.created_at desc
   limit 20;
end;
$$;

/** The owner and desk: counts only — never who, never what. */
create or replace function member_social_counts(p_member uuid)
returns table (friends int, cheers_received int)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or not friends_live(v_gym) or not is_front_desk() then return; end if;
  return query
  select (select count(*)::int from friendships f where f.gym_id = v_gym and f.status = 'accepted' and p_member in (f.requester, f.addressee)),
         (select count(*)::int from cheers c where c.gym_id = v_gym and c.to_member = p_member);
end;
$$;

-- Callable by signed-in people only; each function checks the rest.
do $$
declare f text;
begin
  foreach f in array array['send_friend_request(uuid)', 'send_friend_request_by_code(text)', 'respond_friend_request(uuid, boolean)',
    'remove_friend(uuid)', 'my_friends()', 'my_friend_requests()', 'find_members(text)', 'people_you_may_know()', 'my_friend_code()',
    'friend_wins(int)', 'cheer_win(uuid, text, text)', 'uncheer_win(uuid, text, text)', 'trainee_cheers(uuid, int)',
    'member_social_counts(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- What's new, once per person — owners first, since it starts switched off.
insert into app_releases (app, title, items)
select 'admin', 'Friends and cheers, if you want them', array[
  'Members can add each other as friends, see each other''s wins and cheer them on.',
  'It is off until you switch it on: Your app → Celebrations → Friends & cheers.',
  'You see counts only in the member drawer; coaches see a trainee''s cheers.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'Friends and cheers, if you want them');

-- Every gym table, for the tenancy suite (0200's list plus the two above).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','cheers','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials','friendships',
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
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0217_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0217_applied() to anon, authenticated;
