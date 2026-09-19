grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

do $$
declare
  me uuid; other uuid; adm uuid; stf uuid; n int; r text := ''; x numeric; d date := (now() at time zone 'Asia/Manila')::date;
  s record;
begin
  select id into me from profiles where role = 'member' and status = 'active' limit 1;
  select id into other from profiles where role = 'member' and id <> me limit 1;
  select id into adm from profiles where role = 'admin' limit 1;
  select id into stf from profiles where role = 'staff' limit 1;
  if stf is null then stf := adm; end if;
  -- today's cash: whatever the seed has, plus 1500 and a 400 refund
  insert into payments (member_id, amount, method, status, paid_on) values (me, 1500, 'cash', 'completed', d);
  insert into payments (member_id, amount, method, status, paid_on) values (me, 999, 'cash', 'pending', d);

  -- anon files an error
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  begin insert into client_errors (app, message) values ('member', 'boom'); r := r || ' anon_insert=ok';
  exception when others then r := r || ' anon_insert=REFUSED:' || sqlerrm; end;
  reset role;

  -- member
  perform set_config('request.jwt.claim.sub', me::text, true);
  set local role authenticated;
  insert into client_errors (app, message, route) values ('member', 'TypeError x', '/member/home');
  begin insert into client_errors (app, message, user_id) values ('member', 'spoof', other); r := r || ' spoof=ALLOWED';
  exception when others then r := r || ' spoof=refused'; end;
  select count(*) into n from client_errors; r := r || ' member_reads_errors=' || n;
  begin perform * from cash_day_summary(d); r := r || ' member_cash=ALLOWED';
  exception when others then r := r || ' member_cash=refused'; end;
  begin perform * from trainer_month_summary(d); r := r || ' member_trainers=ALLOWED';
  exception when others then r := r || ' member_trainers=refused'; end;
  update member_profiles set preferred_language = 'fil' where profile_id = me;
  get diagnostics n = row_count; r := r || ' lang_set=' || n;
  begin update member_profiles set preferred_language = 'xx' where profile_id = me; r := r || ' bad_lang=ALLOWED';
  exception when others then r := r || ' bad_lang=refused'; end;
  reset role;

  -- staff: close the day
  perform set_config('request.jwt.claim.sub', stf::text, true);
  set local role authenticated;
  select * into s from cash_day_summary(d);
  r := r || ' expected=' || s.expected || ' n=' || s.payment_count;
  begin perform close_cash_day(d, s.expected - 100); r := r || ' short_no_note=ALLOWED';
  exception when others then r := r || ' short_no_note=refused'; end;
  perform close_cash_day(d, s.expected - 100, 'Gave change from the drawer');
  select difference into x from cash_closeouts where day = d; r := r || ' diff=' || x;
  begin perform close_cash_day(d, s.expected, 'again');
    r := r || ' staff_redo=' || case when stf = adm then 'n/a(admin)' else 'ALLOWED' end;
  exception when others then r := r || ' staff_redo=refused'; end;
  begin perform close_cash_day(d + 1, 10, 'x'); r := r || ' future=ALLOWED';
  exception when others then r := r || ' future=refused'; end;
  begin insert into cash_closeouts (day, expected, counted) values (d - 1, 0, 0); r := r || ' direct_insert=ALLOWED';
  exception when others then r := r || ' direct_insert=refused'; end;
  select count(*) into n from trainer_month_summary(d); r := r || ' trainer_rows=' || n;
  reset role;

  -- admin redoes it
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform close_cash_day(d, (select expected from cash_closeouts where day = d), 'Recounted — the 100 was in the envelope');
  select difference into x from cash_closeouts where day = d;
  r := r || ' after_redo_diff=' || x || ' previous_kept=' || (select (previous->>'counted') is not null from cash_closeouts where day = d);
  select count(*) into n from client_errors; r := r || ' admin_reads_errors=' || n;
  select sum(pt_sessions) into n from trainer_month_summary(d); r := r || ' pt_this_month=' || coalesce(n, 0);
  reset role;
  raise exception 'REPORT%', r;
end $$;
