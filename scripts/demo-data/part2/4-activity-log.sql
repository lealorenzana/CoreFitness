-- Demo data part 2 — BLOCK 4 of 4 — the activity log, describing the demo rows
--
-- Paste ONE file at a time into the Supabase SQL Editor and run it, in
-- order 1 → 4. Split from seed-demo-data-2.sql, which explains every
-- choice made here: the editor has broken on a long paste before.
-- Re-runnable. Expect a NOTICE starting "Block 4:".

-- ============================================================================
-- BLOCK 4 of 4 — the activity log, describing the demo rows
-- ============================================================================
-- Written from the rows the other blocks made, so every entry points at
-- something real in the demo data. The actor is "Front Desk", a coach, or the
-- system — never the gym's actual admin, who did none of this.
do $seed$
declare
  v_real int;
  v_n    int;
begin
  select count(*) into v_real from activity_log where coalesce(detail->>'seed', '') <> 'true';
  if v_real >= 41 then
    raise notice 'Activity log: % real entries already, so it already pages. None added.', v_real;
    return;
  end if;
  select count(*) into v_n from activity_log where detail->>'seed' = 'true';
  if v_n > 0 then
    raise notice 'Activity log: demo entries already present. None added.';
    return;
  end if;

  insert into activity_log (occurred_at, actor_id, actor_role, actor_label, action, subject_type,
                            subject_id, member_id, summary, detail)
  -- Payments taken at the desk
  select p.created_at, null::uuid, 'staff', 'Front Desk', 'payment.recorded', 'payment', p.id, p.member_id,
         'Recorded ₱' || to_char(p.amount, 'FM999,999') || ' cash from ' || pr.first_name || ' ' || pr.last_name
           || case when p.status = 'pending' then ' (pending)' else '' end,
         '{"seed": true}'::jsonb
    from payments p join profiles pr on pr.id = p.member_id
   where p.id::text like '5eed0003-0000-4000-8000-%' and p.created_at > now() - interval '60 days'
  union all
  -- Check-ins, last week
  select a.check_in_time, null::uuid, 'staff', 'Front Desk', 'checkin.recorded', 'attendance', a.id, a.member_id,
         'Checked in ' || pr.first_name || ' ' || pr.last_name || ' (' || upper(a.method::text) || ')',
         '{"seed": true}'::jsonb
    from attendance a join profiles pr on pr.id = a.member_id
   where a.id::text like '5eed0004-0000-4000-8000-%' and a.check_in_time > now() - interval '7 days'
  union all
  -- Class bookings decided, last three weeks
  select coalesce(b.decided_at, b.requested_at + interval '2 hours'), null::uuid,
         case when b.status = 'rejected' then 'system' else 'staff' end,
         case when b.status = 'rejected' then null else 'Front Desk' end,
         'booking.' || case b.status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end,
         'booking', b.id, b.member_id,
         case b.status
           when 'approved' then 'Approved ' || pr.first_name || ' ' || pr.last_name || ' for ' || c.name
           when 'rejected' then pr.first_name || ' ' || pr.last_name || '''s request for ' || c.name || ' expired unanswered'
           else pr.first_name || ' ' || pr.last_name || ' cancelled ' || c.name
         end,
         '{"seed": true}'::jsonb
    from bookings b join classes c on c.id = b.class_id join profiles pr on pr.id = b.member_id
   where b.id::text like '5eed0006-0000-4000-8000-%' and c.scheduled_at > now() - interval '21 days'
  union all
  -- PT sessions accepted by their coach, last three weeks
  select s.decided_at, null::uuid, 'trainer', co.first_name || ' ' || co.last_name, 'pt.approved', 'pt_session',
         s.id, s.member_id,
         co.first_name || ' accepted a session with ' || pr.first_name || ' ' || pr.last_name,
         '{"seed": true}'::jsonb
    from pt_sessions s join profiles pr on pr.id = s.member_id join profiles co on co.id = s.trainer_id
   where s.id::text like '5eed000e-0000-4000-8000-%' and s.status = 'approved'
     and s.starts_at > now() - interval '21 days'
  union all
  -- Suspensions and archives, with the reason on the record
  select e.created_at, null::uuid, 'admin', 'Admin',
         case e.status when 'suspended' then 'member.suspended' else 'member.archived' end,
         'member', e.profile_id, e.profile_id,
         case e.status when 'suspended' then 'Suspended ' else 'Archived ' end
           || pr.first_name || ' ' || pr.last_name || ' — ' || e.reason,
         '{"seed": true}'::jsonb
    from account_status_events e join profiles pr on pr.id = e.profile_id
   where e.id::text like '5eed0008-0000-4000-8000-%'
  union all
  -- New sign-ups in the last month
  select pr.created_at, null::uuid, null::text, null::text, 'member.registered', 'member', pr.id, pr.id,
         pr.first_name || ' ' || pr.last_name || ' registered',
         '{"seed": true}'::jsonb
    from profiles pr
   where pr.id::text like '5eed000_-0000-4000-8000-%' and pr.role = 'member'
     and pr.created_at > now() - interval '30 days';

  select count(*) into v_n from activity_log where detail->>'seed' = 'true';
  raise notice 'Block 4: % activity-log entries.', v_n;
end
$seed$;
