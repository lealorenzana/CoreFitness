-- ============================================================================
-- 0160 — A credential says who issued it and until when, and stops counting
--        when it runs out
-- ============================================================================
--
-- 0054 kept the certificate and who checked it, with a title the trainer
-- typed. A First Aid card from 2019 and one from last month looked the same,
-- and a verified badge stayed on a coach's profile for ever.
--
--   * issuer, credential number, issued on, expires on — on the row the owner
--     verifies, so what was checked is what members are told;
--   * a trainer may correct those details (and the title) while the credential
--     is pending or was not accepted — correcting a rejected one sends it back
--     for review. A verified one is never edited: a renewal is a new upload,
--     because the check was of *that* document;
--   * members see a credential (public_trainer_credentials) only while it is
--     in date — the badge lapses on its own, no one has to remember;
--   * credential_expiry_sweep(): 30 days before, the trainer is told to bring
--     the renewed one; on the day, the trainer and the owner are told it lapsed.
--     Once per credential each (notify_once). The admin's Credentials page and
--     the trainer's own screen run it on open — pg_cron is optional here.
-- ============================================================================

alter table trainer_credentials
  add column if not exists issuer            text check (issuer is null or length(btrim(issuer)) between 1 and 120),
  add column if not exists credential_number text check (credential_number is null or length(btrim(credential_number)) between 1 and 80),
  add column if not exists issued_on         date,
  add column if not exists expires_on        date;
do $$ begin
  alter table trainer_credentials add constraint trainer_credentials_dates check (expires_on is null or issued_on is null or expires_on >= issued_on);
exception when duplicate_object then null; end $$;

-- ---- who may change what --------------------------------------------------------------------------
create or replace function trg_guard_credential_review() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_details boolean;
begin
  -- A guard for signed-in people; the database's own maintenance (no session) passes.
  if auth.uid() is null or get_my_role() is not distinct from 'admin' then
    return new;
  end if;

  -- The review itself, the file and whose it is are the gym's — never the trainer's.
  if new.status      is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note
     or new.file_path   is distinct from old.file_path
     or new.trainer_id  is distinct from old.trainer_id then
    raise exception 'Only the gym can review a credential.';
  end if;

  v_details := new.title is distinct from old.title or new.issuer is distinct from old.issuer
    or new.credential_number is distinct from old.credential_number
    or new.issued_on is distinct from old.issued_on or new.expires_on is distinct from old.expires_on;
  if v_details and old.status = 'verified' then
    raise exception 'A verified credential stays as it was checked. Upload the renewed certificate as a new one.';
  end if;
  -- Corrected after it was not accepted: it goes back to the owner.
  if v_details and old.status = 'rejected' then
    new.status := 'pending';
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$fn$;

-- The reviewer stamp is for a decision; a trainer's resubmission is not one.
create or replace function trg_credential_reviewed() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status is distinct from old.status then
    if new.status in ('verified', 'rejected') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;
  return new;
end;
$fn$;

-- The guard must run before the stamp: both are BEFORE UPDATE and fire by
-- name, and "trainer_credentials_guard" < "trainer_credentials_stamp" already.

-- ---- what members see: verified and in date -------------------------------------------------------
create or replace view public_trainer_credentials with (security_barrier = true) as
 select trainer_id,
    title,
    reviewed_at as verified_on,
    gym_id,
    issuer,
    expires_on
   from trainer_credentials c
  where status = 'verified'::text
    and gym_id = current_gym_id()
    and (expires_on is null or expires_on >= (now() at time zone 'Asia/Manila')::date);
revoke all on public_trainer_credentials from anon;
grant select on public_trainer_credentials to authenticated;

-- ---- reminders ---------------------------------------------------------------------------------------
create or replace function credential_expiry_sweep() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  c record; a uuid; n int := 0;
begin
  for c in
    select t.id, t.gym_id, t.trainer_id, t.title, t.expires_on
      from trainer_credentials t
     where t.status = 'verified' and t.expires_on is not null
       and (v_only is null or t.gym_id = v_only)
       and t.expires_on <= v_today + 30
       -- Lapsed more than a month ago has been said already, or long ago enough not to matter.
       and t.expires_on >= v_today - 30
  loop
    if c.expires_on >= v_today then
      if notify_once(c.trainer_id, 'system', c.title || ' expires on ' || to_char(c.expires_on, 'Mon DD'),
           'Upload the renewed certificate in Profile → Edit profile → Certificates before then, so your verified mark stays on your profile.',
           '/trainer/profile/edit', 'credexp30:' || c.id, c.gym_id) then n := n + 1; end if;
    else
      perform notify_once(c.trainer_id, 'system', c.title || ' has expired',
        'It is no longer shown as verified on your profile. Upload the renewed certificate to get the mark back.',
        '/trainer/profile/edit', 'credexp:' || c.id, c.gym_id);
      for a in select user_id from gym_roles where gym_id = c.gym_id and role = 'admin' and status = 'active' loop
        perform notify_once(a, 'system', 'A coach''s credential lapsed',
          (select coalesce(p.first_name || ' ' || p.last_name, 'A coach') from profiles p where p.id = c.trainer_id)
            || '''s ' || c.title || ' expired on ' || to_char(c.expires_on, 'Mon DD') || '. Members no longer see it.',
          '/credentials', 'credexp-admin:' || c.id || ':' || a, c.gym_id);
      end loop;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$fn$;
revoke all on function credential_expiry_sweep() from public, anon;
grant execute on function credential_expiry_sweep() to authenticated;

create or replace function migration_0160_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0160_applied() from public, anon;
grant execute on function migration_0160_applied() to authenticated;
comment on function migration_0160_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0160.sql
