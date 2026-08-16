-- Core Fitness — let admins read the notifications they've broadcast.
--
-- notifications rows are per-recipient (one row per user), and the only select
-- policy was notifications_select_self. That meant an admin could send a gym-wide
-- announcement but could never see the history of what had been sent — the
-- "Recent Notifications" list on the admin page had no way to load real data.
--
-- Members and trainers are unaffected: they still only ever see their own rows.

drop policy if exists notifications_select_admin on notifications;
create policy notifications_select_admin on notifications for select
  using (get_my_role() = 'admin');
