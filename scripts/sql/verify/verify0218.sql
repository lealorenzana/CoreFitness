-- VERIFICATION for 0218 (the coach's moments, and trainees' wins reaching their coach)
-- Paste into the Supabase SQL editor right after 0218. Read-only; the error is the report.
do $$
declare cols int; fn int; trg int; open_fn int; note int; c boolean;
begin
  select count(*) from information_schema.columns where table_name = 'trainer_profiles'
     and column_name in ('celebrated_sessions', 'celebrated_people', 'celebrated_first_rating', 'celebrated_top_rating', 'arrival_on') into cols;
  select count(*) from pg_proc where proname in ('coach_stats', 'celebrate_coach_moments', 'coach_arrival', 'coaches_of', 'notify_coaches_of_win') into fn;
  select count(*) from pg_trigger where tgname in ('guard_coach_marks', 'win_record', 'win_streak', 'win_target', 'win_challenge') and not tgisinternal into trg;
  -- Only the two the app calls are open to signed-in people.
  select count(*) from pg_proc p where p.proname in ('coach_stats', 'coaches_of', 'notify_coaches_of_win')
     and has_function_privilege('authenticated', p.oid, 'execute') into open_fn;
  select count(*) from app_releases where title = 'Today does more, and your milestones' into note;
  select coalesce((select migration_0218_applied()), false) into c;
  raise exception 'REPORT 0218: coach columns=% (expect 5) | functions=% (expect 5) | triggers=% (expect 5) | internal helpers open to signed-in=% (expect 0) | coaches'' note=% (expect 1) | marker=%',
    cols, fn, trg, open_fn, note, c;
end
$$;
