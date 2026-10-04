-- ============================================================================
-- 0165 — The Activity log catches up
-- ============================================================================
--
-- 0037's audit trail is written only by SECURITY DEFINER triggers (no INSERT
-- policy), so it knew bookings, payments, check-ins, memberships, accounts and
-- the schedule — and nothing built since: the shop, freeze/cancel requests,
-- refunds, rooms and classwork, programs, referrals, rewards, squads, seasons,
-- streak milestones, trainer credentials, win-back messages and the AI coach's
-- applied changes all happened without a line in the log.
--
-- One trigger per table, each writing through log_activity() with the row's own
-- gym_id, so a session-less writer (a sweep, the desk's trigger chain) still
-- files the event under the right gym. Actions are `subject.verb`; the admin
-- page groups them by prefix (shop. · membership. · room./classwork./program./
-- ai. · reward./referral./squad./season./streak./winback./achievement. ·
-- credential./gym.).
--
-- Deliberately NOT logged:
--   • stock moves of reason 'sale'/'void' — the sale and the void already are;
--   • personal records and weekly quest copies — machine-made, every set;
--   • room comments and chat — conversation, not an action on the gym, and chat
--     is private to its two people (0131).
-- ============================================================================

-- Name of a person, or a plain word when they are gone — never a guessed name.
create or replace function act_name(p uuid) returns text
language sql security definer stable set search_path = public as $$
  select coalesce(activity_member_name(p), 'a member')
$$;
revoke all on function act_name(uuid) from public, anon;

create or replace function act_peso(n numeric) returns text
language sql immutable as $$ select '₱' || to_char(coalesce(n, 0), 'FM999,999,990.00') $$;

-- ---- The shop (0133) -------------------------------------------------------
create or replace function log_shop_sale_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('shop.sale', 'shop_sale', new.id, new.member_id,
      'Sold ' || act_peso(new.total) || case when new.member_id is not null then ' to ' || act_name(new.member_id) else '' end,
      jsonb_build_object('total', new.total), new.gym_id);
  elsif new.voided_at is not null and old.voided_at is null then
    perform log_activity('shop.sale_voided', 'shop_sale', new.id, new.member_id,
      'Voided a ' || act_peso(new.total) || ' sale' || coalesce(': ' || nullif(btrim(new.void_reason), ''), ''),
      jsonb_build_object('total', new.total, 'reason', new.void_reason), new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_shop_sale on shop_sales;
create trigger trg_act_shop_sale after insert or update of voided_at on shop_sales
  for each row execute function log_shop_sale_activity();

create or replace function log_stock_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.reason in ('sale', 'void') then return new; end if;
  select name into v_name from shop_products where id = new.product_id;
  perform log_activity('shop.stock_' || new.reason, 'shop_product', new.product_id, null,
    'Stock of ' || coalesce(v_name, 'a product') || ': ' || case when new.change > 0 then '+' else '' end || new.change
      || case new.reason when 'delivery' then ' (delivery)' when 'count' then ' (count)' when 'damage' then ' (damaged)' else '' end
      || coalesce(' — ' || nullif(btrim(new.note), ''), ''),
    jsonb_build_object('change', new.change, 'reason', new.reason), new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_stock on stock_moves;
create trigger trg_act_stock after insert on stock_moves
  for each row execute function log_stock_activity();

-- ---- Freeze / cancel requests (0118) and refunds (0057/0070/0073) ------------
create or replace function log_membership_request_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('membership.request_' || new.kind, 'membership_request', new.id, new.member_id,
      act_name(new.member_id) || ' asked to ' || new.kind
        || case when new.kind = 'freeze' and new.requested_days is not null then ' for ' || new.requested_days || ' days' else '' end
        || ': ' || new.reason,
      jsonb_build_object('kind', new.kind, 'days', new.requested_days), new.gym_id);
  elsif new.status is distinct from old.status and new.status <> 'open' then
    perform log_activity('membership.request_' || new.status, 'membership_request', new.id, new.member_id,
      case new.status when 'granted' then 'Granted ' when 'declined' then 'Declined ' else 'Withdrawn: ' end
        || act_name(new.member_id) || '''s request to ' || new.kind
        || coalesce(' — ' || nullif(btrim(new.close_note), ''), ''),
      jsonb_build_object('kind', new.kind), new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_membership_request on membership_requests;
create trigger trg_act_membership_request after insert or update of status on membership_requests
  for each row execute function log_membership_request_activity();

create or replace function log_refund_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.refund_amount, 0) > 0 then
    perform log_activity('membership.refund', 'membership_event', new.id, new.member_id,
      'Refund of ' || act_peso(new.refund_amount) || ' to ' || act_name(new.member_id) || ' (' || new.kind || ')',
      jsonb_build_object('amount', new.refund_amount, 'percent', new.refund_percent, 'kind', new.kind), new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_refund on membership_events;
create trigger trg_act_refund after insert on membership_events
  for each row execute function log_refund_activity();

-- ---- Coaching: rooms, classwork, programs, the AI coach -----------------------
create or replace function log_room_post_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_room text;
begin
  select name into v_room from rooms where id = new.room_id;
  perform log_activity('room.posted', 'room', new.room_id, null,
    act_name(new.author_id) || ' posted in ' || coalesce(v_room, 'a room'),
    null, new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_room_post on room_posts;
create trigger trg_act_room_post after insert on room_posts
  for each row execute function log_room_post_activity();

create or replace function log_assignment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_room text;
begin
  select name into v_room from rooms where id = new.room_id;
  perform log_activity('classwork.assigned', 'room_assignment', new.id, null,
    act_name(new.created_by) || ' set "' || new.title || '" in ' || coalesce(v_room, 'a room')
      || ', due ' || to_char(new.due_on, 'Mon DD'),
    jsonb_build_object('kind', new.kind, 'due_on', new.due_on), new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_assignment on room_assignments;
create trigger trg_act_assignment after insert on room_assignments
  for each row execute function log_assignment_activity();

create or replace function log_submission_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select title into v_title from room_assignments where id = new.assignment_id;
  if tg_op = 'INSERT' then
    perform log_activity('classwork.turned_in', 'room_assignment', new.assignment_id, new.member_id,
      act_name(new.member_id) || ' turned in "' || coalesce(v_title, 'classwork') || '"', null, new.gym_id);
  elsif new.returned_at is not null and old.returned_at is null then
    perform log_activity('classwork.returned', 'room_assignment', new.assignment_id, new.member_id,
      'Returned ' || act_name(new.member_id) || '''s "' || coalesce(v_title, 'classwork') || '"'
        || case when new.points_awarded > 0 then ' (+' || new.points_awarded || ' points)' else '' end,
      null, new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_submission on room_submissions;
create trigger trg_act_submission after insert or update of returned_at on room_submissions
  for each row execute function log_submission_activity();

create or replace function log_enrolment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prog text;
begin
  select name into v_prog from gym_programs where id = new.program_id;
  if tg_op = 'INSERT' then
    perform log_activity(case when new.assigned_by is not null and new.assigned_by <> new.member_id then 'program.assigned' else 'program.started' end,
      'program', new.program_id, new.member_id,
      case when new.assigned_by is not null and new.assigned_by <> new.member_id
           then act_name(new.assigned_by) || ' put ' || act_name(new.member_id) || ' on ' || coalesce(v_prog, 'a program')
           else act_name(new.member_id) || ' started ' || coalesce(v_prog, 'a program') end,
      null, new.gym_id);
  elsif new.status is distinct from old.status and new.status in ('finished', 'left') then
    perform log_activity('program.' || new.status, 'program', new.program_id, new.member_id,
      act_name(new.member_id) || case new.status when 'finished' then ' finished ' else ' left ' end || coalesce(v_prog, 'a program'),
      null, new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_enrolment on program_enrolments;
create trigger trg_act_enrolment after insert or update of status on program_enrolments
  for each row execute function log_enrolment_activity();

-- The coach's proposals (0145): only what changed something — applied or undone.
create or replace function log_ai_proposal_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('applied', 'undone') then
    perform log_activity('ai.change_' || new.status, 'ai_proposal', new.id, new.member_id,
      act_name(new.member_id) || case new.status when 'applied' then ' applied' else ' undid' end
        || ' an AI coach change: ' || new.summary,
      jsonb_build_object('kind', new.kind), new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_ai_proposal on ai_proposals;
create trigger trg_act_ai_proposal after update of status on ai_proposals
  for each row execute function log_ai_proposal_activity();

-- ---- Engagement --------------------------------------------------------------
create or replace function log_referral_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rewarded' and old.status is distinct from 'rewarded' then
    perform log_activity('referral.paid', 'referral', new.id, new.referrer_id,
      act_name(new.referrer_id) || ' earned ' || new.referrer_points || ' points for referring '
        || act_name(new.referred_id) || ' (' || new.friend_points || ' to the friend)',
      jsonb_build_object('referrer_points', new.referrer_points, 'friend_points', new.friend_points), new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_referral on referrals;
create trigger trg_act_referral after update of status on referrals
  for each row execute function log_referral_activity();

create or replace function log_redemption_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reward text;
begin
  select name into v_reward from rewards where id = new.reward_id;
  if tg_op = 'INSERT' then
    perform log_activity('reward.requested', 'reward', new.reward_id, new.member_id,
      act_name(new.member_id) || ' asked for ' || coalesce(v_reward, 'a reward') || ' (' || new.cost_points || ' points)',
      null, new.gym_id);
  elsif new.fulfilled_at is not null and old.fulfilled_at is null then
    perform log_activity('reward.handed_over', 'reward', new.reward_id, new.member_id,
      'Handed ' || coalesce(v_reward, 'a reward') || ' to ' || act_name(new.member_id), null, new.gym_id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform log_activity('reward.' || new.status, 'reward', new.reward_id, new.member_id,
      case new.status when 'approved' then 'Approved ' else 'Turned down ' end || act_name(new.member_id) || '''s '
        || coalesce(v_reward, 'reward') || coalesce(' — ' || nullif(btrim(new.decision_note), ''), ''),
      null, new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_redemption on reward_redemptions;
create trigger trg_act_redemption after insert or update of status, fulfilled_at on reward_redemptions
  for each row execute function log_redemption_activity();

create or replace function log_squad_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity('squad.created', 'squad', new.id, new.created_by,
    act_name(new.created_by) || ' started the squad ' || new.name, null, new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_squad on squads;
create trigger trg_act_squad after insert on squads
  for each row execute function log_squad_activity();

create or replace function log_season_claim_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tier text;
begin
  select name into v_tier from season_tiers where id = new.tier_id;
  if tg_op = 'INSERT' then
    perform log_activity('season.claimed', 'season_tier', new.tier_id, new.member_id,
      act_name(new.member_id) || ' reached ' || coalesce(v_tier, 'a tier') || ' in the ' || to_char(new.season_start, 'FMMonth') || ' season',
      null, new.gym_id);
  elsif new.handed_over_at is not null and old.handed_over_at is null then
    perform log_activity('season.handed_over', 'season_tier', new.tier_id, new.member_id,
      'Handed ' || act_name(new.member_id) || ' the ' || coalesce(v_tier, 'season') || ' reward', null, new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_season_claim on season_claims;
create trigger trg_act_season_claim after insert or update of handed_over_at on season_claims
  for each row execute function log_season_claim_activity();

create or replace function log_streak_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity('streak.milestone', 'member', new.member_id, new.member_id,
    act_name(new.member_id) || ' reached a ' || new.weeks || '-week streak', jsonb_build_object('weeks', new.weeks), new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_streak on streak_milestones;
create trigger trg_act_streak after insert on streak_milestones
  for each row execute function log_streak_activity();

create or replace function log_winback_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity('winback.sent', 'member', new.member_id, new.member_id,
    'Sent ' || act_name(new.member_id) || ' a win-back message (' || replace(new.rule_key, '_', ' ') || ')',
    jsonb_build_object('rule', new.rule_key), new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_winback on winback_sends;
create trigger trg_act_winback after insert on winback_sends
  for each row execute function log_winback_activity();

-- ---- Trainer credentials (0054/0160) -----------------------------------------
create or replace function log_credential_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('credential.submitted', 'trainer_credential', new.id, new.trainer_id,
      act_name(new.trainer_id) || ' submitted the credential "' || new.title || '"', null, new.gym_id);
  elsif new.status is distinct from old.status then
    perform log_activity('credential.' || new.status, 'trainer_credential', new.id, new.trainer_id,
      case new.status when 'verified' then 'Verified ' when 'rejected' then 'Rejected ' else 'Resubmitted ' end
        || act_name(new.trainer_id) || '''s "' || new.title || '"'
        || case when new.status = 'rejected' then coalesce(' — ' || nullif(btrim(new.review_note), ''), '') else '' end,
      null, new.gym_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_act_credential on trainer_credentials;
create trigger trg_act_credential after insert or update of status on trainer_credentials
  for each row execute function log_credential_activity();

-- Every function above is a trigger body; nobody calls one directly.
do $$
declare f text;
begin
  foreach f in array array['log_shop_sale_activity','log_stock_activity','log_membership_request_activity',
    'log_refund_activity','log_room_post_activity','log_assignment_activity','log_submission_activity',
    'log_enrolment_activity','log_ai_proposal_activity','log_referral_activity','log_redemption_activity',
    'log_squad_activity','log_season_claim_activity','log_streak_activity','log_winback_activity',
    'log_credential_activity'] loop
    execute format('revoke all on function %I() from public, anon, authenticated', f);
  end loop;
end $$;

create or replace function migration_0165_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0165_applied() from public, anon;
grant execute on function migration_0165_applied() to authenticated;
comment on function migration_0165_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';
