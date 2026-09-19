-- 0092 — a reward's whole life, told to the member; and what they are saving for.
--
-- ## 1. Deciding and handing over
--
-- 0051 gave a redemption four states — pending, approved, rejected, fulfilled —
-- and then only ever used three. Nothing moved a request to `fulfilled`, so the
-- member's app said "Approved — collect at the desk" for ever, even after they
-- had the towel in their bag; and the admin's approve/reject was a bare UPDATE
-- that told the member nothing (and would have reported success on zero rows).
--
--   * `decide_redemption()` — admin only, as 0051 ruled (approving commits the
--     gym to giving something away). Stamps who and when, needs a reason to
--     reject, and notifies the member either way.
--   * `mark_redemption_collected()` — the **front desk** (admin or staff): the
--     person handing the reward over is the one who knows it happened. Moves
--     approved → fulfilled, stamps `fulfilled_at`, and tells the member.
--
-- ## 2. Saving for
--
-- A member can pin one reward as the thing they are saving for. It is shown on
-- their Rewards screen with an honest pace estimate, and the gym sees how many
-- members are saving for each reward — the demand signal for restocking, which
-- it had no way to read. Stored on `member_profiles` (the member's own row, which
-- they may already update); `reward_wishlist_counts()` gives the desk counts,
-- never names.

-- ════════════════════════════════════════════════════════════════════════
-- 1. DECIDING AND HANDING OVER
-- ════════════════════════════════════════════════════════════════════════
alter table reward_redemptions add column if not exists fulfilled_at timestamptz;
alter table reward_redemptions add column if not exists fulfilled_by uuid references profiles(id);

create or replace function decide_redemption(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can approve or decline a reward.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'A decision is approved or rejected.';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;

  update reward_redemptions
     set status = p_status, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_id and status = 'pending'
  returning member_id, reward_id into r;
  if r.member_id is null then
    raise exception 'That request has already been decided.';
  end if;

  perform notify_once(r.member_id, 'system',
    case when p_status = 'approved' then 'Reward approved' else 'Reward request declined' end,
    case when p_status = 'approved'
      then (select name from rewards where id = r.reward_id) || ' is ready — collect it at the front desk.'
      else (select name from rewards where id = r.reward_id) || ': ' || btrim(p_note) || ' Your points were not spent.'
    end,
    '/member/rewards', 'redemption:' || p_id || ':' || p_status);
end;
$fn$;

create or replace function mark_redemption_collected(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can hand a reward over.';
  end if;
  update reward_redemptions
     set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
   where id = p_id and status = 'approved'
  returning member_id, reward_id into r;
  if r.member_id is null then
    raise exception 'Only an approved reward can be handed over.';
  end if;
  perform notify_once(r.member_id, 'system', 'Reward collected',
    (select name from rewards where id = r.reward_id) || ' — enjoy it.',
    '/member/rewards', 'redemption:' || p_id || ':collected');
end;
$fn$;

revoke all on function decide_redemption(uuid, text, text), mark_redemption_collected(uuid) from public, anon;
grant execute on function decide_redemption(uuid, text, text), mark_redemption_collected(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. SAVING FOR
-- ════════════════════════════════════════════════════════════════════════
alter table member_profiles
  add column if not exists saving_for_reward uuid references rewards(id) on delete set null;

create or replace function reward_wishlist_counts()
returns table (reward_id uuid, members int)
language sql stable security definer set search_path = public as $fn$
  select mp.saving_for_reward, count(*)::int
    from member_profiles mp
    join profiles p on p.id = mp.profile_id and p.status = 'active'
   where mp.saving_for_reward is not null
     and get_my_role() in ('admin', 'staff')
   group by mp.saving_for_reward
$fn$;
revoke all on function reward_wishlist_counts() from public, anon;
grant execute on function reward_wishlist_counts() to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0092_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0092_applied() from public, anon;
grant execute on function migration_0092_applied() to authenticated;

-- VERIFICATION
--   admin:  select decide_redemption('<pending id>', 'approved');          -- member notified
--           select decide_redemption('<pending id>', 'rejected');          -- raises: needs a reason
--   staff:  select decide_redemption('<pending id>', 'approved');          -- raises: admin only
--           select mark_redemption_collected('<approved id>');           -- fulfilled, member notified
--   member: update member_profiles set saving_for_reward = '<reward>' where profile_id = auth.uid();
--   desk:   select * from reward_wishlist_counts();                        -- counts only
