grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  me uuid; other uuid; adm uuid; tr uuid; trainee uuid; stranger uuid; n int; m int; r text := '';
begin
  select s.trainer_id, s.member_id into tr, trainee from pt_sessions s limit 1;
  select m2.member_id into me from memberships m2 join profiles p on p.id = m2.member_id
   where m2.status = 'active' and p.status = 'active' and p.role = 'member' limit 1;
  select id into other from profiles where role = 'member' and id <> me limit 1;
  select id into adm from profiles where role = 'admin' limit 1;
  select p.id into stranger from profiles p where p.role = 'member' and not is_my_trainee(p.id, tr) limit 1;
  r := r || ' have_trainer=' || (tr is not null) || ' have_stranger=' || (stranger is not null);

  -- member: own progress; sync, then every unlocked metric badge must meet its rule
  perform set_config('request.jwt.claim.sub', me::text, true);
  set local role authenticated;
  select count(*) into n from achievement_progress();
  r := r || ' own_rows=' || n;
  perform sync_my_achievements();
  select count(*) into n
    from achievement_progress() ap
    join achievement_unlocks u on u.achievement_key = ap.achievement_key and u.user_id = me
   where ap.value < ap.threshold or (ap.threshold2 is not null and ap.value2 < ap.threshold2);
  r := r || ' unlocked_but_below=' || n;
  select count(*) into n
    from achievement_progress() ap
   where ap.value >= ap.threshold and (ap.threshold2 is null or ap.value2 >= ap.threshold2)
     and not exists (select 1 from achievement_unlocks u where u.user_id = me and u.achievement_key = ap.achievement_key);
  r := r || ' met_but_locked=' || n;
  select count(*) into n from achievement_progress() where achievement_key like 'level_%';
  r := r || ' level_rows=' || n;
  begin perform * from achievement_progress(other); r := r || ' member_reads_other=ALLOWED';
  exception when others then r := r || ' member_reads_other=refused'; end;
  select count(*), coalesce(sum(case when holders <= audience_size then 1 else 0 end), 0) into n, m from achievement_rarity();
  r := r || ' rarity_rows=' || n || ' sane=' || m;

  -- trainer: own (trainer audience), a trainee, a stranger
  reset role;
  perform set_config('request.jwt.claim.sub', tr::text, true);
  set local role authenticated;
  select count(*) into n from achievement_progress();
  select count(*) into m from achievements where audience = 'trainer' and active and rule_kind = 'metric';
  r := r || ' trainer_own=' || n || '/' || m;
  select count(*) into n from achievement_progress(trainee);
  r := r || ' trainer_reads_trainee=' || n;
  if stranger is not null then
    begin perform * from achievement_progress(stranger); r := r || ' trainer_reads_stranger=ALLOWED';
    exception when others then r := r || ' trainer_reads_stranger=refused'; end;
  end if;

  -- admin
  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  select count(*) into n from achievement_progress(me);
  r := r || ' admin_reads_member=' || n;
  select count(*) into n from achievement_progress();
  r := r || ' admin_own=' || n;

  -- anonymous
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  select count(*) into n from achievement_rarity();
  r := r || ' anon_rarity=' || n;
  reset role;
  raise exception 'REPORT%', r;
end $$;
