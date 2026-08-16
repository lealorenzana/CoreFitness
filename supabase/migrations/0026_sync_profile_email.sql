-- 0026 — keep `profiles.email` in step with the login email.
--
-- The address lives in two places. `auth.users.email` is what you sign in with;
-- `profiles.email` is what the admin roster, the member detail modal and every
-- "contact this member" surface reads. Nothing has ever kept them equal,
-- because until now nothing could change an email at all — the member Edit
-- Profile screen rendered the field disabled with "Ask the front desk to change
-- the email on your account", and the front desk had no way to do it either.
--
-- Now that Change Email exists, the two would drift on the first use: Supabase
-- updates `auth.users.email` and knows nothing about our `profiles` table, so a
-- member would sign in with the new address while the gym's roster still listed
-- the old one. That is the same class of defect as a payment that never updates
-- the membership.
--
-- Syncing on `auth.users` UPDATE rather than from the client is deliberate, and
-- gets the confirmation flow right for free. Supabase only writes the new
-- address into `auth.users.email` **after the user clicks the confirmation
-- link**, so `profiles.email` moves at exactly the moment the change becomes
-- real. A client-side write would have updated the roster the instant the form
-- was submitted, naming an address the person had not yet proven they own.

create or replace function sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_email on auth.users;
create trigger trg_sync_profile_email
after update of email on auth.users
for each row execute function sync_profile_email();

-- One-off repair for any account whose two addresses have already diverged
-- (a manual change in the Supabase dashboard would do it).
update profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and u.email is not null
   and u.email is distinct from p.email;
