-- 0115 — The definer views get a barrier, and a reason on the record.
--
-- Supabase's Security Advisor flags seven views as CRITICAL "Security Definer
-- View". That finding is about a *pattern*, and the pattern is genuinely
-- dangerous: a view without `security_invoker` reads as its owner and skips RLS
-- entirely, so on a multi-tenant database one careless view returns every gym's
-- rows to anybody who can select it.
--
-- ---- WHY THESE SEVEN ARE NOT THAT ------------------------------------------------------
--
-- 0099 already anticipated this. Every one of them filters to the current gym
-- **in its own body** — `where gym_id = current_gym_id()`, or for
-- `trainer_busy_slots` a trainer_id drawn from this gym's `gym_roles`. When
-- there is no session `current_gym_id()` is NULL, `gym_id = NULL` is NULL, and
-- the view returns nothing: it fails closed. None is granted to `anon`;
-- `authenticated` only. `scripts/sql/tenancy-isolation.mjs` asserts, as a real
-- member of Gym A, that not one of them yields a Gym B row.
--
-- ---- WHY THEY CANNOT SIMPLY BECOME INVOKER ---------------------------------------------
--
-- Measured rather than argued, by flipping each one in pglite and re-reading it
-- as a seeded member of Gym A:
--
--   class_availability          72 rows / 308 bookings  ->  72 rows / 0
--   public_trainers             12 rows                 ->  0
--   public_trainer_credentials  23 rows                 ->  0
--   trainer_busy_slots         173 rows                 ->  0
--   trainer_rating_summary      12 rows / 148 ratings   ->  12 rows / 0
--   trainer_evaluation_summary  24 rows / 158 ratings   ->  0
--   trainer_ratings_anon       158 rows                 ->  0
--
-- All seven are projections or aggregates over rows the caller is *not*
-- permitted to read individually, which is the legitimate use of a definer
-- view: a member may know a class has 18 of 20 places taken without being
-- allowed to read the eighteen bookings, and may see a coach's average without
-- reading other members' ratings.
--
-- **`class_availability` is the one to keep in mind.** It returns 72 rows
-- either way — one per class — and every number inside goes to zero. A check
-- that counted rows would have called it safe to flip and shipped a booking
-- screen claiming every class was empty.
--
-- ---- WHAT IS ACTUALLY MISSING, AND WHAT THIS MIGRATION FIXES ---------------------------
--
-- `security_barrier`. Without it PostgreSQL may push a caller's WHERE clause
-- *below* the view's own `gym_id = current_gym_id()` filter, so a cheap
-- expression can be evaluated against rows the filter was going to remove. The
-- classic form needs CREATE FUNCTION, which `authenticated` does not have here;
-- the cheaper form does not — an operator that raises on some values (a divide,
-- a cast) turns into a probe for whether such a row exists in another gym.
--
-- It is a narrow leak and it is a real one, and the tell that it was an
-- oversight rather than a decision is that **one** of the seven already has the
-- barrier: 0099 set it on `trainer_ratings_anon` and on none of its six
-- neighbours. Seven views, one rule.
--
-- This changes no view's definition and no row anybody sees. `alter view ...
-- set` is used rather than `create or replace view` precisely so the bodies
-- 0099 wrote are not restated here and cannot drift from it.
--
-- ---- THE ADVISOR WILL STILL SHOW THESE -------------------------------------------------
--
-- It tests for `security_invoker`, which these must not have. The finding is
-- expected and answered here; `scripts/sql/verify/verify0115.sql` prints the
-- state so the answer can be checked rather than believed.

do $$
declare
  v_view text;
  v_missing text[] := '{}';
begin
  foreach v_view in array array[
    'class_availability', 'public_trainers', 'public_trainer_credentials',
    'trainer_busy_slots', 'trainer_rating_summary', 'trainer_evaluation_summary',
    'trainer_ratings_anon'
  ] loop
    -- Skipped rather than failed if a view is absent: these are spread over
    -- 0016, 0042, 0072 and 0099, and a database part-way through the list must
    -- not be blocked by this one.
    if to_regclass('public.' || v_view) is null then
      v_missing := v_missing || v_view;
      continue;
    end if;
    execute format('alter view public.%I set (security_barrier = true)', v_view);
  end loop;

  if array_length(v_missing, 1) is not null then
    raise notice '0115: not present, skipped: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ---- and no signed-out stranger may read any of them ------------------------------------
--
-- Every `grant select` written for these views said `to authenticated`, and all
-- seven were readable by `anon` anyway: Supabase's project defaults grant SELECT
-- on everything in `public` to both roles, so a view inherits anon the moment it
-- is created and nothing in the migrations says so. Reading the grants rather
-- than the grant *statements* is what found it.
--
-- Today that is harmless — `current_gym_id()` is NULL with no session, so every
-- one of them returns nothing to a stranger. But that single function is then
-- the only thing between a signed-out request and seven views that bypass RLS
-- by design, and defence one function deep is not defence. Nothing needs it:
-- every read is from `directory.ts`, `trainerRatings.ts`, `trainerFeedback.ts`
-- or `trainers.ts`, all behind a session.
--
-- (`trainer_ratings_anon` is "anonymised" — no member_id — not "for anon".)
do $$
declare v_view text;
begin
  foreach v_view in array array[
    'class_availability', 'public_trainers', 'public_trainer_credentials',
    'trainer_busy_slots', 'trainer_rating_summary', 'trainer_evaluation_summary',
    'trainer_ratings_anon'
  ] loop
    if to_regclass('public.' || v_view) is null then continue; end if;
    execute format('revoke all on public.%I from anon', v_view);
    -- Restated, because the revoke above would otherwise be the only grant
    -- statement these views have and the next reader would wonder.
    execute format('grant select on public.%I to authenticated', v_view);
  end loop;
end $$;

-- ---- the rule, so the next view cannot quietly skip it ---------------------------------
--
-- Returns one row per view that is neither invoker nor barriered. The harness
-- asserts this is empty, which is what makes the rule survive the next person
-- who adds a view — a comment would not have.

create or replace function views_without_protection()
returns table (view_name text, invoker boolean, barrier boolean)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), false),
         coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                    where option_name = 'security_barrier'), false)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), false)
     and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                        where option_name = 'security_barrier'), false)
   order by c.relname;
$$;
revoke all on function views_without_protection() from public, anon;
grant execute on function views_without_protection() to authenticated;
comment on function views_without_protection() is
  'Views that run as their owner and have no security_barrier (0115). Must stay '
  'empty: scripts/sql/tenancy-isolation.mjs asserts it.';

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0115_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0115_applied() from public, anon;
grant execute on function migration_0115_applied() to authenticated;
comment on function migration_0115_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0115.sql
