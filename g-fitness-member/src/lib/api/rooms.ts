import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';

/**
 * Coaching rooms (0128) and their classwork (0129) — a Google Classroom for
 * trainers. Used by both sides of this app: the trainer's Rooms tab and the
 * member's Rooms page read the same functions, which answer for whoever asks.
 *
 * Everything that decides anything is in SQL: who is in a room (computed from
 * bookings and 1-on-1 sessions, or a group's code), who may comment (the plan
 * gate), when classwork counts as turned in (a finished workout log, or a
 * checked answer), whether it was late, and whether it earns points (the
 * owner's switch). This module asks and reads.
 *
 * `sync_gym_rooms()` makes the automatic rooms; every rooms screen calls it on
 * load, because rooms follow bookings — elapsed data no trigger fires on.
 */

export type RoomKind = 'class' | 'pt' | 'group';
export type CheckinType = 'question' | 'weight' | 'note' | 'photo';
export type WorkStatus = 'assigned' | 'turned_in' | 'late' | 'missing' | 'returned';

export interface Room {
  id: string; kind: RoomKind; name: string; description: string | null;
  trainerId: string; trainerName: string; memberCount: number; postCount: number;
  lastPostAt: string | null; commentsOn: boolean; archived: boolean;
  /** Only the room's own trainer is given the code. */
  joinCode: string | null; isMine: boolean;
  /** False: a member whose plan lacks coaching_rooms — reads, cannot take part. */
  fullAccess: boolean;
  toReview: number; dueSoon: number;
}
export interface RoomPerson { memberId: string; name: string; photoUrl: string | null; isTrainer: boolean; isMe: boolean }
export interface RoomComment { id: string; body: string; createdAt: string; author: string; isTrainer: boolean; canDelete: boolean }
export interface RoomPost {
  id: string; createdAt: string; body: string; photoUrl: string | null; videoUrl: string | null;
  authorName: string; canDelete: boolean; comments: RoomComment[];
}
export interface Classwork {
  id: string; kind: 'workout' | 'checkin'; checkinType: CheckinType | null; title: string;
  instructions: string | null; dueOn: string; gymWorkoutId: string | null; workoutName: string | null;
  createdAt: string; wholeRoom: boolean;
  targets: number; turnedIn: number; late: number; missing: number; toReview: number;
  myStatus: WorkStatus | null; myAnswerText: string | null; myAnswerNumber: number | null;
  myReturnComment: string | null; myPoints: number;
}
export interface HandIn {
  memberId: string; name: string; photoUrl: string | null; status: WorkStatus;
  submissionId: string | null; turnedInAt: string | null; answerText: string | null;
  answerNumber: number | null; returnComment: string | null; returnedAt: string | null;
  workout: { exercise: string; set: number; reps: number | null; kg: number | null; seconds: number | null }[] | null;
}
export type Flag = 'missing_work' | 'inactive' | 'missed_classes';
export interface ProgressRow {
  memberId: string; name: string; photoUrl: string | null; assigned: number; onTime: number; late: number;
  missing: number; lastWorkoutAt: string | null; classesBooked: number | null; classesAttended: number | null;
  latestWeight: number | null; cells: { assignment: string; status: 'on_time' | 'late' | 'missing' | 'assigned' | 'none' }[];
  flags: Flag[];
}
export interface ReviewItem {
  submissionId: string; assignmentId: string; roomId: string; roomName: string; title: string;
  memberName: string; turnedInAt: string; late: boolean;
}
export interface DueItem { assignmentId: string; roomId: string; roomName: string; title: string; kind: 'workout' | 'checkin'; dueOn: string }

const clean = (m: string) => m.replace(/^.*?: /, '');
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Violet = where you are (done); amber = what to do next. No reds, no greens. */
export const WORK_STATUS: Record<WorkStatus, { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  assigned: { label: 'To do', tone: 'action' },
  turned_in: { label: 'Turned in', tone: 'structure' },
  late: { label: 'Turned in late', tone: 'muted' },
  missing: { label: 'Missing', tone: 'action' },
  returned: { label: 'Returned', tone: 'structure' },
};

export const FLAG_LABEL: Record<Flag, string> = {
  missing_work: '2+ missing',
  inactive: 'No workout in 10 days',
  missed_classes: 'Missed last 3 classes',
};

/** Makes any automatic rooms that are due. Never throws — retried next open. */
export async function syncRooms(): Promise<void> {
  await supabase.rpc('sync_gym_rooms').then(() => undefined, () => undefined);
}

/** undefined = 0128 not live yet. */
export async function myRooms(): Promise<Room[] | undefined> {
  const { data, error } = await supabase.rpc('my_rooms');
  if (error) return undefined;
  const badges = new Map<string, { to_review: number; due_soon: number }>();
  const b = await supabase.rpc('room_badges');
  if (!b.error) for (const r of (b.data ?? []) as { room_id: string; to_review: number; due_soon: number }[]) badges.set(r.room_id, r);
  return ((data ?? []) as {
    id: string; kind: RoomKind; name: string; description: string | null; trainer_id: string; trainer_name: string;
    member_count: number; post_count: number; last_post_at: string | null; comments_on: boolean; archived: boolean;
    join_code: string | null; is_mine: boolean; full_access: boolean;
  }[]).map((r) => ({
    id: r.id, kind: r.kind, name: r.name, description: r.description, trainerId: r.trainer_id,
    trainerName: r.trainer_name, memberCount: r.member_count, postCount: r.post_count, lastPostAt: r.last_post_at,
    commentsOn: r.comments_on, archived: r.archived, joinCode: r.join_code, isMine: r.is_mine, fullAccess: r.full_access,
    toReview: badges.get(r.id)?.to_review ?? 0, dueSoon: badges.get(r.id)?.due_soon ?? 0,
  }));
}

export async function roomPeople(roomId: string): Promise<RoomPerson[]> {
  const { data, error } = await supabase.rpc('room_people', { p_room: roomId });
  if (error) throw new Error(clean(error.message));
  return ((data ?? []) as { member_id: string; name: string; photo_url: string | null; is_trainer: boolean; is_me: boolean }[])
    .map((p) => ({ memberId: p.member_id, name: p.name, photoUrl: p.photo_url, isTrainer: p.is_trainer, isMe: p.is_me }));
}

export async function roomStream(roomId: string): Promise<RoomPost[]> {
  const { data, error } = await supabase.rpc('room_stream', { p_room: roomId });
  if (error) throw new Error(clean(error.message));
  return ((data ?? []) as { post_id: string; created_at: string; body: string; photo_url: string | null;
    video_url: string | null; author_name: string; can_delete: boolean;
    comments: { id: string; body: string; created_at: string; author: string; is_trainer: boolean; can_delete: boolean }[] }[])
    .map((p) => ({
      id: p.post_id, createdAt: p.created_at, body: p.body, photoUrl: p.photo_url, videoUrl: p.video_url,
      authorName: p.author_name, canDelete: p.can_delete,
      comments: (p.comments ?? []).map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, author: c.author,
        isTrainer: c.is_trainer, canDelete: c.can_delete })),
    }));
}

async function currentGym(): Promise<string> {
  const id = await currentGymId();
  if (!id) throw new Error('Could not tell which gym this is for. Reload and try again.');
  return id;
}

export async function addPost(roomId: string, body: string, videoUrl: string | null, photoUrl: string | null): Promise<void> {
  const { error } = await supabase.from('room_posts').insert({
    gym_id: await currentGym(), room_id: roomId, body: body.trim(), video_url: videoUrl || null, photo_url: photoUrl || null,
  });
  if (error) throw new Error(/is_allowed_video_url|video_url/i.test(error.message)
    ? 'Only YouTube or Vimeo links can be added.' : clean(error.message));
}

export async function deletePost(postId: string): Promise<void> {
  const { data, error } = await supabase.from('room_posts').delete().eq('id', postId).select('id');
  if (error) throw new Error(clean(error.message));
  if (!data || data.length === 0) throw new Error('That post could not be removed.');
}

export async function addComment(postId: string, body: string): Promise<void> {
  const { error } = await supabase.from('room_comments').insert({ gym_id: await currentGym(), post_id: postId, body: body.trim() });
  if (error) throw new Error(/row-level security/i.test(error.message)
    ? 'You cannot comment here.' : clean(error.message));
}

export async function deleteComment(commentId: string): Promise<void> {
  const { data, error } = await supabase.from('room_comments').delete().eq('id', commentId).select('id');
  if (error) throw new Error(clean(error.message));
  if (!data || data.length === 0) throw new Error('That comment could not be removed.');
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(clean(error.message));
  return data;
};

export const createGroup = async (name: string, description: string) =>
  (await rpc('create_group_room', { p_name: name.trim(), p_description: description.trim() || null })) as string;
export const updateRoom = (roomId: string, patch: { name?: string; description?: string; commentsOn?: boolean }) =>
  rpc('update_room', { p_room: roomId, p_name: patch.name ?? null, p_description: patch.description ?? null,
    p_comments_on: patch.commentsOn ?? null });
export const resetCode = async (roomId: string) => (await rpc('reset_room_code', { p_room: roomId })) as string;
export const setArchived = (roomId: string, archived: boolean) => rpc('set_room_archived', { p_room: roomId, p_archived: archived });
export const joinRoom = async (code: string) => (await rpc('join_room', { p_code: code.trim() })) as string;
export const leaveRoom = (roomId: string) => rpc('leave_room', { p_room: roomId });
/** A trainer's own coaching group, with its posts and classwork (0169). Class and 1-on-1 rooms are closed instead. */
export const deleteRoom = (roomId: string) => rpc('delete_room', { p_room: roomId });
export const removeFromRoom = (roomId: string, memberId: string) => rpc('remove_from_room', { p_room: roomId, p_member: memberId });

// ---- classwork (0129) ------------------------------------------------------------------------

/** undefined = 0129 not live yet. */
export async function roomClasswork(roomId: string): Promise<Classwork[] | undefined> {
  const { data, error } = await supabase.rpc('room_classwork', { p_room: roomId });
  if (error) return undefined;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, kind: r.kind as Classwork['kind'], checkinType: r.checkin_type as CheckinType | null,
    title: r.title as string, instructions: r.instructions as string | null, dueOn: r.due_on as string,
    gymWorkoutId: r.gym_workout_id as string | null, workoutName: r.workout_name as string | null,
    createdAt: r.created_at as string, wholeRoom: r.whole_room as boolean,
    targets: Number(r.targets), turnedIn: Number(r.turned_in), late: Number(r.late), missing: Number(r.missing),
    toReview: Number(r.to_review), myStatus: r.my_status as WorkStatus | null,
    myAnswerText: r.my_answer_text as string | null, myAnswerNumber: num(r.my_answer_number),
    myReturnComment: r.my_return_comment as string | null, myPoints: Number(r.my_points ?? 0),
  }));
}

export async function createAssignment(input: {
  roomId: string; kind: 'workout' | 'checkin'; workoutId: string | null; checkinType: CheckinType | null;
  title: string; instructions: string; dueOn: string; assignedTo: string[] | null;
}): Promise<string> {
  return (await rpc('create_assignment', {
    p_room: input.roomId, p_kind: input.kind, p_workout: input.workoutId, p_checkin_type: input.checkinType,
    p_title: input.title.trim(), p_instructions: input.instructions.trim() || null, p_due_on: input.dueOn,
    p_assigned_to: input.assignedTo && input.assignedTo.length ? input.assignedTo : null,
  })) as string;
}

export const deleteAssignment = (id: string) => rpc('delete_assignment', { p_assignment: id });
export const startAssignment = async (id: string) => (await rpc('start_assignment', { p_assignment: id })) as string;
export const submitCheckin = (id: string, text: string | null, number: number | null) =>
  rpc('submit_checkin', { p_assignment: id, p_text: text, p_number: number });
export const returnSubmission = (submissionId: string, comment: string) =>
  rpc('return_submission', { p_submission: submissionId, p_comment: comment.trim() });

export async function assignmentDetail(id: string): Promise<HandIn[]> {
  const data = (await rpc('assignment_detail', { p_assignment: id })) as Record<string, unknown>[] | null;
  return (data ?? []).map((r) => ({
    memberId: r.member_id as string, name: r.name as string, photoUrl: r.photo_url as string | null,
    status: r.status as WorkStatus, submissionId: r.submission_id as string | null,
    turnedInAt: r.turned_in_at as string | null, answerText: r.answer_text as string | null,
    answerNumber: num(r.answer_number), returnComment: r.return_comment as string | null,
    returnedAt: r.returned_at as string | null, workout: (r.workout as HandIn['workout']) ?? null,
  }));
}

export async function roomProgress(roomId: string): Promise<ProgressRow[]> {
  const data = (await rpc('room_progress', { p_room: roomId })) as Record<string, unknown>[] | null;
  return (data ?? []).map((r) => ({
    memberId: r.member_id as string, name: r.name as string, photoUrl: r.photo_url as string | null,
    assigned: Number(r.assigned), onTime: Number(r.on_time), late: Number(r.late), missing: Number(r.missing),
    lastWorkoutAt: r.last_workout_at as string | null, classesBooked: num(r.classes_booked),
    classesAttended: num(r.classes_attended), latestWeight: num(r.latest_weight),
    cells: (r.cells as ProgressRow['cells']) ?? [], flags: ((r.flags as Flag[]) ?? []),
  }));
}

export async function reviewQueue(): Promise<ReviewItem[]> {
  const { data, error } = await supabase.rpc('trainer_review_queue');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    submissionId: r.submission_id as string, assignmentId: r.assignment_id as string, roomId: r.room_id as string,
    roomName: r.room_name as string, title: r.title as string, memberName: r.member_name as string,
    turnedInAt: r.turned_in_at as string, late: r.late as boolean,
  }));
}

/** The member's open classwork due within a week. Sends due-tomorrow reminders first. */
export async function myDueClasswork(): Promise<DueItem[]> {
  await supabase.rpc('classwork_due_sweep').then(() => undefined, () => undefined);
  const { data, error } = await supabase.rpc('my_due_classwork');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    assignmentId: r.assignment_id as string, roomId: r.room_id as string, roomName: r.room_name as string,
    title: r.title as string, kind: r.kind as DueItem['kind'], dueOn: r.due_on as string,
  }));
}

/** Workouts a trainer may set: the gym's published ones and their own. */
export async function assignableWorkouts(): Promise<{ id: string; name: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('gym_workouts').select('id, name, published, created_by, hidden')
    .order('name');
  if (error) return [];
  return ((data ?? []) as { id: string; name: string; published: boolean; created_by: string; hidden: boolean }[])
    .filter((w) => !w.hidden && (w.published || w.created_by === user?.id)).map((w) => ({ id: w.id, name: w.name }));
}

/** "Fri 3 Oct" for a Manila date string. */
export function dueLabel(dueOn: string): string {
  const d = new Date(`${dueOn}T12:00:00+08:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' });
}

/** Each of my rooms' picture (0178): a 1-on-1 shows the member, class and group rooms what their coach set. */
export async function myRoomPhotos(): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.rpc('my_room_photos');
  if (error) return new Map();
  return new Map(((data ?? []) as { room_id: string; photo_url: string | null }[]).map((r) => [r.room_id, r.photo_url]));
}
export const setRoomPhoto = (roomId: string, url: string | null) => rpc('set_room_photo', { p_room: roomId, p_url: url });
