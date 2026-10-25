-- VERIFICATION for 0212 (what's new, saved colour themes, a coach's first steps)
-- Paste into the Supabase SQL editor right after 0212. Read-only; the error is the report.
do $$
declare a int; b boolean; c boolean; d boolean; e boolean;
begin
  select count(*) from app_releases into a;
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'saved_themes') into b;
  select exists (select 1 from information_schema.columns where table_name = 'trainer_profiles' and column_name = 'onboarded_at') into c;
  select not has_function_privilege('anon', 'my_whats_new(text)', 'execute')
     and not has_function_privilege('anon', 'save_gym_themes(jsonb)', 'execute')
     and not has_function_privilege('anon', 'platform_save_release(uuid, text, text, text[])', 'execute') into d;
  select coalesce((select migration_0212_applied()), false) into e;
  raise exception 'REPORT 0212: release notes=% | saved_themes=% | coach onboarded_at=% | closed to visitors=% | marker=%', a, b, c, d, e;
end
$$;
