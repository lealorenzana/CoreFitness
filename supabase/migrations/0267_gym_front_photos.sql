-- 0267: the platform's Gyms page shows each gym's own front photo behind its card (owner, 2026-11-23).
--
-- The photo is the "photo of the gym's front and signage" the applicant uploaded with their documents
-- (application_documents, kind 'front_photo', 0187). One row per gym: the latest one that was not
-- replaced, a verified one first. Platform owners only, like every application document; the file
-- itself stays in the private 'applications' bucket and is opened with a short signed URL.

create or replace function platform_gym_front_photos()
returns table (gym_id uuid, path text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can see application documents.' using errcode = '42501';
  end if;
  return query
    select distinct on (a.gym_id) a.gym_id, d.path
      from application_documents d
      join gym_applications a on a.id = d.application_id
     where d.kind = 'front_photo' and a.gym_id is not null and d.status <> 'replaced'
     order by a.gym_id, (d.status = 'verified') desc, d.uploaded_at desc;
end;
$$;
revoke all on function platform_gym_front_photos() from public, anon;
grant execute on function platform_gym_front_photos() to authenticated;

create or replace function migration_0267_applied() returns boolean language sql stable as $$ select true $$;
