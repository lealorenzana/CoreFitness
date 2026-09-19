grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  me uuid; adm uuid; stf uuid; rw uuid; r1 uuid; r2 uuid; r3 uuid; n int; r text := ''; st text;
begin
  select m.member_id into me from memberships m join profiles p on p.id = m.member_id
   where m.status = 'active' and p.status = 'active' limit 1;
  select id into adm from profiles where role = 'admin' limit 1;
  select id into stf from profiles where role = 'staff' limit 1;
  if stf is null then
    stf := adm;  -- no staff seeded: the staff checks below are then skipped
  end if;
  insert into rewards (name, cost_points, stock, is_active) values ('Test towel', 1, 5, true) returning id into rw;
  -- As owner: three pending requests (bypassing the balance check is fine here)
  alter table reward_redemptions disable trigger reward_redemptions_validate;
  insert into reward_redemptions (member_id, reward_id, cost_points) values (me, rw, 1) returning id into r1;
  insert into reward_redemptions (member_id, reward_id, cost_points) values (me, rw, 1) returning id into r2;
  insert into reward_redemptions (member_id, reward_id, cost_points) values (me, rw, 1) returning id into r3;
  alter table reward_redemptions enable trigger reward_redemptions_validate;

  -- member cannot decide
  perform set_config('request.jwt.claim.sub', me::text, true);
  set local role authenticated;
  begin perform decide_redemption(r1, 'approved'); r := r || ' member_decide=ALLOWED';
  exception when others then r := r || ' member_decide=refused'; end;
  update member_profiles set saving_for_reward = rw where profile_id = me;
  get diagnostics n = row_count;
  r := r || ' saving_set=' || n;
  select count(*) into n from reward_wishlist_counts();
  r := r || ' member_sees_counts=' || n;

  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform decide_redemption(r1, 'approved');
  begin perform decide_redemption(r2, 'rejected'); r := r || ' reject_no_reason=ALLOWED';
  exception when others then r := r || ' reject_no_reason=refused'; end;
  perform decide_redemption(r2, 'rejected', 'Out of towels this week');
  begin perform decide_redemption(r1, 'rejected', 'x'); r := r || ' redecide=ALLOWED';
  exception when others then r := r || ' redecide=refused'; end;
  begin perform mark_redemption_collected(r3); r := r || ' collect_pending=ALLOWED';
  exception when others then r := r || ' collect_pending=refused'; end;
  perform mark_redemption_collected(r1);
  select string_agg(status, ',' order by requested_at) into st from reward_redemptions where reward_id = rw;
  r := r || ' statuses=' || st;
  select stock into n from rewards where id = rw;
  r := r || ' stock=' || n;
  select coalesce(max(members), 0) into n from reward_wishlist_counts() where reward_id = rw;
  r := r || ' admin_sees_saving=' || n;

  reset role;
  select count(*) into n from notifications where user_id = me and title in ('Reward approved', 'Reward request declined', 'Reward collected');
  r := r || ' member_notes=' || n;

  raise exception 'REPORT%', r;
end $$;
