import { supabase } from '../lib/supabaseClient';
import { recordPayment } from '../lib/api/payments';
import { changeMembershipPlan, listMemberMemberships } from '../lib/api/memberships';
import { listPlans } from '../lib/api/membershipPlans';
import { approveMemberRegistration } from '../lib/api/members';
import { setPtSessionStatus } from '../lib/api/ptSessions';
import { sweepStaleRequests } from '../lib/api/bookings';
import { notifyUser } from '../lib/api/notify';
import { coachingApproval, coachingSweep, listCoachings, type CoachingApproval, type CoachingRow } from '../lib/api/coaching';
import { loadBookingQueue, type QueueRow } from './bookingQueueService';
import type { OpenRenewalRequest } from '../lib/api/renewalRequests';
import type { RecordPaymentInput } from '../components/ui/RecordPaymentModal';
import type { MembershipPlanRow, PendingRegistrationRow } from '../types/db';
import { todayKey } from '../utils/dates';

/**
 * The desk's answers, in one place, so Payments, Members, Personal training and
 * Notifications' Needs you (mock-up B, 2026-11-27) run the same code: no page
 * keeps its own copy of a rule. Each one throws on failure; the caller says so.
 */

export interface MemberPlanInfo {
  membershipId: string;
  /** The plan the membership is on now; a different pick switches it before recording. */
  planId: string;
  /** NULL on a non-expiring plan (0024): recordPayment leaves the expiry unset. */
  durationDays: number | null;
  planName: string;
  planPrice: number;
}

/**
 * Record a payment at the desk. A different plan picked switches the membership
 * FIRST, then records: recording starts the term from the new plan's days
 * (CLAUDE.md: a plan change must precede recordPayment). The member is told;
 * a failed notice returns false, never undoes the payment.
 */
export async function recordDeskPayment(data: RecordPaymentInput, membership: MemberPlanInfo, plans: MembershipPlanRow[]): Promise<{ notified: boolean }> {
  const switching = !!data.planId && data.planId !== membership.planId;
  const newPlan = switching ? plans.find((pl) => pl.id === data.planId) : undefined;
  if (switching && !newPlan) throw new Error('That plan is no longer offered. Pick another.');
  if (newPlan) await changeMembershipPlan(membership.membershipId, newPlan.id);
  await recordPayment({
    member_id: data.memberId,
    membership_id: membership.membershipId,
    duration_days: newPlan ? newPlan.duration_days : membership.durationDays,
    amount: data.amount,
    method: data.method.toLowerCase(),
    status: 'completed',
    paid_on: data.date,
    due_date: null,
    notes: data.notes || null,
    recorded_by: null,
  });
  const notified = await notifyUser({
    userId: data.memberId,
    type: 'payment',
    title: 'Payment received',
    message: `We received ₱${data.amount.toLocaleString('en-PH')}. Your membership has been extended.`,
    actionUrl: '/member/payments',
  }).then(() => true, () => false);
  return { notified };
}

/** How a renewal request was (or will be) paid. */
export const renewalMethod = (r: OpenRenewalRequest) => !r.paid ? 'Cash'
  : r.paid.kind === 'gcash' ? 'GCash' : r.paid.kind === 'maya' ? 'Maya' : 'Bank transfer';

/** The payment a renewal request asks for: its plan, its price or what they sent online, today. */
export const renewalPayment = (r: OpenRenewalRequest): RecordPaymentInput => ({
  memberId: r.memberId, memberName: r.memberName, amount: r.paid?.amount ?? r.planPrice,
  method: renewalMethod(r), date: todayKey(), planId: r.planId,
  notes: r.paid
    ? `Paid online by ${r.paid.method}, ref ${r.paid.reference}${r.paid.paidOn ? ` on ${r.paid.paidOn}` : ''}`
    : `Paid at the desk for ${r.planName}`,
});

/** The member's newest membership, the one a payment extends (never an old expired row). */
export async function currentPlanOf(memberId: string): Promise<MemberPlanInfo | null> {
  const m = (await listMemberMemberships(memberId))[0];
  if (!m) return null;
  return {
    membershipId: m.id, planId: m.plan_id,
    // NULL is a deliberate "never expires"; only a missing plan join falls back.
    durationDays: m.membership_plans ? m.membership_plans.duration_days : 30,
    planName: m.membership_plans?.name ?? 'Unknown plan',
    planPrice: Number(m.membership_plans?.price) || 0,
  };
}

/** One click on a renewal request: the plan switched if it changed, the payment recorded, the request closed (by its trigger). */
export async function approveRenewalRequest(r: OpenRenewalRequest) {
  const [membership, plans] = await Promise.all([currentPlanOf(r.memberId), listPlans()]);
  if (!membership) throw new Error('This member has no membership plan assigned yet');
  return recordDeskPayment(renewalPayment(r), membership, plans);
}

/** Approve a sign-up (free tier, active) and tell them: "you're in" is the most useful message the gym sends. */
export async function approveRegistration(reg: PendingRegistrationRow, gymName: string): Promise<{ notified: boolean }> {
  await approveMemberRegistration(reg);
  if (!reg.auth_user_id) return { notified: false };
  const notified = await notifyUser({
    userId: reg.auth_user_id,
    type: 'membership',
    title: "You're in",
    message: `Welcome to ${gymName}, ${reg.first_name}. Your membership is active: you can book classes now.`,
    actionUrl: '/member/home',
  }).then(() => true, () => false);
  return { notified };
}

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Time to be set');

/** Confirm or decline a 1-on-1 request, and tell the member. */
export async function decideSession(r: QueueRow, decision: 'approved' | 'rejected'): Promise<{ notified: boolean }> {
  await setPtSessionStatus(r.id, decision);
  const notified = await notifyUser({
    userId: r.memberId, type: 'booking',
    title: decision === 'approved' ? 'Session confirmed' : 'Session not approved',
    message: decision === 'approved' ? `Your session on ${when(r.when)} is confirmed. See you there.`
      : `Your session on ${when(r.when)} could not be approved. Ask the front desk for another time.`,
    actionUrl: '/member/sessions',
  }).then(() => true, () => false);
  return { notified };
}

type Mode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';
export interface ToDecide {
  /** 1-on-1 requests the gym may decide at this gym (0180/0203). */
  sessions: QueueRow[];
  /** Packages paid to the gym, waiting for the desk to confirm (0181). */
  payments: CoachingRow[];
  /** Packages a member asked a coach for, not answered yet. */
  asked: CoachingRow[];
  /** Who approves a member's pick of a coach (0258). */
  approval: CoachingApproval;
}

/** Personal training's To decide: what the gym (not the coach) answers. */
export async function loadToDecide(): Promise<ToDecide> {
  await Promise.all([sweepStaleRequests().catch(() => undefined), Promise.resolve(coachingSweep()).catch(() => undefined)]);
  const [queue, coachings, settings, approval] = await Promise.all([
    loadBookingQueue(), listCoachings().catch(() => null),
    supabase.from('gym_settings').select('pt_booking_approval').maybeSingle(),
    coachingApproval(),
  ]);
  const mode = ((settings.data as { pt_booking_approval: Mode | null } | null)?.pt_booking_approval ?? 'coach') as Mode;
  // The gym decides unless the coach does, and always when the coach is not active (0203), so nothing is stranded.
  const gymMay = (r: QueueRow) => !r.coachActive || (mode !== 'coach' && (mode !== 'coach_desk' || !!r.coachOkName));
  const list = coachings ?? [];
  return {
    sessions: queue.rows.filter((r) => r.kind === 'pt' && r.status === 'pending' && gymMay(r))
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    payments: list.filter((r) => r.fee_mode === 'gym_priced' && (r.status === 'payment_sent' || r.status === 'awaiting_payment')),
    asked: list.filter((r) => r.status === 'requested'),
    approval,
  };
}

/** A package ask is the desk's to answer when the gym says so (0258): 'desk' always; 'coach, then desk' once the coach said yes. */
export const deskMayAnswer = (approval: CoachingApproval, r: CoachingRow) => approval === 'desk' || (approval === 'coach_desk' && !!r.coach_ok_at);
