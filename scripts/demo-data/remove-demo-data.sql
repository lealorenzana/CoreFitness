-- Removes everything seed-demo-data.sql created — and only that.
--
-- Paste into the Supabase SQL Editor and run. One atomic block: it either
-- removes all of it or none of it. Safe to run twice.
--
-- ## How it finds the demo data
--
-- Demo members are those whose id matches `5eed0001-0000-4000-8000-…` **and**
-- whose email ends `@seed.corefitness-test.com`. Both, not either — a real
-- member would have to match a 1-in-10^16 id pattern and a test-only domain.
--
-- Everything is then removed **by member**, not only by the seed's own id
-- pattern. So a payment recorded against a demo member during a demo, or a
-- check-in scanned for one, goes too, even though its id was random. The only
-- rows taken by id pattern alone are the demo classes.
--
-- Audit-log entries about demo members are removed with them. The seed wrote
-- none, so anything here came from clicking around on demo data — it describes
-- people who never existed, and leaving it would put them in the gym's history.
--
-- ## Why the triggers are off while it runs
--
-- The same reason as the seed: deleting fires them. Each deleted booking,
-- payment and check-in would write an audit entry about a person being
-- removed, and some would notify. Off inside this transaction only; no other
-- session sees them off.

do $rm$
declare
  v_ids uuid[];
  v_classes int;
  v_members int;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from profiles
   where id::text like '5eed0001-0000-4000-8000-%'
     and email like '%@seed.corefitness-test.com';

  select count(*) into v_classes from classes where id::text like '5eed0005-0000-4000-8000-%';

  if cardinality(v_ids) = 0 and v_classes = 0 then
    raise notice 'No demo data found. Nothing to remove.';
    return;
  end if;

  alter table profiles              disable trigger user;
  alter table member_profiles       disable trigger user;
  alter table memberships           disable trigger user;
  alter table payments              disable trigger user;
  alter table attendance            disable trigger user;
  alter table classes               disable trigger user;
  alter table bookings              disable trigger user;
  alter table membership_events     disable trigger user;
  alter table account_status_events disable trigger user;

  delete from activity_log
   where member_id = any(v_ids)
      or subject_id = any(v_ids)
      or subject_id::text like '5eed____-0000-4000-8000-%';

  delete from bookings
   where member_id = any(v_ids)
      or class_id::text like '5eed0005-0000-4000-8000-%';
  delete from classes               where id::text like '5eed0005-0000-4000-8000-%';
  delete from attendance            where member_id = any(v_ids);
  delete from payments              where member_id = any(v_ids);
  delete from membership_events     where member_id = any(v_ids);
  delete from memberships           where member_id = any(v_ids);
  delete from account_status_events where profile_id = any(v_ids);
  delete from member_profiles       where profile_id = any(v_ids);
  delete from profiles              where id = any(v_ids);
  -- Last, and it cascades to anything else a demo member picked up during a
  -- demo (notifications, points), through the foreign keys, which stay on.
  delete from auth.users            where id = any(v_ids);

  alter table profiles              enable trigger user;
  alter table member_profiles       enable trigger user;
  alter table memberships           enable trigger user;
  alter table payments              enable trigger user;
  alter table attendance            enable trigger user;
  alter table classes               enable trigger user;
  alter table bookings              enable trigger user;
  alter table membership_events     enable trigger user;
  alter table account_status_events enable trigger user;

  select count(*) into v_members from profiles where id::text like '5eed0001-0000-4000-8000-%';
  raise notice 'Removed % demo members and % demo classes. Demo members remaining: %.',
    cardinality(v_ids), v_classes, v_members;
end
$rm$;
