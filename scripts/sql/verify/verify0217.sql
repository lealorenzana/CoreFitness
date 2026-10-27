-- VERIFICATION for 0217 (friends, wins and cheers — off until each owner switches it on)
-- Paste into the Supabase SQL editor right after 0217. Read-only; the error is the report.
do $$
declare sw int; mp int; t int; fn int; codes_missing int; on_gyms int; note int; c boolean;
begin
  select count(*) from information_schema.columns where table_name = 'gym_settings' and column_name = 'friends_on' into sw;
  select count(*) from information_schema.columns where table_name = 'member_profiles' and column_name in ('findable', 'share_wins', 'friend_code') into mp;
  select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('friendships', 'cheers') into t;
  select count(*) from pg_proc where proname in ('send_friend_request', 'send_friend_request_by_code', 'respond_friend_request', 'remove_friend',
    'my_friends', 'my_friend_requests', 'find_members', 'people_you_may_know', 'my_friend_code', 'friend_wins', 'cheer_win', 'uncheer_win',
    'trainee_cheers', 'member_social_counts') into fn;
  select count(*) from member_profiles where friend_code is null into codes_missing;
  select count(*) from gym_settings where friends_on into on_gyms;
  select count(*) from app_releases where title = 'Friends and cheers, if you want them' into note;
  select coalesce((select migration_0217_applied()), false) into c;
  raise exception 'REPORT 0217: switch=% (expect 1) | member columns=% (expect 3) | tables=% (expect 2) | functions=% (expect 14) | members without a friend code=% (expect 0) | gyms with it on=% (expect 0) | owners'' note=% (expect 1) | marker=%',
    sw, mp, t, fn, codes_missing, on_gyms, note, c;
end
$$;
