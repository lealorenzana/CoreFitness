grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  a uuid; b uuid; c uuid; tr uuid; cls uuid; bk uuid; bk2 uuid; n int; r text := ''; reason text;
  st record;
begin
  select id into tr from profiles where role = 'trainer' limit 1;
  r := '';
  select id into a from profiles where role = 'member' and status = 'active' order by id limit 1;
  select id into b from profiles where role = 'member' and status = 'active' and id <> a order by id limit 1;
  select id into c from profiles where role = 'member' and status = 'active' and id not in (a, b) order by id limit 1;
  select key into reason from cancellation_reasons limit 1;
  insert into classes (name, trainer_id, capacity, scheduled_at, duration_minutes)
  values ('Tiny HIIT', tr, 1, now() + interval '3 days', 45) returning id into cls;
  alter table bookings disable trigger user;
  insert into bookings (member_id, class_id, status) values (a, cls, 'approved') returning id into bk;
  alter table bookings enable trigger user;
  -- the triggers were off for that insert, so re-enable only ours for the rest

  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  r := r || ' b_pos=' || join_waitlist(cls);
  r := r || ' b_again=' || join_waitlist(cls);
  begin insert into class_waitlist (class_id, member_id) values (cls, b); r := r || ' direct_insert=ALLOWED';
  exception when others then r := r || ' direct_insert=refused'; end;
  reset role;
  perform set_config('request.jwt.claim.sub', c::text, true);
  set local role authenticated;
  r := r || ' c_pos=' || join_waitlist(cls);
  select * into st from class_waitlist_status(array[cls]);
  r := r || ' c_sees waiting=' || st.waiting || ' mine=' || coalesce(st.my_position::text, 'null');
  select count(*) into n from class_waitlist; r := r || ' c_reads_rows=' || n;
  reset role;
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  begin perform join_waitlist(cls); r := r || ' booked_join=ALLOWED';
  exception when others then r := r || ' booked_join=refused'; end;
  perform cancel_booking('class', bk, reason, 'Something came up');
  reset role;
  select count(*) into n from notifications where title = 'A spot opened up' and user_id in (b, c);
  r := r || ' notified=' || n;

  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  insert into bookings (member_id, class_id) values (b, cls) returning id into bk2;
  select count(*) into n from class_waitlist where class_id = cls and member_id = b;
  r := r || ' b_left_list_on_booking=' || (n = 0);
  reset role;
  perform set_config('request.jwt.claim.sub', tr::text, true);
  set local role authenticated;
  select count(*) into n from class_waitlist where class_id = cls; r := r || ' trainer_sees=' || n;
  reset role;
  -- capacity raised: c is offered again? (notified < 30 min ago, so no)
  update classes set capacity = 3 where id = cls;
  select count(*) into n from notifications where title = 'A spot opened up' and user_id = c;
  r := r || ' c_not_rebuzzed=' || (n = 1);
  raise exception 'REPORT%', r;
end $$;
