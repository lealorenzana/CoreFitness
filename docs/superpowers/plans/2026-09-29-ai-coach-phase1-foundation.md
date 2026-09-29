# AI Coach — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Premium member at a gym with the assistant switched on chats with a real Claude model that streams its reply, knows a little about them (only if they opt in), and is held to per-member and per-gym message limits the gym sets.

**Architecture:** Migration 0143 adds consent, usage counting and limits in SQL (definer functions, RLS on, usage writable only by the service role). A new Edge Function `ai-coach` checks every gate in SQL as the caller, calls the Anthropic Messages API with the TypeScript SDK, streams the text back as server-sent events, and records usage with the service-role key. The member app's assistant keeps answering gym facts from its rules first and hands anything else to the coach, streaming into the chat.

**Tech Stack:** Supabase Postgres (pglite for tests), Deno Edge Function with `npm:@anthropic-ai/sdk`, React 19 member app, Playwright fixture checks.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-coach-design.md`

## Global Constraints

- Model from secret `COACH_MODEL`, default `claude-sonnet-5-5`; key from secret `ANTHROPIC_API_KEY`. Neither ever reaches a browser bundle.
- Server-side refusal fallback on: beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`.
- Every gate is asked **as the caller** (their JWT, RLS applies); the service-role key is used **only** for `ai_record_usage`.
- Per-member daily limit `gym_settings.ai_daily_messages` default **30**; per-gym monthly `gym_settings.ai_monthly_messages` default **1500**. Days are **Manila** days (`manila_today()`), never UTC.
- The coach never states this gym's prices, hours, schedule, trainers or policies; never gives medical advice; never gives a calorie, kcal, macro or gram target; an injury or condition gets a referral, never a changed exercise.
- The coach reads a member's history **only** when `ai_coach_profiles.consent_reads_data` is true; never PAR-Q/waiver answers, payments, coach chat or photos.
- Conversations reuse `assistant_conversations` / `assistant_messages` (0046, owner-only). No new conversation tables.
- A failure never falls through to free model access, and never leaves the member without an answer: the rules answer stands.
- Legal pages change in the same commit as the rule (CLAUDE.md). `lib/memberDataExport.ts` stays identical in both apps.
- Migrations are pasted by hand, one at a time; the owner pastes 0143 and sets the key — never the agent.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0143_ai_coach_foundation.sql` | consent, usage, limits, status, context, record-usage |
| `scripts/sql/ai-coach.mjs` | the SQL rules, in pglite as `authenticated` |
| `scripts/sql/verify/verify0143.sql` | paste-after report |
| `supabase/functions/ai-coach/core.ts` | pure: system prompt, message shaping, SSE framing, status → HTTP |
| `supabase/functions/ai-coach/index.ts` | the Edge Function: gates, Anthropic stream, usage |
| `scripts/ai-coach-core.mjs` | node test of `core.ts` |
| `g-fitness-member/src/lib/api/aiCoach.ts` | status, consent, streaming client |
| `g-fitness-member/src/components/CoachConsent.tsx` | the one-time consent sheet |
| `g-fitness-member/src/pages/ChatbotPage.tsx` | rules first, then the coach, streamed |
| `g-fitness-member/src/pages/Privacy.tsx` | the assistant paragraph, rewritten |
| `g-fitness-member/src/lib/memberDataExport.ts` + admin twin | include coach consent and usage |
| `scripts/member-coach-check.js` | the screen, with the function routed |

---

### Task 1: Migration 0143 and its SQL rules

**Files:**
- Create: `supabase/migrations/0143_ai_coach_foundation.sql`
- Create: `scripts/sql/ai-coach.mjs`
- Create: `scripts/sql/verify/verify0143.sql`

**Interfaces:**
- Produces (SQL, callable by `authenticated` unless noted):
  - `ai_coach_status() returns jsonb` → `{ gym_id uuid, allowed bool, reason text|null, used_today int, daily_limit int, used_month int, monthly_limit int, consent bool|null }`; `reason ∈ {'not_member','no_plan','switched_off','daily_limit','monthly_limit'}`
  - `set_ai_coach_consent(p_reads_data boolean) returns void`
  - `ai_coach_context() returns jsonb` → `null` without consent, else `{ first_name, experience_level, goals text[], routines text[], workouts_30d int }`
  - `ai_record_usage(p_gym uuid, p_member uuid, p_in int, p_out int) returns void` — **service_role only**
  - tables `ai_coach_profiles`, `ai_usage_days`; columns `gym_settings.ai_daily_messages`, `gym_settings.ai_monthly_messages`, `assistant_messages.source`

- [ ] **Step 1: Write the failing test** — `scripts/sql/ai-coach.mjs`:

```js
/**
 * 0143: the AI coach's foundation — who may use it, how much, and what it may read.
 *
 *   node <repo>/scripts/sql/ai-coach.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const A = 'a1430000-0000-4000-8000-00000000000a';
const B = 'a1430000-0000-4000-8000-00000000000b';
const DESK = 'a1430000-0000-4000-8000-00000000000d';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const status = async () => (await one(`select ai_coach_status() as s`)).s;

// Two members on a plan that includes the model, and a desk account.
await db.exec(`reset role;
  ${[['a', A], ['b', B], ['desk', DESK]].map(([k, id]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@coach-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${id}', '${k.toUpperCase()}', 'T', '${k}@coach-test.com', 'active', 'member', '${GYM}')
      on conflict (id) do update set active_gym_id = excluded.active_gym_id;`).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${A}', 'member', 'active'), ('${GYM}', '${B}', 'member', 'active'), ('${GYM}', '${DESK}', 'staff', 'active')
    on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
  insert into member_profiles (profile_id, experience_level) values ('${A}', 'beginner'), ('${B}', 'advanced')
    on conflict (profile_id) do nothing;
  -- A premium membership for both, on whichever plan includes ai_model.
  insert into memberships (member_id, plan_id, status, start_date, expiry_date)
    select m, (select pf.plan_id from plan_features pf where pf.feature_key = 'ai_model' and pf.enabled limit 1),
           'active', manila_today() - 1, manila_today() + 30
      from unnest(array['${A}','${B}']::uuid[]) m;
  insert into fitness_goals (member_id, title) values ('${A}', 'Squat my bodyweight');`);

// ---- status and gates --------------------------------------------------------------------------
await as(A);
let s = await status();
check('an entitled member may use the coach', s.allowed === true && s.reason === null, JSON.stringify(s));
check('limits default to 30 a day and 1500 a month', s.daily_limit === 30 && s.monthly_limit === 1500, JSON.stringify(s));
check('consent starts unanswered', s.consent === null, JSON.stringify(s));

await db.exec(`reset role; update gym_modules set enabled = false where gym_id = '${GYM}' and feature_key = 'assistant';
  insert into gym_modules (gym_id, feature_key, enabled) values ('${GYM}', 'assistant', false)
    on conflict (gym_id, feature_key) do update set enabled = false;`);
await as(A);
check('the gym switching the assistant off closes it', (await status()).reason === 'switched_off');
await db.exec(`reset role; update gym_modules set enabled = true where gym_id = '${GYM}' and feature_key = 'assistant';`);

await as(DESK);
check('a desk account is not a member', (await status()).reason === 'not_member');

// ---- context only with consent -----------------------------------------------------------------
await as(A);
check('no context before consent', (await one(`select ai_coach_context() as c`)).c === null);
await db.exec(`select set_ai_coach_consent(true)`);
const ctx = (await one(`select ai_coach_context() as c`)).c;
check('with consent: name, level and goals', ctx?.first_name === 'A' && ctx?.experience_level === 'beginner'
  && ctx?.goals?.includes('Squat my bodyweight'), JSON.stringify(ctx));
check('the context never carries health or payment keys',
  !/par_q|waiver|payment|amount|phone|email/i.test(JSON.stringify(ctx)), JSON.stringify(ctx));
await db.exec(`select set_ai_coach_consent(false)`);
check('withdrawing consent stops it at once', (await one(`select ai_coach_context() as c`)).c === null);

// ---- usage: only the service role writes it, and the limits bite -------------------------------
await as(A);
check('a member cannot record usage', !!(await tryExec(`select ai_record_usage('${GYM}', '${A}', 10, 10)`)));
check('a member cannot write the usage table', !!(await tryExec(
  `insert into ai_usage_days (gym_id, member_id, day, messages) values ('${GYM}', '${A}', manila_today(), -100)`))
  || (await one(`select count(*)::int as n from ai_usage_days where messages < 0`)).n === 0);

await db.exec(`reset role; set role service_role;`);
check('the service role records usage', !(await tryExec(`select ai_record_usage('${GYM}', '${A}', 1200, 300)`)));
await db.exec(`reset role; update gym_settings set ai_daily_messages = 2 where gym_id = '${GYM}';
  set role service_role; select ai_record_usage('${GYM}', '${A}', 1000, 200);`);
await as(A);
s = await status();
check('the daily limit closes it at the boundary', s.used_today === 2 && s.reason === 'daily_limit', JSON.stringify(s));
await as(B);
s = await status();
check('one member at their limit does not close it for another', s.allowed === true && s.used_today === 0, JSON.stringify(s));
check('another member reads none of A\'s usage',
  (await one(`select count(*)::int as n from ai_usage_days where member_id = '${A}'`)).n === 0);
await db.exec(`reset role; update gym_settings set ai_daily_messages = 30, ai_monthly_messages = 2 where gym_id = '${GYM}';`);
await as(B);
check('the gym\'s monthly limit closes it for everyone', (await status()).reason === 'monthly_limit');
await db.exec(`reset role; update gym_settings set ai_monthly_messages = 1500 where gym_id = '${GYM}';`);

// ---- limits are bounded; the message source is checked -----------------------------------------
check('a daily limit of 0 is refused', !!(await tryExec(`update gym_settings set ai_daily_messages = 0 where gym_id = '${GYM}'`)));
check('an unknown message source is refused', !!(await tryExec(
  `insert into assistant_messages (conversation_id, role, body, source)
     select id, 'assistant', 'x', 'robot' from assistant_conversations limit 1`))
  || (await one(`select count(*)::int as n from assistant_conversations`)).n === 0);
check('both tables are tenant tables',
  (await one(`select tenancy_gym_tables() @> array['ai_coach_profiles','ai_usage_days'] as ok`)).ok);

// The paste-after report, on this same replay.
{
  const { readFileSync } = await import('node:fs');
  await db.exec('reset role;');
  const report = (await tryExec(readFileSync(`${REPO}/scripts/sql/verify/verify0143.sql`, 'utf8'))) ?? '';
  check('verify0143.sql reports OK', /REPORT 0143/.test(report) && !/NOT OK/.test(report), report);
}

console.log(failures ? `\n${failures} FAILED` : '\nall 0143 checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run (from `~/uicheck`): `node "<repo>/scripts/sql/ai-coach.mjs" "<repo>"`
Expected: FAIL — `function ai_coach_status() does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0143_ai_coach_foundation.sql`:

```sql
-- ============================================================================
-- 0143 — the AI coach, foundation: who may use it, how much, what it may read
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-29-ai-coach-design.md.
--
-- A real model now answers members (the Edge Function `ai-coach`), so four
-- things have to be true in SQL rather than in the app:
--   1. Only an entitled member at a gym that runs the assistant may use it —
--      ai_coach_status() is asked by the function *as the member*.
--   2. It costs the gym money per message, so there are two limits the gym
--      sets, counted per Manila day and month, and the count is written only by
--      the service role: a member who could write it could reset their limit.
--   3. It reads a member's history only after they say yes, and the yes can be
--      withdrawn — ai_coach_context() returns NULL without it.
--   4. What it reads is a short allow-list. Never health or waiver answers,
--      payments, contact details, coach chat or photos.
-- Conversations stay in 0046's assistant_conversations/messages, which are
-- already the member's alone.
-- ============================================================================

alter table gym_settings add column if not exists ai_daily_messages int not null default 30;
alter table gym_settings add column if not exists ai_monthly_messages int not null default 1500;
alter table gym_settings drop constraint if exists gym_settings_ai_daily_check;
alter table gym_settings add constraint gym_settings_ai_daily_check check (ai_daily_messages between 1 and 500);
alter table gym_settings drop constraint if exists gym_settings_ai_monthly_check;
alter table gym_settings add constraint gym_settings_ai_monthly_check check (ai_monthly_messages between 1 and 100000);

-- Which side of the assistant wrote a reply: the rules or the model.
alter table assistant_messages add column if not exists source text;
alter table assistant_messages drop constraint if exists assistant_messages_source_check;
alter table assistant_messages add constraint assistant_messages_source_check
  check (source is null or source in ('rules', 'coach'));

create table if not exists ai_coach_profiles (
  gym_id             uuid not null default acting_gym_id() references gyms(id),
  member_id          uuid not null references profiles(id) on delete cascade,
  consent_reads_data boolean not null,
  consented_at       timestamptz not null default now(),
  primary key (gym_id, member_id)
);

create table if not exists ai_usage_days (
  gym_id     uuid not null references gyms(id),
  member_id  uuid not null references profiles(id) on delete cascade,
  day        date not null,
  messages   int not null default 0 check (messages >= 0),
  tokens_in  bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  primary key (gym_id, member_id, day)
);
create index if not exists ai_usage_days_gym_day on ai_usage_days (gym_id, day);

alter table ai_coach_profiles enable row level security;
alter table ai_usage_days     enable row level security;
grant select on ai_coach_profiles, ai_usage_days to authenticated;

-- The member's own rows, and nobody else's — not the desk, not the owner
-- (the owner gets gym totals from a function in Phase 5).
drop policy if exists ai_coach_profiles_own on ai_coach_profiles;
create policy ai_coach_profiles_own on ai_coach_profiles for select to authenticated
  using (member_id = auth.uid());
drop policy if exists ai_usage_days_own on ai_usage_days;
create policy ai_usage_days_own on ai_usage_days for select to authenticated
  using (member_id = auth.uid());
-- No insert/update/delete policy on either, for any role: writes are functions.

-- ---- status: every gate in one answer -----------------------------------------------------------
create or replace function ai_coach_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_gym uuid := current_gym_id();
  v_daily int; v_monthly int; v_today int; v_month int; v_consent boolean; v_reason text;
begin
  select coalesce(s.ai_daily_messages, 30), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = v_gym;
  v_daily := coalesce(v_daily, 30); v_monthly := coalesce(v_monthly, 1500);

  select coalesce(sum(u.messages), 0) into v_today from ai_usage_days u
   where u.gym_id = v_gym and u.member_id = v_me and u.day = manila_today();
  select coalesce(sum(u.messages), 0) into v_month from ai_usage_days u
   where u.gym_id = v_gym and u.day >= date_trunc('month', manila_today())::date;
  select p.consent_reads_data into v_consent from ai_coach_profiles p
   where p.gym_id = v_gym and p.member_id = v_me;

  v_reason := case
    when v_me is null or v_gym is null or not exists (
      select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = v_me
         and r.role = 'member' and r.status = 'active') then 'not_member'
    when not gym_module_on(v_gym, 'assistant') then 'switched_off'
    when not plan_allows(v_me, 'ai_model') then 'no_plan'
    when v_month >= v_monthly then 'monthly_limit'
    when v_today >= v_daily then 'daily_limit'
  end;

  return jsonb_build_object('gym_id', v_gym, 'allowed', v_reason is null, 'reason', v_reason,
    'used_today', v_today, 'daily_limit', v_daily, 'used_month', v_month, 'monthly_limit', v_monthly,
    'consent', v_consent);
end;
$$;

create or replace function set_ai_coach_consent(p_reads_data boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_gym_id() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into ai_coach_profiles (gym_id, member_id, consent_reads_data, consented_at)
  values (current_gym_id(), auth.uid(), coalesce(p_reads_data, false), now())
  on conflict (gym_id, member_id) do update
    set consent_reads_data = excluded.consent_reads_data, consented_at = now();
end;
$$;

-- ---- what the coach may read: a short allow-list, and only with a yes --------------------------
create or replace function ai_coach_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id();
begin
  if not exists (select 1 from ai_coach_profiles p
                  where p.gym_id = v_gym and p.member_id = v_me and p.consent_reads_data) then
    return null;
  end if;
  return jsonb_build_object(
    'first_name', (select pr.first_name from profiles pr where pr.id = v_me),
    'experience_level', (select mp.experience_level from member_profiles mp where mp.profile_id = v_me),
    'goals', coalesce((select jsonb_agg(g.title order by g.created_at) from fitness_goals g
                        where g.member_id = v_me and g.achieved_on is null), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(r.name order by r.position) from workout_routines r
                           where r.member_id = v_me), '[]'::jsonb),
    'workouts_30d', (select count(*) from workout_logs l
                      where l.member_id = v_me and l.completed_at >= now() - interval '30 days'));
end;
$$;

-- ---- usage: the service role only ---------------------------------------------------------------
create or replace function ai_record_usage(p_gym uuid, p_member uuid, p_in int, p_out int) returns void
language sql security definer set search_path = public as $$
  insert into ai_usage_days (gym_id, member_id, day, messages, tokens_in, tokens_out)
  values (p_gym, p_member, manila_today(), 1, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0))
  on conflict (gym_id, member_id, day) do update
    set messages = ai_usage_days.messages + 1,
        tokens_in = ai_usage_days.tokens_in + excluded.tokens_in,
        tokens_out = ai_usage_days.tokens_out + excluded.tokens_out;
$$;

revoke all on function ai_coach_status(), set_ai_coach_consent(boolean), ai_coach_context()
  from public, anon;
grant execute on function ai_coach_status(), set_ai_coach_consent(boolean), ai_coach_context()
  to authenticated;
revoke all on function ai_record_usage(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function ai_record_usage(uuid, uuid, int, int) to service_role;

-- ---- tenancy: both tables are the gym's --------------------------------------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['ai_coach_profiles', 'ai_usage_days'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
  end loop;
end $$;

create or replace function migration_0143_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0143_applied() from public, anon;
grant execute on function migration_0143_applied() to authenticated;
comment on function migration_0143_applied() is 'Probe marker: 0143 (AI coach foundation) is live.';
```

Before writing, confirm the `tenancy_gym_tables()` array above equals the **last** definition in the history plus the two new names: `grep -ln "function tenancy_gym_tables" supabase/migrations/*.sql | tail -1` must print `0133_shop.sql`; if a later migration redefined it, copy that one's array instead.

- [ ] **Step 4: Write the verify script** — `scripts/sql/verify/verify0143.sql`:

```sql
-- VERIFICATION for 0143_ai_coach_foundation.sql
-- Paste into the Supabase SQL editor right after 0143. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls int; v_write_pol int; v_fns int; v_member_can_record boolean; v_ctx_ok int; v_tenant boolean;
begin
  select count(*) into v_rls from pg_class where relname in ('ai_coach_profiles','ai_usage_days') and relrowsecurity;
  select count(*) into v_write_pol from pg_policies
   where tablename in ('ai_coach_profiles','ai_usage_days') and cmd in ('INSERT','UPDATE','DELETE','ALL')
     and permissive = 'PERMISSIVE';
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('ai_coach_status','set_ai_coach_consent','ai_coach_context','ai_record_usage');
  select has_function_privilege('authenticated', 'ai_record_usage(uuid, uuid, int, int)', 'execute') into v_member_can_record;
  select count(*) into v_ctx_ok from pg_proc where proname = 'ai_coach_context' and prosrc like '%consent_reads_data%';
  select tenancy_gym_tables() @> array['ai_coach_profiles','ai_usage_days'] into v_tenant;
  raise exception 'REPORT 0143: RLS on=% of 2 % | write policies=% % | functions=% of 4 % | member can record usage=% % | context needs consent=% % | tenant tables=% %',
    v_rls, case when v_rls = 2 then 'OK' else 'NOT OK - STOP' end,
    v_write_pol, case when v_write_pol = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 4 then 'OK' else 'NOT OK' end,
    v_member_can_record, case when not v_member_can_record then 'OK' else 'NOT OK - STOP' end,
    v_ctx_ok, case when v_ctx_ok = 1 then 'OK' else 'NOT OK - STOP' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end;
end $$;
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node "<repo>/scripts/sql/ai-coach.mjs" "<repo>"` → `all 0143 checks passed`.
Then run `tenancy-isolation.mjs` and `switches.mjs` the same way → both pass (the tenancy list changed).
If a membership insert fails on a column name, read `supabase/migrations/0004*` or the latest `memberships` definition and fix the **test** fixture (CLAUDE.md: suspect the test first).

- [ ] **Step 6: Mutation check**

Temporarily change `ai_coach_context()`'s first `if not exists (...)` to `if false then` in a scratch copy of the migration (copy to `/tmp`, restore after), rerun: `no context before consent` and `withdrawing consent stops it at once` must FAIL. Restore, rerun, green. Confirm `cmp` against the backup.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0143_ai_coach_foundation.sql scripts/sql/ai-coach.mjs scripts/sql/verify/verify0143.sql
git commit -m "0143: the AI coach's gates, consent, limits and usage, in SQL"
```

---

### Task 2: The pure core of the function, tested in node

**Files:**
- Create: `supabase/functions/ai-coach/core.ts`
- Create: `scripts/ai-coach-core.mjs`

**Interfaces:**
- Produces (exports of `core.ts`, no imports, erasable TypeScript only so node can strip it):
  - `SYSTEM_PROMPT: string`
  - `type Turn = { role: 'user' | 'assistant'; content: string }`
  - `type CoachStatus = { gym_id: string; allowed: boolean; reason: string | null; used_today: number; daily_limit: number; used_month: number; monthly_limit: number; consent: boolean | null }`
  - `statusToHttp(s: CoachStatus): { status: number; body: { reason: string; message: string } } | null`
  - `buildRequest(question: string, history: Turn[], context: Record<string, unknown> | null): { system: string; messages: Turn[] }`
  - `sse(event: { type: 'text'; text: string } | { type: 'done' } | { type: 'error'; reason: string; message: string }): string`
  - `validQuestion(q: unknown): q is string`

- [ ] **Step 1: Write the failing test** — `scripts/ai-coach-core.mjs`:

```js
// node --experimental-strip-types scripts/ai-coach-core.mjs
const core = await import(new URL('../supabase/functions/ai-coach/core.ts', import.meta.url).href);
let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failed++; };
const base = { gym_id: 'g', allowed: true, reason: null, used_today: 0, daily_limit: 30, used_month: 0, monthly_limit: 1500, consent: null };

check('allowed → no error response', core.statusToHttp(base) === null);
check('no plan → 403', core.statusToHttp({ ...base, allowed: false, reason: 'no_plan' })?.status === 403);
check('switched off → 403', core.statusToHttp({ ...base, allowed: false, reason: 'switched_off' })?.status === 403);
check('daily limit → 429 and says the number',
  core.statusToHttp({ ...base, allowed: false, reason: 'daily_limit', used_today: 30 })?.status === 429
  && /30/.test(core.statusToHttp({ ...base, allowed: false, reason: 'daily_limit', used_today: 30 }).body.message));
check('an unknown reason still refuses', core.statusToHttp({ ...base, allowed: false, reason: 'weird' })?.status === 403);

const noCtx = core.buildRequest('How do I brace?', [], null);
check('the question is the last user turn', noCtx.messages.at(-1).role === 'user' && noCtx.messages.at(-1).content === 'How do I brace?');
check('no context → the prompt says it knows nothing about them', /do not know anything about this member/i.test(noCtx.system));
const withCtx = core.buildRequest('Plan my week', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
  { first_name: 'Lea', goals: ['Squat my bodyweight'] });
check('context is included when given', /Lea/.test(withCtx.system) && /Squat my bodyweight/.test(withCtx.system));
check('history keeps order and is capped at 10 turns',
  core.buildRequest('q', Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) })), null)
    .messages.length <= 11);
check('history never starts with an assistant turn',
  core.buildRequest('q', [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'y' }], null).messages[0].role === 'user');
check('the rules are in the prompt', /never state this gym's prices/i.test(core.SYSTEM_PROMPT)
  && /calorie/i.test(core.SYSTEM_PROMPT) && /injur/i.test(core.SYSTEM_PROMPT));

check('sse frames one JSON line', core.sse({ type: 'text', text: 'a\nb' }) === 'data: {"type":"text","text":"a\\nb"}\n\n');
check('an empty question is refused', !core.validQuestion('   ') && !core.validQuestion(42));
check('a 1001-character question is refused', !core.validQuestion('x'.repeat(1001)) && core.validQuestion('x'.repeat(1000)));

console.log(failed ? `\n${failed} FAILED` : '\nai-coach core: all checks passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --experimental-strip-types scripts/ai-coach-core.mjs` → FAIL, module not found.

- [ ] **Step 3: Write `supabase/functions/ai-coach/core.ts`**:

```ts
// The parts of the coach that are pure: its rules, the request it sends, the
// frames it streams, and what each gate says. No imports, so node can test it
// (scripts/ai-coach-core.mjs) and Deno can serve it unchanged.

export type Turn = { role: 'user' | 'assistant'; content: string };

export type CoachStatus = {
  gym_id: string; allowed: boolean; reason: string | null;
  used_today: number; daily_limit: number; used_month: number; monthly_limit: number;
  consent: boolean | null;
};

export const SYSTEM_PROMPT = `You are the coach inside a gym's member app in the Philippines. You help one gym member train well: technique, how to structure training, recovery, motivation, and everyday eating habits.

RULES YOU MUST NEVER BREAK
1. Never state this gym's prices, plans, opening hours, address, class schedule, coaches' names or policies. You do not have them. Say the app shows them (Membership, Book a session) or the front desk can help.
2. Never give medical advice. If the member mentions pain, an injury, illness, medication, pregnancy or a health condition: tell them to stop anything that hurts and to see a coach at the gym or a doctor or physiotherapist, and do not change or substitute exercises because of it.
3. Never give a calorie, kcal, macro or gram target, or a weight-loss number. Eating advice is about habits, food choices and portions by hand size (a palm of protein, a fist of rice, a thumb of fat), never numbers.
4. Stay on fitness, training, recovery and everyday eating. Politely decline anything else.
5. Never claim to be a person, a doctor or a dietitian. You are the gym's AI coach.

HOW YOU WRITE
Warm, direct, short: a few sentences or a short list. Use the member's first name now and then if you know it. Philippine context. When the honest answer is "ask a coach at the gym", say so.`;

const REASONS: Record<string, { status: number; message: (s: CoachStatus) => string }> = {
  not_member: { status: 403, message: () => 'The coach is for members of this gym.' },
  switched_off: { status: 403, message: () => 'This gym does not use the coach.' },
  no_plan: { status: 403, message: () => 'The coach comes with a plan that includes it.' },
  daily_limit: { status: 429, message: (s) => `You have used today's ${s.daily_limit} messages with the coach. It opens again tomorrow.` },
  monthly_limit: { status: 429, message: () => 'The coach has reached this gym\'s limit for the month.' },
};

export function statusToHttp(s: CoachStatus): { status: number; body: { reason: string; message: string } } | null {
  if (s.allowed) return null;
  const r = REASONS[s.reason ?? ''] ?? { status: 403, message: () => 'The coach is not available.' };
  return { status: r.status, body: { reason: s.reason ?? 'unknown', message: r.message(s) } };
}

export function validQuestion(q: unknown): q is string {
  return typeof q === 'string' && q.trim().length > 0 && q.length <= 1000;
}

export function buildRequest(
  question: string, history: Turn[], context: Record<string, unknown> | null,
): { system: string; messages: Turn[] } {
  const about = context
    ? `WHAT YOU KNOW ABOUT THIS MEMBER (they agreed to share it)\n${JSON.stringify(context)}`
    : 'You do not know anything about this member beyond this conversation. Ask what you need.';
  // The last ten turns, cleaned, starting on a user turn (the API requires it).
  let turns = history
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
  return { system: `${SYSTEM_PROMPT}\n\n${about}`, messages: [...turns, { role: 'user', content: question.trim() }] };
}

export function sse(event: { type: 'text'; text: string } | { type: 'done' } | { type: 'error'; reason: string; message: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
```

Note: `SYSTEM_PROMPT` is a prefix of every `system`; in Task 3 it is sent as its own cached block, and the member context as a second, uncached block.

- [ ] **Step 4: Run the test to see it pass** → `ai-coach core: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-coach/core.ts scripts/ai-coach-core.mjs
git commit -m "ai-coach: the pure core (rules, request, frames, gates), tested in node"
```

---

### Task 3: The Edge Function

**Files:**
- Create: `supabase/functions/ai-coach/index.ts`

**Interfaces:**
- Consumes: `core.ts` (Task 2); SQL `ai_coach_status()`, `ai_coach_context()`, `ai_record_usage()` (Task 1).
- Produces: `POST /functions/v1/ai-coach` with body `{ question: string, history: Turn[] }` and the member's `Authorization: Bearer <jwt>`. Responses:
  - `503 { reason: 'not_configured', message }` when `ANTHROPIC_API_KEY` is unset
  - `401` no/invalid session; `400 { reason: 'bad_question' }`
  - `403|429 { reason, message }` from `statusToHttp`
  - `200 text/event-stream` of `sse()` frames: many `text`, then `done` — or one `error` (`reason ∈ 'busy' | 'refusal'`)

- [ ] **Step 1: Write `supabase/functions/ai-coach/index.ts`**:

```ts
// The AI coach (spec: docs/superpowers/specs/2026-09-29-ai-coach-design.md).
//
// Every gate is asked of the database *as the member* — their own JWT goes to
// PostgREST, so RLS and the definer functions decide, not this file. The
// service-role key is used for exactly one call, ai_record_usage(), because a
// member who could write their own count could reset their own limit.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { buildRequest, sse, statusToHttp, SYSTEM_PROMPT, validQuestion, type CoachStatus, type Turn } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc<T>(fn: string, auth: string, key: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}`);
  return (await res.json()) as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ reason: 'method' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ reason: 'not_configured', message: 'The coach is not set up at this gym yet.' }, 503);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ reason: 'signed_out' }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON } });
  if (!who.ok) return json({ reason: 'signed_out' }, 401);
  const member = (await who.json()) as { id: string };

  let body: { question?: unknown; history?: unknown };
  try { body = await req.json(); } catch { return json({ reason: 'bad_question' }, 400); }
  if (!validQuestion(body.question)) return json({ reason: 'bad_question' }, 400);
  const history = Array.isArray(body.history) ? (body.history as Turn[]) : [];

  // Every gate, as the member. A failure to *ask* refuses: an outage must never
  // become free model access (the gym pays per message).
  let status: CoachStatus;
  try { status = await rpc<CoachStatus>('ai_coach_status', auth, ANON); }
  catch { return json({ reason: 'busy', message: 'The coach is busy. Try again in a minute.' }, 503); }
  const refused = statusToHttp(status);
  if (refused) return json(refused.body, refused.status);

  const context = await rpc<Record<string, unknown> | null>('ai_coach_context', auth, ANON).catch(() => null);
  const request = buildRequest(body.question, history, context);
  const about = request.system.slice(SYSTEM_PROMPT.length).trim();

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const model = Deno.env.get('COACH_MODEL') || 'claude-sonnet-5-5';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (s: string) => controller.enqueue(enc.encode(s));
      let usageIn = 0, usageOut = 0, spoke = false;
      try {
        // deno-lint-ignore no-explicit-any
        const params: any = {
          model,
          max_tokens: 2048,
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: about },
          ],
          messages: request.messages,
          output_config: { effort: 'low' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        };
        const s = client.beta.messages.stream(params);
        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            spoke = true;
            send(sse({ type: 'text', text: event.delta.text }));
          }
        }
        const final = await s.finalMessage();
        usageIn = (final.usage.input_tokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0)
          + (final.usage.cache_creation_input_tokens ?? 0);
        usageOut = final.usage.output_tokens ?? 0;
        if (final.stop_reason === 'refusal' && !spoke) {
          send(sse({ type: 'error', reason: 'refusal', message: 'The coach cannot help with that one.' }));
        } else {
          send(sse({ type: 'done' }));
        }
      } catch (err) {
        // Never the raw error: it can carry request details. Log for the gym.
        console.error('ai-coach upstream', err instanceof Anthropic.APIError ? err.status : 'network');
        send(sse({ type: 'error', reason: 'busy', message: 'The coach is busy. Try again in a minute.' }));
      } finally {
        // A message that reached the model counts, even a refused one.
        if (usageIn || usageOut) {
          await rpc('ai_record_usage', `Bearer ${SERVICE}`, SERVICE, {
            p_gym: status.gym_id, p_member: member.id, p_in: usageIn, p_out: usageOut,
          }).catch((e) => console.error('ai-coach usage', String(e)));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
});
```

- [ ] **Step 2: Check it against the SDK before relying on it**

Deno is not installed on this machine, so this file is not compiled locally. Verify the three calls it makes against the SDK docs bundled with the `claude-api` skill (`typescript/claude-api/streaming.md` and `README.md`): `client.beta.messages.stream(...)` async-iterates events with `content_block_delta` / `text_delta`; `.finalMessage()` returns `usage` and `stop_reason`; `Anthropic.APIError` has `.status`. Fix any name that differs. Then re-run `node --experimental-strip-types scripts/ai-coach-core.mjs` (the core it imports must still pass).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ai-coach/index.ts
git commit -m "ai-coach: the Edge Function — gates as the member, Claude streamed, usage by service role"
```

The live check of this function happens in Task 6 after the owner sets the key; until then the app treats `503 not_configured` exactly as it treats today's undeployed `fitness-assistant`.

---

### Task 4: The member app — client, consent, streaming chat

**Files:**
- Create: `g-fitness-member/src/lib/api/aiCoach.ts`
- Create: `g-fitness-member/src/components/CoachConsent.tsx`
- Modify: `g-fitness-member/src/pages/ChatbotPage.tsx` (imports; the model branch in `send`, lines 228–247; the header, line 302; `persist`, lines 201–210)
- Modify: `g-fitness-member/src/lib/api/assistantChats.ts` (`appendMessage` takes an optional source)
- Delete: `g-fitness-member/src/lib/api/fitnessAssistant.ts` (unused once the coach replaces it)

**Interfaces:**
- Consumes: the function's responses (Task 3); SQL `ai_coach_status()`, `set_ai_coach_consent()` (Task 1).
- Produces:
  - `getCoachStatus(): Promise<CoachStatus | null>` (null = unknown, e.g. 0143 not pasted)
  - `setCoachConsent(readsData: boolean): Promise<void>`
  - `askCoach(question: string, history: Turn[], onText: (chunk: string) => void): Promise<{ ok: true } | { ok: false; reason: string; message: string }>`
  - `<CoachConsent open onChoose={(yes: boolean) => void} />`

- [ ] **Step 1: Write `g-fitness-member/src/lib/api/aiCoach.ts`**:

```ts
import { supabase } from '../supabaseClient';

/**
 * The AI coach (0143 + the `ai-coach` Edge Function).
 *
 * The rules in data/memberAssistant.ts still answer every fact about this gym
 * first; the coach answers what they cannot. Every gate is the database's —
 * this file only reads the answer so the screen can explain it.
 */

export interface CoachStatus {
  gym_id: string; allowed: boolean;
  reason: 'not_member' | 'no_plan' | 'switched_off' | 'daily_limit' | 'monthly_limit' | null;
  used_today: number; daily_limit: number; used_month: number; monthly_limit: number;
  consent: boolean | null;
}

export interface Turn { role: 'user' | 'assistant'; content: string }

/** Null when unknown — before 0143 is pasted, or offline. Never a guess. */
export async function getCoachStatus(): Promise<CoachStatus | null> {
  const { data, error } = await supabase.rpc('ai_coach_status');
  if (error || !data) return null;
  return data as CoachStatus;
}

export async function setCoachConsent(readsData: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_ai_coach_consent', { p_reads_data: readsData });
  if (error) throw new Error(error.message);
}

/**
 * Ask the coach and stream its reply into `onText`.
 *
 * Resolves `{ ok: false }` for every failure — not configured, a limit, busy,
 * a refusal, offline — with the sentence to show. The caller keeps the rules'
 * answer in every one of them, so the coach can only ever add to the assistant.
 */
export async function askCoach(
  question: string, history: Turn[], onText: (chunk: string) => void,
): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const busy = { ok: false as const, reason: 'busy', message: 'The coach is busy. Try again in a minute.' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'signed_out', message: 'Sign in again to use the coach.' };
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, history: history.slice(-10) }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null) as { reason?: string; message?: string } | null;
      return { ok: false, reason: body?.reason ?? 'busy', message: body?.message ?? busy.message };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut: number;
      while ((cut = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
        if (!frame.startsWith('data: ')) continue;
        const ev = JSON.parse(frame.slice(6)) as { type: string; text?: string; reason?: string; message?: string };
        if (ev.type === 'text' && ev.text) onText(ev.text);
        if (ev.type === 'error') return { ok: false, reason: ev.reason ?? 'busy', message: ev.message ?? busy.message };
        if (ev.type === 'done') return { ok: true };
      }
    }
    return busy;
  } catch {
    return busy;
  }
}
```

- [ ] **Step 2: Write `g-fitness-member/src/components/CoachConsent.tsx`** — a `GlassSheet`-style bottom sheet, portalled, with the always-mounted wrapper owning `pointerEvents` (CLAUDE.md's rule). Read `components/ui/GlassSheet.tsx` first and use it if its props fit (`open`, `onClose`, children); otherwise follow the saved-chats panel in `ChatbotPage.tsx` lines 415–506. Content, verbatim:

```tsx
import GlassSheet from './ui/GlassSheet';
import { NocButton } from './ui/noc';

/**
 * Asked once, before the coach first answers (0143). Messages go to Anthropic
 * to be answered, and the coach reads your training only if you say yes here.
 * The same switch lives in Settings, and No still leaves you a working coach.
 */
export default function CoachConsent({ open, onChoose }: { open: boolean; onChoose: (yes: boolean) => void }) {
  return (
    <GlassSheet open={open} onClose={() => onChoose(false)} title="Before the coach answers">
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
        <p>The coach is an AI. What you type is sent to Anthropic, the company that runs it, to be answered.</p>
        <p style={{ marginTop: 10 }}>It gives better advice if it can see your training: your goals, your routines,
          how often you have worked out lately, and your first name.</p>
        <p style={{ marginTop: 10 }}>It never sees your health or waiver answers, your payments, your contact
          details, your chats with coaches or your photos.</p>
        <p style={{ marginTop: 10 }}>You can change this any time in Settings.</p>
      </div>
      <div className="flex flex-col" style={{ gap: 10, marginTop: 18 }}>
        <NocButton variant="fill" onClick={() => onChoose(true)}>Yes, use my training</NocButton>
        <NocButton variant="ghost" onClick={() => onChoose(false)}>No, just answer questions</NocButton>
      </div>
    </GlassSheet>
  );
}
```

If `GlassSheet`'s actual props differ (e.g. no `title`), adapt the call to its real signature; the text stays as written.

- [ ] **Step 3: `assistantChats.ts` — record which side answered**

Change `appendMessage(conversationId, role, body)` to `appendMessage(conversationId, role, body, source?: 'rules' | 'coach')` and include `...(source ? { source } : {})` in the insert object. Read the function first; keep its existing error handling.

- [ ] **Step 4: `ChatbotPage.tsx` — rules first, then the coach, streamed**

1. Imports: remove `import { askFitnessAssistant } from '../lib/api/fitnessAssistant';`; add
   `import { askCoach, getCoachStatus, setCoachConsent, type CoachStatus } from '../lib/api/aiCoach';` and
   `import CoachConsent from '../components/CoachConsent';`.
2. State, after `mayUseModel`:
   ```tsx
   const [coach, setCoach] = useState<CoachStatus | null>(null);
   const [askConsent, setAskConsent] = useState(false);
   // The question waiting for the consent answer, if the sheet opened on a send.
   const pending = useRef<string | null>(null);
   ```
   and inside the existing mount effect, after `refreshList();`: `getCoachStatus().then((s) => { if (!cancelled) setCoach(s); });`
3. `persist(question, answer)` → `persist(question, answer, source: 'rules' | 'coach')`, passing `'rules'`/`'coach'` into the second `appendMessage`.
4. Replace the block from `if (isRuleFallback(answer) && mayUseModel) {` to its closing `}` (lines 234–247) with:
   ```tsx
   let source: 'rules' | 'coach' = 'rules';
   if (isRuleFallback(answer) && mayUseModel && coach?.allowed) {
     if (coach.consent === null) {
       // First time: ask before anything leaves the phone. The question is sent
       // once they answer (see onConsent).
       pending.current = trimmed;
       setAskConsent(true);
       setIsTyping(false);
       return;
     }
     const history = messagesRef.current
       .filter((m) => m.id !== GREETING_ID)
       .slice(-10)
       .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
     const botId = `${Date.now()}c`;
     let streamed = '';
     setMessages((prev) => [...prev, { id: botId, text: '', sender: 'bot' }]);
     setIsTyping(false);
     const result = await askCoach(trimmed, history, (chunk) => {
       streamed += chunk;
       setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: streamed } : m)));
     });
     if (result.ok && streamed.trim()) {
       answer = streamed;
       source = 'coach';
     } else {
       // The rules' answer stands, with the coach's reason under it when it has one.
       answer = result.ok ? answer : `${answer}\n\n${result.message}`;
       setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: answer } : m)));
     }
     setCoach((c) => (c ? { ...c, used_today: c.used_today + (source === 'coach' ? 1 : 0) } : c));
     try { await persist(trimmed, answer, source); setSaveError(null); }
     catch (err) { setSaveError(errorMessage(err, 'This conversation is not being saved.')); }
     return;
   }
   ```
   and directly after that block, for a member who has reached a limit (the spec: the rules' answer stands and the reason is said):
   ```tsx
   if (isRuleFallback(answer) && mayUseModel && coach && !coach.allowed
       && (coach.reason === 'daily_limit' || coach.reason === 'monthly_limit')) {
     answer = coach.reason === 'daily_limit'
       ? `${answer}\n\nYou have used today's ${coach.daily_limit} messages with the coach. It opens again tomorrow.`
       : `${answer}\n\nThe coach has reached this gym's limit for the month.`;
   }
   ```
   Then in the unchanged tail below it change `await persist(trimmed, answer);` to `await persist(trimmed, answer, source);`.
   Add to the screen check's limit step: `out.push('the limit is explained: ' + (/used today's 30 messages/.test(await text()) ? 'yes' : 'MISSING'));`
5. Consent handler and sheet — add above `return (`:
   ```tsx
   const onConsent = async (yes: boolean) => {
     setAskConsent(false);
     try { await setCoachConsent(yes); setCoach((c) => (c ? { ...c, consent: yes } : c)); }
     catch (err) { setSaveError(errorMessage(err, 'Your choice was not saved.')); return; }
     const q = pending.current; pending.current = null;
     if (q) { setMessages((prev) => prev.filter((m) => m.text !== q || m.sender !== 'user')); send(q); }
   };
   ```
   and render `<CoachConsent open={askConsent} onChoose={(yes) => void onConsent(yes)} />` just before the closing `</div>` of the page.
6. Header (line 302): the subtitle becomes honest about the model:
   `subtitle={coach?.allowed ? 'Gym answers from the app · training help from the AI coach' : 'Answers about your account and the gym'}`,
   and under the New chat / Saved chats row, when `coach?.allowed`, a line:
   `<span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{coach.used_today} of {coach.daily_limit} coach messages today</span>`.

- [ ] **Step 5: Delete `g-fitness-member/src/lib/api/fitnessAssistant.ts`**, then:

Run: `cd g-fitness-member && npx tsc -b && npx eslint src/pages/ChatbotPage.tsx src/lib/api/aiCoach.ts src/components/CoachConsent.tsx`
Expected: no errors. `python scripts/audit-dead-code.py` shows no new lead for these files.

- [ ] **Step 6: Commit**

```bash
git add g-fitness-member/src
git commit -m "Member app: the assistant hands what its rules cannot answer to the AI coach, streamed, after asking consent"
```

---

### Task 5: Privacy, the data export, Settings switch, and the screen check

**Files:**
- Modify: `g-fitness-member/src/pages/Privacy.tsx:63`
- Modify: `g-fitness-member/src/lib/memberDataExport.ts` and `g-fitness-admin/src/lib/memberDataExport.ts` (identical)
- Modify: the member Settings page (find it: `grep -ln "Your data" g-fitness-member/src/pages/*.tsx`)
- Create: `scripts/member-coach-check.js`; Modify: `scripts/ci/ui-checks.json`

- [ ] **Step 1: Privacy — replace the assistant sentence (line 63) with:**

```ts
'The in-app assistant answers questions about your membership, bookings and the gym from fixed rules, in the app. At gyms and on plans that include the AI coach, questions the rules cannot answer are sent to Anthropic, the company that runs the model, to be answered. The coach sees your first name, goals, routines and how often you have trained lately only if you say yes when it first asks (Settings changes it); it never sees health or waiver answers, payments, contact details, chats with coaches or photos. Your conversations are kept in the gym\'s database, visible only to you, and you can delete them.',
```

- [ ] **Step 2: Data export (both copies, identical)** — add to `TABLES`, after `['member_share_prefs', 'member_id'],`:

```ts
  ['ai_coach_profiles', 'member_id'],
  ['ai_usage_days', 'member_id'],
```

Run `diff g-fitness-member/src/lib/memberDataExport.ts g-fitness-admin/src/lib/memberDataExport.ts` → no output.

- [ ] **Step 3: Settings** — next to the existing privacy/data rows, a toggle row "Let the coach read my training", shown only when `getCoachStatus()` returns non-null and `allowed`, reading `consent === true` and calling `setCoachConsent(!on)`. Use the row component the page already uses for its other toggles (read the page first).

- [ ] **Step 4: The screen check** — `scripts/member-coach-check.js`. Generate it from `member-shop-check.js`'s setup (the session planting, `DB`, `match`, `route` handler) with a Write-tool script, the same way `member-switches-check.js` was made, and:
  - add to `RPC`: `ai_coach_status: { gym_id: 'gym-1', allowed: true, reason: null, used_today: 3, daily_limit: 30, used_month: 40, monthly_limit: 1500, consent: null }` (as `let COACH = {...}` so steps can change it) and `set_ai_coach_consent: null` recording `CALLS.set_ai_coach_consent`;
  - route `**/functions/v1/ai-coach` to `route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"type":"text","text":"Brace like "}\n\ndata: {"type":"text","text":"you are about to be poked."}\n\ndata: {"type":"done"}\n\n' })`, recording the posted body;
  - the tail:

```js
  await go('/member/chatbot');
  let t = await text();
  out.push('coach named honestly: ' + (/training help from the AI coach/.test(t) ? 'yes' : 'MISSING'));
  out.push('messages left shown: ' + (/3 of 30 coach messages today/.test(t) ? 'yes' : 'MISSING'));
  await page.getByLabel('Your question').fill('How do I brace for a squat?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1200);
  t = await text();
  out.push('consent asked before anything is sent: ' + (/Before the coach answers/.test(t) && !COACH_POSTS.length ? 'yes' : 'MISSING'));
  await page.getByRole('button', { name: 'Yes, use my training' }).click();
  await page.waitForTimeout(2000);
  t = await text();
  out.push('consent saved: ' + (CALLS.set_ai_coach_consent?.p_reads_data === true ? 'yes' : 'MISSING'));
  out.push('the question reached the coach once: ' + (COACH_POSTS.length === 1 && COACH_POSTS[0].question === 'How do I brace for a squat?' ? 'yes' : 'MISSING'));
  out.push('the streamed reply is shown whole: ' + (/Brace like you are about to be poked\./.test(t) ? 'yes' : 'MISSING'));
  out.push('saved as the coach\'s: ' + ((DB.assistant_messages ?? []).some((m) => m.source === 'coach') ? 'yes' : 'MISSING'));
  // Gym facts still come from the rules, never the model.
  const before = COACH_POSTS.length;
  await page.getByLabel('Your question').fill('What time do you open?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  out.push('a gym fact is answered by the rules: ' + (COACH_POSTS.length === before ? 'yes' : 'NO, sent to the model'));
  // At the limit: the rules' answer stands and the reason is said.
  COACH.allowed = false; COACH.reason = 'daily_limit'; COACH.used_today = 30;
  await go('/member/chatbot');
  await page.getByLabel('Your question').fill('Why am I sore for three days?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  out.push('at the limit nothing is sent: ' + (COACH_POSTS.length === before ? 'yes' : 'NO, sent anyway'));
  await page.screenshot({ path: 'shots/member-coach.png' });
  return out.join('\n');
}
```

Add `{ "file": "member-coach-check.js", "app": "member" }` to `scripts/ci/ui-checks.json` (keep the one-line-per-check format: edit with `sed`, never re-serialise the JSON).

- [ ] **Step 5: Run it** — from `~/uicheck`: `node "<repo>/scripts/ci/run-ui-checks.mjs" member-coach` → PASS. A failing line: suspect the fixture first (column names, `Content-Range`), then the page.

- [ ] **Step 6: Commit**

```bash
git add g-fitness-member/src g-fitness-admin/src/lib/memberDataExport.ts scripts/member-coach-check.js scripts/ci/ui-checks.json
git commit -m "Coach: Privacy says what leaves and when, export includes it, Settings switch, screen check"
```

---

### Task 6: Bookkeeping, full verification, ship, and the owner's steps

**Files:**
- Modify: `scripts/probe-migrations.py` (row 0143), `g-fitness-admin/src/pages/SystemHealth.tsx` (`LAST = 143`), `.github/workflows/ci.yml` (add `ai-coach` to the SQL list; a step `node --experimental-strip-types scripts/ai-coach-core.mjs`), `CLAUDE.md` (≤ 199 lines: replace the sentence "**The "AI" features are deterministic and rule-based, not model calls**" with the new truth, and a Roadmap sentence for 0143), `docs/AI_INTEGRATION.md` (a top section: the coach supersedes `fitness-assistant`; what is sent and when; cost), the spec (conversations reuse 0046's tables).

- [ ] **Step 1:** Make those edits. `python scripts/probe-migrations.py` shows 0143 NOT PASTED until the owner pastes it (correct).
- [ ] **Step 2:** Full sweep — all four apps `npm run build`; both apps `npx eslint` on changed files; the three audits; every `scripts/sql/*.mjs` in the CI list; `node --experimental-strip-types scripts/accent-contrast.mjs`; `node --experimental-strip-types scripts/ai-coach-core.mjs`; every UI check. All green before shipping.
- [ ] **Step 3:** Commit, `git push`, `npx vercel deploy --prod --yes` in `g-fitness-member` (and `g-fitness-admin`, whose export changed); `python scripts/verify-deploy.py https://corefitness-gym.vercel.app`.
- [ ] **Step 4: Hand the owner their steps, in this order** (never do them for them — the key is a credential):
  1. Paste `0143_ai_coach_foundation.sql`, then `scripts/sql/verify/verify0143.sql` — every part OK.
  2. console.anthropic.com → create an account → Billing: add credit (e.g. $10) and **set a monthly spend limit** → API keys: create a key.
  3. Supabase dashboard → Edge Functions → Secrets: add `ANTHROPIC_API_KEY` (and optionally `COACH_MODEL`).
  4. Deploy the function: Supabase dashboard → Edge Functions → Deploy new function `ai-coach` from `supabase/functions/ai-coach/` (or `npx supabase functions deploy ai-coach` after `npx supabase login` and `link`).
  5. Tell the agent; it then signs in as a test **Premium** member on the live app (a test account the owner provides or created for testing — not a real member's password), asks "How do I brace for a squat?" and "What time do you open?", and confirms: the first streams from the coach, the second is the rules' answer, and the count went up by one.

---

## Phases 2–5 (each its own plan, written when the previous ships)

- **Phase 2 — Onboarding:** coaching profile columns on `ai_coach_profiles`, `save_ai_coach_profile()`, the guided first conversation with quick-reply chips, the profile added to `ai_coach_context()`.
- **Phase 3 — Training tools:** read tools and the proposal system (`ai_proposals`, `create_ai_proposal`, `apply_ai_proposal`, `undo_ai_proposal`), kinds `routine.create`, `routine.replace`, `schedule.set`, `goal.create`; `source` columns on routines and `gym_plans`; proposal cards; trainer member sheet mark.
- **Phase 4 — Meals:** `ai_meal_guides`, `meals.set` with the no-numbers check, the Meals section under Progress.
- **Phase 5 — Owner and platform:** Your app limits and this month's usage and estimated cost; platform Usage row per gym.
