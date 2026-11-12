-- ============================================================================
-- 0248 — A reel video is at most 15 MB (owner, 2026-11-12)
-- ============================================================================
-- Bandwidth, not storage, is the cost that grows with a gym's size: every view of
-- an uploaded video is served from Supabase. A phone video at 15 MB still looks
-- fine on a phone, and costs 40% less each time it is watched. The app checks the
-- same number before uploading (lib/api/reels.ts REEL_MAX_BYTES); the bucket is the
-- rule. Videos already uploaded stay. Links use no storage and no bandwidth of ours.
-- Safe to paste again.
-- ============================================================================
update storage.buckets set file_size_limit = 15728640 where id = 'reels';

create or replace function migration_0248_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0248_applied() to anon, authenticated;
