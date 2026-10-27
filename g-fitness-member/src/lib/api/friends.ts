import { supabase } from '../supabaseClient';
import { currentGymId } from '../gymContext';

/**
 * Friends, wins and cheers (0217; wave 3 of the lively member app). Optional:
 * off at a gym until its owner switches it on, and then every function here
 * answers. Everything is decided in SQL — who may be found, whose wins show,
 * which win may be cheered; this module asks and reads.
 */

export type FriendState = 'none' | 'sent' | 'incoming' | 'friends';
export interface Person { id: string; firstName: string; lastName: string; photoUrl: string | null }
export interface Friend extends Person { since: string | null; streakWeeks: number; inSquad: boolean }
export interface FriendRequest extends Person { requestId: string; direction: 'in' | 'out'; reason: 'squad' | 'invited' | null; at: string }
export interface Found extends Person { state: FriendState; reason?: 'squad' | 'invited' }
export type WinKind = 'record' | 'streak' | 'badge' | 'target' | 'challenge';
export interface Win extends Person {
  relation: 'friend' | 'squad'; kind: WinKind; ref: string; title: string; detail: string | null; tier: string | null; at: string; cheered: boolean;
}

const clean = (m: string) => m.replace(/^.*?: /, '');
const person = (r: { member_id: string; first_name: string | null; last_name: string | null; photo_url: string | null }): Person => ({
  id: r.member_id, firstName: r.first_name ?? '', lastName: r.last_name ?? '', photoUrl: r.photo_url,
});

/** Is Friends switched on at this gym? False before 0217 too — then nothing shows anywhere. */
export async function friendsOn(): Promise<boolean> {
  const gym = await currentGymId().catch(() => null);
  if (!gym) return false;
  const { data, error } = await supabase.from('gym_settings').select('friends_on').eq('gym_id', gym).maybeSingle();
  return !error && (data as { friends_on?: boolean } | null)?.friends_on === true;
}

async function rows<T>(fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(clean(error.message));
  return (data ?? []) as T[];
}

type PersonRow = { member_id: string; first_name: string | null; last_name: string | null; photo_url: string | null };

export async function myFriends(): Promise<Friend[]> {
  return (await rows<PersonRow & { since: string | null; streak_weeks: number; in_squad: boolean }>('my_friends'))
    .map((r) => ({ ...person(r), since: r.since, streakWeeks: r.streak_weeks ?? 0, inSquad: !!r.in_squad }));
}

export async function myFriendRequests(): Promise<FriendRequest[]> {
  return (await rows<PersonRow & { request_id: string; direction: 'in' | 'out'; reason: 'squad' | 'invited' | null; created_at: string }>('my_friend_requests'))
    .map((r) => ({ ...person(r), requestId: r.request_id, direction: r.direction, reason: r.reason, at: r.created_at }));
}

export async function findMembers(query: string): Promise<Found[]> {
  if (query.trim().length < 2) return [];
  return (await rows<PersonRow & { state: FriendState }>('find_members', { p_query: query.trim() }))
    .map((r) => ({ ...person(r), state: r.state }));
}

export async function peopleYouMayKnow(): Promise<Found[]> {
  return (await rows<PersonRow & { state: FriendState; reason: 'squad' | 'invited' }>('people_you_may_know'))
    .map((r) => ({ ...person(r), state: r.state, reason: r.reason }));
}

export async function friendWins(limit = 40): Promise<Win[]> {
  return (await rows<PersonRow & { relation: 'friend' | 'squad'; kind: WinKind; ref: string; title: string; detail: string | null; tier: string | null; at: string; cheered: boolean }>(
    'friend_wins', { p_limit: limit }))
    .map((r) => ({ ...person(r), relation: r.relation, kind: r.kind, ref: r.ref, title: r.title, detail: r.detail, tier: r.tier, at: r.at, cheered: !!r.cheered }));
}

/** 'sent', or 'friends' when they had already asked you. */
export async function sendRequest(memberId: string): Promise<'sent' | 'friends'> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_other: memberId });
  if (error) throw new Error(clean(error.message));
  return data as 'sent' | 'friends';
}

export async function sendRequestByCode(code: string): Promise<{ state: 'sent' | 'friends'; name: string }> {
  const { data, error } = await supabase.rpc('send_friend_request_by_code', { p_code: code });
  if (error) throw new Error(clean(error.message));
  return data as { state: 'sent' | 'friends'; name: string };
}

export async function respondRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_friend_request', { p_id: requestId, p_accept: accept });
  if (error) throw new Error(clean(error.message));
}

/** Unfriend, or take back a request you sent. */
export async function removeFriend(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_other: memberId });
  if (error) throw new Error(clean(error.message));
}

export async function myFriendCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_friend_code');
  if (error) return null;
  return (data as string | null) ?? null;
}

/** The QR a friend scans: "CFF1." and the code — never the check-in code's shape. */
export const FRIEND_QR_PREFIX = 'CFF1.';
export const friendQr = (code: string) => `${FRIEND_QR_PREFIX}${code}`;
export const codeFromQr = (text: string): string | null =>
  text.startsWith(FRIEND_QR_PREFIX) ? text.slice(FRIEND_QR_PREFIX.length).trim() : /^[A-Z0-9]{7}$/i.test(text.trim()) ? text.trim() : null;

export async function cheer(win: Win, on: boolean): Promise<void> {
  const { error } = await supabase.rpc(on ? 'cheer_win' : 'uncheer_win', { p_member: win.id, p_kind: win.kind, p_ref: win.ref });
  if (error) throw new Error(clean(error.message));
}

/** The member's two switches (Settings → Friends). Null before 0217. */
export async function myFriendPrivacy(): Promise<{ findable: boolean; shareWins: boolean } | null> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from('member_profiles').select('findable, share_wins').eq('profile_id', uid).maybeSingle();
  if (error || !data) return null;
  const r = data as { findable: boolean; share_wins: boolean };
  return { findable: r.findable, shareWins: r.share_wins };
}

export async function setFriendPrivacy(patch: { findable?: boolean; shareWins?: boolean }): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('Not signed in');
  const row: Record<string, boolean> = {};
  if (patch.findable != null) row.findable = patch.findable;
  if (patch.shareWins != null) row.share_wins = patch.shareWins;
  const { data, error } = await supabase.from('member_profiles').update(row).eq('profile_id', uid).select('profile_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('That setting was not saved.');
}

/** A coach's trainee: the cheers they received lately — who and what (0217). Empty when not their trainee. */
export async function traineeCheers(memberId: string): Promise<{ from: string; title: string; at: string }[]> {
  const { data, error } = await supabase.rpc('trainee_cheers', { p_member: memberId, p_days: 14 });
  if (error || !Array.isArray(data)) return [];
  return (data as { from_first_name: string | null; from_last_initial: string | null; win_title: string; at: string }[])
    .map((r) => ({ from: `${r.from_first_name ?? ''}${r.from_last_initial ? ` ${r.from_last_initial}.` : ''}`.trim(), title: r.win_title, at: r.at }));
}
