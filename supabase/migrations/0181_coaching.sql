-- ============================================================================
-- 0181 — Getting a coach: the ways in, the term, stand-ins, and who is paid
-- ============================================================================
--
-- Until now "your coach" was only inferred: whoever you had booked
-- (is_my_trainee(), 0082). A gym could not say "Lea trains with Coach Rae
-- until 30 November", a member could not pick a coach for a stretch of time,
-- and G Fitness's real arrangement — the member pays the trainer, separately
-- from the gym — had nowhere to live.
--
-- WAYS IN (gym_settings.coaching_modes, several at once):
--   classes        timetable classes (unchanged; listed so the owner sees it)
--   pick_pt        a member picks a coach for 1-on-1
--   pick_group     2+ members pick the same coach together (one starts, the
--                  others join with the group's code) — one group room
--   desk_assigns   the desk or owner assigns a coach
--   coach_invites  a coach invites a member (who accepts)
--
-- THE TERM: the member chooses a length from the gym's list
-- (coaching_lengths, months). It ends on its date (coaching_sweep(), page
-- load, re-runnable — elapsed time is not an event), with a reminder a week
-- before. Switching early is ending this one and asking for the next.
--
-- WHO PAYS (gym_settings.coaching_fee_mode):
--   included        the member's plan decides (can_book_pt); nothing to pay
--   gym_priced      the owner prices each kind × length (coaching_prices);
--                   the member pays the gym and the desk confirms it, which
--                   writes an ordinary payments row
--   trainer_direct  G Fitness: the member pays the COACH (the coach's own
--                   GCash/Maya/bank, trainer_payment_methods), sends the
--                   reference, and the coach taps Received. The gym sees that
--                   the member has a coach and until when — never the money.
--
-- STAND-INS: when the coach is away, the member picks another coach for a
-- date range; the main coach stays theirs.
--
-- Rows are written only by the definer functions below: coachings and
-- coaching_standins have RLS on and no write policy for any role.
-- ============================================================================

alter table gym_settings add column if not exists coaching_modes text[] not null
  default array['classes', 'pick_pt', 'desk_assigns', 'coach_invites'];
alter table gym_settings drop constraint if exists gym_settings_coaching_modes_check;
alter table gym_settings add constraint gym_settings_coaching_modes_check
  check (coaching_modes <@ array['classes', 'pick_pt', 'pick_group', 'desk_assigns', 'coach_invites']);
alter table gym_settings add column if not exists coaching_lengths int[] not null default array[1, 3, 6];
alter table gym_settings drop constraint if exists gym_settings_coaching_lengths_check;
alter table gym_settings add constraint gym_settings_coaching_lengths_check
  check (cardinality(coaching_lengths) between 1 and 6 and 1 <= all (coaching_lengths) and 24 >= all (coaching_lengths));
alter table gym_settings add column if not exists coaching_fee_mode text not null default 'included';
alter table gym_settings drop constraint if exists gym_settings_coaching_fee_mode_check;
alter table gym_settings add constraint gym_settings_coaching_fee_mode_check
  check (coaching_fee_mode in ('included', 'gym_priced', 'trainer_direct'));

-- What the gym charges, per kind and length (gym_priced only).
create table if not exists coaching_prices (
  gym_id  uuid not null default current_gym_id() references gyms(id) on delete cascade,
  kind    text not null check (kind in ('pt', 'group')),
  months  int  not null check (months between 1 and 24),
  price   numeric(10,2) not null check (price >= 0),
  primary key (gym_id, kind, months)
);

-- A coach's own ways to be paid (trainer_direct). Shown to their members.
create table if not exists trainer_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default current_gym_id() references gyms(id) on delete cascade,
  trainer_id     uuid not null default auth.uid() references profiles(id) on delete cascade,
  kind           text not null check (kind in ('gcash', 'maya', 'bank', 'other')),
  label          text not null check (length(btrim(label)) between 1 and 60),
  account_name   text check (account_name is null or length(account_name) <= 80),
  account_number text check (account_number is null or length(account_number) <= 60),
  qr_url         text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists trainer_payment_methods_trainer_idx on trainer_payment_methods (gym_id, trainer_id);

create table if not exists coachings (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default current_gym_id() references gyms(id) on delete cascade,
  member_id     uuid not null references profiles(id) on delete cascade,
  trainer_id    uuid not null references profiles(id) on delete cascade,
  kind          text not null check (kind in ('pt', 'group')),
  room_id       uuid,
  months        int  not null check (months between 1 and 24),
  status        text not null check (status in ('invited', 'requested', 'awaiting_payment', 'payment_sent',
                                                 'active', 'ended', 'declined', 'cancelled')),
  fee_mode      text not null check (fee_mode in ('included', 'gym_priced', 'trainer_direct')),
  price         numeric(10,2),
  pay_reference text check (pay_reference is null or length(btrim(pay_reference)) between 3 and 60),
  pay_sent_at   timestamptz,
  paid_at       timestamptz,
  confirmed_by  uuid references profiles(id),
  payment_id    uuid,
  starts_on     date,
  ends_on       date,
  started_by    text not null check (started_by in ('member', 'desk', 'coach')),
  end_reason    text check (end_reason is null or length(end_reason) <= 200),
  ended_at      timestamptz,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, room_id) references rooms (gym_id, id) on delete set null (room_id),
  check (ends_on is null or starts_on is null or ends_on > starts_on)
);
-- One coaching of each kind at a time per member; a finished one does not count.
create unique index if not exists coachings_one_open on coachings (gym_id, member_id, kind)
  where status in ('invited', 'requested', 'awaiting_payment', 'payment_sent', 'active');
-- A payment reference is claimed once (as 0148/0167).
create unique index if not exists coachings_reference_once on coachings (gym_id, upper(btrim(pay_reference)))
  where pay_reference is not null;
create index if not exists coachings_trainer_idx on coachings (gym_id, trainer_id, status);

create table if not exists coaching_standins (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default current_gym_id() references gyms(id) on delete cascade,
  coaching_id uuid not null,
  trainer_id  uuid not null references profiles(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  foreign key (gym_id, coaching_id) references coachings (gym_id, id) on delete cascade,
  check (ends_on >= starts_on and ends_on - starts_on <= 90)
);
create index if not exists coaching_standins_trainer_idx on coaching_standins (gym_id, trainer_id, ends_on);

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
alter table coaching_prices enable row level security;
alter table trainer_payment_methods enable row level security;
alter table coachings enable row level security;
alter table coaching_standins enable row level security;

drop policy if exists coaching_prices_read on coaching_prices;
create policy coaching_prices_read on coaching_prices for select to authenticated using (true);

drop policy if exists trainer_pay_read on trainer_payment_methods;
create policy trainer_pay_read on trainer_payment_methods for select to authenticated using (true);
drop policy if exists trainer_pay_own_insert on trainer_payment_methods;
create policy trainer_pay_own_insert on trainer_payment_methods for insert to authenticated
  with check (trainer_id = auth.uid() and role_in_gym(gym_id) = 'trainer');
drop policy if exists trainer_pay_own_update on trainer_payment_methods;
create policy trainer_pay_own_update on trainer_payment_methods for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists trainer_pay_own_delete on trainer_payment_methods;
create policy trainer_pay_own_delete on trainer_payment_methods for delete to authenticated
  using (trainer_id = auth.uid());

-- Each table's read policy asks about the other; asked through definer
-- helpers, or the two policies would recurse into each other.
create or replace function coaching_i_stand_in(p_coaching uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coaching_standins s where s.coaching_id = p_coaching and s.trainer_id = auth.uid());
$$;
create or replace function coaching_is_mine(p_coaching uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coachings c where c.id = p_coaching and (c.member_id = auth.uid() or c.trainer_id = auth.uid()));
$$;
revoke all on function coaching_i_stand_in(uuid) from public, anon;
revoke all on function coaching_is_mine(uuid) from public, anon;
grant execute on function coaching_i_stand_in(uuid) to authenticated;
grant execute on function coaching_is_mine(uuid) to authenticated;

drop policy if exists coachings_read on coachings;
create policy coachings_read on coachings for select to authenticated
  using (member_id = auth.uid() or trainer_id = auth.uid() or is_front_desk() or coaching_i_stand_in(id));

drop policy if exists coaching_standins_read on coaching_standins;
create policy coaching_standins_read on coaching_standins for select to authenticated
  using (trainer_id = auth.uid() or is_front_desk() or coaching_is_mine(coaching_id));

grant select on coaching_prices, coachings, coaching_standins to authenticated;
grant select, insert, update, delete on trainer_payment_methods to authenticated;

do $$
declare t text;
begin
  foreach t in array array['coaching_prices', 'trainer_payment_methods', 'coachings', 'coaching_standins'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- The gym's choices
-- ---------------------------------------------------------------------------
create or replace function coaching_settings(p_gym uuid default null)
returns table (modes text[], lengths int[], fee_mode text)
language sql stable security definer set search_path = public as $$
  select coalesce(gs.coaching_modes, array['classes', 'pick_pt', 'desk_assigns', 'coach_invites']),
         coalesce(gs.coaching_lengths, array[1, 3, 6]),
         coalesce(gs.coaching_fee_mode, 'included')
    from (select coalesce(p_gym, current_gym_id()) g) x
    left join gym_settings gs on gs.gym_id = x.g;
$$;
revoke all on function coaching_settings(uuid) from public, anon;
grant execute on function coaching_settings(uuid) to authenticated;

create or replace function set_coaching_settings(p_modes text[], p_lengths int[], p_fee_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how coaching works.' using errcode = '42501';
  end if;
  if p_fee_mode not in ('included', 'gym_priced', 'trainer_direct') then
    raise exception 'Choose included, priced by the gym, or paid to the coach.';
  end if;
  if not (coalesce(p_modes, '{}') <@ array['classes', 'pick_pt', 'pick_group', 'desk_assigns', 'coach_invites']) then
    raise exception 'That is not a way of getting coached here.';
  end if;
  if p_lengths is null or cardinality(p_lengths) not between 1 and 6
     or exists (select 1 from unnest(p_lengths) l where l not between 1 and 24) then
    raise exception 'Offer 1 to 6 lengths, each 1 to 24 months.';
  end if;
  update gym_settings
     set coaching_modes = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(p_modes) m),
         coaching_lengths = (select array_agg(distinct l order by l) from unnest(p_lengths) l),
         coaching_fee_mode = p_fee_mode
   where gym_id = acting_gym_id();
end;
$$;
revoke all on function set_coaching_settings(text[], int[], text) from public, anon;
grant execute on function set_coaching_settings(text[], int[], text) to authenticated;

-- NULL price removes it.
create or replace function set_coaching_price(p_kind text, p_months int, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets coaching prices.' using errcode = '42501';
  end if;
  if p_price is null then
    delete from coaching_prices where gym_id = acting_gym_id() and kind = p_kind and months = p_months;
  else
    insert into coaching_prices (gym_id, kind, months, price) values (acting_gym_id(), p_kind, p_months, p_price)
    on conflict (gym_id, kind, months) do update set price = excluded.price;
  end if;
end;
$$;
revoke all on function set_coaching_price(text, int, numeric) from public, anon;
grant execute on function set_coaching_price(text, int, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Starts a term today (Manila), makes its room, tells both people.
create or replace function coaching_activate(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c coachings; v_room uuid; v_name text; v_code text;
begin
  select * into c from coachings where id = p_id for update;
  perform act_as_gym(c.gym_id);
  if c.kind = 'pt' then
    select left(coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'Trainee') || ' · 1-on-1', 80)
      into v_name from profiles p where p.id = c.member_id;
    insert into rooms (gym_id, kind, trainer_id, member_id, name)
    values (c.gym_id, 'pt', c.trainer_id, c.member_id, v_name)
    on conflict (gym_id, trainer_id, member_id) where kind = 'pt' do nothing;
    select id into v_room from rooms
     where gym_id = c.gym_id and kind = 'pt' and trainer_id = c.trainer_id and member_id = c.member_id;
    update rooms set archived_at = null where id = v_room and archived_at is not null;
  else
    v_room := c.room_id;
    if v_room is null then
      loop
        v_code := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 6));
        exit when not exists (select 1 from rooms where gym_id = c.gym_id and join_code = v_code);
      end loop;
      select left('Coaching group · ' || coalesce(nullif(btrim(p.first_name), ''), 'Coach'), 80)
        into v_name from profiles p where p.id = c.trainer_id;
      insert into rooms (gym_id, kind, trainer_id, name, join_code)
      values (c.gym_id, 'group', c.trainer_id, v_name, v_code) returning id into v_room;
    end if;
    insert into room_members (gym_id, room_id, member_id) values (c.gym_id, v_room, c.member_id)
    on conflict do nothing;
  end if;
  update coachings
     set status = 'active', room_id = v_room,
         starts_on = manila_today(), ends_on = (manila_today() + make_interval(months => c.months))::date,
         updated_at = now()
   where id = p_id;
  perform notify_once(c.member_id, 'booking', 'Your coaching has started',
    display_name_of(c.trainer_id) || ' is your coach until ' ||
      to_char((manila_today() + make_interval(months => c.months))::date, 'Mon DD, YYYY') || '.',
    '/member/coach', 'coaching:on:' || p_id, c.gym_id);
  perform notify_once(c.trainer_id, 'booking', 'New trainee',
    display_name_of(c.member_id) || ' trains with you for ' || c.months || ' month' ||
      case when c.months = 1 then '' else 's' end || '.',
    '/trainer/rooms', 'coaching:on:t:' || p_id, c.gym_id);
end;
$$;
revoke all on function coaching_activate(uuid) from public, anon, authenticated;

-- After the coach (or member, for an invite) agrees: pay, or start.
create or replace function coaching_after_yes(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c coachings;
begin
  select * into c from coachings where id = p_id;
  if c.fee_mode = 'included' or coalesce(c.price, 0) = 0 then
    perform coaching_activate(p_id);
  else
    update coachings set status = 'awaiting_payment', updated_at = now() where id = p_id;
    perform notify_once(c.member_id, 'booking', 'Pay to start your coaching',
      case when c.fee_mode = 'trainer_direct'
        then 'Pay ' || display_name_of(c.trainer_id) || ' ₱' || to_char(c.price, 'FM999,999,990.00') || ' and send the reference.'
        else 'Pay the gym ₱' || to_char(c.price, 'FM999,999,990.00') || ' and send the reference, or pay at the desk.' end,
      '/member/coach', 'coaching:pay:' || p_id, c.gym_id);
  end if;
end;
$$;
revoke all on function coaching_after_yes(uuid) from public, anon, authenticated;

-- The price for a new coaching under the gym's fee mode.
create or replace function coaching_price_for(p_gym uuid, p_kind text, p_months int) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_mode text := (select fee_mode from coaching_settings(p_gym));
begin
  if v_mode = 'included' then return null; end if;
  if v_mode = 'gym_priced' then
    return (select price from coaching_prices where gym_id = p_gym and kind = p_kind and months = p_months);
  end if;
  return null;   -- trainer_direct: the coach's own price, set when they accept
end;
$$;

create or replace function coaching_check_trainer(p_gym uuid, p_trainer uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from gym_roles where gym_id = p_gym and user_id = p_trainer and role = 'trainer' and status = 'active') then
    raise exception 'That coach is not taking trainees here.';
  end if;
end;
$$;

revoke all on function coaching_price_for(uuid, text, int) from public, anon, authenticated;
revoke all on function coaching_check_trainer(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ways in
-- ---------------------------------------------------------------------------
-- A member asks a coach. p_code joins an existing coaching group instead.
create or replace function request_coaching(p_trainer uuid, p_kind text, p_months int, p_code text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id(); s record; v_id uuid; v_room uuid;
        m record; p record; v_trainer uuid := p_trainer;
begin
  if v_me is null or role_in_gym(v_gym) is distinct from 'member' then
    raise exception 'Only a member asks for a coach.' using errcode = '42501';
  end if;
  select * into s from coaching_settings(v_gym);
  if p_kind = 'pt' and not ('pick_pt' = any(s.modes)) then
    raise exception 'This gym assigns coaches at the desk. Ask there.';
  end if;
  if p_kind = 'group' and not ('pick_group' = any(s.modes)) then
    raise exception 'This gym does not run coaching groups that members start.';
  end if;
  if p_kind not in ('pt', 'group') then raise exception 'Choose 1-on-1 or a group.'; end if;
  if not (p_months = any(s.lengths)) then
    raise exception 'This gym offers % month terms.', array_to_string(s.lengths, ', ');
  end if;
  if p_kind = 'group' and nullif(btrim(p_code), '') is not null then
    select r.id, r.trainer_id into v_room, v_trainer from rooms r
     where r.gym_id = v_gym and r.kind = 'group' and r.join_code = upper(btrim(p_code)) and r.archived_at is null
       and exists (select 1 from coachings c where c.room_id = r.id and c.status = 'active');
    if v_room is null then raise exception 'No coaching group has that code.'; end if;
  end if;
  perform coaching_check_trainer(v_gym, v_trainer);
  if s.fee_mode = 'included' then
    perform act_as_gym(v_gym);
    select * into m from current_membership_of(v_me);
    select * into p from membership_plans where id = m.plan_id;
    if m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) or p is null or not p.can_book_pt then
      raise exception 'Your plan does not include a coach. Ask the front desk about one that does.';
    end if;
  end if;
  if s.fee_mode = 'gym_priced' and coaching_price_for(v_gym, p_kind, p_months) is null then
    raise exception 'The gym has not priced a % month term yet. Ask at the front desk.', p_months;
  end if;
  insert into coachings (gym_id, member_id, trainer_id, kind, room_id, months, status, fee_mode, price, started_by)
  values (v_gym, v_me, v_trainer, p_kind, v_room, p_months, 'requested', s.fee_mode,
          coaching_price_for(v_gym, p_kind, p_months), 'member')
  returning id into v_id;
  perform notify_once(v_trainer, 'booking', 'Coaching request',
    display_name_of(v_me) || ' asked you to coach them' || case when p_kind = 'group' then ' in your group' else '' end ||
      ' for ' || p_months || ' month' || case when p_months = 1 then '' else 's' end || '.',
    '/trainer/coaching', 'coaching:req:' || v_id, v_gym);
  return v_id;
exception when unique_violation then
  raise exception 'You already have a coach, or a request waiting. End or cancel that one first.';
end;
$$;
revoke all on function request_coaching(uuid, text, int, text) from public, anon;
grant execute on function request_coaching(uuid, text, int, text) to authenticated;

-- The coach answers a request (with their price, under trainer_direct), or
-- the member answers a coach's invitation.
create or replace function respond_coaching(p_id uuid, p_accept boolean, p_price numeric default null) returns text
language plpgsql security definer set search_path = public as $$
declare c coachings; v_me uuid := auth.uid();
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.id is null then raise exception 'That request is not here any more.'; end if;
  if c.status = 'requested' and c.trainer_id = v_me then
    if not p_accept then
      update coachings set status = 'declined', updated_at = now() where id = p_id;
      perform notify_once(c.member_id, 'booking', 'Coaching request declined',
        display_name_of(v_me) || ' cannot take you on right now. Try another coach.', '/member/coach', 'coaching:no:' || p_id, c.gym_id);
      return 'declined';
    end if;
    if c.fee_mode = 'trainer_direct' then
      if p_price is null or p_price < 0 then raise exception 'Say what you charge for the % months (₱0 if nothing).', c.months; end if;
      update coachings set price = p_price where id = p_id;
    end if;
    perform coaching_after_yes(p_id);
    return (select status from coachings where id = p_id);
  elsif c.status = 'invited' and c.member_id = v_me then
    if not p_accept then
      update coachings set status = 'declined', updated_at = now() where id = p_id;
      return 'declined';
    end if;
    perform coaching_after_yes(p_id);
    return (select status from coachings where id = p_id);
  end if;
  raise exception 'That is not yours to answer.' using errcode = '42501';
end;
$$;
revoke all on function respond_coaching(uuid, boolean, numeric) from public, anon;
grant execute on function respond_coaching(uuid, boolean, numeric) to authenticated;

-- The desk assigns. It starts at once unless there is something to pay.
create or replace function assign_coaching(p_member uuid, p_trainer uuid, p_months int, p_price numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); s record; v_id uuid;
begin
  if not is_front_desk() then raise exception 'Only the gym assigns a coach.' using errcode = '42501'; end if;
  select * into s from coaching_settings(v_gym);
  if not ('desk_assigns' = any(s.modes)) then raise exception 'Turn on "The desk assigns a coach" in Settings → Coaching first.'; end if;
  if p_months not between 1 and 24 then raise exception 'A term is 1 to 24 months.'; end if;
  perform coaching_check_trainer(v_gym, p_trainer);
  if role_in_gym_of(v_gym, p_member) is distinct from 'member' then raise exception 'That person is not a member here.'; end if;
  insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, price, started_by)
  values (v_gym, p_member, p_trainer, 'pt', p_months, 'requested', s.fee_mode,
          coalesce(p_price, coaching_price_for(v_gym, 'pt', p_months)), 'desk')
  returning id into v_id;
  perform coaching_after_yes(v_id);
  return v_id;
exception when unique_violation then
  raise exception 'That member already has a coach or a request waiting.';
end;
$$;
revoke all on function assign_coaching(uuid, uuid, int, numeric) from public, anon;
grant execute on function assign_coaching(uuid, uuid, int, numeric) to authenticated;

-- A coach invites a member; the member accepts or not.
create or replace function invite_coaching(p_member uuid, p_months int, p_price numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_me uuid := auth.uid(); s record; v_id uuid;
begin
  if role_in_gym(v_gym) is distinct from 'trainer' then raise exception 'Only a coach sends an invitation.' using errcode = '42501'; end if;
  select * into s from coaching_settings(v_gym);
  if not ('coach_invites' = any(s.modes)) then raise exception 'This gym does not let coaches invite trainees.'; end if;
  if not (p_months = any(s.lengths)) then raise exception 'This gym offers % month terms.', array_to_string(s.lengths, ', '); end if;
  if role_in_gym_of(v_gym, p_member) is distinct from 'member' then raise exception 'That person is not a member here.'; end if;
  insert into coachings (gym_id, member_id, trainer_id, kind, months, status, fee_mode, price, started_by)
  values (v_gym, p_member, v_me, 'pt', p_months, 'invited', s.fee_mode,
          case when s.fee_mode = 'trainer_direct' then p_price else coaching_price_for(v_gym, 'pt', p_months) end, 'coach')
  returning id into v_id;
  perform notify_once(p_member, 'booking', 'A coach invited you',
    display_name_of(v_me) || ' offered to coach you for ' || p_months || ' month' ||
      case when p_months = 1 then '' else 's' end || '.', '/member/coach', 'coaching:inv:' || v_id, v_gym);
  return v_id;
exception when unique_violation then
  raise exception 'That member already has a coach or a request waiting.';
end;
$$;
revoke all on function invite_coaching(uuid, int, numeric) from public, anon;
grant execute on function invite_coaching(uuid, int, numeric) to authenticated;

-- role_in_gym() is the caller's; this one is anybody's.
create or replace function role_in_gym_of(p_gym uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from gym_roles where gym_id = p_gym and user_id = p_user and status = 'active' limit 1;
$$;
revoke all on function role_in_gym_of(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paying
-- ---------------------------------------------------------------------------
create or replace function submit_coaching_payment(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare c coachings;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.member_id is distinct from auth.uid() then raise exception 'That is not your coaching.' using errcode = '42501'; end if;
  if c.status not in ('awaiting_payment', 'payment_sent') then raise exception 'Nothing to pay on this one.'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Type the reference number from your receipt.'; end if;
  update coachings set status = 'payment_sent', pay_reference = btrim(p_reference), pay_sent_at = now(), updated_at = now()
   where id = p_id;
  if c.fee_mode = 'trainer_direct' then
    perform notify_once(c.trainer_id, 'booking', 'Payment sent to you',
      display_name_of(c.member_id) || ' says they paid you (ref ' || btrim(p_reference) || '). Tap Received once you see it.',
      '/trainer/coaching', 'coaching:sent:' || p_id || ':' || btrim(p_reference), c.gym_id);
  else
    perform notify_once(r.user_id, 'payment', 'Coaching payment to confirm',
      display_name_of(c.member_id) || ' paid for coaching (ref ' || btrim(p_reference) || ').',
      '/coaching', 'coaching:sent:' || p_id || ':' || r.user_id, c.gym_id)
      from gym_roles r where r.gym_id = c.gym_id and r.role in ('admin', 'staff') and r.status = 'active';
  end if;
exception when unique_violation then
  raise exception 'That reference has already been used.';
end;
$$;
revoke all on function submit_coaching_payment(uuid, text) from public, anon;
grant execute on function submit_coaching_payment(uuid, text) to authenticated;

-- trainer_direct: the coach confirms. gym_priced: the desk confirms (cash at
-- the counter needs no reference), and it becomes an ordinary payment.
create or replace function confirm_coaching_payment(p_id uuid, p_received boolean default true, p_method text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare c coachings; v_pay uuid;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.id is null or c.status not in ('awaiting_payment', 'payment_sent') then
    raise exception 'Nothing is waiting to be paid on that one.';
  end if;
  if c.fee_mode = 'trainer_direct' then
    if c.trainer_id is distinct from auth.uid() then
      raise exception 'Only the coach who was paid can say it arrived.' using errcode = '42501';
    end if;
  elsif not is_front_desk() then
    raise exception 'The front desk confirms payments to the gym.' using errcode = '42501';
  end if;
  if not p_received then
    update coachings set status = 'awaiting_payment', pay_reference = null, pay_sent_at = null, updated_at = now() where id = p_id;
    perform notify_once(c.member_id, 'booking', 'Payment not found yet',
      'Your payment for coaching was not found. Check the reference and send it again.',
      '/member/coach', 'coaching:notfound:' || p_id || ':' || coalesce(c.pay_reference, ''), c.gym_id);
    return;
  end if;
  if c.fee_mode = 'gym_priced' then
    insert into payments (gym_id, member_id, amount, method, status, notes, recorded_by, paid_on)
    values (c.gym_id, c.member_id, coalesce(c.price, 0), coalesce(nullif(btrim(p_method), ''), case when c.pay_reference is null then 'cash' else 'online' end),
            'completed', 'Coaching: ' || c.months || ' month' || case when c.months = 1 then '' else 's' end ||
              ' with ' || display_name_of(c.trainer_id) || coalesce(' · ref ' || c.pay_reference, ''),
            auth.uid(), manila_today())
    returning id into v_pay;
  end if;
  update coachings set paid_at = now(), confirmed_by = auth.uid(), payment_id = v_pay where id = p_id;
  perform coaching_activate(p_id);
end;
$$;
revoke all on function confirm_coaching_payment(uuid, boolean, text) from public, anon;
grant execute on function confirm_coaching_payment(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ending, stand-ins, time passing
-- ---------------------------------------------------------------------------
create or replace function end_coaching(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c coachings; v_me uuid := auth.uid(); v_other uuid;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id() for update;
  if c.id is null then raise exception 'That coaching is not here.'; end if;
  if not (c.member_id = v_me or c.trainer_id = v_me or is_front_desk()) then
    raise exception 'That is not yours to end.' using errcode = '42501';
  end if;
  if c.status in ('ended', 'declined', 'cancelled') then return; end if;
  update coachings
     set status = case when c.status = 'active' then 'ended' else 'cancelled' end,
         ended_at = now(), end_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now(),
         ends_on = case when c.status = 'active' then least(coalesce(c.ends_on, manila_today()), greatest(manila_today(), c.starts_on + 1)) else c.ends_on end
   where id = p_id;
  delete from coaching_standins where coaching_id = p_id and starts_on > manila_today();
  update coaching_standins set ends_on = manila_today() where coaching_id = p_id and ends_on > manila_today();
  if c.kind = 'group' and c.room_id is not null then
    delete from room_members where room_id = c.room_id and member_id = c.member_id;
  end if;
  v_other := case when v_me = c.member_id then c.trainer_id else c.member_id end;
  perform notify_once(v_other, 'booking', 'Coaching ended',
    display_name_of(v_me) || ' ended the coaching' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '.'),
    case when v_other = c.member_id then '/member/coach' else '/trainer/coaching' end, 'coaching:end:' || p_id || ':' || v_other, c.gym_id);
end;
$$;
revoke all on function end_coaching(uuid, text) from public, anon;
grant execute on function end_coaching(uuid, text) to authenticated;

-- The member picks a stand-in for a stretch; the main coach stays theirs.
create or replace function set_coaching_standin(p_id uuid, p_trainer uuid, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = public as $$
declare c coachings; v_id uuid;
begin
  select * into c from coachings where id = p_id and gym_id = current_gym_id();
  if c.member_id is distinct from auth.uid() and not is_front_desk() then
    raise exception 'Only the member picks their stand-in.' using errcode = '42501';
  end if;
  if c.status <> 'active' then raise exception 'A stand-in is for a coaching that is running.'; end if;
  if p_trainer = c.trainer_id then raise exception 'That is your own coach.'; end if;
  perform coaching_check_trainer(c.gym_id, p_trainer);
  if p_from < manila_today() or p_to < p_from or p_to - p_from > 90 then
    raise exception 'A stand-in runs from today or later, for up to 90 days.';
  end if;
  insert into coaching_standins (gym_id, coaching_id, trainer_id, starts_on, ends_on, created_by)
  values (c.gym_id, p_id, p_trainer, p_from, least(p_to, coalesce(c.ends_on, p_to)), auth.uid())
  returning id into v_id;
  perform notify_once(p_trainer, 'booking', 'You are standing in',
    display_name_of(c.member_id) || ' asked you to stand in for ' || display_name_of(c.trainer_id) ||
      ' from ' || to_char(p_from, 'Mon DD') || ' to ' || to_char(p_to, 'Mon DD') || '.',
    '/trainer/coaching', 'coaching:standin:' || v_id, c.gym_id);
  perform notify_once(c.trainer_id, 'booking', 'A stand-in while you are away',
    display_name_of(p_trainer) || ' covers ' || display_name_of(c.member_id) || ' from ' || to_char(p_from, 'Mon DD') ||
      ' to ' || to_char(p_to, 'Mon DD') || '. They are still your trainee.',
    '/trainer/coaching', 'coaching:standin:main:' || v_id, c.gym_id);
  return v_id;
end;
$$;
revoke all on function set_coaching_standin(uuid, uuid, date, date) from public, anon;
grant execute on function set_coaching_standin(uuid, uuid, date, date) to authenticated;

-- Ends terms whose date has passed and reminds a week before. Re-runnable,
-- from page loads (pg_cron is optional here).
create or replace function coaching_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); n int := 0; c record;
begin
  if v_gym is null then return 0; end if;
  for c in select * from coachings where gym_id = v_gym and status = 'active'
             and ends_on is not null and ends_on <= manila_today() + 7 and reminded_at is null and ends_on > manila_today() loop
    perform notify_once(c.member_id, 'booking', 'Your coaching ends soon',
      'Your coaching with ' || display_name_of(c.trainer_id) || ' ends on ' || to_char(c.ends_on, 'Mon DD') || '. Renew it from Your coach.',
      '/member/coach', 'coaching:soon:' || c.id, v_gym);
    update coachings set reminded_at = now() where id = c.id;
  end loop;
  update coachings set status = 'ended', ended_at = now(), end_reason = coalesce(end_reason, 'The term ended.'), updated_at = now()
   where gym_id = v_gym and status = 'active' and ends_on is not null and ends_on <= manila_today();
  get diagnostics n = row_count;
  -- A request nobody answered in 14 days stops waiting.
  update coachings set status = 'cancelled', end_reason = 'Nobody answered in 14 days.', updated_at = now()
   where gym_id = v_gym and status in ('requested', 'invited') and created_at < now() - interval '14 days';
  return n;
end;
$$;
revoke all on function coaching_sweep() from public, anon;
grant execute on function coaching_sweep() to authenticated;

-- One read for the member's and the coach's screens.
create or replace function my_coachings() returns table (
  id uuid, member_id uuid, member_name text, member_photo text, trainer_id uuid, trainer_name text, trainer_photo text,
  kind text, room_id uuid, months int, status text, fee_mode text, price numeric, pay_reference text,
  pay_sent_at timestamptz, starts_on date, ends_on date, started_by text, created_at timestamptz,
  standin_id uuid, standin_trainer_id uuid, standin_name text, standin_from date, standin_to date,
  group_code text, i_am text)
language sql stable security definer set search_path = public as $$
  select c.id, c.member_id, display_name_of(c.member_id), pm.photo_url, c.trainer_id, display_name_of(c.trainer_id), pt.photo_url,
         c.kind, c.room_id, c.months, c.status, c.fee_mode, c.price, c.pay_reference,
         c.pay_sent_at, c.starts_on, c.ends_on, c.started_by, c.created_at,
         s.id, s.trainer_id, case when s.id is null then null else display_name_of(s.trainer_id) end, s.starts_on, s.ends_on,
         case when c.kind = 'group' then r.join_code end,
         case when c.member_id = auth.uid() then 'member' when c.trainer_id = auth.uid() then 'coach' else 'standin' end
    from coachings c
    join profiles pm on pm.id = c.member_id
    join profiles pt on pt.id = c.trainer_id
    left join rooms r on r.id = c.room_id
    left join lateral (select * from coaching_standins x where x.coaching_id = c.id and x.ends_on >= manila_today()
                        order by x.starts_on limit 1) s on true
   where c.gym_id = current_gym_id()
     and (c.member_id = auth.uid() or c.trainer_id = auth.uid() or s.trainer_id = auth.uid())
   order by case c.status when 'active' then 0 when 'payment_sent' then 1 when 'awaiting_payment' then 2
                          when 'requested' then 3 when 'invited' then 3 else 9 end, c.created_at desc;
$$;
revoke all on function my_coachings() from public, anon;
grant execute on function my_coachings() to authenticated;

-- ---------------------------------------------------------------------------
-- A coaching makes a trainee (0082's question gets a third answer). 0101's
-- body, plus an active coaching and a current stand-in.
-- ---------------------------------------------------------------------------
create or replace function is_my_trainee(p_member uuid, p_trainer uuid default null)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from pt_sessions s
     where s.member_id = p_member
       and s.gym_id = acting_gym_id()
       and s.trainer_id = coalesce(p_trainer, auth.uid())
  ) or exists (
    select 1
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = p_member
       and b.gym_id = acting_gym_id()
       and c.trainer_id = coalesce(p_trainer, auth.uid())
  ) or exists (
    select 1 from coachings k
     where k.member_id = p_member and k.gym_id = acting_gym_id()
       and k.trainer_id = coalesce(p_trainer, auth.uid()) and k.status = 'active'
  ) or exists (
    select 1 from coaching_standins x join coachings k on k.id = x.coaching_id
     where k.member_id = p_member and x.gym_id = acting_gym_id()
       and x.trainer_id = coalesce(p_trainer, auth.uid()) and k.status = 'active'
       and manila_today() between x.starts_on and x.ends_on
  );
$fn$;

-- A member choosing a coach, or a stand-in, sees whether they are on leave
-- (0178's presence). The view as 0099 made it, presence appended; the
-- security_barrier 0115 gave it is restated, never lost on a replace.
create or replace view public_trainers with (security_barrier = true) as
 select p.id,
    p.first_name,
    p.last_name,
    p.photo_url,
    tp.specialization,
    tp.bio,
    tp.availability,
    tp.years_experience,
    tp.certifications,
    tp.focus_areas,
    tp.achievements,
    tp.gym_id,
    tp.presence
   from profiles p
     join trainer_profiles tp on tp.profile_id = p.id
  where tp.gym_id = current_gym_id()
    and exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = tp.gym_id
                  and r.role = 'trainer'::user_role and r.status = 'active')
    and (sees_demo_data() or not is_demo_row(p.id));
revoke all on public_trainers from anon;

-- The four new tables are gym tables (TENANCY).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','coaching_prices','coaching_standins','coachings','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0181_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0181_applied() from public, anon;
grant execute on function migration_0181_applied() to authenticated;
comment on function migration_0181_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0181.sql
