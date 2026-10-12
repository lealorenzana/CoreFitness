-- VERIFICATION for 0197 (the rewards catalogue: photo, category, featured, last day, monthly limit)
-- Paste into the Supabase SQL editor right after 0197. Read-only; the error is the report.
do $$
declare c1 int; c2 boolean; c3 boolean; c4 boolean;
begin
  select count(*) from information_schema.columns where table_name = 'rewards'
     and column_name in ('image_url', 'category', 'featured', 'available_until', 'per_member_monthly') into c1;
  select exists (select 1 from pg_trigger where tgname = 'reward_redemptions_limits') into c2;
  select exists (select 1 from pg_trigger where tgname = 'rewards_image_is_gyms') into c3;
  select coalesce((select migration_0197_applied()), false) into c4;
  raise exception 'REPORT 0197: new columns=% (want 5) | limit trigger=% | photo trigger=% | marker=%', c1, c2, c3, c4;
end
$$;
