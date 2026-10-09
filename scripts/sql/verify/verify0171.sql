-- VERIFICATION for 0171 (dates the database refuses; one win-back a month)
-- Paste into the Supabase SQL editor right after 0171. Read-only; the error is the report.
-- every value should be true; date_triggers should be 13.
do $$
declare c1 int; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select count(*) into c1 from pg_trigger where tgname = 'dates_window' and not tgisinternal;
  select exists (select 1 from pg_proc where proname = 'assert_date_window') into c2;
  select exists (select 1 from pg_trigger where tgname = 'winback_cap' and not tgisinternal) into c3;
  -- A date of birth tomorrow is refused even here (inside a block that is rolled back by the report).
  begin
    perform assert_date_window(manila_today() + 1, manila_today() - 30, manila_today(), 'probe');
    c4 := false;
  exception when sqlstate '22008' then c4 := true;
  end;
  select coalesce((select migration_0171_applied()), false) into c5;
  raise exception 'REPORT 0171: date_triggers=% | assert_fn=% | winback_cap=% | refuses_tomorrow=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
