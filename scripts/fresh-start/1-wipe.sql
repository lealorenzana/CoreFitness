-- ============================================================================
-- Fresh start — PART 1 of 5 — delete every gym, every person and all their data
-- ============================================================================
--
-- IRREVERSIBLE. Take the encrypted backup first (docs/BACKUPS.md), and empty
-- the storage buckets (Supabase → Storage: media, progress, support,
-- applications, credentials) — files cannot be deleted from SQL, and an
-- account whose upload still points at it cannot be deleted.
--
-- Paste the whole file into the Supabase SQL Editor and run it once. It is ONE
-- transaction: if anything at all goes wrong, nothing is deleted and the error
-- says why. Running it again later is safe (it deletes whatever has appeared).
--
-- What stays:
--   * every platform admin (platform_admins) — the super admin's account,
--     profile and sign-in are untouched
--   * the platform itself: its plans and prices, billing settings, payment
--     methods, features, announcements, the shared exercise library and free
--     workout library, the map cache
--   * Gym #1's row and its RULES — points, badges, refund tiers, cancellation
--     reasons, goal templates, settings — because every new gym copies its
--     starting rules from Gym #1 (seed_gym_defaults). Part 2 renames it into
--     your private test gym.
--
-- What goes: every other gym; every account that is not a platform admin
-- (members, coaches, desks, owners, applicants — and their sign-ins); every
-- row any of them made; every application, payment, ticket and log about them.
-- ============================================================================

do $wipe$
declare
  v_one    uuid := gym_one();
  v_keep   uuid[];
  -- Gym #1's rules, copied into every new gym (0098/0186 seed_gym_defaults).
  v_rules  text[] := array['gym_settings', 'point_rules', 'cancellation_reasons', 'goal_templates',
                           'achievements', 'refund_rules'];
  -- Platform-level tables with no gym_id that hold gym or person history.
  v_clear  text[] := array['application_documents', 'application_messages', 'gym_applications',
                           'gym_suggestions', 'support_messages', 'announcement_dismissals',
                           'push_subscriptions', 'notification_prefs', 'client_errors', 'email_outbox',
                           'ai_coach_errors', 'paymongo_checkouts', 'platform_events',
                           'platform_capacity_snapshots'];
  t        record;
  v_tab    text;
  fk       record;
  v_pass   int;
  v_n      bigint;
  v_bad    text := '';
  v_people bigint;
  v_gyms   bigint;
  v_users  bigint;
begin
  select coalesce(array_agg(user_id), '{}') into v_keep from platform_admins;
  if cardinality(v_keep) = 0 then
    raise exception 'No platform admin exists, so this would delete the super admin too. Nothing was deleted.';
  end if;
  if not exists (select 1 from gyms where id = v_one) then
    raise exception 'Gym #1 is missing — new gyms copy their rules from it. Nothing was deleted.';
  end if;

  -- The platform admins' own "current gym" is Gym #1 from now on.
  update profiles set active_gym_id = v_one where id = any (v_keep);

  -- Nothing may award points, write the activity log or refuse a delete on the way.
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table public.%I disable trigger user', t.relname);
  end loop;

  -- Children before parents, by retrying: a delete refused by a row that still
  -- points at it goes through on a later pass, once that row has gone.
  for v_pass in 1 .. 25 loop
    -- Every gym table: everything but Gym #1's rules. NULL gym_id rows are the
    -- platform's own (the shared library) and stay.
    for t in
      select c.table_name from information_schema.columns c
        join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'gym_id' and x.table_type = 'BASE TABLE'
    loop
      begin
        if t.table_name = any (v_rules) then
          execute format('delete from public.%I where gym_id <> $1', t.table_name) using v_one;
        else
          execute format('delete from public.%I where gym_id is not null', t.table_name);
        end if;
      exception when foreign_key_violation or restrict_violation then null;   -- a later pass
      end;
    end loop;

    foreach v_tab in array v_clear loop
      if to_regclass('public.' || v_tab) is null then continue; end if;
      begin
        execute format('delete from public.%I', v_tab);
      exception when foreign_key_violation or restrict_violation then null;
      end;
    end loop;

    -- Every other column that points at a gym (an approved application, a
    -- suggestion): Gym #1 stays, any other gym's row goes or is cleared.
    for fk in
      select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
        from pg_constraint c
        cross join lateral unnest(c.conkey, c.confkey) as k(att, fatt)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and c.confrelid = 'public.gyms'::regclass
         and a.attname <> 'gym_id'
         and c.conrelid <> 'public.profiles'::regclass
    loop
      begin
        if fk.notnull then
          execute format('delete from %s where %I <> $1', fk.tbl, fk.col) using v_one;
        else
          execute format('update %s set %I = null where %I <> $1', fk.tbl, fk.col, fk.col) using v_one;
        end if;
      exception when foreign_key_violation or restrict_violation or not_null_violation or check_violation then null;
      end;
    end loop;

    -- Every column that points at a person who is not a platform admin:
    -- the row goes, or a nullable "recorded by" is cleared.
    for fk in
      select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
        from pg_constraint c
        cross join lateral unnest(c.conkey, c.confkey) as k(att, fatt)
        join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = k.att
        join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.fatt
       where c.contype = 'f'
         and c.connamespace = 'public'::regnamespace
         and c.confrelid in ('public.profiles'::regclass, 'public.member_profiles'::regclass,
                             'public.trainer_profiles'::regclass, 'auth.users'::regclass)
         and fa.attname in ('id', 'profile_id')
         and c.conrelid not in ('public.profiles'::regclass, 'public.member_profiles'::regclass,
                                'public.trainer_profiles'::regclass)
    loop
      begin
        if fk.notnull then
          execute format('delete from %s where %I <> all ($1)', fk.tbl, fk.col) using v_keep;
        else
          execute format('update %s set %I = null where %I is not null and %I <> all ($1)', fk.tbl, fk.col, fk.col, fk.col) using v_keep;
        end if;
      exception when foreign_key_violation or restrict_violation or not_null_violation or check_violation then null;
      end;
    end loop;

    begin delete from member_profiles  where profile_id <> all (v_keep); exception when foreign_key_violation or restrict_violation then null; end;
    begin delete from trainer_profiles where profile_id <> all (v_keep); exception when foreign_key_violation or restrict_violation then null; end;
    begin delete from profiles         where id <> all (v_keep);         exception when foreign_key_violation or restrict_violation then null; end;
    begin delete from gyms             where id <> v_one;                exception when foreign_key_violation or restrict_violation then null; end;
  end loop;

  -- Prove it before committing: anything left over undoes the whole run.
  select count(*) into v_people from profiles where id <> all (v_keep);
  select count(*) into v_gyms from gyms where id <> v_one;
  if v_people > 0 then v_bad := v_bad || v_people || ' people; '; end if;
  if v_gyms > 0 then v_bad := v_bad || v_gyms || ' gyms; '; end if;
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'gym_id' and x.table_type = 'BASE TABLE'
  loop
    if t.table_name = any (v_rules) then
      execute format('select count(*) from public.%I where gym_id <> $1', t.table_name) into v_n using v_one;
    else
      execute format('select count(*) from public.%I where gym_id is not null', t.table_name) into v_n;
    end if;
    if v_n > 0 then v_bad := v_bad || t.table_name || ' ' || v_n || '; '; end if;
  end loop;
  if v_bad <> '' then
    raise exception 'Not everything could be deleted, so NOTHING was: %', v_bad;
  end if;

  -- Gym #1 is nobody's now; part 2 gives it its owner, desk, coach and members.
  update gyms set status = 'active' where id = v_one;
  update profiles set active_gym_id = v_one where id = any (v_keep);

  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table public.%I enable trigger user', t.relname);
  end loop;

  -- The sign-ins last. An account whose uploaded file still points at it stays
  -- (empty Storage and run this file again); everything else of theirs is gone.
  begin
    delete from auth.users where id <> all (v_keep);
    get diagnostics v_users = row_count;
  exception when foreign_key_violation or restrict_violation then
    v_users := -1;
  end;

  raise notice 'Fresh start part 1: done. Kept % platform admin(s) and Gym #1''s rules. Sign-ins deleted: %.',
    cardinality(v_keep), case when v_users < 0 then 'NONE — empty Storage, then run this file again' else v_users::text end;
end
$wipe$;

-- What is left, in one row.
select (select count(*) from gyms)                         as gyms,
       (select count(*) from profiles)                     as people,
       (select count(*) from auth.users)                   as sign_ins,
       (select count(*) from platform_admins)              as platform_admins,
       (select count(*) from achievements where gym_id = gym_one()) as gym1_badges_kept,
       (select count(*) from exercises where gym_id is null)        as shared_exercises_kept;
