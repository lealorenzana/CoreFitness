-- 0049 — what a subscription withholds, as data the admin edits.
--
-- 0017 put four entitlement columns on `membership_plans` and enforced them with
-- triggers: can_book_classes, can_book_pt, and a quota for each. That was the
-- right shape for bookings and it is not touched here — those triggers are live,
-- they carry week/month quota semantics that a generic boolean cannot express,
-- and breaking them to be tidy would risk the one part of this system that
-- provably works.
--
-- What they cannot do is gate a *screen*. Right now every member sees every
-- feature; the AI plan builder, which is the most expensive thing the gym runs,
-- is as available on the ₱0 tier as on Premium.
--
-- ---------------------------------------------------------------------------
-- Why a table and not six more columns
-- ---------------------------------------------------------------------------
-- The requirement was stated as: "it should be editable in the admin app if we
-- want to add another new type of subscription." With columns, a new plan is a
-- migration plus a form field plus a deploy. With a matrix, a new plan is one
-- INSERT and a row of checkboxes that already renders.
--
-- ---------------------------------------------------------------------------
-- The missing-row problem, which is the whole reason for the trigger
-- ---------------------------------------------------------------------------
-- A plan with no `plan_features` rows forces `plan_allows()` to guess.
--
--   * Fail closed, and the moment an admin adds a plan every member on it is
--     locked out of a working app.
--   * Fail open, and gating means nothing the first time someone forgets.
--
-- Neither is acceptable, so a plan is never allowed to have a missing cell.
-- `sync_plan_features()` fills every (plan × feature) gap from the tier
-- defaults; an AFTER INSERT trigger on `membership_plans` calls it, this file
-- calls it once for the three existing plans, and any future migration that
-- adds a feature key calls it again. `plan_allows()` still treats a missing row
-- as enabled — belt and braces behind the trigger, not the policy.
--
-- ---------------------------------------------------------------------------
-- What is deliberately NOT gateable
-- ---------------------------------------------------------------------------
-- Check-in, attendance history, membership, renewal, payments, notifications,
-- settings, profile, events, trainer profiles, achievements, goals and body
-- progress. And two on principle:
--
--   * **The free workout resources (0019)** exist because the panel asked for
--     something for members who cannot pay. Gating them would contradict the
--     business model in the same document that proposes them.
--   * **The rule-based assistant.** It costs nothing to run and answers ~98% of
--     questions. Only the *model escalation* is gated, so no member is ever
--     locked out of asking a question — they get the free answer instead of the
--     smarter one, and the gym's only per-use cost falls on the only tier that
--     pays for it.

-- ============================================================================
-- 1. THE CATALOGUE
-- ============================================================================
-- A feature key exists because code implements it. Inventing a row here would
-- produce a switch that gates nothing — the "control that writes a flag nothing
-- reads" failure this project has already shipped — so there is deliberately no
-- INSERT policy on this table for anyone, admin included. New keys arrive by
-- migration, alongside the code that honours them.

create table if not exists features (
  key               text primary key,
  label             text not null,
  description       text not null,
  -- Seed values, applied per tier when a plan is created. They are not the
  -- rule: once seeded, `plan_features.enabled` is the only thing consulted, so
  -- an admin who unticks a box is never overruled by a default.
  default_free      boolean not null default false,
  default_freemium  boolean not null default false,
  default_premium   boolean not null default true,
  sort_order        int not null default 0
);

comment on table features is
  'Catalogue of gateable app areas. Rows arrive by migration only, alongside '
  'the code that honours the key. The admin edits plan_features, not this.';

insert into features (key, label, description,
                      default_free, default_freemium, default_premium, sort_order) values
  ('workout_tracker', 'Workout tracker',
   'Record exercises, sets, reps and weight, and see your training history.',
   false, true,  true,  1),
  ('plan_builder',    'AI workout plan',
   'Answer a few questions and get a training plan built around your days and your goal.',
   false, false, true,  2),
  ('ai_model',        'Smarter AI assistant',
   'General fitness and training questions answered by an AI model. Everyone can '
   'still ask the assistant about the gym, your membership and your bookings.',
   false, false, true,  3),
  ('points_earn',     'Earn CORE Points',
   'Collect points for checking in, logging workouts and attending sessions.',
   false, true,  true,  4),
  ('points_redeem',   'Redeem CORE Points',
   'Exchange your points for gym rewards.',
   false, false, true,  5),
  ('challenges',      'Gym challenges',
   'Join gym challenges and earn points for finishing them.',
   false, true,  true,  6)
on conflict (key) do update
  set label            = excluded.label,
      description      = excluded.description,
      default_free     = excluded.default_free,
      default_freemium = excluded.default_freemium,
      default_premium  = excluded.default_premium,
      sort_order       = excluded.sort_order;

-- ============================================================================
-- 2. THE MATRIX
-- ============================================================================

create table if not exists plan_features (
  plan_id     uuid not null references membership_plans(id) on delete cascade,
  feature_key text not null references features(key) on delete cascade,
  enabled     boolean not null,
  -- Reserved for features that are allowed *up to a point*. Nothing in this
  -- migration reads it; it exists so adding a metered feature later is a value
  -- change rather than a schema change. NULL = no ceiling.
  quota       int,
  primary key (plan_id, feature_key),
  constraint plan_features_quota_positive check (quota is null or quota > 0)
);

create index if not exists idx_plan_features_plan on plan_features(plan_id);

-- ============================================================================
-- 3. NO PLAN MAY HAVE A MISSING CELL
-- ============================================================================

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
         end
    from membership_plans p
    cross join features f
  on conflict (plan_id, feature_key) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

comment on function sync_plan_features() is
  'Fills every missing (plan x feature) cell from the tier defaults. Called by '
  'the membership_plans insert trigger, and by any migration that adds a '
  'feature key. Never overwrites an existing row, so an admin choice survives.';

-- Deliberately fills gaps only. A tier change on an existing plan does NOT
-- re-seed: an admin who moved a plan from freemium to premium and then unticked
-- two boxes made a decision, and a re-seed would silently reverse it.
create or replace function trg_seed_plan_features() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  perform sync_plan_features();
  return null;
end;
$fn$;

drop trigger if exists membership_plans_seed_features on membership_plans;
create trigger membership_plans_seed_features
  after insert on membership_plans
  for each statement execute function trg_seed_plan_features();

-- The three plans seeded in 0004 predate the trigger.
select sync_plan_features();

-- ============================================================================
-- 4. THE RESOLVER
-- ============================================================================
-- One definition of "may this member use this feature", read by RLS, by the
-- triggers, by the Edge Function and by the UI that words the lock — so the
-- explanation on screen and the rule in the database cannot drift apart.
--
-- Signatures are the live ones: `membership_is_usable` took a third argument in
-- 0024 and `current_membership_of` gained a fourth returned column, because
-- NULL expiry means "not activated yet" for a pending row and "never expires"
-- for a lifetime one, and those two must stay distinguishable.

create or replace function plan_allows(p_member uuid, p_feature text)
returns boolean
language plpgsql stable security definer set search_path = public as $fn$
declare
  m       record;
  v_on    boolean;
begin
  -- The gym is never gated by a member's tier. A front-desk action must not
  -- fail because the person in front of them is on Free Access.
  -- IS NOT DISTINCT FROM, not IN: for a caller with no profiles row get_my_role()
  -- is NULL, and `NULL in (...)` is NULL, which is not true and so falls
  -- through to the member path below. That is the correct outcome here, but it
  -- is written explicitly so the next reader does not have to work it out —
  -- this is the exact shape that leaked in 0032 and was closed in 0048.
  if get_my_role() is not distinct from 'admin'
     or get_my_role() is not distinct from 'staff' then
    return true;
  end if;

  select * into m from current_membership_of(p_member);

  -- No membership at all, or one that is not currently usable: expired, frozen,
  -- or a pending registration that was never activated. A gated feature is part
  -- of what a membership buys, so it stops when the membership does.
  if m.plan_id is null
     or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    return false;
  end if;

  select pf.enabled into v_on
    from plan_features pf
   where pf.plan_id = m.plan_id
     and pf.feature_key = p_feature;

  -- Unreachable while the trigger above holds. If it ever is reached, let the
  -- member in rather than locking them out of a working app over a bookkeeping
  -- gap they did not cause.
  return coalesce(v_on, true);
end;
$fn$;

revoke all on function plan_allows(uuid, text) from public, anon;
grant execute on function plan_allows(uuid, text) to authenticated;

revoke all on function sync_plan_features() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the phone app asks
-- ---------------------------------------------------------------------------
-- One round trip returning every feature with the caller's own answer, rather
-- than shipping the plan row to the client and letting it work the rules out
-- again. The UI cannot drift from the enforcement, because this **is** the
-- enforcement function — the same `plan_allows()` the RLS policies call.
--
-- The label and description ride along so the lock card is worded from the row
-- that denied it. A gate can never ship without an explanation.
create or replace function my_features()
returns table (key text, label text, description text, enabled boolean, sort_order int)
language sql stable security definer set search_path = public as $fn$
  select f.key, f.label, f.description, plan_allows(auth.uid(), f.key), f.sort_order
    from features f
   order by f.sort_order;
$fn$;

revoke all on function my_features() from public, anon;
grant execute on function my_features() to authenticated;

-- ============================================================================
-- 5. RLS
-- ============================================================================

alter table features      enable row level security;
alter table plan_features enable row level security;

-- Members read the catalogue because the lock card is worded from it — the
-- label and description a member sees are the same row the check reads, so a
-- gate can never ship without an explanation.
drop policy if exists features_select_authenticated on features;
create policy features_select_authenticated on features
  for select to authenticated using (true);

-- No INSERT, UPDATE or DELETE policy on `features`, for any role. See the note
-- at the top of section 1.

drop policy if exists plan_features_select_authenticated on plan_features;
create policy plan_features_select_authenticated on plan_features
  for select to authenticated using (true);

-- Pricing and entitlements are the same class of decision, so this matches
-- `membership_plans_write_admin`: admin only, not staff.
drop policy if exists plan_features_write_admin on plan_features;
create policy plan_features_write_admin on plan_features
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

-- ============================================================================
-- 6. FIRST ENFORCEMENT — the AI plan builder
-- ============================================================================
-- The rest of the gates land with the features they guard (points in 0051,
-- challenges in 0052, the tracker in 0050). This one is enforceable today
-- because `workout_plans` already exists (0047).
--
-- 0047 gave the member one `for all` policy. Splitting it means a lapsed
-- membership stops you *generating* a new plan without also stopping you
-- reading, renaming or deleting the plans you already have — losing access to
-- your own history is a punishment nobody asked for.

-- Re-asserted rather than assumed. 0047 enabled it, but a policy on a table
-- whose RLS is off is decoration: it grants nothing and blocks nothing, and it
-- reads exactly like protection. Idempotent, so stating it costs nothing and
-- makes this file correct on its own.
alter table workout_plans enable row level security;

drop policy if exists workout_plans_all_self on workout_plans;

drop policy if exists workout_plans_read_self on workout_plans;
create policy workout_plans_read_self on workout_plans
  for select using (member_id = auth.uid());

drop policy if exists workout_plans_update_self on workout_plans;
create policy workout_plans_update_self on workout_plans
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists workout_plans_delete_self on workout_plans;
create policy workout_plans_delete_self on workout_plans
  for delete using (member_id = auth.uid());

drop policy if exists workout_plans_insert_self on workout_plans;
create policy workout_plans_insert_self on workout_plans
  for insert
  with check (member_id = auth.uid() and plan_allows(member_id, 'plan_builder'));

-- `workout_plans_select_gym` (0047) is untouched: the trainer's read still runs
-- through trainer_may_see(member_id, 'workouts').

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Expect 6 features, and 6 rows per plan with no gaps:
--
--   select count(*) from features;
--   select p.name, p.tier, count(pf.*) as cells,
--          count(*) filter (where pf.enabled) as enabled
--     from membership_plans p
--     left join plan_features pf on pf.plan_id = p.id
--    group by p.name, p.tier order by p.tier;
--
-- Expect: Free Access 6 cells / 0 enabled, Freemium Trial 6 / 3,
--         Premium 6 / 6.
--
-- Every plan has every feature (this must return zero rows):
--
--   select p.name, f.key from membership_plans p cross join features f
--    where not exists (select 1 from plan_features pf
--                       where pf.plan_id = p.id and pf.feature_key = f.key);
--
-- A member cannot write the matrix (run as an authenticated non-admin):
--
--   update plan_features set enabled = true;        -- expect 0 rows
--   insert into features (key,label,description) values ('x','x','x');  -- 42501
