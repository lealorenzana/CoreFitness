-- 0228 — an applicant changes their plan (follows 0224's paying before approval).
--
-- The plan chosen on the apply form is not final: on their application page an
-- applicant can switch plan (and monthly/yearly) while the application waits —
-- until they send a payment. Once a payment is being checked or confirmed, the
-- plan is locked (the money was for that plan). The change is said in the
-- conversation, so Core Fitness sees it on Applications (unread, as any message).
-- Pay for your plan (0224) follows the new plan's price, read in SQL as ever.
-- Safe to paste again.

create or replace function change_application_plan(p_application uuid, p_plan text, p_billing text default 'monthly')
returns void
language plpgsql security definer set search_path = public as $$
declare a gym_applications; p platform_plans; v_billing text := coalesce(nullif(btrim(p_billing), ''), 'monthly');
begin
  if not may_file_for_application(p_application) then
    raise exception 'You cannot change that application.' using errcode = '42501';
  end if;
  select * into a from gym_applications where id = p_application for update;
  if a.status is distinct from 'pending' then
    raise exception 'This application is no longer open.';
  end if;
  if exists (select 1 from application_payments where application_id = p_application and status in ('pending', 'paid')) then
    raise exception 'Your payment is for % — the plan is fixed now. Ask us below if you need a different one.',
      coalesce((select name from platform_plans where key = a.plan_key), 'this plan');
  end if;
  if v_billing not in ('monthly', 'yearly') then raise exception 'Choose monthly or yearly.'; end if;
  select * into p from platform_plans where key = p_plan and is_public and is_active;
  if p.key is null then raise exception 'That plan is not on offer.'; end if;
  if v_billing = 'yearly' and coalesce(p.price_yearly, 0) <= 0 then v_billing := 'monthly'; end if;
  if a.plan_key is not distinct from p.key and a.billing is not distinct from v_billing then return; end if;

  update gym_applications set plan_key = p.key, billing = v_billing where id = p_application;
  insert into application_messages (application_id, from_platform, body, author)
  values (p_application, false,
          'I changed my plan to ' || p.name || case when coalesce(p.price_monthly, 0) > 0 then ', billed ' || v_billing else '' end || '.',
          auth.uid());
  perform platform_log(null, 'application.plan_changed', a.gym_name || ' changed its plan to ' || p.name,
    jsonb_build_object('application', p_application, 'plan', p.key, 'billing', v_billing));
end;
$$;
revoke all on function change_application_plan(uuid, text, text) from public, anon;
grant execute on function change_application_plan(uuid, text, text) to authenticated;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0228_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0228_applied() to anon, authenticated;
