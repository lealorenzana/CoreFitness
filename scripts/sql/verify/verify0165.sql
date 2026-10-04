-- VERIFICATION for 0165 (the Activity log catches up)
-- Paste into the Supabase SQL editor right after 0165. Read-only; the error is the report.
-- triggers should be 16, callable false, marker true.
do $$
declare n int; c1 boolean; c2 boolean;
begin
  select count(*) into n from pg_trigger
   where not tgisinternal and tgname in ('trg_act_shop_sale','trg_act_stock','trg_act_membership_request','trg_act_refund',
     'trg_act_room_post','trg_act_assignment','trg_act_submission','trg_act_enrolment','trg_act_ai_proposal','trg_act_referral',
     'trg_act_redemption','trg_act_squad','trg_act_season_claim','trg_act_streak','trg_act_winback','trg_act_credential');
  c1 := has_function_privilege('authenticated','log_shop_sale_activity()','execute');
  select coalesce((select migration_0165_applied()), false) into c2;
  raise exception 'REPORT 0165: triggers=% | callable=% | marker=%', n, c1, c2;
end
$$;
