-- Takes out everything lab-populate.sql added to Core Fitness Lab (ids 5eed9…),
-- including the gym-level rows Remove demo data does not reach.
-- The memberships it marked expired stay expired.
do $$
declare
  g constant uuid := 'c0f1e55e-0000-4000-8000-000000000001';
  t text;
begin
  foreach t in array array['shop_sale_items','shop_sales','bookings','pt_sessions','attendance','payments','memberships',
    'coach_checkins','equipment_reports','gym_notes','feature_requests','gym_goals','membership_requests','referrals',
    'testimonials','trainer_credentials','slot_bookings','slot_templates'] loop
    execute format('alter table %I disable trigger user', t);
    execute format('delete from %I where gym_id = $1 and id::text like %L', t, '5eed9%') using g;
    execute format('alter table %I enable trigger user', t);
  end loop;
  delete from cash_closeouts where gym_id = g and closed_by = 'cf1ab000-0000-4000-8000-000000000002'
    and closed_at >= '2026-11-13';
  delete from coaching_prices where gym_id = g;
  delete from class_waitlist where gym_id = g and member_id::text like '5eed%';
end $$;
