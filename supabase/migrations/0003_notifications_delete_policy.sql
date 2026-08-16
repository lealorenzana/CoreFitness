-- Core Fitness — follow-up migration
-- A user may delete their own notifications (dismiss). 0002_rls.sql only granted
-- select/update on notifications; delete had no matching policy (default deny).
-- Run this in the Supabase SQL Editor after 0001/0002.

create policy notifications_delete_self on notifications for delete
  using (user_id = auth.uid());
