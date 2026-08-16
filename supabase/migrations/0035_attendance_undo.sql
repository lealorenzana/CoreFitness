-- 0035 — let the front desk undo a check-in it just got wrong.
--
-- `attendance` has had SELECT and INSERT policies since 0002 and nothing else,
-- so DELETE and UPDATE were default-deny. A desk that scanned the wrong member,
-- or checked someone in twice through two different lanes, had no way to fix it:
-- the row was permanent, it counted toward that member's training days in
-- `member_training_stats` (0028), and it counted against the gym in Retention.
--
-- **Same day only.** A mis-scan is noticed within minutes, so that is all the
-- window the desk needs — and it is the difference between correcting today's
-- mistake and being able to quietly rewrite last month's history. `check_in_time`
-- is compared in **Manila time**, not UTC: the gym's day is not the server's, and
-- a 6am visit is normal here. Comparing in UTC would make the last eight hours of
-- every gym day belong to "yesterday" and fall outside the window immediately.
--
-- A hard delete rather than a `voided_at` flag on purpose. A wrong check-in is
-- false data, not history — and soft-voiding would mean auditing every existing
-- reader (progression, retention, the member's own attendance history) to teach
-- each one to skip voided rows. Every one of those readers stays correct as-is.

drop policy if exists attendance_delete_frontdesk on attendance;
create policy attendance_delete_frontdesk on attendance for delete
  using (
    is_front_desk()
    and (check_in_time at time zone 'Asia/Manila')::date
        = (now() at time zone 'Asia/Manila')::date
  );

-- Deliberately no UPDATE policy. There is nothing on this row worth editing:
-- the member, the time and the method are facts about what happened. If any of
-- them is wrong the row is wrong — delete it and scan again.
