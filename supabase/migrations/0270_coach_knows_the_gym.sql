-- 0270: the assistant knows how this gym runs (owner, 2026-11-23).
--
-- Asked "what's the difference between sessions, bookings and packages in this gym", the assistant
-- answered with a fixed card about a "Book a Session" button and classes. The coach's reader
-- (0177, + equipment in 0184) gave it prices, hours and the timetable, but not the owner's setup:
-- what is switched on, who approves a session, a class and a package, time slots, cancel windows,
-- day passes, freeze limits and the refund rules. This adds them as `how_this_gym_runs`, read from
-- the gym's own settings, never typed in. Read only, as the member (their gym only); nothing writes.

do $$
begin
  if exists (select 1 from pg_proc where proname = 'ai_coach_gym_info' and pronargs = 0)
     and not exists (select 1 from pg_proc where proname = 'ai_coach_gym_info_v2') then
    alter function ai_coach_gym_info() rename to ai_coach_gym_info_v2;
  end if;
end
$$;
revoke all on function ai_coach_gym_info_v2() from public, anon, authenticated;

create or replace function ai_coach_gym_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select ai_coach_gym_info_v2() || jsonb_build_object('how_this_gym_runs', (
    select jsonb_build_object(
      'switched_on', (select jsonb_object_agg(k, gym_module_on(current_gym_id(), k))
                        from unnest(array['classes','coaching','slots','requests','equipment','engagement','points',
                                          'progress','targets','photos','shop','events','reels','gym_chat','referrals']) k),
      'session_approval', booking_approval_mode(current_gym_id(), 'pt'),
      'class_approval', booking_approval_mode(current_gym_id(), 'class'),
      'package_ways_in', s.coaching_modes,
      'package_pick_approval', s.coaching_approval,
      'package_months', s.coaching_lengths,
      'package_payment', s.coaching_fee_mode,
      'closed_days', (select jsonb_agg((array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[d + 1])
                        from unnest(s.closed_days) d where d between 0 and 6),
      'session_cancel_minutes_before', s.pt_cancel_minutes,
      'class_cancel_minutes_before', s.class_cancel_minutes,
      'time_slots', case when gym_module_on(current_gym_id(), 'slots')
                      then jsonb_build_object('door', s.slot_door, 'book_days_ahead', s.slot_ahead_days) end,
      'day_pass', case when s.day_pass_on
                    then jsonb_build_object('one_day_php', s.day_pass_price, 'five_days_php', s.pack5_price, 'ten_days_php', s.pack10_price) end,
      'freeze_guideline', jsonb_build_object('max_days_at_once', s.max_freeze_days_at_once, 'max_days_a_year', s.max_freeze_days_per_year),
      'refund', jsonb_build_object(
        'rule', 'At least the unused part of what was paid (pro-rata), or the tier below if higher, minus the fee.',
        'fee_php', s.refund_processing_fee, 'fee_reason', s.refund_fee_reason,
        'tiers', coalesce((select jsonb_agg(jsonb_build_object('label', r.label, 'from_day', r.min_days, 'before_day', r.max_days,
                                                               'percent', r.percent) order by r.priority)
                             from refund_rules r where r.gym_id = current_gym_id() and r.is_active), '[]'::jsonb)),
      'points_name', s.points_name)
      from gym_settings s where s.gym_id = current_gym_id() limit 1));
$$;
revoke all on function ai_coach_gym_info() from public, anon;
grant execute on function ai_coach_gym_info() to authenticated;

create or replace function migration_0270_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0270_applied() to anon, authenticated;
