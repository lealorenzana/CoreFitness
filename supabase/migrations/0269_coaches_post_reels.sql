-- 0269: the owner decides whether coaches post reels (owner, 2026-11-23: "there should be settings in
-- the admin owner app to set if trainers can post a reel or not").
--
-- gym_settings.coaches_post_reels, on by default, so nothing changes at any gym until its owner turns it
-- off (Reels page, owner only; 0013's gym_settings_update_admin already limits the write to the owner).
-- Off: a coach cannot post or upload a reel. Reels a coach already posted stay, and the coach still edits,
-- hides and removes their own (may_manage_reel is untouched): turning the switch off is not a takedown,
-- the owner removes any reel they want gone. The owner and the desk post as before.

alter table gym_settings add column if not exists coaches_post_reels boolean not null default true;
comment on column gym_settings.coaches_post_reels is
  '0269: coaches may post reels here. Off: owner and desk only; coaches keep managing their own.';

-- 0245's definition (the last one), plus the switch for a coach.
create or replace function may_post_reels() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() is not null
    and storage_role_here() in ('admin', 'staff', 'trainer')
    and gym_writable()
    and gym_module_on(current_gym_id(), 'reels')
    and (storage_role_here() <> 'trainer'
         or coalesce((select s.coaches_post_reels from gym_settings s where s.gym_id = current_gym_id()), true)), false);
$$;
revoke all on function may_post_reels() from public, anon;
grant execute on function may_post_reels() to authenticated;

create or replace function migration_0269_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0269_applied() to anon, authenticated;
