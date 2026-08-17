-- 0039 — SECURITY FIX. Role guards that a NULL role walked straight through.
--
-- `get_my_role()` returns NULL for any caller with no `profiles` row — an
-- anonymous request holding the public anon key, or a user mid-sign-up. Every
-- guard in this codebase was written as:
--
--     if get_my_role() <> 'admin' then raise exception '…'; end if;
--
-- and `NULL <> 'admin'` is **NULL, not TRUE**. The `if` body therefore never
-- runs and the guard is skipped entirely. Three-valued logic: the comparison is
-- "unknown", and plpgsql treats unknown as not-true.
--
-- **This was live and exploitable in 0038.** Verified against the real project
-- with nothing but the anon key that ships in the deployed bundle:
--
--     POST /rest/v1/rpc/revoke_achievement  →  204 No Content
--
-- 204 is success. An unauthenticated caller executed a DELETE against
-- `achievement_unlocks`. It removed nothing only because the probe passed a
-- non-existent user id; with a real member's id it would have taken their
-- badge. `award_achievement` got as far as "No such account", i.e. past the
-- admin check and into the user lookup — with a real id it would have inserted.
--
-- Why those two and not the older ones: `award_achievement` and
-- `revoke_achievement` are SECURITY DEFINER functions reachable directly at
-- `/rest/v1/rpc/…`. SECURITY DEFINER **bypasses RLS**, so the role check inside
-- the function is the only boundary there is. The older guards below have the
-- identical bug but sit behind RLS — a caller with no profile row cannot pass
-- the `profiles` or `memberships` UPDATE policies, so those triggers never fire.
-- They are fixed here anyway: defence in depth is only depth if it works, and
-- the fix is one token.
--
-- The fix is `IS DISTINCT FROM`, which is the NULL-safe comparison:
-- `NULL IS DISTINCT FROM 'admin'` is TRUE, so an unknown role is treated as
-- "not an admin" instead of as "no opinion".

-- ============================================================================
-- 1. THE TWO THAT WERE ACTUALLY EXPLOITABLE (from 0038)
-- ============================================================================

create or replace function award_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  target_role text;
begin
  -- IS DISTINCT FROM, not <>. A caller with no profile row has a NULL role and
  -- must be rejected, not waved through.
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can award an achievement' using errcode = 'insufficient_privilege';
  end if;

  select * into a from achievements where key = p_key;
  if not found then
    raise exception 'No such achievement: %', p_key;
  end if;

  select role::text into target_role from profiles where id = p_user;
  if target_role is null then
    raise exception 'No such account';
  end if;
  if target_role is distinct from a.audience then
    raise exception 'That achievement belongs to the % catalogue, but this account is a %',
      a.audience, target_role;
  end if;

  insert into achievement_unlocks (user_id, achievement_key)
  values (p_user, p_key)
  on conflict (user_id, achievement_key) do nothing;
end;
$$;

create or replace function revoke_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can revoke an achievement' using errcode = 'insufficient_privilege';
  end if;
  delete from achievement_unlocks where user_id = p_user and achievement_key = p_key;
end;
$$;

-- ============================================================================
-- 2. THE SAME BUG BEHIND RLS — not exploitable, fixed regardless
-- ============================================================================
-- Bodies reproduced from the migration that last defined each one, with only
-- the comparison changed. `prevent_member_profile_tamper` is 0016's version
-- (qr_code only) — 0006's older one also guarded `experience_level`, which 0016
-- deliberately released to members, and reinstating that would silently break
-- the onboarding write.

create or replace function prevent_profile_privilege_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins can change role or status';
    end if;
  end if;
  return new;
end;
$$;

create or replace function prevent_member_profile_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    if new.qr_code is distinct from old.qr_code then
      raise exception 'Only admins can change qr_code';
    end if;
  end if;
  return new;
end;
$$;

create or replace function enforce_freeze_frequency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only a transition *into* frozen counts. Editing a row that is already
  -- frozen (say, correcting the expiry) must not burn another freeze.
  if new.status = 'frozen' and old.status is distinct from 'frozen' then
    if old.freeze_count >= 1 and get_my_role() is distinct from 'admin' then
      raise exception 'This membership has already been frozen once this period. An admin can override.';
    end if;
    new.freeze_count := old.freeze_count + 1;
    new.frozen_at := coalesce(new.frozen_at, (now() at time zone 'Asia/Manila')::date);
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 3. VERIFY
-- ============================================================================
-- Run this migration, then re-probe as anon. Both must now be refused:
--
--   curl -s -X POST "$URL/rest/v1/rpc/revoke_achievement" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "Content-Type: application/json" \
--     -d '{"p_user":"00000000-0000-0000-0000-000000000000","p_key":"days_10"}'
--
-- Expected: 403 with "Only an admin can revoke an achievement".
-- Before this migration it returned 204 No Content — a successful DELETE.
