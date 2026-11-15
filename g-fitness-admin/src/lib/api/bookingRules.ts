import { supabase } from '../supabaseClient';

/**
 * Gym styles phase 4 (0260): repeat bookings, no-shows and late cancels — every rule the owner's.
 * **Byte-identical in admin and member — diff before changing one.**
 *
 * Both switches (`repeats`, `noshows`) are off at every gym until the owner turns them on, so every screen reads
 * `repeatsOn` / `noshowsOn` from the database and draws nothing when they are false or the read fails.
 */

export type RepeatWho = 'member' | 'coach' | 'desk';
export type RepeatKind = 'weeks' | 'until_stopped';
export type LateMode = 'block' | 'mark' | 'mark_free';
export type NoshowMode = 'auto' | 'hand' | 'auto_coach' | 'off';
export type BookingKind = 'class' | 'pt' | 'slot';

export interface BookingRules {
  repeatsOn: boolean;
  noshowsOn: boolean;
  repeatWho: RepeatWho[];
  repeatKind: RepeatKind;
  repeatMaxWeeks: number;
  repeatAheadDays: number;
  classCancelMinutes: number;
  ptCancelMinutes: number;
  slotCancelMinutes: number;
  lateMode: LateMode;
  noshowMode: NoshowMode;
  noshowWindowMinutes: number;
  noshowTell: boolean;
  noshowCountsUsed: boolean;
  noshowPause: boolean;
  noshowPauseCount: number;
  noshowPauseWithinDays: number;
  noshowPauseDays: number;
  /** The signed-in member's own pause, if one is running. */
  myPause: { until: string; reason: string } | null;
}

/** The gym's rules, or null before 0260 / outside a gym (nothing is drawn). */
export async function getBookingRules(): Promise<BookingRules | null> {
  const { data, error } = await supabase.rpc('gym_booking_rules');
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof r[k] === 'number' ? (r[k] as number) : d);
  return {
    repeatsOn: r.repeats_on === true,
    noshowsOn: r.noshows_on === true,
    repeatWho: (Array.isArray(r.repeat_who) ? r.repeat_who : ['member']) as RepeatWho[],
    repeatKind: (r.repeat_kind as RepeatKind) ?? 'weeks',
    repeatMaxWeeks: n('repeat_max_weeks', 4),
    repeatAheadDays: n('repeat_ahead_days', 7),
    classCancelMinutes: n('class_cancel_minutes', 0),
    ptCancelMinutes: n('pt_cancel_minutes', 0),
    slotCancelMinutes: n('slot_cancel_minutes', 0),
    lateMode: (r.late_cancel_mode as LateMode) ?? 'mark',
    noshowMode: (r.noshow_mode as NoshowMode) ?? 'auto_coach',
    noshowWindowMinutes: n('noshow_window_minutes', 60),
    noshowTell: r.noshow_tell !== false,
    noshowCountsUsed: r.noshow_counts_used !== false,
    noshowPause: r.noshow_pause === true,
    noshowPauseCount: n('noshow_pause_count', 3),
    noshowPauseWithinDays: n('noshow_pause_within_days', 30),
    noshowPauseDays: n('noshow_pause_days', 7),
    myPause: (r.my_pause as { until: string; reason: string } | null) ?? null,
  };
}

type Result = { ok: true } | { ok: false; message: string };
const done = (error: { message: string } | null): Result => (error ? { ok: false, message: error.message } : { ok: true });

/** Owner only (the database refuses anyone else). */
export async function setRepeatRules(who: RepeatWho[], kind: RepeatKind, maxWeeks: number, aheadDays: number): Promise<Result> {
  const { error } = await supabase.rpc('set_repeat_rules', { p_who: who, p_kind: kind, p_max_weeks: maxWeeks, p_ahead_days: aheadDays });
  return done(error);
}
export async function setCancelRules(classMin: number, ptMin: number, slotMin: number, mode: LateMode): Promise<Result> {
  const { error } = await supabase.rpc('set_cancel_rules', { p_class: classMin, p_pt: ptMin, p_slot: slotMin, p_mode: mode });
  return done(error);
}
export async function setNoshowRules(r: Pick<BookingRules, 'noshowMode' | 'noshowWindowMinutes' | 'noshowTell' | 'noshowCountsUsed'
  | 'noshowPause' | 'noshowPauseCount' | 'noshowPauseWithinDays' | 'noshowPauseDays'>): Promise<Result> {
  const { error } = await supabase.rpc('set_noshow_rules', {
    p_mode: r.noshowMode, p_window: r.noshowWindowMinutes, p_tell: r.noshowTell, p_counts_used: r.noshowCountsUsed,
    p_pause: r.noshowPause, p_count: r.noshowPauseCount, p_within_days: r.noshowPauseWithinDays, p_days: r.noshowPauseDays,
  });
  return done(error);
}

/** The coach (their own sessions and classes) or the desk: came / didn't come. Changing a no-show undoes its effects. */
export async function markAttendance(kind: BookingKind, id: string, came: boolean): Promise<Result> {
  const { error } = await supabase.rpc('mark_attendance', { p_kind: kind, p_id: id, p_came: came });
  return done(error);
}

export async function liftBookingPause(memberId: string, reason?: string): Promise<Result> {
  const { error } = await supabase.rpc('lift_booking_pause', { p_member: memberId, p_reason: reason ?? null });
  return done(error);
}

/** Start a repeat from a booking that is still on (its first week). `weeks` counts the first; null = until stopped. */
export async function repeatBooking(kind: BookingKind, id: string, weeks: number | null): Promise<Result> {
  const { error } = await supabase.rpc('repeat_booking', { p_kind: kind, p_id: id, p_weeks: weeks });
  return done(error);
}
export async function stopRepeat(id: string): Promise<Result> {
  const { error } = await supabase.rpc('stop_repeat', { p_id: id });
  return done(error);
}

export interface RepeatWeek { date: string; outcome: 'booked' | 'refused'; message: string | null; bookingId: string | null }
export interface Repeat {
  id: string; memberId: string; memberName: string; kind: BookingKind; what: string; weekday: number; starts: string;
  weeks: number | null; firstDate: string; createdByRole: RepeatWho; stoppedAt: string | null; stopReason: string | null; weekList: RepeatWeek[];
}
/** Own (member), with them (coach), or the gym's (desk; one member or all). Empty when it cannot be read. */
export async function listRepeats(memberId?: string): Promise<Repeat[]> {
  const { data, error } = await supabase.rpc('booking_repeats_for', { p_member: memberId ?? null });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, memberId: r.member_id as string, memberName: (r.member_name as string) ?? '', kind: r.kind as BookingKind,
    what: r.what as string, weekday: r.weekday as number, starts: r.starts as string, weeks: (r.weeks as number | null) ?? null,
    firstDate: r.first_date as string, createdByRole: r.created_by_role as RepeatWho, stoppedAt: (r.stopped_at as string | null) ?? null,
    stopReason: (r.stop_reason as string | null) ?? null,
    weekList: ((r.week_list as Record<string, unknown>[]) ?? []).map((w) => ({
      date: w.date as string, outcome: w.outcome as 'booked' | 'refused', message: (w.message as string | null) ?? null, bookingId: (w.booking_id as string | null) ?? null,
    })),
  }));
}

export interface RecordRow { kind: BookingKind; id: string; what: string; startsAt: string; mark: 'came' | 'no_show' | 'late_cancel'; markedByRole: string | null; markedAt: string | null }
/** A member's marks (no-shows, came, late cancels) — the member, the desk, or one of their coaches. Null when it failed. */
export async function getBookingRecord(memberId: string, days = 90): Promise<RecordRow[] | null> {
  const { data, error } = await supabase.rpc('booking_record', { p_member: memberId, p_days: days });
  if (error || !data) return null;
  return (data as Record<string, unknown>[]).map((r) => ({
    kind: r.kind as BookingKind, id: r.id as string, what: r.what as string, startsAt: r.starts_at as string,
    mark: r.mark as RecordRow['mark'], markedByRole: (r.marked_by_role as string | null) ?? null, markedAt: (r.marked_at as string | null) ?? null,
  }));
}

export interface Pause { id: string; until: string; reason: string; auto: boolean }
export async function getBookingPause(memberId: string): Promise<Pause | null> {
  const { data, error } = await supabase.rpc('booking_pause_of', { p_member: memberId });
  if (error || !data || !(data as unknown[]).length) return null;
  const p = (data as Record<string, unknown>[])[0];
  return { id: p.id as string, until: p.until as string, reason: p.reason as string, auto: p.auto === true };
}

/** The re-runnable sweeps (pg_cron is optional): judge ended sessions, book the weeks repeats have not booked yet. */
export async function runBookingSweeps(): Promise<void> {
  await Promise.allSettled([supabase.rpc('settle_no_shows'), supabase.rpc('extend_repeats')]);
}

/** "2 hours", "90 minutes", "1 day" — for a cancel window. */
export function minutesWords(m: number): string {
  if (m <= 0) return 'until it starts';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;
  return `${m} minutes`;
}

/** Is this start inside the gym's late window right now? */
export function insideLateWindow(startsAt: string, minutes: number, now = Date.now()): boolean {
  return minutes > 0 && new Date(startsAt).getTime() - minutes * 60_000 <= now;
}
