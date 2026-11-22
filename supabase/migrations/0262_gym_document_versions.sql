-- ============================================================================
-- 0262 — The gym documents, edited in the platform's Settings (the owner, 2026-11-22)
-- ============================================================================
--
-- "In the gym documents in settings, where do I edit the gym documents?" Until now
-- the wording of the Terms for gyms, the Data Processing Agreement and the Privacy
-- Policy lived in the website's code (corefitness-site/src/legalText.ts) and
-- Settings could only put a version (a date) in effect (0156).
--
-- Now a version is a row: all three documents as sections, with four placeholders
-- for what Settings decides ({business}, {contact}, {grace}, {reminders}), filled
-- by the site with the same words the code uses. One draft at a time; publishing
-- freezes it under its date and puts that date in effect through 0156's own
-- platform_publish_gym_terms(), so the apply form and the owners' agreement banner
-- keep working unchanged. A published version can never be edited or deleted
-- (a trigger refuses, even for the table owner, as 0119 does for waivers), so every
-- agreement points at words that still exist.
--
-- The site shows a published row when its date is the one in effect, and its own
-- code text otherwise, so nothing changes until a version is published here.
-- ============================================================================

create table if not exists gym_document_versions (
  version      text primary key check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  docs         jsonb not null,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  updated_by   uuid references profiles(id) on delete set null
);
alter table gym_document_versions enable row level security;
-- No policies: read and written only through the functions below.
create unique index if not exists gym_document_versions_one_draft on gym_document_versions ((true)) where status = 'draft';

-- Published words never change.
create or replace function gym_document_versions_frozen() returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    raise exception 'Version % of the gym documents is published and cannot be changed. Start a new version instead.', old.version;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists gym_document_versions_frozen on gym_document_versions;
create trigger gym_document_versions_frozen before update or delete on gym_document_versions
  for each row execute function gym_document_versions_frozen();

-- The shape a version must have: the three documents, each with a title and at least one section.
create or replace function gym_documents_valid(p jsonb) returns boolean language sql immutable as $$
  select coalesce(bool_and(
           jsonb_typeof(p -> k) = 'object'
           and coalesce(length(btrim(p -> k ->> 'title')), 0) > 0
           and jsonb_typeof(p -> k -> 'sections') = 'array'
           and jsonb_array_length(p -> k -> 'sections') > 0), false)
    from unnest(array['terms', 'dpa', 'privacy']) k;
$$;
revoke execute on function gym_documents_valid(jsonb) from public, anon, authenticated;

-- The website: the version in effect, when it was written here. Null means the site shows its own text.
create or replace function public_gym_documents() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', v.version, 'docs', v.docs)
    from gym_document_versions v join platform_billing b on b.gym_terms_published = v.version
   where v.status = 'published'
   limit 1;
$$;
revoke execute on function public_gym_documents() from public;
grant execute on function public_gym_documents() to anon, authenticated;

-- The platform: every version, newest first, with who last changed it.
create or replace function platform_gym_documents()
returns table (version text, status text, docs jsonb, note text, created_at timestamptz, updated_at timestamptz, published_at timestamptz, updated_by text, in_effect boolean)
language sql stable security definer set search_path = public as $$
  select v.version, v.status, v.docs, v.note, v.created_at, v.updated_at, v.published_at,
         coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email),
         v.version = (select gym_terms_published from platform_billing where id)
    from gym_document_versions v left join profiles p on p.id = v.updated_by
   where is_platform_admin()
   order by (v.status = 'draft') desc, v.version desc;
$$;
revoke execute on function platform_gym_documents() from public, anon;
grant execute on function platform_gym_documents() to authenticated;

-- Save the one draft (creating it, or renaming its date).
create or replace function save_gym_documents_draft(p_version text, p_docs jsonb, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can change the gym documents.'; end if;
  if p_version !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A version is a date, like 2026-12-01.'; end if;
  if not gym_documents_valid(p_docs) then raise exception 'Each of the three documents needs a title and at least one section.'; end if;
  if exists (select 1 from gym_document_versions where version = p_version and status = 'published') then
    raise exception 'Version % is already published. Pick a later date for the new one.', p_version;
  end if;
  if exists (select 1 from platform_billing where id and gym_terms_published = p_version) then
    raise exception 'Version % is the one in effect now. Pick a later date for the new one.', p_version;
  end if;
  delete from gym_document_versions where status = 'draft' and version <> p_version;
  insert into gym_document_versions (version, docs, note, updated_by) values (p_version, p_docs, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (version) do update set docs = excluded.docs, note = excluded.note, updated_at = now(), updated_by = auth.uid();
end;
$$;
revoke execute on function save_gym_documents_draft(text, jsonb, text) from public, anon;
grant execute on function save_gym_documents_draft(text, jsonb, text) to authenticated;

create or replace function discard_gym_documents_draft() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can change the gym documents.'; end if;
  delete from gym_document_versions where status = 'draft';
end;
$$;
revoke execute on function discard_gym_documents_draft() from public, anon;
grant execute on function discard_gym_documents_draft() to authenticated;

-- Publish the draft: freeze it, then put its date in effect the way 0156 always has (logged, owners asked to agree).
create or replace function publish_gym_documents(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can publish the gym documents.'; end if;
  if not exists (select 1 from gym_document_versions where version = p_version and status = 'draft') then
    raise exception 'There is no draft called %. Save the draft first.', p_version;
  end if;
  update gym_document_versions set status = 'published', published_at = now(), updated_at = now(), updated_by = auth.uid()
   where version = p_version and status = 'draft';
  perform platform_publish_gym_terms(p_version);
end;
$$;
revoke execute on function publish_gym_documents(text) from public, anon;
grant execute on function publish_gym_documents(text) to authenticated;

create or replace function migration_0262_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0262_applied() to anon, authenticated;
