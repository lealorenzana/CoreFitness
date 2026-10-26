-- 0213 — Where the assistant button sits, per member; reward reminders say the gym's own points name.
--
-- 1. The member app's redesign (2026-10-26) moves the assistant into the page header beside the bell
--    by default — the floating bubble covered "Book", the end of Today's timeline and Settings' address.
--    The owner asked for the member to choose. A choice is per member, so it lives on the account,
--    never only in the phone's storage (CLAUDE.md): `member_profiles.assistant_button`, written by
--    the member for themself through RLS's own-row update, as `preferred_language` (0095) is.
--
-- 2. 0102's `trg_notify_reward_reachable()` wrote "You have N CORE Points — enough for …" into every
--    gym's members' inboxes, while the app shows each gym's own name for them (0110's points_name —
--    "G Points" at one gym). The message now says the gym's word, falling back to "Points" exactly as
--    the app does. Last definition before this one: 0102 (0053 is older); nothing later redefines it.
--
-- Paste once. Safe to re-run.

alter table member_profiles add column if not exists assistant_button text not null default 'header';
alter table member_profiles drop constraint if exists member_profiles_assistant_button_check;
alter table member_profiles add constraint member_profiles_assistant_button_check
  check (assistant_button in ('header', 'floating'));

comment on column member_profiles.assistant_button is
  'Where the member app puts the assistant (0213): ''header'' — a button beside the bell (default) — or '
  '''floating'' — the bubble. The member chooses in Settings.';

create or replace function trg_notify_reward_reachable() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  bal int;
  r record;
  word text;
begin
  perform act_as_gym(new.gym_id);
  bal := member_points_balance(new.member_id);

  -- The most expensive reward of this gym now affordable. One message, not one per reward.
  select id, name, cost_points into r
    from rewards
   where gym_id = new.gym_id
     and is_active and (stock is null or stock > 0) and cost_points <= bal
   order by cost_points desc
   limit 1;

  if r.id is not null then
    -- The gym's own word for its points (0110); "Points" when it has not chosen one, as in the app.
    select nullif(btrim(points_name), '') into word from gym_settings where gym_id = new.gym_id;
    perform notify_once(
      new.member_id, 'success', 'You can claim a reward',
      'You have ' || bal || ' ' || coalesce(word, 'Points') || ' — enough for ' || r.name || '.',
      '/member/rewards',
      'reward:' || r.id::text
    );
  end if;
  return null;
end;
$fn$;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0213_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0213_applied() to anon, authenticated;
