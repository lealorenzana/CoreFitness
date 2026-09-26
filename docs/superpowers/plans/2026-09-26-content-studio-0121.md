# Content Studio 0121 — Exercise Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gym puts its own photo, demo video, coaching cues and steps on any exercise, and its members see them — in the exercise sheet and from a "How to" button mid-workout — without any other gym seeing them.

**Architecture:** The 36 standard exercises are one shared library (`exercises.gym_id is null`) that every gym reads, so a gym's media cannot live on the exercise row. It lives in a per-gym overlay, `gym_exercise_media (gym_id, exercise_id)`. The library rows carry the starter cues/steps as defaults; an overlay's cues/steps replace them for that gym only. Photos are counted in `gym_photos` against the gym's platform plan (`platform_plans.max_photos`, default 100); a photo can only be uploaded into a slot reserved by `reserve_gym_photo()`, so the count cannot be bypassed.

**Tech Stack:** Postgres/Supabase (RLS, storage policies), pglite harness, React 19 + Vite (admin Tailwind v3, member Tailwind v4), Playwright fixture checks.

**Spec:** `docs/superpowers/specs/2026-09-26-content-studio-design.md` (0121 section)

## Global Constraints

- Video: links only; allowed hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`, `vimeo.com`, `player.vimeo.com`, https only — enforced in SQL.
- Photos: counted per gym; `max_photos` seeded **100** on every platform plan; NULL = unlimited; compressed on the device to ≤1280px JPEG before upload.
- Who edits: gym **admin** (any row in their gym) and **trainers** (only rows they created). Front desk (`staff`) does not edit content.
- Exercise how-tos are **never locked** by a member plan.
- Every gym table joins `tenancy_gym_tables()` and gets the four restrictive `tenant_*` policies.
- A migration is pasted by hand; it ends with `migration_0121_applied()` and has `verify0121.sql`.
- Member UI: `components/ui/noc.tsx` primitives, type floor 12px, violet = state, amber = action, no reds/greens.
- `assertWrote()` guards every `.update(`/`.delete(` in app code.

## Spec deviations (decided while planning, reported to the user)

1. **Media is an overlay table, not new columns on `exercises`.** The spec said "exercises gains photo/video…". The 36 seeded exercises are shared by every gym; columns on them would leak one gym's video to all.
2. **Only the platform curates the shared library.** 0099 let Gym #1's staff edit shared rows (`may_curate_library()` = platform or Gym #1) and turned Gym #1's new exercises into shared ones (`trg_library_row_gym`). In a SaaS that means one customer edits every customer's list — Gym #1 hiding "Deadlift" hid it everywhere. 0121: curation is platform-only; a gym hides a shared exercise with its overlay's `hidden`.
3. **"Published" = the existing `is_active` for a gym's own exercises**, and overlay edits are live on save. Drafts matter for programs (0122), not for one exercise's photo.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0121_exercise_media.sql` | overlay, photo slots, starter text, policies, curation change |
| `scripts/sql/content-media.mjs` | SQL proof (new) |
| `scripts/sql/verify/verify0121.sql` | paste report |
| `scripts/probe-migrations.py`, `g-fitness-admin/src/pages/SystemHealth.tsx` | 0121 row / LAST=121 |
| `g-fitness-admin/src/lib/videoEmbed.ts`, `g-fitness-member/src/lib/videoEmbed.ts` | URL → embed URL, **identical** |
| `g-fitness-admin/src/lib/api/exerciseMedia.ts`, `g-fitness-member/src/lib/api/exerciseMedia.ts` | overlay reads/writes, photo reserve/upload/release |
| `g-fitness-admin/src/pages/Exercises.tsx` | library vs own rows, media editor, photo counter |
| `g-fitness-member/src/components/workout/ExerciseGuide.tsx` | photo + video + cues + steps (one component) |
| `g-fitness-member/src/pages/workouts/ExerciseLibrary.tsx` | uses ExerciseGuide; drops hidden |
| `g-fitness-member/src/pages/GuidedWorkout.tsx` | "How to" button → sheet with ExerciseGuide |
| `g-fitness-member/src/pages/trainer/TrainerExercises.tsx` + route + rail link | trainer writes own |
| `corefitness-platform/src/lib/platform.ts`, `pages/Plans.tsx` | photo limit per plan |
| `scripts/admin-exercise-media-check.js`, `scripts/exercise-guide-check.js` | fixtures |

---

### Task 1: The migration and its SQL proof

**Files:** Create `supabase/migrations/0121_exercise_media.sql`, `scripts/sql/content-media.mjs`, `scripts/sql/verify/verify0121.sql`; modify `scripts/probe-migrations.py`, `g-fitness-admin/src/pages/SystemHealth.tsx` (`LAST = 121`), `.github/workflows/ci.yml` (add `content-media` to the rule-check loop).

**Interfaces — Produces (SQL):**
- table `gym_exercise_media(gym_id uuid, exercise_id uuid, photo_url text, video_url text, cues text[], steps text[], hidden boolean, created_by uuid, updated_at timestamptz)`, PK `(gym_id, exercise_id)`
- table `gym_photos(id uuid, gym_id uuid, path text unique, created_by uuid, created_at timestamptz)`
- `exercises.cues text[] not null default '{}'`, `exercises.steps text[] not null default '{}'`, `exercises.created_by uuid`
- `platform_plans.max_photos int default 100`
- `is_allowed_video_url(text) returns boolean`
- `reserve_gym_photo() returns text` — a path `gyms/<gym>/content/<uuid>.jpg`
- `release_gym_photo(p_path text) returns void`
- `gym_photo_usage() returns table(used int, cap int)` — cap NULL = unlimited
- `set_platform_plan_photo_limit(p_plan text, p_max int) returns void` (platform only)

- [ ] **Step 1: Write the failing harness** `scripts/sql/content-media.mjs`, same shape as `storage-tenancy.mjs` (liveDb, two gyms A/B, admin/staff/trainer/member each, `touched()` returning `'ERROR …'` on error). Checks, each one line:
  1. a gym A admin adds a video to shared "Barbell Back Squat"; gym B reads **no** overlay row for it
  2. gym B's member sees the library's starter cues (non-empty) for that exercise, gym A's member sees gym A's cues when set
  3. a non-YouTube/Vimeo link is refused (`https://evil.test/x`), `http://youtube.com/…` refused, `https://youtu.be/abc` allowed
  4. a trainer creates an overlay → `created_by` = them; a second trainer cannot update it (0 rows); the admin can
  5. the front desk cannot insert an overlay (error or 0)
  6. a member cannot insert/update overlays
  7. a gym A admin cannot update a shared library row (0 rows) — curation is platform-only now
  8. an exercise a gym A admin creates stays gym A's (`gym_id = A`, not null), and gym B cannot see it
  9. a trainer creates a gym exercise (`created_by` them); another trainer cannot update it
  10. photo limit: set gym A's plan `max_photos = 2`; admin reserves 2 → third `reserve_gym_photo()` raises; `release_gym_photo()` frees one; reserve works again
  11. `gym_photo_usage()` returns `used` matching and `cap = 2`
  12. storage: uploading `gyms/A/content/<reserved>.jpg` is allowed for the reserver; an unreserved content path is refused; gym B cannot upload into A's content folder; a trainer cannot upload `gyms/A/events/x.jpg` (0120 still holds)
  13. a member cannot reserve a photo
  14. a trainer cannot release another trainer's photo; the admin can
  15. `storage_policies_without_gym()` still returns 0 rows
  16. tenancy: gym B's admin reads 0 `gym_photos` rows of gym A

- [ ] **Step 2: Run it — expected FAIL** (`relation "gym_exercise_media" does not exist`).
  Run (from `~/uicheck`): `node "<repo>/scripts/sql/content-media.mjs" "<repo>"`

- [ ] **Step 3: Write `0121_exercise_media.sql`** — the whole file:

```sql
-- header comment: why an overlay (shared library), why photo slots, the curation change.

-- ---- 1. starter text lives on the shared library ------------------------------
alter table exercises add column if not exists cues  text[] not null default '{}';
alter table exercises add column if not exists steps text[] not null default '{}';
alter table exercises add column if not exists created_by uuid references profiles(id);

create or replace function guide_lines_ok(p text[], p_max int, p_len int) returns boolean
language sql immutable as $$
  select coalesce(array_length(p, 1), 0) <= p_max
     and not exists (select 1 from unnest(p) x where char_length(btrim(x)) not between 1 and p_len)
$$;
alter table exercises drop constraint if exists exercises_guide_ok;
alter table exercises add constraint exercises_guide_ok
  check (guide_lines_ok(cues, 6, 120) and guide_lines_ok(steps, 10, 240));

-- Starter cues/steps for every shared exercise, by name; only where empty, so a
-- re-run never overwrites. (Full text for all 36 is written in the file.)
update exercises e set cues = s.cues, steps = s.steps
  from (values ('Barbell Bench Press', array['…'], array['…']) /* …36 rows… */) s(name, cues, steps)
 where e.gym_id is null and lower(e.name) = lower(s.name) and e.cues = '{}';

-- ---- 2. only the platform curates the shared library -------------------------
create or replace function may_curate_library() returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin();
$$;
create or replace function trg_library_row_gym() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_platform_admin() and new.gym_id is not distinct from current_gym_id() then
    new.gym_id := null;   -- the platform adds to the shared list
  end if;
  return new;
end;
$$;

-- Trainers write gym exercises they created (admin keeps exercises_write_admin).
drop policy if exists exercises_insert_trainer on exercises;
create policy exercises_insert_trainer on exercises for insert to authenticated
  with check (storage_role_here() = 'trainer' and created_by = auth.uid() and gym_id = current_gym_id());
drop policy if exists exercises_update_trainer on exercises;
create policy exercises_update_trainer on exercises for update to authenticated
  using (storage_role_here() = 'trainer' and created_by = auth.uid() and gym_id = current_gym_id())
  with check (created_by = auth.uid() and gym_id = current_gym_id());
alter table exercises alter column created_by set default auth.uid();

-- ---- 3. video links ------------------------------------------------------------
create or replace function is_allowed_video_url(p text) returns boolean
language sql immutable as $$
  select p is null or p ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/'
$$;

-- ---- 4. the per-gym overlay -----------------------------------------------------
create table if not exists gym_exercise_media (
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  exercise_id uuid not null references exercises(id) on delete cascade,
  photo_url   text,
  video_url   text check (is_allowed_video_url(video_url)),
  cues        text[] check (cues  is null or guide_lines_ok(cues, 6, 120)),
  steps       text[] check (steps is null or guide_lines_ok(steps, 10, 240)),
  hidden      boolean not null default false,
  created_by  uuid not null default auth.uid() references profiles(id),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, exercise_id)
);
alter table gym_exercise_media enable row level security;
grant select, insert, update, delete on gym_exercise_media to authenticated;

create policy gym_exercise_media_read on gym_exercise_media for select to authenticated using (true);
create policy gym_exercise_media_insert on gym_exercise_media for insert to authenticated
  with check (storage_role_here() in ('admin', 'trainer') and created_by = auth.uid());
create policy gym_exercise_media_update on gym_exercise_media for update to authenticated
  using (storage_role_here() = 'admin' or (storage_role_here() = 'trainer' and created_by = auth.uid()))
  with check (storage_role_here() in ('admin', 'trainer'));
create policy gym_exercise_media_delete on gym_exercise_media for delete to authenticated
  using (storage_role_here() = 'admin' or (storage_role_here() = 'trainer' and created_by = auth.uid()));

-- created_by never changes (the admin editing a trainer's row keeps it the trainer's).
create or replace function trg_media_keep_author() returns trigger language plpgsql as $$
begin new.created_by := old.created_by; new.updated_at := now(); return new; end; $$;
create trigger gym_exercise_media_author before update on gym_exercise_media
  for each row execute function trg_media_keep_author();

-- ---- 5. photo slots --------------------------------------------------------------
alter table platform_plans add column if not exists max_photos int default 100
  check (max_photos is null or max_photos > 0);
create table if not exists gym_photos (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default acting_gym_id() references gyms(id),
  path text not null unique,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
alter table gym_photos enable row level security;
grant select on gym_photos to authenticated;          -- no write policy: the functions write
create policy gym_photos_read on gym_photos for select to authenticated using (true);

create or replace function gym_photo_usage() returns table (used int, cap int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from gym_photos where gym_id = current_gym_id()),
         (select pp.max_photos from gyms g join platform_plans pp on pp.key = g.plan
           where g.id = current_gym_id());
$$;

create or replace function reserve_gym_photo() returns text
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_cap int; v_used int; v_path text;
begin
  if storage_role_here() not in ('admin', 'trainer') or not gym_writable() then
    raise exception 'Only the gym owner and its trainers add photos.' using errcode = '42501';
  end if;
  perform 1 from gyms where id = v_gym for update;          -- two uploads at 99 cannot both win
  select pp.max_photos into v_cap from gyms g join platform_plans pp on pp.key = g.plan where g.id = v_gym;
  select count(*) into v_used from gym_photos where gym_id = v_gym;
  if v_cap is not null and v_used >= v_cap then
    raise exception 'Your plan allows % photos and all % are used. Delete one, or move to a bigger plan.', v_cap, v_used
      using errcode = '23514';
  end if;
  v_path := 'gyms/' || v_gym || '/content/' || gen_random_uuid() || '.jpg';
  insert into gym_photos (gym_id, path) values (v_gym, v_path);
  return v_path;
end;
$$;

create or replace function release_gym_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from gym_photos
   where path = p_path and gym_id = current_gym_id() and gym_writable()
     and (storage_role_here() = 'admin' or (storage_role_here() = 'trainer' and created_by = auth.uid()));
  if not found then
    raise exception 'That photo is not yours to remove.' using errcode = '42501';
  end if;
end;
$$;

create or replace function set_platform_plan_photo_limit(p_plan text, p_max int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform sets plan limits.' using errcode = '42501'; end if;
  update platform_plans set max_photos = p_max where key = p_plan;
  if not found then raise exception 'No plan %.', p_plan; end if;
end;
$$;

-- ---- 6. storage: content photos need a reserved slot ----------------------------
create or replace function content_slot_mine(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_photos where path = p_name and created_by = auth.uid()
                  and gym_id = current_gym_id());
$$;
create or replace function may_write_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text and gym_writable() and
    case when split_part(p_name, '/', 3) = 'content'
         then storage_role_here() in ('admin', 'trainer') and content_slot_mine(p_name)
         else storage_role_here() in ('admin', 'staff') end,
    false);
$$;
create or replace function may_delete_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (media_path_gym(p_name) = current_gym_id()::text and gym_writable() and
      (storage_role_here() = 'admin'
       or (split_part(p_name, '/', 3) = 'content' and content_slot_mine(p_name))))
    or is_platform_admin(),
    false);
$$;

-- ---- 7. tenancy (list = 0119's plus the two new tables) -------------------------
-- tenancy_gym_tables() redefined with 'gym_exercise_media','gym_photos' added;
-- the four restrictive tenant_* policies for both, exactly as 0119 section 1.

-- grants/revokes on every new function (authenticated only), the marker, verify pointer.
```

- [ ] **Step 4: Run the harness — expected PASS**, then the whole SQL suite (all eight `.mjs`), `replay-migrations` must read `121/121`.
- [ ] **Step 5: `verify0121.sql`** — REPORT line: `tables=2 of 2`, `overlay write policies without a role check=0` (**STOP line**), `shared exercises with starter cues=N of M`, `plans with a photo limit=…`, `photos used=…`. **`probe-migrations.py`** row `0121`, **`SystemHealth.tsx`** `LAST = 121`, CI loop adds `content-media`.
- [ ] **Step 6: Commit** — `0121: a gym's own photo, video and cues on any exercise, seen only by its members`.

### Task 2: Shared helpers in both apps

**Files:** Create `g-fitness-{admin,member}/src/lib/videoEmbed.ts` (identical) and `g-fitness-{admin,member}/src/lib/api/exerciseMedia.ts`.

**Interfaces — Produces:**
```ts
// videoEmbed.ts
export function embedUrl(url: string | null | undefined): string | null;
//   youtu.be/<id> | youtube.com/watch?v=<id> | youtube.com/shorts/<id> | youtube.com/embed/<id>
//     -> https://www.youtube-nocookie.com/embed/<id>
//   vimeo.com/<digits> | player.vimeo.com/video/<digits> -> https://player.vimeo.com/video/<digits>
//   anything else -> null
export const ALLOWED_VIDEO_HINT = 'A YouTube or Vimeo link';

// exerciseMedia.ts
export interface ExerciseMedia {
  exerciseId: string; photoUrl: string | null; videoUrl: string | null;
  cues: string[] | null; steps: string[] | null; hidden: boolean; createdBy: string;
}
export async function listExerciseMedia(): Promise<Map<string, ExerciseMedia>>;   // [] before 0121
export async function saveExerciseMedia(exerciseId: string, patch: Partial<Omit<ExerciseMedia, 'exerciseId' | 'createdBy'>>): Promise<void>;
//   upsert on (gym_id, exercise_id) with gym_id = currentGymId(); assertWrote on update
export async function uploadContentPhoto(file: File): Promise<string>;   // reserve -> shrink -> upload -> public URL; releases the slot on failure
export async function removeContentPhoto(publicUrl: string): Promise<void>;   // storage remove, then release_gym_photo
export async function photoUsage(): Promise<{ used: number; cap: number | null } | null>;
```

- [ ] **Step 1:** Write `videoEmbed.ts`; test by running it (`await import('/src/lib/videoEmbed.ts')` through the dev server) against: `https://youtu.be/dQw4w9WgXcQ`, `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3`, `https://youtube.com/shorts/dQw4w9WgXcQ`, `https://vimeo.com/76979871`, `https://evil.test/x` → null, `http://youtu.be/x` → null. **Test regexes by running them** (CLAUDE.md).
- [ ] **Step 2:** Write `exerciseMedia.ts` in admin (shrink reused from `lib/api/media.ts` — export its `shrink`), copy to member with the member's supabase import path. `diff` the two.
- [ ] **Step 3:** Builds pass in both apps. Commit.

### Task 3: Admin Exercises page

**Files:** Modify `g-fitness-admin/src/pages/Exercises.tsx`; create `scripts/admin-exercise-media-check.js`; add to `scripts/ci/ui-checks.json`.

- [ ] **Step 1: Fixture first** (failing): routes `exercises` (one shared row `gym_id: null` "Barbell Back Squat" with starter cues; one gym row "Sled Push"), `gym_exercise_media` (empty), rpc `gym_photo_usage` → `[{used: 42, cap: 100}]`. Asserts: counter text `42 of 100 photos`; the shared row is labelled `Core Fitness library` and its name is not editable; opening Squat's guide editor and entering `https://youtu.be/abc12345678` + a cue + Save sends an **upsert to `gym_exercise_media`** with `video_url` and `cues` (captured from the POST body); a bad link `https://example.com/v` shows `A YouTube or Vimeo link` and sends nothing; Hide on the shared row sends `hidden: true` to the overlay, **not** a PATCH to `exercises`.
- [ ] **Step 2: Run — expected FAIL** (`MISSING`).
- [ ] **Step 3: Implement:** rows show a source label (`Core Fitness library` for `gym_id null`, `Yours` otherwise); for library rows the Hide/Show toggle writes the overlay; own rows keep the `is_active` toggle; a "Guide" button opens a panel with photo (ImageField-like picker using `uploadContentPhoto`), video link input with live `embedUrl` preview iframe, cues (up to 6 one-line inputs), steps (up to 10), Save → `saveExerciseMedia`. Header shows `photoUsage()` as `N of M photos` (`N photos` when cap null). Library cues show as placeholder text ("Using the library's cues — type to replace them").
- [ ] **Step 4: Run — PASS**; screenshot read; `npm run build`; commit.

### Task 4: Member exercise guide + How to in the workout

**Files:** Create `g-fitness-member/src/components/workout/ExerciseGuide.tsx`; modify `pages/workouts/ExerciseLibrary.tsx`, `pages/GuidedWorkout.tsx`, `lib/api/workoutSets.ts` (select `cues, steps`), create `scripts/exercise-guide-check.js`, manifest entry.

**Interfaces:**
```ts
// ExerciseGuide.tsx
export default function ExerciseGuide(props: {
  name: string; libraryCues: string[]; librarySteps: string[]; media: ExerciseMedia | null;
}): JSX.Element;
// photo (if any), video iframe from embedUrl (16:9, loading="lazy", allow fullscreen),
// cues as a short list, steps numbered; overlay cues/steps replace the library's when non-null;
// no video -> the existing "Watch form videos on YouTube" search link, worded as a search.
```
- [ ] **Step 1: Fixture first:** member session; `exercises` returns Squat with library cues; `gym_exercise_media` returns Squat with `video_url https://youtu.be/abc12345678`, own `steps`, and a second row `hidden: true` for "Chest Fly". Asserts: library list does **not** show Chest Fly; opening Squat shows an `iframe[src*="youtube-nocookie.com/embed/abc12345678"]`, the gym's steps (not the library's), the library's cues; a routine run (reuse `workout-run-check.js` routing) shows a `How to` button that opens the same guide.
- [ ] **Step 2: FAIL.** **Step 3:** implement: `ExerciseLibrary` loads `listExerciseMedia()` alongside, filters hidden, renders `ExerciseGuide` above "Your last time"; `GuidedWorkout` current-exercise header gets a ghost `How to` button (only when `ex.exerciseId`) opening a `GlassSheet` with `ExerciseGuide` (pages portal; wrapper owns `pointerEvents`). **Step 4:** PASS, screenshot, build, commit.

### Task 5: Trainer writes their own

**Files:** Create `g-fitness-member/src/pages/trainer/TrainerExercises.tsx`; modify `App.tsx` (route `/trainer/exercises`), `components/layout/trainerNav.ts` (rail link "Exercises" in the profile/more rail).
- [ ] Fixture extension in `exercise-guide-check.js` (trainer session): the page lists the gym's exercises with `Yours` on rows the trainer created; "New exercise" sends an insert to `exercises` with `created_by` = trainer; editing the guide of a library exercise sends an upsert to `gym_exercise_media`; a row created by someone else shows the guide **read-only** (no Save). Implement with the same `ExerciseGuide` for preview and noc form primitives. Build, commit.

### Task 6: Platform photo limit
**Files:** `corefitness-platform/src/lib/platform.ts` (`max_photos` on the plan type; `setPlanPhotoLimit(plan, max)` → `set_platform_plan_photo_limit`), `pages/Plans.tsx` (input "Photos (blank = unlimited)" beside staff; saved after `savePlan`; card line `· up to N photos`). Build (`npm run build` in the platform app), commit.

### Task 7: Align, document, ship
- [ ] Admin member drawer / trainer member sheet: nothing member-specific in 0121 (media is gym content, not a member's data) — state that in the commit, per CLAUDE.md's alignment rule.
- [ ] Docs: CLAUDE.md (≤200 lines: overlay rule, curation is platform-only, photo slots), `docs/TENANCY.md` (curation change), `docs/MIGRATION_STATUS.md` 0121 row.
- [ ] Full runs: all SQL harnesses, all fixture checks, four builds, `audit-writes.py`, `audit-routes.py`, `audit-dead-code.py`.
- [ ] Commit, push. Deploy only when the user says so; 0121 is pasted by hand **after** the app deploy (the app reads the overlay defensively and shows nothing new until it exists).
