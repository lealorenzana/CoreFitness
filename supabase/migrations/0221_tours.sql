-- 0221 — the tours (guides G4, plan docs/superpowers/plans/2026-10-28-simplify.md Part E).
--
-- Each main screen in the three apps shows a short tour the first time a person
-- opens it: a spotlight on the screen's parts and one line each, Next or Skip.
-- Which tours a person has seen is kept on their account — never on the phone —
-- so a new phone does not show them again, and Help can replay any of them.
--
-- One row per person, one column per app: the tour ids seen in that app
-- (the member app's 'today', the coach app's 'today', the admin's 'dashboard'…).
-- Not on `profiles`: every profile update is written to the gym's activity log
-- (trg_log_profile), and a tour seen is not a change anyone needs to read.
--
-- Written only through mark_tour_seen() (security definer, the caller's own row);
-- read through my_tours_seen(). No insert or update policy for anyone.
--
-- Also: the What's new notes for the guides (photos, setup questions, Taglish, tours).
-- Safe to paste again.

create table if not exists tours_seen (
  person_id uuid primary key references profiles(id) on delete cascade,
  member text[] not null default '{}',
  coach text[] not null default '{}',
  admin text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table tours_seen enable row level security;
drop policy if exists tours_seen_own on tours_seen;
create policy tours_seen_own on tours_seen for select to authenticated using (person_id = auth.uid());
revoke all on tours_seen from anon;
grant select on tours_seen to authenticated;

-- The tours this person has seen in one app ('member' | 'coach' | 'admin'). Empty when none.
create or replace function my_tours_seen(p_app text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select case p_app when 'member' then member when 'coach' then coach when 'admin' then admin end
                     from tours_seen where person_id = auth.uid()), '{}'::text[]);
$$;

-- Marks one tour seen (Skip and the last Next both call it). Idempotent.
create or replace function mark_tour_seen(p_app text, p_tour text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_app not in ('member', 'coach', 'admin') then raise exception 'Unknown app.'; end if;
  if p_tour is null or p_tour !~ '^[a-z][a-z0-9_-]{0,39}$' then raise exception 'Unknown tour.'; end if;
  insert into tours_seen (person_id) values (auth.uid()) on conflict (person_id) do nothing;
  update tours_seen set
    member = case when p_app = 'member' and not (p_tour = any(member)) then member || p_tour else member end,
    coach  = case when p_app = 'coach'  and not (p_tour = any(coach))  then coach  || p_tour else coach end,
    admin  = case when p_app = 'admin'  and not (p_tour = any(admin))  then admin  || p_tour else admin end,
    updated_at = now()
  where person_id = auth.uid();
end
$$;

revoke all on function my_tours_seen(text) from public, anon;
revoke all on function mark_tour_seen(text, text) from public, anon;
grant execute on function my_tours_seen(text) to authenticated;
grant execute on function mark_tour_seen(text, text) to authenticated;

-- What's new: once per person, as for every release.
insert into app_releases (app, title, items)
select 'member', 'Photos, Taglish and a quick tour', array[
  'Tap a photo to see it big. Choosing a photo lets you move and zoom it first.',
  'Filipino now reads the way we talk — Taglish, with the app words kept in English.',
  'Each main screen shows a short tour the first time. Replay any of them in Settings → Help.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'Photos, Taglish and a quick tour');

insert into app_releases (app, title, items)
select 'trainer', 'Photos and a quick tour', array[
  'Tap a photo to see it big. Choosing a photo lets you move and zoom it first.',
  'Today, Personal training and Schedule each show a short tour the first time. Replay them from You → Help.'
]
where not exists (select 1 from app_releases where app = 'trainer' and title = 'Photos and a quick tour');

insert into app_releases (app, title, items)
select 'admin', 'One Personal training page, and a quick tour', array[
  'Personal training holds what to decide, every session and every package. Class bookings sit under Classes when you run them.',
  'Choosing a photo or logo lets you move and zoom it first; click any photo to see it big.',
  'The main pages show a short tour the first time. Replay any of them from Help.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'One Personal training page, and a quick tour');

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0221_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0221_applied() to anon, authenticated;
