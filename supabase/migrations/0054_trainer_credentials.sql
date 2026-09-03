-- 0054 — a trainer's certifications, as documents the gym has actually seen.
--
-- `trainer_profiles.certifications` (0041) is free text the trainer types, and
-- the member-facing profile says so out loud: "Shown to members as the
-- trainer's own statement — the gym does not verify them." That was the honest
-- thing to write for a field nobody checks. It is also a weak claim to make
-- about the people a member trusts with a barbell.
--
-- This does not replace that field. It gives the gym somewhere to keep the
-- certificate itself, and a record of who looked at it.
--
-- ---------------------------------------------------------------------------
-- Why this bucket is private and `avatars` is not
-- ---------------------------------------------------------------------------
-- 0021 made `avatars` public-read, deliberately: they are gym member photos
-- shown behind a login, and signed URLs would expire mid-render for no gain.
--
-- A certificate is not a photo. It carries a legal name, usually a licence or
-- registration number, sometimes a date of birth, and it belongs to an employee
-- rather than to the gym. Public-read here would mean a single leaked URL
-- exposes a real person's identity documents forever, and nothing about the
-- feature needs that.
--
-- So: `public = false`, read restricted to the owner and the admin, and files
-- reached through short-lived signed URLs.
--
-- ---------------------------------------------------------------------------
-- Not staff
-- ---------------------------------------------------------------------------
-- `staff` take payments, check people in and extend memberships — reversible
-- front-desk transactions, all recorded. Reviewing an employee's qualifications
-- is hiring paperwork. It is not a front-desk task and the front desk has no
-- reason to read it.

-- ============================================================================
-- 1. THE RECORD
-- ============================================================================
create table if not exists trainer_credentials (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references trainer_profiles(profile_id) on delete cascade,
  -- What the trainer says it is: "NASM-CPT", "First Aid / CPR".
  title        text not null,
  -- credentials/<auth.uid()>/<random>.<ext> — the uid folder is what the
  -- storage policies key off, exactly as 0021 does for avatars.
  file_path    text not null unique,
  mime_type    text,
  size_bytes   int,
  status       text not null default 'pending'
                 check (status in ('pending','verified','rejected')),
  uploaded_at  timestamptz not null default now(),
  reviewed_by  uuid references profiles(id),
  reviewed_at  timestamptz,
  -- Shown to the trainer. A rejection with no reason is a dead end.
  review_note  text
);

create index if not exists idx_trainer_credentials_trainer
  on trainer_credentials(trainer_id, uploaded_at desc);

create index if not exists idx_trainer_credentials_pending
  on trainer_credentials(uploaded_at) where status = 'pending';

-- ============================================================================
-- 2. THE TRAINER CANNOT MARK THEIR OWN AS VERIFIED
-- ============================================================================
-- The whole value of the feature is that someone checked. A trainer who could
-- set `status` could upload a blank page and call it verified, and the record
-- would then be worth less than the free-text field it was meant to improve.
--
-- Postgres has no per-column RLS, so this is a trigger — the same shape used to
-- stop a member editing their own `role` on `profiles`.
create or replace function trg_guard_credential_review() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if get_my_role() is not distinct from 'admin' then
    return new;
  end if;

  -- Anyone else may correct the title of their own row and nothing else.
  if new.status      is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note
     or new.file_path   is distinct from old.file_path
     or new.trainer_id  is distinct from old.trainer_id then
    raise exception 'Only the gym can review a credential.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trainer_credentials_guard on trainer_credentials;
create trigger trainer_credentials_guard
  before update on trainer_credentials
  for each row execute function trg_guard_credential_review();

-- A new upload is always pending, whatever the client sent.
create or replace function trg_credential_defaults() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  new.status      := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end;
$fn$;

drop trigger if exists trainer_credentials_defaults on trainer_credentials;
create trigger trainer_credentials_defaults
  before insert on trainer_credentials
  for each row execute function trg_credential_defaults();

-- Stamp the reviewer rather than trusting the client to say who they were.
create or replace function trg_credential_reviewed() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists trainer_credentials_stamp on trainer_credentials;
create trigger trainer_credentials_stamp
  before update on trainer_credentials
  for each row execute function trg_credential_reviewed();

-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table trainer_credentials enable row level security;

drop policy if exists trainer_credentials_select_own on trainer_credentials;
create policy trainer_credentials_select_own on trainer_credentials
  for select using (trainer_id = auth.uid());

-- Admin only. Not staff, not members — a member never sees the document.
drop policy if exists trainer_credentials_select_admin on trainer_credentials;
create policy trainer_credentials_select_admin on trainer_credentials
  for select using (get_my_role() is not distinct from 'admin');

drop policy if exists trainer_credentials_insert_own on trainer_credentials;
create policy trainer_credentials_insert_own on trainer_credentials
  for insert to authenticated with check (trainer_id = auth.uid());

-- Both the trainer and the admin may UPDATE; the trigger above decides which
-- columns each of them is allowed to have changed.
drop policy if exists trainer_credentials_update on trainer_credentials;
create policy trainer_credentials_update on trainer_credentials
  for update to authenticated
  using (trainer_id = auth.uid() or get_my_role() is not distinct from 'admin')
  with check (trainer_id = auth.uid() or get_my_role() is not distinct from 'admin');

-- A trainer may withdraw a document they uploaded. An admin may remove one
-- outright — a certificate uploaded to the wrong account is personal data
-- sitting somewhere it should not be, and waiting for the trainer to notice is
-- not a fix.
drop policy if exists trainer_credentials_delete on trainer_credentials;
create policy trainer_credentials_delete on trainer_credentials
  for delete using (trainer_id = auth.uid() or get_my_role() is not distinct from 'admin');

-- ============================================================================
-- 4. THE BUCKET
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'credentials',
  'credentials',
  false,                                    -- the whole point; see the header
  5242880,                                  -- 5 MB: a scan or a phone photo
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists credentials_read_own    on storage.objects;
drop policy if exists credentials_read_admin  on storage.objects;
drop policy if exists credentials_insert_own  on storage.objects;
drop policy if exists credentials_update_own  on storage.objects;
drop policy if exists credentials_delete_own  on storage.objects;
drop policy if exists credentials_delete_admin on storage.objects;

-- Read your own folder only.
create policy credentials_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Schema-qualified: these policies evaluate in the `storage` schema, where
-- `public` is not guaranteed to be on the search_path (the note 0021 leaves).
create policy credentials_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials' and public.get_my_role() = 'admin');

create policy credentials_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy credentials_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy credentials_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy credentials_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'credentials' and public.get_my_role() = 'admin');

-- ============================================================================
-- 5. WHAT THE ADMIN SCREEN COUNTS
-- ============================================================================
create or replace function trainer_credential_summary()
returns table (trainer_id uuid, total int, verified int, pending int, rejected int)
language sql stable security definer set search_path = public as $fn$
  select c.trainer_id,
         count(*)::int,
         count(*) filter (where c.status = 'verified')::int,
         count(*) filter (where c.status = 'pending')::int,
         count(*) filter (where c.status = 'rejected')::int
    from trainer_credentials c
   where get_my_role() = 'admin'
   group by c.trainer_id;
$fn$;

revoke all on function trainer_credential_summary() from public, anon;
grant execute on function trainer_credential_summary() to authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select id, public, file_size_limit from storage.buckets where id = 'credentials';
--     -- expect public = false
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'credentials%';        -- expect 6
--
-- As the trainer who owns the row (must fail):
--   update trainer_credentials set status = 'verified';
--
-- As a member or as staff (must return 0 rows):
--   select * from trainer_credentials;
