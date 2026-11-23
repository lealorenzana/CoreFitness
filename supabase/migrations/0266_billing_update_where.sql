-- 0266 — the platform's two price settings could not be saved (owner, 2026-11-23: "UPDATE requires a WHERE clause").
--
-- Supabase runs pg_safeupdate, which refuses an UPDATE with no WHERE even inside a definer function. platform_billing
-- is one row (id boolean primary key, always true), and 0191's platform_set_custom_colours_price and 0189's
-- platform_set_topup updated it with no WHERE, so both refused every save. Same functions, same checks, `where id`.
-- No other function's last definition updates a table without a WHERE (searched 2026-11-23). Safe to paste again.

create or replace function platform_set_custom_colours_price(p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform.' using errcode = '42501'; end if;
  if p_price is null or p_price < 0 then raise exception 'Give a price.'; end if;
  update platform_billing set custom_colours_price = p_price where id;
  if not found then raise exception 'The platform''s billing settings are missing.'; end if;
end;
$$;
revoke all on function platform_set_custom_colours_price(numeric) from public, anon;
grant execute on function platform_set_custom_colours_price(numeric) to authenticated;

create or replace function platform_set_topup(p_messages int, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform prices top-ups.' using errcode = '42501'; end if;
  if p_messages is null or p_messages not between 50 and 100000 then raise exception 'A pack is 50 to 100,000 messages.'; end if;
  if p_price is null or p_price < 0 then raise exception 'Give a price.'; end if;
  update platform_billing set ai_topup_messages = p_messages, ai_topup_price = p_price where id;
  if not found then raise exception 'The platform''s billing settings are missing.'; end if;
  perform platform_log(null, 'ai.topup_priced', 'AI top-ups: ' || p_messages || ' messages for ₱' || p_price, null);
end;
$$;
revoke all on function platform_set_topup(int, numeric) from public, anon;
grant execute on function platform_set_topup(int, numeric) to authenticated;

create or replace function migration_0266_applied() returns boolean language sql stable as $$ select true $$;
