-- ============================================================================
-- 0239 — Capacity: every file says what it is, whose it is, and when it came
-- ============================================================================
--
-- The platform's Capacity → Largest files read "applications · not a gym's file"
-- ten times over (the owner, 2026-11-08: "make it fully detailed … so I will not
-- be confused"). platform_capacity_details() now returns, per file, what it is
-- (for an application document, which of the six; otherwise what the bucket
-- holds), whose (the gym, or the applying gym's name), its type and size, and
-- when it was uploaded. Still never the file's own name — it can be a person's.
-- Tables and buckets gain a plain-words description too.
-- ============================================================================

drop function if exists platform_capacity_details();
create or replace function platform_capacity_details()
returns table (kind text, key text, label text, used bigint, n bigint,
               what text, whose text, file_type text, uploaded timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;

  return query
    select 'table'::text, c.relname::text, c.relname::text, pg_total_relation_size(c.oid)::bigint,
           greatest(c.reltuples, 0)::bigint,
           case c.relname
             when 'attendance' then 'Check-ins at every gym'
             when 'payments' then 'Payments recorded at the desk or online'
             when 'profiles' then 'Every person''s account details'
             when 'notifications' then 'Notices sent to people'
             when 'point_ledger' then 'Points earned and spent'
             when 'pt_sessions' then '1-on-1 coaching sessions'
             when 'memberships' then 'Membership terms'
             when 'messages' then 'Chats between members and coaches'
             when 'workout_logs' then 'Workouts people logged'
             when 'workout_sets' then 'Sets inside those workouts'
             when 'achievement_unlocks' then 'Badges people earned'
             when 'gym_roles' then 'Who belongs to which gym, as what'
             when 'activity_log' then 'The gyms'' activity history'
             when 'client_errors' then 'Crash reports from the apps'
             when 'exercises' then 'The exercise library'
             else null end,
           null::text, null::text, null::timestamptz
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc limit 12;

  return query
    select 'bucket'::text, o.bucket_id::text, o.bucket_id::text,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, count(*)::bigint,
           case o.bucket_id
             when 'applications' then 'Documents gyms sent when applying'
             when 'avatars' then 'People''s profile photos'
             when 'media' then 'Gym logos, product and equipment photos'
             when 'progress' then 'Members'' private progress photos'
             when 'support' then 'Screenshots sent with support tickets'
             when 'credentials' then 'Coaches'' certificates'
             else null end,
           null::text, null::text, max(o.created_at)
      from storage.objects o group by o.bucket_id order by 4 desc;

  return query
    select 'file'::text, o.id::text,
           o.bucket_id || ' · ' || coalesce(g.name, a.gym_name, 'not a gym''s file'),
           coalesce((o.metadata ->> 'size')::bigint, 0), null::bigint,
           -- What it is: an application's document by its name's first part; otherwise what the bucket holds.
           case when o.bucket_id = 'applications' then
                  case split_part(storage.filename(o.name), '-', 1)
                    when 'owner_id' then 'Owner''s valid government ID'
                    when 'bir_2303' then 'BIR Certificate of Registration (2303)'
                    when 'barangay' then 'Barangay business clearance'
                    when 'front_photo' then 'Photo of the gym''s front and signage'
                    when 'permit' then 'Mayor''s / business permit'
                    when 'dti_sec' then 'DTI or SEC registration'
                    else 'An application document' end
                when o.bucket_id = 'avatars' then 'A profile photo'
                when o.bucket_id = 'media' then 'A gym picture (logo, product or equipment)'
                when o.bucket_id = 'progress' then 'A member''s progress photo (private)'
                when o.bucket_id = 'support' then 'A support ticket screenshot'
                when o.bucket_id = 'credentials' then 'A coach''s certificate'
                else 'A file in ' || o.bucket_id end,
           -- Whose: the gym that owns it, or the gym that applied with it.
           coalesce(g.name, case when a.id is not null then a.gym_name || ' (application, ' || a.status || ')' end, 'Core Fitness'),
           coalesce(o.metadata ->> 'mimetype', ''),
           o.created_at
      from storage.objects o
      left join gyms g on (storage.foldername(o.name))[1] = 'gyms' and g.id::text = (storage.foldername(o.name))[2]
      left join gym_applications a on o.bucket_id = 'applications' and a.id::text = (storage.foldername(o.name))[1]
     order by coalesce((o.metadata ->> 'size')::bigint, 0) desc limit 10;
end;
$$;
revoke execute on function platform_capacity_details() from public, anon;
grant execute on function platform_capacity_details() to authenticated;

create or replace function migration_0239_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0239_applied() to anon, authenticated;
