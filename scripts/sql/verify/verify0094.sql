grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  me uuid; other uuid; adm uuid; ch uuid; n int; m int; r text := ''; ghost uuid := gen_random_uuid();
begin
  select a.member_id into me from attendance a join profiles p on p.id = a.member_id where p.role = 'member'
   group by a.member_id order by count(*) desc limit 1;
  select id into other from profiles where role = 'member' and id <> me limit 1;
  select id into adm from profiles where role = 'admin' limit 1;
  insert into challenges (title, description, metric_key, target, starts_on, ends_on, reward_points, is_active)
  values ('Test month', 'x', 'training_days', 5, current_date - 400, current_date + 30, 10, true) returning id into ch;
  insert into challenge_participants (challenge_id, member_id) values (ch, me), (ch, other);

  select challenge_progress(ch, me) into n;
  r := r || ' owner_sees=' || n;

  -- a signed-in user with no profile row: role NULL
  perform set_config('request.jwt.claim.sub', ghost::text, true);
  set local role authenticated;
  select challenge_progress(ch, me) into m;
  r := r || ' ghost_sees=' || m;
  begin perform * from challenge_standings(ch); r := r || ' ghost_standings=ALLOWED';
  exception when others then r := r || ' ghost_standings=refused'; end;

  reset role;
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select challenge_progress(ch, me) into m;
  r := r || ' member_sees_other=' || m;
  select challenge_progress(ch, other) into m;
  r := r || ' member_sees_self_ok=' || (m >= 0);
  begin perform * from challenge_standings(ch); r := r || ' member_standings=ALLOWED';
  exception when others then r := r || ' member_standings=refused'; end;

  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  select count(*), max(progress) into m, n from challenge_standings(ch);
  r := r || ' admin_rows=' || m || ' top=' || n;
  r := r || ' list=' || (select string_agg(first_name || ':' || progress || '/' || target, ',') from challenge_standings(ch));
  reset role;
  raise exception 'REPORT% | %', r, (select count(*) from challenge_participants where challenge_id = ch);
end $$;
