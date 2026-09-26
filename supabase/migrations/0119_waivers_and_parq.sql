-- 0119 — A waiver the gym wrote, a PAR-Q the member answered, and a record of
-- both that cannot be rewritten afterwards.
--
-- A gym cannot lawfully let somebody train without a signed waiver, and this
-- system has never had one. 0079 stamps `member_profiles.terms_accepted_at`
-- when a member self-registers, which records that they agreed to *the app's*
-- Terms and Privacy Policy. That is a different document about a different
-- thing: the Terms are between the member and the service, a waiver is between
-- the member and the gym, and no amount of the first is evidence of the second.
--
-- ---- THE ONE RULE THAT MAKES A WAIVER WORTH ANYTHING -----------------------------------
--
-- **Published text is immutable.** "Lea accepted this on 14 March" means
-- nothing if the gym can edit what "this" says in April. So a waiver is
-- versioned: editing a published one creates the next version, and every
-- acceptance points at the exact version the member was shown.
--
-- The alternative — one editable row per gym — is the shape somebody reaches
-- for first, and it produces a record that is worse than no record, because it
-- looks like evidence and is not.
--
-- ---- THE PAR-Q, AND WHAT IT MUST NOT DO ------------------------------------------------
--
-- Seven questions, the standard ones. They are stored in SQL rather than typed
-- into a screen, because a gym editing the PAR-Q into something shorter is a
-- liability, not a customisation.
--
-- **A "yes" refers the member to the desk and to their doctor. It never changes
-- their training, and it never blocks them by itself.** CLAUDE.md already fixed
-- this rule in place for the assistant — a stated injury yields a referral,
-- never a changed exercise — and the same reasoning holds harder here: this
-- system is not qualified to decide that somebody with chest pain may do
-- squats but not deadlifts. It flags, a human decides.
--
-- ---- WHETHER IT GATES ANYTHING IS THE GYM'S CHOICE --------------------------------------
--
-- `gym_settings.waiver_required` defaults to **false**, so pasting this changes
-- nothing for anybody. A gym that turns it on gets booking refused until the
-- member signs — and only booking:
--
--   * **never check-in.** Blocking the door would mean a queue at the desk on
--     the morning the gym switched it on, and the desk can see who has not
--     signed and hand them a tablet.
--   * **never the free workout library** (0019, CLAUDE.md), which exists for
--     members who cannot pay and asks nothing of them.
--
-- And it **locks and explains**, in the 0049 sense: the member is told what to
-- do, because signing is something they can actually go and do.

-- ---- 1. the document ------------------------------------------------------------------

create table if not exists gym_waivers (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  version      int  not null,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 20000),
  -- NULL while it is a draft. Once set, the row is frozen by a trigger below.
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references profiles(id),
  unique (gym_id, version),
  -- The target of waiver_acceptances' composite key. 0098's rule: a foreign
  -- key between two gym tables carries gym_id, so the database itself refuses
  -- a Gym B acceptance of a Gym A waiver — whatever the application sends.
  unique (gym_id, id)
);

-- One draft at a time: a gym with two half-written waivers has no way to say
-- which one is next.
create unique index if not exists gym_waivers_one_draft
  on gym_waivers (gym_id) where published_at is null;

alter table gym_waivers enable row level security;

-- Everybody signed in may read a PUBLISHED waiver of their own gym: a member
-- must be able to re-read what they signed, and 0049's rule that a gate
-- explains itself needs the text to be reachable. Drafts are the desk's.
drop policy if exists gym_waivers_read on gym_waivers;
create policy gym_waivers_read on gym_waivers for select
  using (auth.uid() is not null and (published_at is not null or is_front_desk()));

-- No write policy: every write goes through the functions below.
grant select on gym_waivers to authenticated;

create table if not exists waiver_acceptances (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  waiver_id   uuid not null,
  member_id   uuid not null references profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  -- question key -> true/false, exactly as answered. Kept whole rather than
  -- reduced to `flagged`, because "which one" is the question the desk asks.
  par_q       jsonb not null default '{}'::jsonb,
  flagged     boolean not null default false,
  unique (waiver_id, member_id),
  -- Composite, not `references gym_waivers(id)`: the pair has to match, so a
  -- row cannot point at another gym's waiver even if every policy were wrong.
  foreign key (gym_id, waiver_id) references gym_waivers (gym_id, id) on delete cascade
);

alter table waiver_acceptances enable row level security;

drop policy if exists waiver_acceptances_self on waiver_acceptances;
create policy waiver_acceptances_self on waiver_acceptances for select
  using (member_id = auth.uid());

drop policy if exists waiver_acceptances_desk on waiver_acceptances;
create policy waiver_acceptances_desk on waiver_acceptances for select
  using (is_front_desk());

-- **No INSERT policy for anyone.** A signature the client can write is not a
-- signature (CLAUDE.md: anything the client can grant or skip proves nothing).
grant select on waiver_acceptances to authenticated;

-- Both join the tenancy layer.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_invitations','gym_modules','gym_plans','gym_settings','gym_waivers',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','plan_features','point_ledger','point_rules',
    'pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['gym_waivers', 'waiver_acceptances'] loop
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

-- ---- 2. published text cannot change ---------------------------------------------------
-- The whole value of the record. Enforced here rather than in the functions,
-- because a constraint holds against every road in — a future function, a
-- migration, the SQL editor at midnight.

create or replace function trg_waiver_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.published_at is not null then
    if new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.published_at is distinct from old.published_at
       or new.version is distinct from old.version then
      raise exception
        'A published waiver cannot be edited. Save a new version instead — '
        'members accepted the words that were on screen, and changing them '
        'afterwards would make every signature meaningless.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists waiver_frozen on gym_waivers;
create trigger waiver_frozen before update on gym_waivers
  for each row execute function trg_waiver_frozen();

-- ---- 3. the PAR-Q ----------------------------------------------------------------------
-- In SQL, not in a screen and not editable: a gym shortening the PAR-Q is a
-- liability rather than a customisation. The wording is the standard one.

create or replace function parq_questions()
returns table (key text, question text, sort_order int)
language sql immutable as $$
  values
    ('heart_condition', 'Has a doctor ever said you have a heart condition, or that you should only do physical activity recommended by a doctor?', 1),
    ('chest_pain_active', 'Do you feel pain in your chest when you do physical activity?', 2),
    ('chest_pain_rest', 'In the past month, have you had chest pain when you were not doing physical activity?', 3),
    ('balance', 'Do you lose your balance because of dizziness, or do you ever lose consciousness?', 4),
    ('bone_joint', 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?', 5),
    ('medication', 'Is your doctor currently prescribing drugs for your blood pressure or a heart condition?', 6),
    ('other_reason', 'Do you know of any other reason why you should not do physical activity?', 7);
$$;
revoke all on function parq_questions() from public;
grant execute on function parq_questions() to anon, authenticated;
comment on function parq_questions() is
  'The standard seven-question PAR-Q (0119). Fixed in SQL on purpose: a gym '
  'shortening this is a liability, not a setting. A yes refers to the desk and '
  'a doctor; it never changes training and never blocks by itself.';

-- ---- 4. the gym writes it ---------------------------------------------------------------

alter table gym_settings add column if not exists waiver_required boolean not null default false;
comment on column gym_settings.waiver_required is
  'When true, a member must accept the current waiver before BOOKING (0119). '
  'Never gates check-in or the free workout library. Default false, so pasting '
  '0119 changes nothing until a gym chooses it.';

-- Saves the draft, creating one if there is none. Publishing is separate and
-- deliberate: a half-written waiver must never be the thing a member signs.
create or replace function save_gym_waiver(p_title text, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym uuid := acting_gym_id();
  v_id  uuid;
  v_next int;
begin
  if v_gym is null then raise exception 'No gym to change.' using errcode = '42501'; end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can write the waiver.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'A waiver needs a title and a body.';
  end if;

  perform act_as_gym(v_gym);
  select id into v_id from gym_waivers
   where gym_id = v_gym and published_at is null;

  if v_id is not null then
    update gym_waivers set title = btrim(p_title), body = btrim(p_body) where id = v_id;
    return v_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_next from gym_waivers where gym_id = v_gym;
  insert into gym_waivers (gym_id, version, title, body, created_by)
  values (v_gym, v_next, btrim(p_title), btrim(p_body), auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function save_gym_waiver(text, text) from public, anon;
grant execute on function save_gym_waiver(text, text) to authenticated;

create or replace function publish_gym_waiver()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym uuid := acting_gym_id();
  v_id  uuid;
  v_ver int;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can publish the waiver.' using errcode = '42501';
  end if;

  perform act_as_gym(v_gym);
  select id, version into v_id, v_ver from gym_waivers
   where gym_id = v_gym and published_at is null;
  if v_id is null then raise exception 'There is no draft to publish.'; end if;

  update gym_waivers set published_at = now() where id = v_id;

  -- Said in the gym's own log, because publishing a new version means every
  -- member has to sign again and the owner should see that recorded.
  perform log_activity('gym.waiver_published', 'gym_waivers', v_id, null,
    'Waiver version ' || v_ver || ' published — members sign this one from now on',
    jsonb_build_object('version', v_ver), v_gym);
  return v_ver;
end;
$fn$;
revoke all on function publish_gym_waiver() from public, anon;
grant execute on function publish_gym_waiver() to authenticated;

-- ---- 5. the member signs it -------------------------------------------------------------

-- What this member must sign, if anything. Drives the member screen and the
-- gate below, so both read one answer rather than two that can disagree.
create or replace function my_waiver_status()
returns table (waiver_id uuid, version int, title text, body text,
               accepted_at timestamptz, required boolean, flagged boolean)
language sql stable security definer set search_path = public as $$
  with w as (
    select * from gym_waivers
     where gym_id = current_gym_id() and published_at is not null
     order by version desc limit 1
  )
  select w.id, w.version, w.title, w.body,
         a.accepted_at,
         coalesce((select s.waiver_required from gym_settings s
                    where s.gym_id = current_gym_id()), false),
         coalesce(a.flagged, false)
    from w
    left join waiver_acceptances a
      on a.waiver_id = w.id and a.member_id = auth.uid();
$$;
revoke all on function my_waiver_status() from public, anon;
grant execute on function my_waiver_status() to authenticated;

create or replace function accept_waiver(p_waiver uuid, p_answers jsonb)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_me    uuid := auth.uid();
  v_gym   uuid := current_gym_id();
  v_w     record;
  v_key   text;
  v_flag  boolean := false;
  v_clean jsonb := '{}'::jsonb;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;

  select * into v_w from gym_waivers
   where id = p_waiver and gym_id = v_gym and published_at is not null;
  if v_w.id is null then
    raise exception 'That waiver is not the one this gym is using.';
  end if;

  -- Every question answered, and only the questions that exist. A missing
  -- answer is not a "no": it is somebody who did not read it.
  for v_key in select key from parq_questions() loop
    if p_answers is null or not (p_answers ? v_key)
       or jsonb_typeof(p_answers -> v_key) <> 'boolean' then
      raise exception 'Please answer every health question.';
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, (p_answers ->> v_key)::boolean);
    if (p_answers ->> v_key)::boolean then v_flag := true; end if;
  end loop;

  insert into waiver_acceptances (gym_id, waiver_id, member_id, par_q, flagged)
  values (v_gym, p_waiver, v_me, v_clean, v_flag)
  on conflict (waiver_id, member_id) do nothing;

  -- A yes goes to the desk, once. It is a referral, not a decision: nobody is
  -- blocked by it, and no training is changed by it.
  if v_flag then
    perform notify_once(r.user_id, 'system', 'Health questionnaire to review',
      coalesce((select first_name || ' ' || last_name from profiles where id = v_me), 'A member')
        || ' answered yes to a PAR-Q question. Talk to them before they train hard.',
      '/members', 'parq:' || p_waiver || ':' || v_me)
      from gym_roles r
     where r.gym_id = v_gym and r.role in ('admin', 'staff') and r.status = 'active';
  end if;

  return v_flag;
end;
$fn$;
revoke all on function accept_waiver(uuid, jsonb) from public, anon;
grant execute on function accept_waiver(uuid, jsonb) to authenticated;

-- ---- 6. the desk sees who has, and who was flagged --------------------------------------

create or replace function gym_waiver_signatures()
returns table (member_id uuid, member_name text, accepted_at timestamptz,
               version int, flagged boolean, par_q jsonb)
language sql stable security definer set search_path = public as $$
  select a.member_id,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         a.accepted_at, w.version, a.flagged, a.par_q
    from waiver_acceptances a
    join gym_waivers w on w.id = a.waiver_id
    join profiles p on p.id = a.member_id
   where a.gym_id = current_gym_id() and is_front_desk()
   order by a.flagged desc, a.accepted_at desc;
$$;
revoke all on function gym_waiver_signatures() from public, anon;
grant execute on function gym_waiver_signatures() to authenticated;

-- ---- 7. the gate, if the gym wants one --------------------------------------------------
--
-- Added to the two entitlement triggers rather than as a third trigger, so
-- there is one place per booking kind that decides whether it may happen.
-- Both keep 0101's tenancy behaviour exactly; this is one extra check at the
-- end, after the plan checks, so a member with no plan still hears about the
-- plan first — that is the thing they are more likely to be able to fix.

create or replace function waiver_blocks(p_member uuid, p_gym uuid) returns text
language plpgsql stable security definer set search_path = public as $fn$
declare v_w record;
begin
  if not coalesce((select waiver_required from gym_settings where gym_id = p_gym), false) then
    return null;
  end if;
  select id, version into v_w from gym_waivers
   where gym_id = p_gym and published_at is not null
   order by version desc limit 1;
  -- Required but never written: the gym has not finished setting this up, and
  -- refusing every booking over the gym's own unfinished admin would be the
  -- system punishing a member for it.
  if v_w.id is null then return null; end if;
  if exists (select 1 from waiver_acceptances
              where waiver_id = v_w.id and member_id = p_member) then
    return null;
  end if;
  return 'Please read and sign the gym''s waiver before booking. It is in the app '
      || 'under Membership, and takes a minute.';
end;
$fn$;
revoke all on function waiver_blocks(uuid, uuid) from public, anon;
grant execute on function waiver_blocks(uuid, uuid) to authenticated;

create or replace function enforce_class_booking_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_week date;
  block text;
begin
  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  if m is null then
    raise exception 'You need an active membership to book a class.';
  end if;
  if not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_classes then
    raise exception 'Your plan does not include class booking. Upgrade at the front desk.';
  end if;

  if p.class_bookings_per_week is not null then
    select date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date
      into slot_week
      from classes c where c.id = new.class_id;

    select count(*) into used
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = new.member_id
       and b.gym_id = new.gym_id
       and b.status in ('pending', 'approved')
       and date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date = slot_week;

    if used >= p.class_bookings_per_week then
      raise exception 'Your plan allows % class(es) per week. You have already booked that week.',
        p.class_bookings_per_week;
    end if;
  end if;

  -- 0119, last: a member with no plan hears about the plan first.
  block := waiver_blocks(new.member_id, new.gym_id);
  if block is not null then raise exception '%', block; end if;

  return new;
end;
$$;

create or replace function enforce_pt_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_month date;
  block text;
begin
  if is_front_desk() then
    return new;
  end if;

  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  if m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_pt then
    raise exception 'Your plan does not include personal training. Upgrade at the front desk.';
  end if;

  if p.pt_sessions_per_month is not null then
    slot_month := date_trunc('month', (new.starts_at at time zone 'Asia/Manila'))::date;

    select count(*) into used
      from pt_sessions s
     where s.member_id = new.member_id
       and s.gym_id = new.gym_id
       and s.status in ('pending', 'approved')
       and date_trunc('month', (s.starts_at at time zone 'Asia/Manila'))::date = slot_month;

    if used >= p.pt_sessions_per_month then
      raise exception 'Your plan allows % personal training session(s) per month.',
        p.pt_sessions_per_month;
    end if;
  end if;

  -- 0119, last, and note the `is_front_desk()` early return above: the desk
  -- booking somebody in is never refused over a waiver. They have the person
  -- in front of them and a tablet; the gate is for the member booking alone
  -- from a phone.
  block := waiver_blocks(new.member_id, new.gym_id);
  if block is not null then raise exception '%', block; end if;

  return new;
end;
$$;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0119_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0119_applied() from public, anon;
grant execute on function migration_0119_applied() to authenticated;
comment on function migration_0119_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0119.sql
