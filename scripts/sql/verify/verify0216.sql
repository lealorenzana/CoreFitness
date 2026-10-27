-- VERIFICATION for 0216 (the big moments: owner switches, member sound, celebrated markers, notes)
-- Paste into the Supabase SQL editor right after 0216. Read-only; the error is the report.
do $$
declare g int; m int; f boolean; n int; old_unmarked int; c boolean;
begin
  select count(*) from information_schema.columns where table_name = 'gym_settings'
    and column_name in ('celebrations', 'celebration_sounds') into g;
  select count(*) from information_schema.columns where table_name = 'member_profiles'
    and column_name in ('celebration_sounds', 'celebrated_level', 'arrival_on', 'checkin_celebrated_on', 'celebrated_challenges') into m;
  select exists (select 1 from information_schema.columns where table_name = 'fitness_goals' and column_name = 'celebrated_at') into f;
  select count(*) from fitness_goals where achieved_on is not null and celebrated_at is null into old_unmarked;
  select count(*) from app_releases where title in ('Big moments, and the app offline', 'Today first, and You', 'Celebrations in the member app') into n;
  select coalesce((select migration_0216_applied()), false) into c;
  raise exception 'REPORT 0216: gym switches=% (expect 2) | member columns=% (expect 5) | goal mark=% | old reached goals left unmarked=% (expect 0) | notes=% (expect 3) | marker=%',
    g, m, f, old_unmarked, n, c;
end
$$;
