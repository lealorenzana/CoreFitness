-- 0280 — reading business documents (plan docs/superpowers/plans/2026-11-27-document-ocr.md).
--
-- When an applicant attaches a document, the read-document Edge Function asks Claude
-- what it says and stores the answer here. The reading SUGGESTS: it fills the expiry
-- for the applicant to check, and shows the platform what was read with warnings.
-- It never verifies, rejects or blocks anything; a person still clicks Verified.
--
--   * document_readings: RLS on, NO policy. The applicant claims a reading through
--     claim_document_reading() (as themselves, so may_file_for_application decides);
--     only the service role saves the result (save_document_reading); only the
--     platform reads it (application_document_checks).
--   * A cap per application (30) because every reading costs the platform API money.
--   * A reading goes when its application goes (cascade), and when account deletion
--     (0225) removes the application's documents, so a read ID number never outlives
--     the file it came from.
-- Safe to paste again.

create table if not exists document_readings (
  path           text primary key,
  application_id uuid not null references gym_applications(id) on delete cascade,
  kind           text not null,
  result         jsonb,                       -- null while the reading runs
  model          text,
  read_at        timestamptz not null default now()
);
create index if not exists idx_document_readings_app on document_readings(application_id);
alter table document_readings enable row level security;
revoke all on document_readings from public, anon, authenticated;

/** Words of a name for matching: upper case, letters and digits, common filler dropped. */
create or replace function name_words(p text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct w), '{}')
    from unnest(regexp_split_to_array(upper(regexp_replace(coalesce(p, ''), '[^[:alnum:]]+', ' ', 'g')), '\s+')) w
   where w <> '' and w not in ('INC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'GYM', 'FITNESS', 'CENTER', 'CENTRE',
                               'THE', 'AND', 'OF', 'ENTERPRISE', 'ENTERPRISES', 'TRADING', 'SERVICES', 'OPC',
                               'LTD', 'CLUB', 'STUDIO', 'MR', 'MS', 'MRS', 'JR', 'SR');
$$;

/** Null when either name is missing (nothing to compare); else true when at least half
    the words of the shorter name appear in the other. */
create or replace function names_match(a text, b text) returns boolean
language sql immutable set search_path = public as $$
  with x as (select name_words(a) wa, name_words(b) wb)
  select case when cardinality(wa) = 0 or cardinality(wb) = 0 then null
              when cardinality(wa) <= cardinality(wb)
                then (select count(*) from unnest(wa) w where w = any(wb))::numeric / cardinality(wa) >= 0.5
              else (select count(*) from unnest(wb) w where w = any(wa))::numeric / cardinality(wb) >= 0.5
         end
    from x;
$$;

/** As the applicant: may this file be read? Claims a slot under the cap.
    Returns {"claimed": true} to read it now, or {"claimed": false, "result": …} when
    it was already read (the stored answer, null while that reading still runs). */
create or replace function claim_document_reading(p_path text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app uuid;
  v_row document_readings;
begin
  if split_part(coalesce(p_path, ''), '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'That file is not in an application''s folder.' using errcode = '42501';
  end if;
  v_app := split_part(p_path, '/', 1)::uuid;
  if not may_file_for_application(v_app) then
    raise exception 'You cannot add documents to that application.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind = 'front_photo'
     or not exists (select 1 from application_document_kinds() k where k.kind = p_kind) then
    raise exception 'That document is not one we read.';
  end if;
  select * into v_row from document_readings where path = p_path;
  if found then
    return jsonb_build_object('claimed', false, 'result', v_row.result);
  end if;
  if (select count(*) from document_readings where application_id = v_app) >= 30 then
    raise exception 'limit: This application has used its document readings. Type the date instead.';
  end if;
  insert into document_readings (path, application_id, kind) values (p_path, v_app, p_kind)
  on conflict (path) do nothing;
  return jsonb_build_object('claimed', true);
end;
$$;
revoke all on function claim_document_reading(text, text) from public, anon;
grant execute on function claim_document_reading(text, text) to authenticated;

/** The Edge Function's one write, with the service key. */
create or replace function save_document_reading(p_path text, p_result jsonb, p_model text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update document_readings set result = p_result, model = p_model, read_at = now() where path = p_path;
  return found;
end;
$$;
revoke all on function save_document_reading(text, jsonb, text) from public, anon, authenticated;
grant execute on function save_document_reading(text, jsonb, text) to service_role;

/** A failed reading frees its slot (and the path), so the applicant can try again or type. */
create or replace function drop_document_reading(p_path text) returns void
language sql security definer set search_path = public as $$
  delete from document_readings where path = p_path and result is null;
$$;
revoke all on function drop_document_reading(text) from public, anon, authenticated;
grant execute on function drop_document_reading(text) to service_role;

/** The platform's view: per sent document, what was read and what does not add up. */
create or replace function application_document_checks(p_application uuid)
returns table (document_id uuid, reading jsonb, warnings text[])
language sql stable security definer set search_path = public as $$
  select d.id, r.result,
         array_remove(array[
           case when (r.result->>'readable')::boolean is false
                then 'We could not read this file.' end,
           case when (r.result->>'readable')::boolean is not false
                 and r.result->>'looks_like' is not null and r.result->>'looks_like' <> d.kind
                then 'This does not look like a ' || k.label || '.' end,
           case when d.kind in ('permit', 'dti_sec', 'bir_2303', 'barangay')
                 and (names_match(r.result->>'business_name', a.gym_name) is not null
                      or names_match(r.result->>'owner_name', a.owner_name) is not null)
                 and coalesce(names_match(r.result->>'business_name', a.gym_name), false) is false
                 and coalesce(names_match(r.result->>'owner_name', a.owner_name), false) is false
                 and coalesce(names_match(r.result->>'business_name', a.owner_name), false) is false
                then 'The name on it (' || coalesce(r.result->>'business_name', r.result->>'owner_name')
                     || ') differs from the application (' || a.gym_name || ', ' || a.owner_name || ').' end,
           case when d.kind = 'owner_id' and names_match(r.result->>'owner_name', a.owner_name) is false
                then 'The name on the ID (' || (r.result->>'owner_name') || ') differs from the owner, '
                     || a.owner_name || '.' end,
           case when d.expires_on is not null and r.result->>'expires_on' ~ '^\d{4}-\d{2}-\d{2}$'
                 and (r.result->>'expires_on')::date <> d.expires_on
                then 'Typed expiry ' || to_char(d.expires_on, 'Mon DD, YYYY') || '; the file says '
                     || to_char((r.result->>'expires_on')::date, 'Mon DD, YYYY') || '.' end,
           case when d.kind = 'permit' and r.result->>'valid_for_year' ~ '^\d{4}$'
                 and (r.result->>'valid_for_year')::int <> extract(year from manila_today())::int
                then 'This permit is for ' || (r.result->>'valid_for_year') || ', not this year.' end
         ], null)
    from application_documents d
    join gym_applications a on a.id = d.application_id
    join application_document_kinds() k on k.kind = d.kind
    left join document_readings r on r.path = d.path and r.result is not null
   where d.application_id = p_application and d.status <> 'draft' and is_platform_admin();
$$;
revoke all on function application_document_checks(uuid) from public, anon;
grant execute on function application_document_checks(uuid) to authenticated;
revoke all on function name_words(text) from public, anon, authenticated;
revoke all on function names_match(text, text) from public, anon, authenticated;

-- A deleted document takes its application's orphaned readings with it (0225's erase).
create or replace function document_readings_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from document_readings r
   where r.application_id = old.application_id
     and not exists (select 1 from application_documents d where d.path = r.path);
  return null;
end;
$$;
revoke all on function document_readings_follow() from public, anon, authenticated;
drop trigger if exists document_readings_follow on application_documents;
create trigger document_readings_follow after delete on application_documents
  for each row execute function document_readings_follow();

create or replace function migration_0280_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0280_applied() to anon, authenticated;
