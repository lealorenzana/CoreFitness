-- Core Fitness — gym profile/config, so Settings stops writing to localStorage.
--
-- The admin Settings page kept gym name, address, contact details and operating
-- hours in `localStorage['admin_gym_info']`. That meant the values were per
-- browser: they vanished on a different machine, and nothing else in the system
-- — receipts, notifications, the member app — could ever read them.
--
-- Single-row table. `id` is pinned to a constant so there is exactly one row to
-- read and update; a settings table that can grow extra rows just invites
-- "which one is live?".

create table if not exists gym_settings (
  id boolean primary key default true,
  gym_name text not null default 'Core Fitness',
  address text,
  phone text,
  email text,
  opening_time text,
  closing_time text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  -- Enforces the single row: the only allowed primary key is true.
  constraint gym_settings_singleton check (id)
);

insert into gym_settings (id) values (true) on conflict (id) do nothing;

alter table gym_settings enable row level security;

-- Everyone signed in can read it — the member app shows gym name and hours.
drop policy if exists gym_settings_select_authenticated on gym_settings;
create policy gym_settings_select_authenticated on gym_settings for select
  using (auth.uid() is not null);

-- Only an admin edits it. Staff run the desk; they don't rename the gym.
drop policy if exists gym_settings_update_admin on gym_settings;
create policy gym_settings_update_admin on gym_settings for update
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');
