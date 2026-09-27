import { supabase } from '../supabaseClient';

/**
 * Coaching rooms, as the owner and desk see them (0128/0129): every room in the
 * gym by trainer, its stream to read and moderate (remove a post or comment —
 * never post as the trainer), and a member's rooms and classwork record for the
 * member drawer. The phone app's lib/api/rooms.ts is the trainer's and member's.
 */

export interface GymRoom {
  id: string; kind: 'class' | 'pt' | 'group'; name: string; trainerName: string; memberCount: number;
  postCount: number; commentCount: number; lastPostAt: string | null; archived: boolean;
}
export interface StreamComment { id: string; body: string; createdAt: string; author: string; isTrainer: boolean }
export interface StreamPost {
  id: string; createdAt: string; body: string; photoUrl: string | null; videoUrl: string | null;
  authorName: string; comments: StreamComment[];
}

const clean = (m: string) => m.replace(/^.*?: /, '');

/** undefined = 0128 not live yet. Makes any automatic rooms that are due first. */
export async function allGymRooms(): Promise<GymRoom[] | undefined> {
  await supabase.rpc('sync_gym_rooms').then(() => undefined, () => undefined);
  const { data, error } = await supabase.rpc('all_gym_rooms');
  if (error) return undefined;
  return ((data ?? []) as { id: string; kind: GymRoom['kind']; name: string; trainer_name: string; member_count: number;
    post_count: number; comment_count: number; last_post_at: string | null; archived: boolean }[]).map((r) => ({
    id: r.id, kind: r.kind, name: r.name, trainerName: r.trainer_name, memberCount: r.member_count,
    postCount: r.post_count, commentCount: r.comment_count, lastPostAt: r.last_post_at, archived: r.archived,
  }));
}

export async function roomStream(roomId: string): Promise<StreamPost[]> {
  const { data, error } = await supabase.rpc('room_stream', { p_room: roomId });
  if (error) throw new Error(clean(error.message));
  return ((data ?? []) as { post_id: string; created_at: string; body: string; photo_url: string | null; video_url: string | null;
    author_name: string; comments: { id: string; body: string; created_at: string; author: string; is_trainer: boolean }[] }[])
    .map((p) => ({
      id: p.post_id, createdAt: p.created_at, body: p.body, photoUrl: p.photo_url, videoUrl: p.video_url,
      authorName: p.author_name,
      comments: (p.comments ?? []).map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, author: c.author, isTrainer: c.is_trainer })),
    }));
}

async function removeRow(table: 'room_posts' | 'room_comments', id: string): Promise<void> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) throw new Error(clean(error.message));
  // A zero-row delete reports success (CLAUDE.md).
  if (!data || data.length === 0) throw new Error('That could not be removed.');
}
export const removePost = (id: string) => removeRow('room_posts', id);
export const removeComment = (id: string) => removeRow('room_comments', id);

/** A member's rooms and classwork record, for the drawer. null = not live / not readable. */
export async function memberRoomsSummary(memberId: string): Promise<{
  rooms: { id: string; kind: GymRoom['kind']; name: string; trainerName: string }[];
  record: { assigned: number; onTime: number; late: number; missing: number } | null;
} | null> {
  const r = await supabase.rpc('member_rooms', { p_member: memberId });
  if (r.error) return null;
  const c = await supabase.rpc('member_classwork_record', { p_member: memberId });
  const rec = !c.error && Array.isArray(c.data) && c.data[0]
    ? (c.data[0] as { assigned: number; on_time: number; late: number; missing: number }) : null;
  return {
    rooms: ((r.data ?? []) as { id: string; kind: GymRoom['kind']; name: string; trainer_name: string }[])
      .map((x) => ({ id: x.id, kind: x.kind, name: x.name, trainerName: x.trainer_name })),
    record: rec ? { assigned: rec.assigned, onTime: rec.on_time, late: rec.late, missing: rec.missing } : null,
  };
}
