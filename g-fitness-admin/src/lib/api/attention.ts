import { supabase } from '../supabaseClient';

/**
 * Bookings nobody has answered, and what the desk can do about them (0083).
 *
 * The escalation itself is not here and is not new: `sweep_stale_requests()`
 * has nudged the trainer at 24 hours, told the member at 48 and notified every
 * admin at 72 since 0071. What this adds is the screen that notification should
 * have been pointing at — how long each member has waited, and the three
 * actions that resolve it.
 *
 * Every function is front-desk gated in SQL. `is_front_desk()` is the boundary;
 * the page only decides what to render.
 */

export interface AttentionRow {
  kind: 'pt' | 'class';
  id: string;
  member_id: string;
  member_name: string;
  trainer_id: string | null;
  trainer_name: string | null;
  /** The class name, or the member's note on a PT request. */
  what: string;
  requested_at: string;
  starts_at: string;
  days_waiting: number;
  hours_until: number;
  /** Decided in SQL so this screen and any other cannot disagree. */
  urgency: 'urgent' | 'overdue' | 'waiting' | 'new';
}

/**
 * The queue, worst first.
 *
 * Ordered here rather than in the view because "worst" is a presentation
 * decision: urgent (the session is nearly here) outranks overdue (nobody has
 * answered in three days) even when the overdue one has waited longer.
 */
const URGENCY_RANK: Record<AttentionRow['urgency'], number> = {
  urgent: 0, overdue: 1, waiting: 2, new: 3,
};

export async function listBookingsNeedingAttention(): Promise<AttentionRow[]> {
  const { data, error } = await supabase
    .from('bookings_needing_attention')
    .select('*');
  if (error) throw error;
  return ((data ?? []) as AttentionRow[]).sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.days_waiting - a.days_waiting
  );
}

export interface TrainerSuggestion {
  trainer_id: string;
  trainer_name: string;
  specialization: string | null;
  /** Focus areas shared with what the member said they are here for. */
  shared_focus: number;
  /** Sessions already on their book in the next week. */
  upcoming_load: number;
}

/**
 * Coaches who could actually take this session.
 *
 * Availability is the filter and everything else ranks — see the function's own
 * comment. A coach who does not work that hour is absent from this list, not
 * merely sorted last, because offering them would be offering a refusal.
 */
export async function suggestTrainers(sessionId: string): Promise<TrainerSuggestion[]> {
  const { data, error } = await supabase
    .rpc('suggest_trainers_for_session', { p_session: sessionId });
  if (error) throw error;
  return (data ?? []) as TrainerSuggestion[];
}

/** Move a PT session to another coach. Stays pending — they still accept it. */
export async function reassignSession(sessionId: string, trainerId: string): Promise<void> {
  const { error } = await supabase
    .rpc('reassign_pt_session', { p_session: sessionId, p_trainer: trainerId });
  if (error) throw error;
}

/**
 * Nudge the trainer by hand.
 *
 * Returns false when nothing was sent — either one already went today, or the
 * booking stopped being pending while the page was open. The caller must say
 * which happened rather than claiming a reminder went out; a desk that thinks
 * it chased someone and did not is worse off than one that knows it failed.
 */
export async function remindTrainer(kind: 'pt' | 'class', id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remind_trainer', { p_kind: kind, p_id: id });
  if (error) throw error;
  return data === true;
}
