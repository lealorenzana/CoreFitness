# AI Coach — Phase 2: Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first time a member opens the coach it sets them up in a short guided conversation — goal, experience, days a week, minutes a session, equipment, what they enjoy, what to avoid, and whether anything hurts — saves the answers as their coaching profile, and every coach reply from then on is shaped by it.

**Architecture:** Migration 0144 adds the profile columns to `ai_coach_profiles`, a validating writer `save_ai_coach_profile(jsonb)`, and extends `ai_coach_context()` so the profile is always given to the coach (the member typed it *for* the coach) while their training history still needs consent. The setup is deterministic quick-reply chips in the chat — no model call per step — and ends with one coach message that welcomes them using what they said.

**Tech Stack:** Supabase Postgres (pglite tests), React 19 member app, Playwright fixture check.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-coach-design.md` (Phase 2)

## Global Constraints

- An injury answer is stored as **a yes/no only, never the text**; a yes makes the coach refer (see a coach at the gym or a doctor/physiotherapist) and never change or substitute exercises for it.
- The profile is given to the coach whether or not the member consented to history (they wrote it for the coach); goals, routines, workouts and experience level from the rest of the app still need consent.
- Setup never blocks: "Skip for now" is always there; the coach answers without a profile.
- Nothing is sent to the model during the chips; one model call at the end (the welcome), counted like any message.
- Copy is exact as written below; Privacy changes in the same commit.
- Member app rules (CLAUDE.md): build from `components/ui/noc.tsx`; never declare a component inside a render body; an unused import fails the build.

---

### Task 1: Migration 0144 — the coaching profile

**Files:**
- Create: `supabase/migrations/0144_ai_coach_profile.sql`
- Create: `scripts/sql/verify/verify0144.sql`
- Modify: `scripts/sql/ai-coach.mjs` (append checks before the verify step)

**Interfaces — Produces:**
- `save_ai_coach_profile(p jsonb) returns void` (authenticated). Keys: `goal` ∈ `strength|muscle|fat_loss|fitness|sport|health`; `experience` ∈ `new|some|experienced`; `days_per_week` int 1–7; `minutes` int 15–180; `equipment` text[] ⊆ `full_gym|machines|barbell|dumbbells|bodyweight|cardio` (1–6 items); `likes` text ≤ 200 or null; `avoid` text ≤ 200 or null; `has_injury` boolean. Missing required key or bad value → exception with a plain sentence. Sets `onboarded_at = now()`. Creates the row (consent_reads_data false) if none.
- `ai_coach_context()` now returns `{ profile: {...} | null, ...history fields only with consent }` — i.e. `null` only when there is neither a profile nor consent.
- `ai_coach_status()` gains `onboarded boolean`.

- [ ] **Step 1: Write the failing checks** — append to `scripts/sql/ai-coach.mjs` before the verify block:

```js
// ---- 0144: the coaching profile ----------------------------------------------------------------
await as(A);
check('status says not set up yet', (await status()).onboarded === false);
check('a bad goal is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"get huge","experience":"new","days_per_week":3,"minutes":45,"equipment":["dumbbells"],"has_injury":false}'::jsonb)`)));
check('8 days a week is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":8,"minutes":45,"equipment":["dumbbells"],"has_injury":false}'::jsonb)`)));
check('unknown equipment is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength","experience":"new","days_per_week":3,"minutes":45,"equipment":["rocket"],"has_injury":false}'::jsonb)`)));
check('a missing answer is refused', !!(await tryExec(`select save_ai_coach_profile('{"goal":"strength"}'::jsonb)`)));
check('a 201-character note is refused', !!(await tryExec(`select save_ai_coach_profile(jsonb_build_object('goal','strength','experience','new','days_per_week',3,'minutes',45,'equipment',jsonb_build_array('dumbbells'),'has_injury',false,'likes',repeat('x',201)))`)));
check('a good profile saves', !(await tryExec(`select save_ai_coach_profile('{"goal":"muscle","experience":"some","days_per_week":4,"minutes":60,"equipment":["full_gym","dumbbells"],"likes":"lifting","avoid":"running","has_injury":true}'::jsonb)`)));
check('status says set up', (await status()).onboarded === true);
await db.exec(`select set_ai_coach_consent(false)`);
let c = (await one(`select ai_coach_context() as c`)).c;
check('without consent: the profile only', c?.profile?.goal === 'muscle' && c?.profile?.has_injury === true
  && c.goals === undefined && c.routines === undefined && c.experience_level === undefined, JSON.stringify(c));
check('the injury is a yes/no, never text', !/injur.*[a-z]{4,}/i.test(JSON.stringify(c?.profile ?? {}).replace('"has_injury":true', '')));
await db.exec(`select set_ai_coach_consent(true)`);
c = (await one(`select ai_coach_context() as c`)).c;
check('with consent: profile and history', c?.profile?.goal === 'muscle' && Array.isArray(c?.goals), JSON.stringify(c));
await as(B);
check('another member sees none of A\'s profile',
  (await one(`select count(*)::int as n from ai_coach_profiles where member_id = '${A}'`)).n === 0);
check('a member with nothing set up gets no context', (await one(`select ai_coach_context() as c`)).c === null);
```

(Adjust only if a fixture name differs; the assertions stay.) Also extend the verify step's expectation to run `verify0144.sql` the same way as `verify0143.sql`.

- [ ] **Step 2: Run to see it fail** — `cd ~/uicheck && node "<repo>/scripts/sql/ai-coach.mjs" "<repo>"` → FAIL (`function save_ai_coach_profile does not exist`).

- [ ] **Step 3: Write `supabase/migrations/0144_ai_coach_profile.sql`:**

```sql
-- ============================================================================
-- 0144 — the coach's profile of a member (AI coach, Phase 2)
-- ============================================================================
-- What a member tells the coach when it sets them up. Given to the coach
-- whether or not they let it read their training (they wrote it for the
-- coach); their history from the rest of the app still needs that consent.
-- An injury is kept as yes/no only — never the words — and a yes makes the
-- coach refer, never change exercises (CLAUDE.md).
-- ============================================================================

alter table ai_coach_profiles add column if not exists goal text;
alter table ai_coach_profiles add column if not exists experience text;
alter table ai_coach_profiles add column if not exists days_per_week int;
alter table ai_coach_profiles add column if not exists minutes int;
alter table ai_coach_profiles add column if not exists equipment text[];
alter table ai_coach_profiles add column if not exists likes text;
alter table ai_coach_profiles add column if not exists avoid text;
alter table ai_coach_profiles add column if not exists has_injury boolean;
alter table ai_coach_profiles add column if not exists onboarded_at timestamptz;

alter table ai_coach_profiles drop constraint if exists ai_coach_profiles_answers_check;
alter table ai_coach_profiles add constraint ai_coach_profiles_answers_check check (
  (goal is null or goal in ('strength','muscle','fat_loss','fitness','sport','health'))
  and (experience is null or experience in ('new','some','experienced'))
  and (days_per_week is null or days_per_week between 1 and 7)
  and (minutes is null or minutes between 15 and 180)
  and (equipment is null or (cardinality(equipment) between 1 and 6
       and equipment <@ array['full_gym','machines','barbell','dumbbells','bodyweight','cardio']))
  and (likes is null or char_length(likes) <= 200)
  and (avoid is null or char_length(avoid) <= 200));

create or replace function save_ai_coach_profile(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_equipment text[];
begin
  if auth.uid() is null or current_gym_id() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p is null or not (p ? 'goal' and p ? 'experience' and p ? 'days_per_week' and p ? 'minutes'
                       and p ? 'equipment' and p ? 'has_injury') then
    raise exception 'Please answer every question first.';
  end if;
  if jsonb_typeof(p -> 'equipment') <> 'array' then
    raise exception 'Choose the equipment you can use.';
  end if;
  select array_agg(e) into v_equipment from jsonb_array_elements_text(p -> 'equipment') e;
  insert into ai_coach_profiles (gym_id, member_id, consent_reads_data, consented_at,
      goal, experience, days_per_week, minutes, equipment, likes, avoid, has_injury, onboarded_at)
  values (current_gym_id(), auth.uid(), false, now(),
      p ->> 'goal', p ->> 'experience', (p ->> 'days_per_week')::int, (p ->> 'minutes')::int, v_equipment,
      nullif(btrim(p ->> 'likes'), ''), nullif(btrim(p ->> 'avoid'), ''), (p ->> 'has_injury')::boolean, now())
  on conflict (gym_id, member_id) do update set
      goal = excluded.goal, experience = excluded.experience, days_per_week = excluded.days_per_week,
      minutes = excluded.minutes, equipment = excluded.equipment, likes = excluded.likes,
      avoid = excluded.avoid, has_injury = excluded.has_injury, onboarded_at = now();
end;
$$;
revoke all on function save_ai_coach_profile(jsonb) from public, anon;
grant execute on function save_ai_coach_profile(jsonb) to authenticated;
```

Then **redefine `ai_coach_status()`** — copy its body from 0143 exactly and add `'onboarded', <exists a row for (v_gym, v_me) with onboarded_at not null>` to the returned object. And **redefine `ai_coach_context()`**:

```sql
create or replace function ai_coach_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id(); p ai_coach_profiles%rowtype; v_profile jsonb;
begin
  select * into p from ai_coach_profiles where gym_id = v_gym and member_id = v_me;
  if p.onboarded_at is not null then
    v_profile := jsonb_build_object('goal', p.goal, 'experience', p.experience, 'days_per_week', p.days_per_week,
      'minutes', p.minutes, 'equipment', to_jsonb(p.equipment), 'likes', p.likes, 'avoid', p.avoid,
      'has_injury', p.has_injury);
  end if;
  if not coalesce(p.consent_reads_data, false) then
    return case when v_profile is null then null else jsonb_build_object('profile', v_profile) end;
  end if;
  return jsonb_build_object(
    'profile', v_profile,
    'first_name', (select pr.first_name from profiles pr where pr.id = v_me),
    'experience_level', (select mp.experience_level from member_profiles mp where mp.profile_id = v_me and mp.gym_id = v_gym),
    'goals', coalesce((select jsonb_agg(g.title order by g.created_at) from fitness_goals g
                        where g.member_id = v_me and g.gym_id = v_gym and g.achieved_on is null), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(r.name order by r.position) from workout_routines r
                           where r.member_id = v_me and r.gym_id = v_gym), '[]'::jsonb),
    'workouts_30d', (select count(*) from workout_logs l
                      where l.member_id = v_me and l.gym_id = v_gym and l.completed_at >= now() - interval '30 days'));
end;
$$;
```

Keep 0143's grants (a `create or replace` keeps them; do not revoke). End with the probe marker `migration_0144_applied()` in 0143's exact style.

- [ ] **Step 4: `scripts/sql/verify/verify0144.sql`** — 0143's shape: report the 9 columns exist, the answers check exists, `save_ai_coach_profile` exists and is executable by authenticated, `ai_coach_context` source contains `onboarded_at` and still `consent_reads_data`; `REPORT 0144: … OK/NOT OK`.

- [ ] **Step 5: Run to pass**; also `tenancy-isolation.mjs`. **Mutation:** in a scratch copy make the no-consent branch return the full object; `without consent: the profile only` must fail; restore; `cmp`.

- [ ] **Step 6: Commit** — `0144: the coach's profile of a member, given to the coach; history still needs consent` + Co-Authored-By.

---

### Task 2: The guided setup in the chat, and the coach using it

**Files:**
- Create: `g-fitness-member/src/components/CoachSetup.tsx`
- Modify: `g-fitness-member/src/lib/api/aiCoach.ts` (`onboarded` on `CoachStatus`; `saveCoachProfile(p)`)
- Modify: `g-fitness-member/src/pages/ChatbotPage.tsx`
- Modify: `supabase/functions/ai-coach/core.ts` (prompt rule for the profile's injury flag) + `scripts/ai-coach-core.mjs`
- Modify: `g-fitness-member/src/pages/Privacy.tsx` (the assistant sentence)
- Create: `scripts/member-coach-setup-check.js`; Modify: `scripts/ci/ui-checks.json`

**Interfaces:**
- Consumes: `save_ai_coach_profile(p jsonb)`, `ai_coach_status().onboarded` (Task 1).
- Produces: `saveCoachProfile(p: CoachProfile): Promise<void>`; `type CoachProfile = { goal; experience; days_per_week; minutes; equipment: string[]; likes: string | null; avoid: string | null; has_injury: boolean }`; `<CoachSetup onDone={(p: CoachProfile) => void} onSkip={() => void} />`.

- [ ] **Step 1: core.ts — the injury rule.** Add to `SYSTEM_PROMPT`'s rules, as rule 6, verbatim:
  `6. If the member's profile says has_injury is true, do not plan or change exercises around it. Say once, kindly, that a coach at the gym or a physiotherapist should look at it first, then help with everything else.`
  and to `scripts/ai-coach-core.mjs`: `check('the profile injury rule is in the prompt', /has_injury is true/.test(core.SYSTEM_PROMPT));`. Run the node test.

- [ ] **Step 2: `aiCoach.ts`** — add `onboarded: boolean` to `CoachStatus` (treat a missing field as `true`, so a database without 0144 never shows the setup), the `CoachProfile` type, and:

```ts
export async function saveCoachProfile(p: CoachProfile): Promise<void> {
  const { error } = await supabase.rpc('save_ai_coach_profile', { p });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: `CoachSetup.tsx`** — one question at a time, as coach-side text on the page (same visual as a bot message: `borderLeft: 2px solid var(--color-primary)`) with `Chip`s below it; each tap records the answer, shows it as the member's bubble, and moves on. A "Back" text button undoes the last answer; "Skip for now" (always visible) calls `onSkip`. Questions and choices, verbatim:

| # | Coach says | Choices (label → value) |
|---|---|---|
| 1 | "Let's set you up. What do you want most from training?" | Get stronger → strength · Build muscle → muscle · Lose fat → fat_loss · Get fitter → fitness · Train for a sport → sport · Feel healthier → health |
| 2 | "How long have you been training?" | I'm new → new · A few months to a year → some · Over a year → experienced |
| 3 | "How many days a week can you train?" | 1 … 7 (value = the number) |
| 4 | "How long is a usual session?" | 30 min → 30 · 45 min → 45 · 60 min → 60 · 90 min → 90 |
| 5 | "What can you use? Pick all that apply, then tap Done." | Full gym → full_gym · Machines → machines · Barbell → barbell · Dumbbells → dumbbells · Just my body → bodyweight · Cardio machines → cardio · **Done** (enabled when ≥ 1 chosen; multi-select with `on`) |
| 6 | "Anything you love doing, or want to avoid? (Optional)" | two `TextInput`s labelled "I enjoy" and "I'd rather avoid", `maxLength={200}`, and a **Next** button |
| 7 | "Does anything hurt at the moment, or do you have an injury?" | No → false · Yes → true. After Yes, the coach says: "Thanks for telling me. I won't plan around it — please have a coach at the gym or a physiotherapist look at it first. I can still help with everything else." (no text box: the injury is never written down) |

After #7 it calls `onDone(profile)`.

- [ ] **Step 4: `ChatbotPage.tsx`** — when `coach?.allowed && coach.consent !== null && coach.onboarded === false` and the member has not skipped in this visit, render `<CoachSetup>` in place of the suggestion chips at the top of an empty chat. `onDone`: `saveCoachProfile(p)` (on failure: show the save error banner, keep the answers, offer "Try again"); on success update the status (`onboarded: true`, via the existing `updateCoach` so `coachRef` stays in sync) and send one coach message through the normal path with the question `"I've finished setting up. Give me a short welcome and one first step."` (it is counted like any message). `onSkip`: hide the setup for this visit only (component state, not storage). Add a small text button under the header, shown when `coach?.allowed && coach.onboarded`, "Redo my setup", which re-opens the setup. Keep every Phase 1 behaviour (rules first, consent first, history rules from the final review: only coach replies and their questions).

- [ ] **Step 5: Privacy** — in the assistant sentence, after the consent clause, add verbatim: `What you tell the coach when it sets you up — your goal, experience, how often and how long you train, your equipment, what you enjoy or avoid, and whether something hurts (a yes or no, never the details) — is kept for the coach and used in every answer, even if you do not let it read your training.`

- [ ] **Step 6: `scripts/member-coach-setup-check.js`** — built from `scripts/member-coach-check.js`'s setup (same single route handler; `COACH` object with `consent: true, onboarded: false`; record `save_ai_coach_profile` posts). Assert: the first question shows; tapping through all seven (Build muscle, Over a year, 4, 60 min, Dumbbells + Full gym + Done, Next with "running" in "I'd rather avoid", Yes) posts a profile `{goal:'muscle', experience:'experienced', days_per_week:4, minutes:60, equipment:[…both], avoid:'running', has_injury:true}`; the referral sentence appears after Yes; no request reached the function until the setup finished and then exactly one (the welcome); "Skip for now" hides the setup and a question still goes to the coach; with `onboarded: true` the setup does not appear and "Redo my setup" does. Failure words: MISSING / NO / STILL SHOWN. Add it to `scripts/ci/ui-checks.json` (one line, sed, never re-serialise).

- [ ] **Step 7: Verify** — `npx tsc -b`, eslint on touched files, the node core test, the new check and `member-coach` pass. Commit: `Coach: a guided setup in the chat, and every answer shaped by it` + Co-Authored-By.

---

### Task 3: Bookkeeping and the sweep

- [ ] probe row 0144; SystemHealth `LAST = 144`; CLAUDE.md Roadmap clause for 0144 (≤ 199 lines, edit in place); `docs/AI_INTEGRATION.md` coach section: what the profile holds and that it is sent without the history consent; the spec's Phase 2 line marked done.
- [ ] Full sweep: 4 builds, eslint on changed files, 3 audits, accent-contrast, ai-coach-core, every SQL file in the CI list, every UI check. Commit. (Push/deploy is the controller's, after the final review.)
