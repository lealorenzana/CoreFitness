-- 0020 — the Progress Hub gets real tables.
--
-- The last mock in either app. Unlike every other migration so far this isn't a
-- data-layer swap: body measurements, goals and workout logs had **no tables at
-- all**, so the screens were reading `src/data/mock*.ts` fixtures.
--
-- Decisions baked in here:
--
--   * **Members log their own.** Self-write, trainer-read. A trainer-only model
--     would leave the feature dead for every member without a trainer, which on
--     the free tier is all of them.
--   * **Badges are gone.** They had no table and no earning rules — gamification
--     with nothing behind it. Nothing to migrate; the tab is deleted.
--   * **Trainer feedback needs no table.** A trainer's recommendation already
--     inserts a real `notifications` row; that tab reads those.

-- ============ BODY MEASUREMENTS ============
create table if not exists body_measurements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  -- The day it was measured, not the day it was typed in. Members catch up on
  -- a week of entries at once; the same distinction as payments.paid_on.
  measured_on date not null default (now() at time zone 'Asia/Manila')::date,
  weight_kg numeric(5,2),
  -- Stored per measurement rather than once on the profile so a historical BMI
  -- stays correct — height genuinely changes for younger members.
  height_cm numeric(5,2),
  body_fat_pct numeric(4,1),
  chest_cm numeric(5,2),
  waist_cm numeric(5,2),
  hips_cm numeric(5,2),
  arms_cm numeric(5,2),
  thighs_cm numeric(5,2),
  notes text,
  created_at timestamptz not null default now(),
  -- One entry per day. Re-measuring the same morning corrects the entry rather
  -- than producing two conflicting rows for one day on the chart.
  unique (member_id, measured_on)
);

create index if not exists idx_body_measurements_member
  on body_measurements(member_id, measured_on desc);

-- ============ GOALS ============
create table if not exists fitness_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  title text not null,
  /** 'weight_kg' | 'body_fat_pct' | 'waist_cm' | 'workouts_per_week' | 'custom'.
      Text rather than an enum so a member can track something nobody thought of;
      the app only auto-computes progress for the ones it recognises. */
  metric text not null default 'custom',
  start_value numeric(6,2),
  target_value numeric(6,2),
  target_date date,
  -- Set once, when reached. A goal that's been hit stays hit even if the number
  -- later moves the wrong way — erasing that would erase the achievement.
  achieved_on date,
  created_at timestamptz not null default now()
);

create index if not exists idx_fitness_goals_member on fitness_goals(member_id);

-- ============ WORKOUT LOGS ============
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  performed_on date not null default (now() at time zone 'Asia/Manila')::date,
  /** Free text, but the app offers gym_settings.activity_options as the choices
      so this stays aggregatable alongside attendance.activity. */
  activity text,
  duration_minutes int,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_logs_member
  on workout_logs(member_id, performed_on desc);

-- ============ RLS ============
-- Same shape on all three: the member owns their own rows; trainers and the
-- front desk may read them; nobody may write another member's.
--
-- Trainers get read access because a coach who can't see the numbers can't
-- coach against them. They cannot edit: an entry a member didn't make, appearing
-- in their own log, is worse than no entry.
alter table body_measurements enable row level security;
alter table fitness_goals enable row level security;
alter table workout_logs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['body_measurements', 'fitness_goals', 'workout_logs'] loop
    execute format('drop policy if exists %I_select_self on %I', t, t);
    execute format(
      'create policy %I_select_self on %I for select using (member_id = auth.uid())', t, t);

    execute format('drop policy if exists %I_select_staff on %I', t, t);
    execute format(
      'create policy %I_select_staff on %I for select using (get_my_role() in (''admin'',''staff'',''trainer''))', t, t);

    execute format('drop policy if exists %I_write_self on %I', t, t);
    execute format(
      'create policy %I_write_self on %I for all using (member_id = auth.uid()) with check (member_id = auth.uid())', t, t);
  end loop;
end $$;
