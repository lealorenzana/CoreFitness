-- 0057 — four named plans, a freeze the gym can audit, and events worth reading.
--
-- **Run 0056 first.** This file inserts a plan with tier 'pro', and that enum
-- value has to be committed before it can be used.
--
-- Three unrelated gaps, all raised together, all small enough that separate
-- files would be ceremony.

-- ============================================================================
-- 1. THE FOUR PLANS
-- ============================================================================
-- The gym names them Free Trial, Free Plan, Premium and Pro. Two of those are
-- renames of rows that already exist and that members are *currently on*, so
-- this updates in place rather than inserting duplicates — a second "Free Plan"
-- row would leave existing memberships pointing at the old one and split the
-- revenue report in two.
--
-- Matched on the old name, and only when the new name is not already present,
-- so a re-run is a no-op rather than a second rename.
update membership_plans set name = 'Free Trial'
 where name = 'Freemium Trial'
   and not exists (select 1 from membership_plans p2 where p2.name = 'Free Trial');

update membership_plans set name = 'Free Plan'
 where name = 'Free Access'
   and not exists (select 1 from membership_plans p2 where p2.name = 'Free Plan');

-- ── The seeder has to learn about 'pro' BEFORE a Pro plan exists ────────────
--
-- 0049's `sync_plan_features()` maps tier to a default with
-- `case p.tier when 'free' … when 'freemium' … when 'premium' … end`, and a
-- CASE with no ELSE returns NULL for anything else. `plan_features.enabled` is
-- NOT NULL, so inserting a plan on a tier the CASE does not name makes the
-- seeding trigger fail and takes the whole INSERT with it.
--
-- That is not hypothetical — it is what the first draft of this file did. The
-- Pro plan could not be created at all, and the error named a NOT NULL
-- violation on a table nobody was inserting into.
--
-- Redefined with an explicit ELSE, so any future tier seeds as fully enabled
-- and the admin unticks what it should not have. Fail-open here is right: a
-- new top tier that silently grants nothing is worse than one that grants too
-- much, and the admin sees the whole matrix on one screen.
create or replace function sync_plan_features() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  n int;
begin
  insert into plan_features (plan_id, feature_key, enabled)
  select p.id, f.key,
         case p.tier
           when 'free'     then f.default_free
           when 'freemium' then f.default_freemium
           when 'premium'  then f.default_premium
           else true
         end
    from membership_plans p
    cross join features f
  on conflict (plan_id, feature_key) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function sync_plan_features() from public, anon, authenticated;

-- Pro sits above Premium: everything Premium has, without the monthly PT
-- ceiling. Priced by the gym; ₱2,500 is a starting figure they edit on the
-- Membership Plans screen, not a number this file is authoritative about.
insert into membership_plans
  (name, tier, price, duration_days, description, is_active,
   can_book_classes, can_book_pt, class_bookings_per_week, pt_sessions_per_month)
select 'Pro', 'pro', 2500, 30,
       E'Everything in Premium\nUnlimited personal training\nPriority booking',
       true, true, true, null, null
where not exists (select 1 from membership_plans where name = 'Pro');

-- Premium keeps a PT ceiling so Pro has something concrete to add. Only set
-- when it has never been configured, so a gym that already chose a number
-- keeps it.
update membership_plans
   set pt_sessions_per_month = 4
 where name = 'Premium' and can_book_pt and pt_sessions_per_month is null;

-- Every plan needs its full row of feature cells (0049). The insert trigger
-- covers the new one; this covers the case where 0049 ran before this file.
select sync_plan_features();

-- Pro is the top tier, so it gets everything. Written explicitly rather than
-- relying on the tier defaults, because 0049's defaults have no 'pro' branch —
-- `case p.tier when 'free' … when 'freemium' … when 'premium' …` returns NULL
-- for an unknown tier, and `enabled` is NOT NULL. Without this the insert
-- trigger would have failed the moment the Pro plan was created.
update plan_features
   set enabled = true
 where plan_id in (select id from membership_plans where tier = 'pro');

-- ============================================================================
-- 2. FREEZE AND CANCEL, WITH A REASON AND A PAPER TRAIL
-- ============================================================================
-- 0018 allowed one freeze per membership period and counted it with an int on
-- the membership row. Two things were missing that the gym actually needs:
--
--   * **A monthly limit rather than a lifetime one.** A counter cannot express
--     "twice a month" — it has no idea when the last freeze was.
--   * **Why.** A frozen membership with no reason is an argument at the front
--     desk three weeks later, and refund questions have nowhere to live.
--
-- So freezes become rows. The count is then a query over this month, the reason
-- is a column, and the gym has a record of who did what and when.
create table if not exists membership_events (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  member_id     uuid not null references member_profiles(profile_id) on delete cascade,
  kind          text not null check (kind in ('freeze','unfreeze','cancel')),
  /** Required for freeze and cancel; an unfreeze needs no justification. */
  reason        text,
  /** Did the member ask for money back? Recorded even when the answer is no,
      because "we never discussed it" and "they said no" are different facts. */
  refund_requested boolean not null default false,
  refund_note   text,
  /** Whoever was at the desk. Never trusted from the client — see the trigger. */
  recorded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_membership_events_member
  on membership_events(member_id, created_at desc);

-- Counting freezes in the current Manila month. A calendar month, not a
-- rolling 30 days: "twice a month" is what the gym says to members, and a
-- rolling window would refuse a freeze on the 1st because of one on the 3rd of
-- the month before.
create or replace function freezes_this_month(p_member uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select count(*)::int
    from membership_events e
   where e.member_id = p_member
     and e.kind = 'freeze'
     and date_trunc('month', (e.created_at at time zone 'Asia/Manila'))
       = date_trunc('month', (now() at time zone 'Asia/Manila'));
$fn$;

-- The desk is the client here, so the limit cannot live in the form.
create or replace function trg_membership_event_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- Stamped, not accepted: the client does not get to say who was at the desk.
  new.recorded_by := auth.uid();

  if new.kind in ('freeze','cancel') and coalesce(btrim(new.reason), '') = '' then
    raise exception 'A reason is required to % a membership.', new.kind;
  end if;

  -- Admin can override; a member in a genuinely exceptional situation should
  -- not be told no by a trigger with nobody able to say yes.
  if new.kind = 'freeze'
     and get_my_role() is distinct from 'admin'
     and freezes_this_month(new.member_id) >= 2 then
    raise exception
      'This membership has already been frozen twice this month. An admin can override.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists membership_events_guard on membership_events;
create trigger membership_events_guard
  before insert on membership_events
  for each row execute function trg_membership_event_guard();

alter table membership_events enable row level security;

-- The member sees their own history — it is their membership, and "why is my
-- account frozen" should not require a phone call.
drop policy if exists membership_events_select_self on membership_events;
create policy membership_events_select_self on membership_events
  for select using (member_id = auth.uid());

drop policy if exists membership_events_select_desk on membership_events;
create policy membership_events_select_desk on membership_events
  for select using (get_my_role() in ('admin','staff'));

-- The desk records them; freezing is front-desk work (0012).
drop policy if exists membership_events_insert_desk on membership_events;
create policy membership_events_insert_desk on membership_events
  for insert to authenticated
  with check (get_my_role() in ('admin','staff'));

-- **No UPDATE or DELETE policy for anyone.** A freeze record that can be
-- rewritten is not a record. A mistake is corrected by adding the opposite
-- event, exactly as `attendance` undo works (0035).

revoke all on function freezes_this_month(uuid) from public, anon;
grant execute on function freezes_this_month(uuid) to authenticated;

-- 0018's counter stays where it is. Nothing reads it any more, but dropping a
-- column that a deployed build might still select is how a working app starts
-- returning 400s mid-session.
comment on column memberships.freeze_count is
  'Superseded by membership_events (0057), which counts per calendar month and '
  'records a reason. Left in place so an older deployed bundle keeps working.';

-- ============================================================================
-- 3. EVENTS MEMBERS CAN ACTUALLY UNDERSTAND
-- ============================================================================
-- `events` has had `description`, `location` and `capacity` since 0014 and the
-- admin form already fills them. What a member could not find out is the part
-- that decides whether they turn up: what to bring, what it costs, who it is
-- for, and who to ask.
alter table events
  add column if not exists what_to_bring text,
  add column if not exists who_is_it_for text,
  /** NULL = free. 0 would mean "priced at zero", which reads the same on screen
      but is a different statement about a paid gym's event. */
  add column if not exists fee numeric(10,2),
  add column if not exists contact text,
  /** Shown above the fold so an event nobody should miss can be marked as such.
      One flag, not a priority scale nobody would maintain. */
  add column if not exists is_featured boolean not null default false;

comment on column events.fee is
  'NULL means free. 0 means deliberately priced at zero — the screens say '
  '"Free" for NULL and "₱0" for zero, because those are different claims.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select name, tier, price, duration_days from membership_plans order by price;
--     -- expect Free Trial, Free Plan, Premium, Pro
--
--   select p.name, count(*) filter (where pf.enabled) as on, count(*) as cells
--     from membership_plans p join plan_features pf on pf.plan_id = p.id
--    group by p.name order by p.name;              -- Pro: 6 of 6
--
--   select freezes_this_month('<a member>');
--
-- A freeze with no reason is refused (expect the exception):
--   insert into membership_events (membership_id, member_id, kind)
--   values ('<m>', '<member>', 'freeze');
